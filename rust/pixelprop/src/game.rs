extern crate core;

use crate::entities::ScoreCounter;
use crate::entities::{
    Entity, EntityBody, EntityHandle, EntityId, EntityKind, EntityKindInner, HunterState,
    MoveMessage, Player, PlayerState, Prop, PropState,
};
use crate::game_config::BuildingConfig;
use crate::game_config::ObjectConfigHandle;
use crate::game_config::PrefabConfig;
use crate::game_config::PrefabConfigHandle;
use crate::game_config::{
    GameConfig, GroupConfig, MapConfig, MapObjectKind, ObjectConfig, PrefabKind, GAME_CONFIG,
};
use crate::game_world::GameWorld;
use crate::network::ClientEventData;
use crate::network::ClientHandleData;
use crate::network::ClientMessage;
use crate::network::GameStateEvent;
use crate::network::PingEvent;
use crate::network::PlayerDeathEvent;
use crate::network::ScoreboardUpdateEvent;
use crate::network::ShootEvent;
use crate::network::{ClientHandle, ClientId, SocketSender};
use crate::utils::random_sample;
use crate::utils::Ray;
use crate::utils::{time_milliseconds, Counter, FloatType, Rect, Serializable, Vector};
#[cfg(profile)]
use flame;
use rand;
use rand::Rng;
use rmpv::Value;
use std::cell::{Ref, RefCell, RefMut};
use std::collections::HashMap;
use std::collections::HashSet;
use std::f64;
use std::io::Write;
use std::mem;
use std::panic;
use std::rc::Rc;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use ws::CloseCode;

/*** Errors ***/
#[derive(Debug)]
pub enum GameError {
    InvalidDeletion,
    MissingEntity,
    InvalidEntityKind,
    EntityNotSelectable,
    WrongPlayerState,
    MissingPlayerEntity,
    MissingPlayerKind,
    ShootingTooEarly,
    PingTooEarly,
}

/*** Game ***/
#[derive(Clone)]
pub enum GameState {
    PreGame,
    Hiding,
    Hunting,
}

impl Serializable for GameState {
    fn serialize(&self) -> Value {
        match *self {
            GameState::PreGame => 0,
            GameState::Hiding => 1,
            GameState::Hunting => 2,
        }
        .into()
    }
}

pub struct Game {
    /// The state of the game
    state: GameState,

    /// The timer until the state changes
    state_timer: f64,

    /// The world that holds the entities and physics
    world: GameWorld,

    /// Handles incoming clients
    rx_client_handle: Receiver<ClientHandleData>,

    /// List of connections within the game
    clients: RefCell<HashMap<ClientId, ClientHandle>>,

    /// Counter for generating client IDs
    client_id: Counter<ClientId>,

    /// Events that need to be sent to the client
    client_events: Vec<Box<ClientEventData>>,

    /// Update index counter
    update_index: Counter<usize>,

    /// The time (in milliseconds) of the last update
    last_update: u64,

    /// Time at which the update started
    update_time: u64,

    /// Cached minimap data that can be sent to the client
    cached_minimap: Value,

    /// If the minimap changed since the last update
    minimap_changed: bool,
}

impl panic::UnwindSafe for Game {}

impl Game {
    pub const UPDATE_DELAY: u64 = 66; // 15/sec

    pub fn new(rx_client_handle: Receiver<ClientHandleData>) -> Game {
        // Create a Game object
        let mut game = Game {
            state: GameState::PreGame,
            state_timer: 0.,
            world: GameWorld::new(),
            rx_client_handle,
            clients: RefCell::new(HashMap::new()),
            client_id: Counter::new(0, 1),
            client_events: Vec::new(),
            update_index: Counter::new(0, 1),
            last_update: 0,
            update_time: 0,
            cached_minimap: Value::Array(Vec::new()),
            minimap_changed: false,
        };

        // Build the map
        game.init_map();

        // Set the state
        game.set_pre_game_state();

        game
    }

    /// Launches the main event loop for the game
    pub fn launch(mut self) {
        loop {
            // Tick the update
            self.update_index.tick();

            // Clear the data if needed
            #[cfg(profile)]
            {
                if self.update_index.current() % 3 == 0 {
                    flame::clear();
                }
            }

            // Perform the update
            self.update_time = time_milliseconds();
            //            let update_panic_result = panic::catch_unwind(|| {
            // Execute the update
            match self.update() {
                Ok(_) => {}
                Err(err) => println!("Game update error: {:?}", err),
            }
            //            });
            let update_end = time_milliseconds();

            // Print the error if the update_panicked
            //            if let Err(err) = update_panic_result {
            //                println!("Update panicked with error: {:?}\nAttempting recovery.", err);
            //            }

            // Calculate the update duration
            let update_duration = if update_end > self.update_time {
                update_end - self.update_time
            } else {
                println!("Update end is earlier that update start somehow.");
                1
            };

            // Save last update time
            self.last_update = self.update_time;

            // Commit the data on the thread
            #[cfg(profile)]
            {
                if self.update_index.current() % 3 == 0 {
                    flame::commit_thread();
                }
            }

            // Sleep until the next update; if the duration took too long, then it will
            // immediately perform the next update
            if update_duration < Game::UPDATE_DELAY {
                thread::sleep(Duration::from_millis(Game::UPDATE_DELAY - update_duration));
            } else {
                //                println!("Update took {} ms too long.", update_duration - Game::UPDATE_DELAY);
            }
        }
    }

    /// Called every tick.
    fn update(&mut self) -> Result<(), GameError> {
        measure!("Update");

        // Calculate the dt; we use a static dt so we have predictable physics
        //        let dynamic_dt = (time_milliseconds() - self.last_update) as FloatType / 1000.;
        //        let max_dt = (Game::UPDATE_DELAY as FloatType) / 1000.;
        //        let dt = f64::min(dynamic_dt, max_dt); // If the server is lagging a lot, use max dt
        let dt = (Game::UPDATE_DELAY as FloatType) / 1000.;

        /* Update game state */
        // Decrement the time
        self.state_timer = f64::max(self.state_timer - dt, 0.);
        if self.state_timer <= 0. {
            self.state_timer_finished();
        }

        /* Check game over */
        if let GameState::Hunting = self.state {
            // Check if each type exists
            let mut has_props = false;
            let mut has_hunters = false;
            for entity in self.world.entities().iter() {
                let entity = entity.borrow();
                let kind = entity.kind();
                if let EntityKind::Player(ref player) = *kind {
                    match *player.state() {
                        PlayerState::Hunter(_) => has_hunters = true,
                        PlayerState::Prop(_) => has_props = true,
                    }
                }
            }

            // Finish the game
            if !has_props {
                self.finish_game(false);
            } else if !has_hunters {
                // This should only happen if all the hunters leave the game
                self.finish_game(true);
            }
        }

        /* Send new scoreboard if needed */
        if self.update_index.current() % 10 == 0 {
            self.broadcast_event(Box::new(ScoreboardUpdateEvent {
                data: self.serialize_scoreboard(self.calculate_scoreboard(None)),
            }));
        }

        /* Map updates */
        if let Err(err) = self.update_players(dt) {
            println!("Player update error: {:?}", err);
        };

        /* Update the world */
        if let Err(err) = self.world.update(dt) {
            println!("World update error: {:?}", err);
        }

        /* Send client updates */
        // Send the updates if it's been long enough
        {
            measure!("Send updates");

            // Send the updates
            for (_, client) in self.clients.borrow_mut().iter_mut() {
                client.build_update_message(
                    &self.state,
                    self.state_timer,
                    &self.world,
                    &self.client_events,
                    &self.cached_minimap,
                    self.minimap_changed,
                    GAME_CONFIG.view_range,
                );
            }
            self.minimap_changed = false;

            // Clean up after update
            self.client_events.clear();
        }

        // Remove the flags from all of the objects
        self.world.commit_update();

        Ok(())
    }
}

impl Game {
    /// Adds a new event to the list.
    fn broadcast_event(&mut self, event: Box<ClientEventData>) {
        self.client_events.push(event);
    }

    /// Reads from the clients and updates the state for players
    fn update_players(&mut self, dt: f64) -> Result<(), GameError> {
        measure!("Update players");

        // Handle new connections
        while let Ok(client_data) = self.rx_client_handle.try_recv() {
            measure!("New client connection");

            // Create a new client
            let client = ClientHandle::new(client_data);

            // Save the client
            self.clients
                .borrow_mut()
                .insert(self.client_id.tick(), client);
        }

        // Handle messages from connections
        let mut disconnections = Vec::new();
        let mut entities_to_spawn = Vec::new();
        let mut entities_to_destroy = Vec::new();
        let mut client_event_buffer = Vec::<Box<ClientEventData>>::new();
        let mut temp_force_switch_state = None;
        for (id, client) in self.clients.borrow_mut().iter_mut() {
            // Remove the player's ID if it doesn't exist
            if let Some(id) = client.player_id {
                client.spectating_id = None; // Remove spectating if has player
                if self.world.entity_with_id(&id).is_none() {
                    client.player_id = None;
                }
            } else if let Some(id) = client.spectating_id {
                // We can assume that `player_id` is None
                // The entity for the spectating ID disappeared, go spectate another hunter.
                if self.world.entity_with_id(&id).is_none() {
                    client.spectating_id = self.random_hunter(client);
                }
            }

            /* Handle message */
            let mut move_messages = Vec::new(); // Keep track of all moves and handle later
            while let Ok(message) = client.rx_message.try_recv() {
                // Validate that the player exists
                match message {
                    // These messages don't require the player
                    ClientMessage::Auth { .. } => {}
                    ClientMessage::Join { .. } => {}
                    ClientMessage::Leave { .. } => {}
                    ClientMessage::CheatCode(_) => {}
                    ClientMessage::TempData { .. } => {}

                    // All other messages require the player
                    _ => {
                        if client.player_id.is_none() {
                            println!("No player for message: {:?}", message);
                            continue;
                        }
                    }
                }

                // Decide what to do with the message
                match message {
                    ClientMessage::Auth { rivet_player_token } => {
                        if client.rivet_player_token.is_none() {
                            println!("Player authenticating");

                            // TODO: This is blocking the game loop
                            match crate::rivet::player_connected(rivet_player_token.clone()) {
                                Ok(_) => {
                                    println!("Player connected");

                                    client.rivet_player_token = Some(rivet_player_token);

                                    // Send init config
                                    client.send_init();
                                }
                                Err(err) => {
                                    println!("Failed to connect player: {:?}", err);
                                    client.socket_out().close(CloseCode::Normal);
                                }
                            }
                        }
                    }
                    ClientMessage::Join {
                        username,
                        character_id,
                    } => {
                        measure!("Join message");

                        // Make sure not already in the game
                        if client.player_id != None {
                            continue;
                        }

                        match self.state {
                            GameState::PreGame => { /* Let the player join */ }
                            _ => {
                                client.spectating_id = self.random_hunter(client);
                                continue;
                            }
                        }

                        // Validate the character id
                        if !GAME_CONFIG
                            .store
                            .characters
                            .iter()
                            .any(|p| p.id == character_id)
                        {
                            println!("Invalid character id: {}", character_id);
                            continue;
                        }

                        // Spawn the user
                        let mut player = Entity::new(EntityKind::Player(Player::new(
                            username.clone(),
                            character_id,
                            client.is_admin,
                        )));
                        player.set_label(Some(username));

                        // Save the id for the client
                        let player_id = player.id().clone();
                        client.player_id = Some(player_id.clone());

                        // Insert the entity
                        let player_handle = self.world.insert_entity(player)?;

                        // Set spawn position
                        self.move_player_to_spawn(player_handle.borrow_mut());

                        // Set the state (so it sends initial data like the shoot delay)
                        self.set_player_state(client, PlayerState::default_state());
                    }
                    ClientMessage::MoveDir(move_message) => {
                        measure!("Move message");
                        move_messages.push(move_message);
                    }
                    ClientMessage::FaceDir { dir } => {
                        measure!("Face dir message");
                        self.player_entity_mut(client)?.set_dir(dir);
                    }
                    ClientMessage::Rotate { rot } => {
                        measure!("Rotate message");
                        self.player_entity_mut(client)?.body_mut().set_rotation(rot);
                    }
                    ClientMessage::Shoot { target } => {
                        measure!("Shoot message");

                        // Find the difference between the vectors
                        let player_entity = self.player_entity(client)?;
                        let body = player_entity.body();
                        let mut origin = body.get_pos().clone();
                        let face_dir = player_entity.dir().clone();

                        // Validate the player kind
                        if let EntityKind::Player(ref mut player) = *player_entity.kind_mut() {
                            if let PlayerState::Hunter(ref mut hunter_state) = *player.state_mut() {
                                // Make sure that the props are not hiding
                                match self.state {
                                    GameState::Hiding => continue,
                                    _ => {}
                                }

                                // Make sure the player can shoot; admins can shoot as fast as they
                                // want
                                let now = time_milliseconds();
                                if !client.is_admin
                                    && (now - hunter_state.last_shoot_time) as f64 / 1000.
                                        < GAME_CONFIG.player.min_shoot_delay
                                {
                                    continue;
                                } else {
                                    // Set shoot time
                                    hunter_state.last_shoot_time = now;

                                    // Send new delay
                                    client.send_shoot_delay(Some(
                                        (GAME_CONFIG.player.min_shoot_delay * 1000.) as u64,
                                    ));
                                }
                            } else {
                                continue;
                            }
                        }

                        // Move the origin to the rotated shoot position
                        let shoot_pos = &GAME_CONFIG.player.shoot_pos;
                        let shoot_dist = (shoot_pos.x.powf(2.) + shoot_pos.y.powf(2.)).powf(0.5);
                        let shoot_angle = FloatType::atan2(shoot_pos.y, shoot_pos.x) + face_dir;
                        origin.add(
                            &Vector::new(
                                shoot_angle.cos() * shoot_dist,
                                shoot_angle.sin() * shoot_dist,
                                shoot_pos.z,
                            ),
                            1.,
                        );

                        // Create the direction vector
                        let mut dir = target;
                        dir.add(&origin, -1.);

                        // Create the ray
                        let ray = Ray::new(origin, dir, 1000.);

                        // Cast the ray in the tree
                        let filter =
                            |e: &Entity| client.player_id.filter(|id| e.id() != id).is_some();
                        let distance = if let Some((hit_entity, distance)) =
                            self.world.cast_ray(&ray, filter)
                        {
                            let mut hit_entity = hit_entity.borrow_mut();

                            // Find the entity that was hit and destroy it if it's a normal prop; if
                            // this returns `None`, then do no damage
                            let prefab_health = match *hit_entity.kind() {
                                EntityKind::Prop(ref prop) => match prop.prefab.kind {
                                    PrefabKind::Prop { .. } => Some(prop.get_prefab().health),
                                    _ => None,
                                },
                                EntityKind::Player(ref player) => {
                                    match *player.state() {
                                        PlayerState::Prop(_) => {
                                            // Only allow damage when hunting
                                            match self.state {
                                                GameState::PreGame => None,
                                                GameState::Hiding => None,
                                                _ => Some(player.get_prefab().health),
                                            }
                                        }
                                        _ => None,
                                    }
                                }
                            };

                            // Determine if a player was hit
                            let hit_prop_player =
                                if let EntityKind::Player(ref player) = *hit_entity.kind() {
                                    if let PlayerState::Prop(_) = *player.state() {
                                        true
                                    } else {
                                        false
                                    }
                                } else {
                                    false
                                };

                            // Register the shot with the player
                            if let EntityKind::Player(ref mut player) = *player_entity.kind_mut() {
                                player.score_counter_mut().shot(hit_prop_player);
                            }

                            // Damage the entity if it's not dead
                            if !hit_entity.is_dead() {
                                // Cause damage
                                if let Some(health) = prefab_health {
                                    hit_entity.damage(1. / health);
                                }

                                // The entity was killed; award the kill
                                if hit_prop_player && hit_entity.is_dead() {
                                    if let EntityKind::Player(ref mut player) =
                                        *player_entity.kind_mut()
                                    {
                                        player.score_counter_mut().killed_player();
                                    }
                                }
                            }

                            // Return the distance
                            distance
                        } else {
                            // Return a unit distance of the ray length; since this a percentage,
                            // we have to divide by the ray dir length
                            ray.length() / ray.dir().magnitude()
                        };

                        // Broadcast the shoot event
                        let mut shoot_end = ray.origin().clone();
                        shoot_end.add(ray.dir(), distance);
                        client_event_buffer.push(Box::new(ShootEvent {
                            shooter: player_entity.id().clone(),
                            start: ray.origin().clone(),
                            end: shoot_end,
                        }));
                    }
                    ClientMessage::Select { entity_id } => {
                        measure!("Selection message");

                        // Get the entity's prefab & rotation
                        let (prefab, rotation) =
                            if let Some(entity) = self.world.entity_with_id(&entity_id) {
                                let entity = entity.borrow();
                                let prefab = entity.kind().inner().get_prefab();
                                let rotation = entity.body().get_rotation().clone();
                                (prefab, rotation)
                            } else {
                                continue;
                            };

                        // Set the prop
                        try_or_continue!(self.set_player_prop(client, prefab, rotation));
                    }
                    ClientMessage::Jump => {
                        measure!("Jump message");

                        // Determine if on ground
                        let entity = self.player_entity(client)?;
                        let mut body = entity.body();

                        // Calculate rect to query for jumping right below the player
                        let jump_rect = if let Some(ref bounding_rect) = *body.bounding_rect() {
                            Rect::new(
                                Vector::new(0., 0., -0.5),
                                Vector::new(
                                    bounding_rect.size.x * 0.5,
                                    bounding_rect.size.y * 0.5,
                                    1.,
                                ),
                            )
                        } else {
                            println!("No bounding rect for player to jump with.");
                            continue;
                        };

                        // Determine if player on the ground; they can just as much as they want
                        // if they're and admin
                        let on_ground = client.is_admin
                            || self
                                .world
                                .query_rect(&jump_rect, body.get_pos(), false, false, |e| {
                                    e.id() != entity.id()
                                })
                                .is_some();

                        // Jump if needed
                        drop(body);
                        if on_ground {
                            let mut body = entity.body_mut();
                            body.get_vel_mut().z = GAME_CONFIG.player.jump_velocity;
                        }
                    }
                    ClientMessage::ForcePing => {
                        measure!("Force ping");

                        // Ping the prop
                        let entity = self.player_entity(client)?;
                        let kind = &mut *entity.kind_mut();
                        if let &mut EntityKind::Player(ref mut player) = kind {
                            if let PlayerState::Prop(ref mut prop_state) = *player.state_mut() {
                                // Make sure it's been long enough so the player can force ping
                                if (time_milliseconds() - prop_state.last_ping_time) as f64 / 1000.
                                    > GAME_CONFIG.player.ping_delay_min
                                {
                                    // Send the ping
                                    let did_ping = self.ping_prop(
                                        client,
                                        &mut client_event_buffer,
                                        prop_state,
                                        entity.body(),
                                    );

                                    // Increase score
                                    if did_ping {
                                        player.score_counter_mut().pinged(entity.body().volume());
                                    }
                                } else {
                                    continue;
                                }
                            }
                        }
                    }
                    ClientMessage::CheatCode(code) => {
                        measure!("Cheat code");

                        if code == "admin" {
                            client.is_admin = true;
                        }
                    }
                    ClientMessage::TempData { data } => {
                        measure!("Temp message");

                        if !client.is_admin {
                            continue;
                        }

                        // Split the message
                        let split = data.split(":").collect::<Vec<_>>();
                        if split.len() < 2 {
                            println!("Invalid split in string {}", data);
                            continue;
                        }
                        let (msg_type, msg_body) = (split[0], split[1]);

                        // Handle the message
                        match msg_type {
                            // Dump tree structure
                            "dump-tree" => {
                                self.world.needs_tree_dump = true;
                            }

                            // Change state
                            "switch-state" => {
                                temp_force_switch_state = msg_body.parse::<u8>().ok();
                            }

                            // Player type
                            "switch-player-type" => {
                                // Update the state
                                match msg_body {
                                    "hunter" => self.set_player_to_hunter(client)?,
                                    "prop" => self.set_player_to_prop(client)?,
                                    t @ _ => println!("Invalid player state {}", t),
                                }
                            }

                            // Duplicate object
                            "duplicate-object" => {
                                // Get the data from the player
                                let mut player_entity = self.player_entity_mut(client)?;
                                let mut body = player_entity.body_mut();

                                // Read the data
                                let asset = player_entity.asset().clone();
                                let position = body.get_pos().clone();
                                let rotation = body.get_rotation().clone();

                                // Move the player up
                                body.get_pos_mut().z += 100.;

                                // Print out the object definition
                                println!("- prefabId: {asset}\n  position: {position}\n  rotation: {rotation}", asset = asset, position = position, rotation = rotation);

                                // Spawn an object
                                entities_to_spawn.push(ObjectConfigHandle::new(ObjectConfig {
                                    prefab_id: asset,
                                    position,
                                    rotation,
                                    spawn_chance: 1.,
                                }));
                            }

                            "spawn-all-props" => {
                                // Get the base position
                                let player_entity = self.player_entity_mut(client)?;
                                let base_pos = player_entity.body().get_pos().clone();

                                // Find all the props
                                let spacing = 50.;
                                let grid_width = 10;
                                let mut i = 0;
                                for prefab in GAME_CONFIG.prefabs.iter() {
                                    if let PrefabKind::Prop { .. } = prefab.kind {
                                        // Spawn a prefab
                                        entities_to_spawn.push(ObjectConfigHandle::new(
                                            ObjectConfig {
                                                prefab_id: prefab.asset(),
                                                position: Vector::new(
                                                    base_pos.x
                                                        + (i % grid_width) as FloatType * spacing,
                                                    base_pos.y
                                                        + (i / grid_width) as FloatType * spacing,
                                                    base_pos.z + 0.,
                                                ),
                                                rotation: 0,
                                                spawn_chance: 1.,
                                            },
                                        ));

                                        // Increment index
                                        i += 1;
                                    }
                                }
                            }

                            "round-position" => {
                                // Rounds the player's position to the nearest 0.5
                                let mut player_entity = self.player_entity_mut(client)?;
                                let mut body = player_entity.body_mut();
                                let mut pos = body.get_pos_mut();
                                pos.x = (pos.x * 2.).round() / 2.;
                                pos.y = (pos.y * 2.).round() / 2.;
                                pos.z = (pos.z * 2.).round() / 2.;
                            }

                            // Unknown
                            t @ _ => println!("Invalid temp message type {}", t),
                        }
                    }
                    ClientMessage::Leave => {
                        measure!("Leave message");

                        disconnections.push(id.clone());

                        if let Some(rivet_player_token) = &client.rivet_player_token {
                            // TODO: This is blocking the game loop
                            match crate::rivet::player_disconnected(rivet_player_token.clone()) {
                                Ok(_) => {
                                    println!("Player disconnected");
                                }
                                Err(err) => {
                                    println!("Failed to disconnect player: {:?}", err);
                                }
                            }
                        }
                    }
                }
            }

            // Apply the move messages
            {
                measure!("Apply move message");

                // Don't do anything if there is no player
                if !self.has_player_entity(client) {
                    continue;
                }

                // Handle the move message
                let entity = self.player_entity(client)?;
                let mut kind = entity.kind_mut();
                if let EntityKind::Player(ref mut player) = *kind {
                    player.apply_move_messages(move_messages);
                } else {
                    println!("Missing player kind.");
                    continue;
                }

                // Move the player to their spawn position if a hunter and in hiding
                if let EntityKind::Player(ref player) = *kind {
                    if let PlayerState::Hunter(_) = *player.state() {
                        match self.state {
                            GameState::Hiding => {
                                let mut entity_body = entity.body_mut();
                                entity_body.get_pos_mut().copy_from(player.spawn_pos());
                                entity_body.get_vel_mut().set(0., 0., 0.);
                            }
                            _ => {}
                        }
                    }
                }
            }

            // Handle pinging
            {
                measure!("Handle pinging");

                // Don't do anything if there is no player
                if !self.has_player_entity(client) {
                    continue;
                }

                // Determine if player is a prop and then create the ping
                let entity = self.player_entity(client)?;
                let kind = &mut *entity.kind_mut();
                if let &mut EntityKind::Player(ref mut player) = kind {
                    match player.state_mut() {
                        &mut PlayerState::Prop(ref mut prop_state) => {
                            // Determine if needs ping
                            let time = time_milliseconds();
                            if time >= prop_state.next_ping_time {
                                // Ping
                                let did_ping = self.ping_prop(
                                    client,
                                    &mut client_event_buffer,
                                    prop_state,
                                    entity.body(),
                                );

                                // Increase score
                                if did_ping {
                                    player.score_counter_mut().pinged(entity.body().volume());
                                }
                            }
                        }
                        _ => { /* Do nothing */ }
                    }
                } else {
                    println!("Missing player kind.");
                    continue;
                }
            }

            // Send new stamina
            {
                measure!("Send stamina");

                // Don't do anything if there is no player
                if !self.has_player_entity(client) {
                    continue;
                }

                // Determine if player is a prop and then create the ping
                let entity = self.player_entity(client)?;
                let kind = &mut *entity.kind_mut();
                if let &mut EntityKind::Player(ref mut player) = kind {
                    let mut stamina = player.stamina();
                    if stamina.is_changed() {
                        client.send_stamina(*stamina.get());
                    }
                    stamina.committed();
                }
            }
        }

        // Temp switch the state
        if let Some(new_state) = temp_force_switch_state {
            match new_state {
                1 => self.set_pre_game_state(),
                2 => self.set_hiding_state(),
                3 => self.set_hunting_state(),
                4 => self.finish_game(true),
                5 => self.finish_game(false),
                t @ _ => println!("Invalid change state {}", t),
            }
        }

        // Switch any players to a hunter and heal them if they're about to get destroyed
        for (_, client) in self.clients.borrow().iter() {
            // Check if the player is going to die
            let did_die = if let Ok(ref mut entity) = self.player_entity_mut(client) {
                if entity.is_dead() {
                    entity.set_health(1.0);
                    true
                } else {
                    false
                }
            } else {
                false
            };

            // Change to hunter if died
            if did_die {
                // Broadcast the message
                client_event_buffer.push(Box::new(PlayerDeathEvent {
                    player_id: client.player_id.unwrap().clone(),
                }));

                // Change the state
                self.set_player_state(client, PlayerState::Hunter(HunterState::new()));
            }
        }

        // Destroy entities with no health
        for entity in self.world.entities().iter() {
            let entity = entity.borrow();

            // If it's a prop player, register the new health and register sleeping
            if let EntityKind::Player(ref mut player) = *entity.kind_mut() {
                if let PlayerState::Prop(_) = *player.state() {
                    // Update health
                    let health = if let PlayerState::Prop(_) = *player.state() {
                        entity.health().clone()
                    } else {
                        0.
                    };
                    player.score_counter_mut().update_prop_health(health);

                    // Set sleeping
                    if entity.body().get_vel().magnitude() <= 0.1 {
                        player.score_counter_mut().sleeping(dt);
                    }
                }
            }

            // Use 0.001 since there are some division errors sometimes
            if entity.is_dead() {
                entities_to_destroy.push(entity.id().clone());
            }
        }

        // Commit changes that occurred while processing the updates
        for object in entities_to_spawn.into_iter() {
            self.spawn_object(&object, &Vector::zero(), 0, false);
        }
        for id in entities_to_destroy.into_iter() {
            self.world.remove_entity_with_id(&id)?;
        }
        for event in client_event_buffer.into_iter() {
            self.broadcast_event(event);
        }

        // Remove disconnections
        for client_id in disconnections.iter() {
            measure!("Remove disconnections");

            // Remove the client and make sure it worked
            if let Some(client) = self.clients.borrow_mut().remove(&client_id) {
                // Remove the player, if exists
                if let Some(player_id) = client.player_id {
                    match self.world.remove_entity_with_id(&player_id) {
                        Ok(_) => {}
                        Err(err) => println!(
                            "Attempted to remove player for connection with error: {:?}",
                            err
                        ),
                    }
                }
            } else {
                println!("Trying to remove a client that doesn't exist.");
            }
        }

        Ok(())
    }

    /// Sets the player's state to a hunter.
    fn set_player_to_hunter(&self, client: &ClientHandle) -> Result<(), GameError> {
        self.set_player_state(client, PlayerState::Hunter(HunterState::new()))
    }

    /// Sets the player's state to a prop.
    fn set_player_to_prop(&self, client: &ClientHandle) -> Result<(), GameError> {
        self.set_player_state(client, PlayerState::Prop(PropState::new()))
    }

    /// Sets the player's state between a hunter or prop.
    fn set_player_state(
        &self,
        client: &ClientHandle,
        mut state: PlayerState,
    ) -> Result<(), GameError> {
        // TODO: Call player.set_state
        let mut entity = self.player_entity_mut(client)?;

        // Reset the health
        entity.set_health(1.0);

        // Handle the pinging
        match state {
            PlayerState::Prop(ref mut prop_state) => {
                // Tell the client there is no shoot time
                client.send_shoot_delay(None);

                // Set a ping time for the client
                let body = entity.body();
                let volume = body.volume();
                self.set_ping_time(client, prop_state, volume, false);
            }
            PlayerState::Hunter { .. } => {
                // Tell the client there is no ping time
                client.send_ping_delay(None);

                // Set a shoot time for the client
                client.send_shoot_delay(Some((GAME_CONFIG.player.min_shoot_delay * 1000.) as u64));
            }
        }

        // Get the player's data
        let (prefab, uses_dir) = if let EntityKind::Player(ref mut player) = *entity.kind_mut() {
            // Set the player state
            player.set_state(state);

            // Get the appropriate data
            let prefab = player.get_prefab();
            let uses_dir = player.uses_dir();
            (prefab, uses_dir)
        } else {
            return Err(GameError::MissingPlayerKind);
        };

        // Update if uses dir
        entity.apply_prefab(prefab);
        entity.set_uses_dir(uses_dir);

        Ok(())
    }

    /// Returns a random id for a hunter.
    fn random_hunter(&self, client: &mut ClientHandle) -> Option<EntityId> {
        // Find a random hunter
        let valid_entities = self.world.entities().iter().filter(|e| {
            if let EntityKind::Player(ref player) = *e.borrow().kind() {
                if let PlayerState::Hunter(_) = *player.state() {
                    return true;
                }
            }

            return false;
        });
        random_sample(valid_entities).map(|e| e.borrow().id().clone())
    }

    /// Broadcasts a ping from the prop's location. Returns if the ping went through.
    fn ping_prop(
        &self,
        client: &ClientHandle,
        client_event_buffer: &mut Vec<Box<ClientEventData>>,
        prop_state: &mut PropState,
        body: Ref<EntityBody>,
    ) -> bool {
        // Don't do anything if not hunting
        match self.state {
            GameState::Hunting => {}
            _ => return false,
        }

        let time = time_milliseconds();

        // Broadcast the ping
        client_event_buffer.push(Box::new(PingEvent {
            point: body.get_pos().clone(),
        }));

        // Update last ping time
        prop_state.last_ping_time = time;

        // Set the new ping time
        let volume = body.volume();
        self.set_ping_time(client, prop_state, volume, false);

        true
    }

    /// Sets the player's prop
    fn set_player_prop(
        &self,
        client: &ClientHandle,
        prefab: PrefabConfigHandle,
        rotation: u8,
    ) -> Result<(), GameError> {
        measure!("Set player prop");

        let mut entity = self.player_entity_mut(client)?;

        // Validate the player kind
        if let EntityKind::Player(ref player) = *entity.kind() {
            match *player.state() {
                PlayerState::Prop(ref prop_state) => {}
                _ => return Err(GameError::WrongPlayerState),
            }
        };

        // Apply the entity prefab to the player
        entity.apply_prefab(prefab);
        entity.body_mut().set_rotation(rotation);

        // Set a new ping if the calculated ping is sooner than the current ping; this way, a player
        // can't switch from a large object to a small object while keeping the ping time of the
        // large object
        if let EntityKind::Player(ref mut player) = *entity.kind_mut() {
            if let PlayerState::Prop(ref mut prop_state) = *player.state_mut() {
                let body = entity.body();
                let volume = body.volume();
                self.set_ping_time(client, prop_state, volume, true);
            } else {
                return Err(GameError::WrongPlayerState);
            }
        };

        Ok(())
    }

    /// Sets teh ping time on the prop and notifies the client of the change. If `compare` is true,
    /// then it will only set the new ping time if it's less than the current time.
    fn set_ping_time(
        &self,
        client: &ClientHandle,
        prop_state: &mut PropState,
        volume: FloatType,
        compare: bool,
    ) {
        // Calculate the ping time
        let now = time_milliseconds();
        let delay = Player::prop_ping_delay(volume);
        let next_ping_time = now + delay;

        // Set the new ping time if not comparing or it's a closer ping time than the current
        if !compare || next_ping_time < prop_state.next_ping_time {
            // Save the time
            prop_state.next_ping_time = next_ping_time;

            // Send the ping time to the player
            client.send_ping_delay(Some(delay));
        }
    }
}

/*** State Management ***/
impl Game {
    fn state_timer_finished(&mut self) {
        match self.state {
            GameState::PreGame => self.set_hiding_state(),
            GameState::Hiding => self.set_hunting_state(),
            GameState::Hunting => self.finish_game(true),
        }
    }

    fn set_pre_game_state(&mut self) {
        //        println!("Switching to pre-game state.");

        // We use the old map so players can go around and do whatever

        // Update the state of the clients
        for (_, client) in self.clients.borrow_mut().iter_mut() {
            // Change player to hunters
            if client.player_id.is_some() {
                let state = PlayerState::Hunter(HunterState::new());
                self.set_player_state(client, state);
            }

            // Stop spectating the entity and send the player back to the home menu
            if client.spectating_id.is_some() {
                client.spectating_id = None;
            }
        }

        // Update the state
        self.state_timer = 10.;
        self.state = GameState::PreGame;
        self.broadcast_new_state();
    }

    fn set_hiding_state(&mut self) {
        //        println!("Switching to hiding state.");

        // Store the players in the game
        let mut players_in_game = self
            .clients
            .borrow()
            .iter()
            .filter_map(|(c_id, c)| c.player_id.map(|p_id| (c_id.clone(), p_id.clone())))
            .collect::<Vec<_>>();
        let mut rng = rand::thread_rng();
        rng.shuffle(&mut players_in_game);

        // Check if there's enough players
        let player_count = players_in_game.len();
        if player_count < 4 {
            self.state_timer = 10.; // Wait another 10 seconds for more players to join
            return;
        }

        // Rebuild the map; this will no destroy the players
        self.init_map();

        // Assign the player states
        for (i, &(client_id, player_id)) in players_in_game.iter().enumerate() {
            // Decide if hunter; they're a hunter if it's one of the first two players or in the
            // bottom 20%
            let is_hunter = i < 2 || i <= (player_count as f64 * 0.2) as usize;

            // Update the state
            let state = if is_hunter {
                PlayerState::Hunter(HunterState::new())
            } else {
                PlayerState::Prop(PropState::new())
            };
            self.set_player_state(self.clients.borrow().get(&client_id).unwrap(), state);

            // Reset the health
            if let Ok(ref mut player) =
                self.player_entity_mut(self.clients.borrow().get(&client_id).unwrap())
            {
                player.set_health(1.);
            }
        }

        // Reposition the players
        self.move_players_to_spawn();

        // Update the state
        self.state_timer = 15.;
        self.state = GameState::Hiding;
        self.broadcast_new_state();
    }

    fn set_hunting_state(&mut self) {
        //        println!("Switching to hunting state.");

        // Update the state
        self.state_timer = 5. * 60.;
        self.state = GameState::Hunting;
        self.broadcast_new_state();
    }

    fn finish_game(&mut self, props_win: bool) {
        //        println!("Finishing game.");

        // Send the score breakdowns to the clients
        let scoreboard = self.calculate_scoreboard(Some(props_win));
        let scoreboard_value = self.serialize_scoreboard(scoreboard.clone());
        for (_, client) in self.clients.borrow().iter() {
            if let Some(player_id) = client.player_id {
                // Find a score that matches the client's player id
                for (i, score) in scoreboard.iter().enumerate() {
                    // Validate that the entity ID matches the client
                    if score.entity_id != player_id {
                        continue;
                    }

                    // Generate the breakdown
                    let breakdown = if let Ok(ref entity) = self.player_entity(client) {
                        if let EntityKind::Player(ref player) = *entity.kind() {
                            let is_prop = match *player.state() {
                                PlayerState::Prop(_) => true,
                                PlayerState::Hunter(_) => false,
                            };
                            player
                                .score_counter()
                                .score_breakdown(Some(i as u64), is_prop == props_win)
                        } else {
                            println!("Missing player for score breakdown.");
                            break;
                        }
                    } else {
                        println!("No player entity for client score breakdown.");
                        break;
                    };

                    // Send the results
                    client.send_game_results(props_win, scoreboard_value.clone(), breakdown);
                }
            }
        }

        // Update the state
        self.set_pre_game_state();
    }

    /// Places all the players on a square around the center of the map.
    fn move_players_to_spawn(&mut self) {
        let mut rng = rand::thread_rng();

        // Position the players on the spawn
        for (_, client) in self
            .clients
            .borrow()
            .iter()
            .filter(|&(_, c)| c.player_id.is_some())
        {
            if let Ok(player) = self.player_entity_mut(client) {
                self.move_player_to_spawn(player);
            } else {
                println!("Failed to find player to move to spawn.");
            }
        }
    }

    /// Places the player on a square around the ceneter
    fn move_player_to_spawn(&self, mut player: RefMut<Entity>) {
        let mut rng = rand::thread_rng();
        let square_size = 75.;

        // Determine random x and y on the edge of a square
        let mut x = rng.gen_range(-square_size, square_size);
        let mut y = if rng.gen_weighted_bool(2) {
            square_size
        } else {
            -square_size
        };
        if rng.gen_weighted_bool(2) {
            mem::swap(&mut x, &mut y);
        }

        // Position the player there
        let mut player_body = player.body_mut();
        let player_pos = player_body.get_pos_mut();
        player_pos.set(x, y, 1.);

        // Save the position
        if let EntityKind::Player(ref mut player) = *player.kind_mut() {
            player.set_spawn_pos(player_pos);
        }
    }

    fn broadcast_new_state(&mut self) {
        // Don't do anything, since the state will be sent with each update now

        //        // Send the new state to everyone
        //        self.broadcast_event(box GameStateEvent {
        //            state: self.state.clone()
        //        });
    }
}

/*** Map Generation ***/
impl Game {
    /// Initializes the map for the game
    fn init_map(&mut self) -> Result<(), GameError> {
        measure!("Init map");

        let mut rng = rand::thread_rng();

        // Destroy all entities except the players
        let all_entity_ids = self
            .world
            .entities()
            .iter()
            .map(|e| e.borrow().id().clone())
            .collect::<Vec<_>>();
        'entity_loop: for id in all_entity_ids.into_iter() {
            // Don't destroy the entity if it's a player
            for (_, client) in self.clients.borrow().iter() {
                if let Some(player_id) = client.player_id {
                    if player_id == id {
                        continue 'entity_loop;
                    }
                }
            }

            // Remove the entity
            self.world.remove_entity_with_id(&id);
        }

        // Add entities from config
        let map = GAME_CONFIG
            .maps
            .get("map-a")
            .expect("Could not get map config");
        self.spawn_object_collection(&map.objects, Vector::zero());

        // Generate the minimap
        self.cached_minimap = self.generate_minimap();
        self.minimap_changed = true;

        Ok(())
    }

    /// Initializes a collection of objects
    fn spawn_object_collection(&mut self, objects: &Vec<MapObjectKind>, offset: Vector) {
        measure!("Spawn collection");

        for object in objects.iter() {
            match *object {
                MapObjectKind::Object(ref object) => {
                    self.spawn_object(object, &offset, 0, true);
                }
                MapObjectKind::Group(ref group) => {
                    let mut collection_offset = offset.clone();
                    collection_offset.add(&group.offset, 1.);
                    self.spawn_object_collection(&group.objects, collection_offset);
                }
                MapObjectKind::Building(ref building) => {
                    self.generate_building(building);
                }
            }
        }
    }

    fn spawn_object(
        &mut self,
        object: &ObjectConfigHandle,
        offset: &Vector,
        offset_rotation: u8,
        use_spawn_chance: bool,
    ) {
        measure!("Spawn object");

        // Determine spawn chance
        let mut rng = rand::thread_rng();
        if use_spawn_chance {
            if rng.gen_range(0., 1.) > object.spawn_chance {
                return;
            }
        }

        // Find the prefab
        let prefab = GAME_CONFIG
            .prefab_with_id(&object.prefab_id)
            .expect(&format!(
                "Could not find prefab with id {}",
                object.prefab_id
            ));

        // Create a prop
        let prop = EntityKind::Prop(Prop::from_prefab(object.clone(), prefab.clone()));
        let entity = Entity::new(prop);

        // Offset the entity
        let new_rot = (entity.body().get_rotation() + offset_rotation) % 4;
        entity.body_mut().get_pos_mut().add(offset, 1.);
        entity.body_mut().set_rotation(new_rot);

        // Add it to the world
        self.world
            .insert_entity(entity)
            .expect("Failed to insert object into world");
    }

    fn generate_building(&mut self, building: &BuildingConfig) {
        measure!("Generate building");

        // Split up the map into a 2D vec with chunks of 2 characters
        let components = building
            .map
            .split("\n")
            .map(|line| {
                let mut components = Vec::new();
                for i in (0..line.len()).step_by(2) {
                    let slice = if i + 2 <= line.len() {
                        // Check if going over string length
                        line[i..(i + 2)].to_string()
                    } else {
                        line[i..(i + 1)].to_string()
                    };
                    components.push(slice);
                }
                components
            })
            .collect::<Vec<_>>();
        let map_height = (components.len() / 2) as f64 * building.room_size;
        let longest_line = components.iter().map(|l| l.len()).max().unwrap();
        let map_width = (longest_line / 2) as f64 * building.room_size;

        // Iterate through each line
        for (y, line) in components.iter().enumerate() {
            // Step through the line 2 characters at a time
            for (x, chunk) in line.iter().enumerate() {
                // Parse the character pair
                let symbol = &chunk[0..1];
                let rotation = if chunk.len() == 2 { &chunk[1..2] } else { " " };

                // Don't do anything if it's an empty space
                if symbol == " " {
                    continue;
                }

                // Find the base rotation (based on the wall position) and then extract the rotation from the string
                let base_rotation: u8 = if x % 2 == 0 && y % 2 == 1 { 1 } else { 0 }; // Automatic rotation guessing
                let rotation: u8 = if rotation == " " {
                    base_rotation
                } else {
                    base_rotation + rotation.parse::<u8>().unwrap()
                };

                // Spawn the prefab
                let object = building.lookup_table.get(symbol).expect(&format!(
                    "Could not find object for symbold {} at ({}, {})",
                    symbol, x, y
                ));

                // Calculate the offset so its origin is the bottom left
                let mut object_offset = building.offset.clone(); // Start with offset for building
                object_offset.x += (x as FloatType) * building.room_size / 2.;
                object_offset.y += map_height - (y as FloatType) * building.room_size / 2.; // Flip y coords

                // Center the offset if needed
                if building.centered {
                    object_offset.x -= map_width / 2.;
                    object_offset.y -= map_height / 2.;
                }

                // Spawn the object
                self.spawn_object(object, &object_offset, rotation, false);
            }
        }
    }
}

/*** Player Entity Fetching ***/
impl Game {
    pub fn has_player_entity(&self, client: &ClientHandle) -> bool {
        match client.player_id {
            Some(_) => true,
            None => false,
        }
    }

    pub fn player_entity(&self, client: &ClientHandle) -> Result<Ref<Entity>, GameError> {
        measure_verbose!("Get player entity");

        if let Some(ref player_id) = client.player_id {
            if let Some(entity) = self.world.entity_with_id(player_id) {
                return Ok(entity.borrow());
            }
        }

        Err(GameError::MissingPlayerEntity)
    }

    pub fn player_entity_mut(&self, client: &ClientHandle) -> Result<RefMut<Entity>, GameError> {
        measure_verbose!("Get player mut");

        if let Some(ref player_id) = client.player_id {
            if let Some(entity) = self.world.entity_with_id(player_id) {
                return Ok(entity.borrow_mut());
            }
        }

        Err(GameError::MissingPlayerEntity)
    }
}

/*** Minimap ***/
impl Game {
    fn generate_minimap(&self) -> Value {
        // Add each entity to the list of rectangles
        let mut rects = Vec::new();
        for entity in self.world.entities().iter() {
            let entity = entity.borrow();
            let body = entity.body();
            let entity_kind = entity.kind();

            // Make sure it's not blacklisted
            if entity.asset() == "ground" {
                continue;
            }

            // Only add fixture props
            if let EntityKind::Prop(ref prop) = *entity_kind {
                // Find the rectangles
                let mut prop_rects = Vec::new();
                if let PrefabKind::Fixture = prop.prefab.kind {
                    // Add each of the rects in the body
                    for rect in entity.body().rotated_rects().iter() {
                        prop_rects.push(rect.serialize_with_offset(entity.body().get_pos()));
                    }

                    // Add each of the minimap rects
                    for rect in prop.prefab.minimap_rects.iter() {
                        // Rotate the rect so it appears properly on the map
                        let mut rect = rect.clone();
                        rect.rotate(body.get_rotation());

                        // Serialize the rect
                        prop_rects.push(rect.serialize_with_offset(entity.body().get_pos()));
                    }
                }

                // Add the color and rectangles
                rects.push(Value::Array(vec![
                    prop.prefab.minimap_color.clone().into(),
                    prop_rects.into(),
                ]));
            }
        }

        Value::Array(rects)
    }
}

/*** Scoring ***/
#[derive(Clone)]
pub struct ScoreboardItem {
    pub entity_id: EntityId,
    pub is_prop: bool,
    pub username: String,
    pub score: u64,
}

impl Serializable for ScoreboardItem {
    fn serialize(&self) -> Value {
        Value::Array(vec![
            self.entity_id.into(),
            self.is_prop.into(),
            self.username.clone().into(),
            self.score.into(),
        ])
    }
}

impl Game {
    /// Generate the data for the scoreboard; if `props_win` is `None`, the game is not over yet;
    /// otherwise, it holds `true` if the props won; returns entity id, string, and score
    fn calculate_scoreboard(&self, props_win: Option<bool>) -> Vec<ScoreboardItem> {
        // Map the clients to their id, username, and score
        let mut results = self
            .clients
            .borrow()
            .iter()
            .filter_map(|(_, client)| {
                if let Ok(ref entity) = self.player_entity(client) {
                    if let EntityKind::Player(ref player) = *entity.kind() {
                        let is_prop = match *player.state() {
                            PlayerState::Prop(_) => true,
                            PlayerState::Hunter(_) => false,
                        };
                        let winning_team = props_win.map(|props_win| is_prop == props_win); // Check if on same team as winner
                        Some(ScoreboardItem {
                            entity_id: entity.id().clone(),
                            is_prop,
                            username: player.username().clone(),
                            score: player.score_counter().calculate(None, winning_team), // Placement will be added later
                        })
                    } else {
                        unreachable!("Cannot have client entity without player.");
                    }
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();

        // Sort the results
        results.sort_by(|a, b| b.score.cmp(&a.score));

        // If the game is over, add the placements to the appropriate scores
        if props_win.is_some() {
            results
                .into_iter()
                .enumerate()
                .map(|(i, mut v)| {
                    v.score += ScoreCounter::placement(Some(i as u64)).1;
                    v
                })
                .collect::<Vec<_>>()
        } else {
            results
        }
    }

    fn serialize_scoreboard(&self, results: Vec<ScoreboardItem>) -> Value {
        results
            .into_iter()
            //            .take(10) // Only 10 results
            .map(|d| d.serialize())
            .collect::<Vec<_>>()
            .into()
    }
}
