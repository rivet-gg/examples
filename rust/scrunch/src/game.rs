use rand;
use rand::distributions::{IndependentSample, Range};
use rand::Rng;
use std::collections::HashMap;
use std::f64;
use std::ops::AddAssign;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::entities::{Entity, EntityId, EntityKind, Player, PlayerClass};
use crate::game_map::{GameMap, IndexType, MapIndex};
use crate::incremental_value::IncrementalValue;
use crate::network::{ClientHandle, ClientId, SocketSender};
use crate::utils::time_milliseconds;
use crate::utils::Counter;

#[derive(Debug)]
pub enum GameError {
    /// Given an invalid ID to perform an action on; usually the entity does not exist
    /// Note: Use sparsely in favor of more specific errors.
    InvalidId,

    /// Attempting to delete an entity that does not exist or is not valid
    InvalidDeletion,

    /// Attempting to move entity to a position that cannot be moved to
    InvalidMovePosition,

    /// Entity identified to perform action on does not exist
    MissingEntity,

    /// Attempting to perform action on entity of the wrong kind
    InvalidEntityKind,

    /// Attempting to move an entity to the exact same place it is right now
    SameMovePosition,

    /// Attempting to insert or move an entity where another entity already exists
    EntityAlreadyAtIndex,

    /// Attempting to move to an index outside of the map
    OutOfMap,
}

pub type GameReference = Arc<Mutex<Game>>;

pub struct Game {
    /// List of connections within the game
    clients: HashMap<ClientId, ClientHandle>,

    /// Structure that holds the items inside the map
    map: GameMap,

    /// Counter for generating client IDs
    client_id: Counter<ClientId>,

    /// Number of bots to maintain in the game
    bot_count: usize,

    /// List of entity IDs for the bots
    bot_ids: Vec<EntityId>,
}

impl Game {
    pub fn new() -> GameReference {
        // Create a Game object
        let game = Game {
            clients: HashMap::new(),
            map: GameMap::new(),
            client_id: Counter::new(0, 1),
            bot_count: 50,
            bot_ids: Vec::new(),
        };

        // Create the game reference
        let game_reference = Arc::new(Mutex::new(game));

        // Start event loop
        {
            let game = game_reference.clone();
            thread::spawn(move || {
                loop {
                    // Perform the update; the lock will go out of scope after the block
                    {
                        let mut game = game.lock().unwrap();
                        match game.update() {
                            Ok(_) => {}
                            Err(err) => println!("Game update error: {:?}", err),
                        }
                    }

                    // TODO: Fix sleep time to be dynamic
                    thread::sleep(Duration::from_millis(200));

                    // TODO: Recover from panic here
                }
            });
        }

        game_reference
    }

    /// Called when a new connection is created.
    pub fn add_client(&mut self, client: ClientHandle) {
        // Save the client
        self.clients.insert(self.client_id.tick(), client);
    }

    /// Called every tick.
    fn update(&mut self) -> Result<(), GameError> {
        /* Update the size */
        self.map.update_map_size();

        // Update the bots
        self.update_bots()?;

        /* Map updates */
        self.update_players()?;
        self.update_gaps()?;

        /* Send client updates */
        // Send the updates
        for (_, client) in self.clients.iter_mut() {
            client.build_update_message(&self.map);
        }

        // Remove the flags from all of the objects
        self.map.updated();

        Ok(())
    }
}

impl Game {
    fn update_players(&mut self) -> Result<(), GameError> {
        // Handle messages from connections
        let mut disconnections = Vec::new();
        let mut wanted_player_moves = Vec::new();
        for (id, client) in self.clients.iter_mut() {
            // Handle leave message
            if let Ok(_) = client.rx_leave.try_recv() {
                disconnections.push(id.clone());
                continue;
            }

            // Handle join message
            if let Ok(username) = client.rx_join.try_recv() {
                // Validate the IDs
                client.validate_player_ids(&self.map);

                // Make sure not already in the game
                if client.player_id != None {
                    continue;
                }

                // Spawn the user
                let player = Entity::new(
                    self.map.spawn_position(),
                    EntityKind::Player(Player::new(username, PlayerClass::random())),
                );
                let player_id = self.map.insert_entity(player)?;

                // Update the client
                client.player_id = Some(player_id);

                // Send the join
                client.send_join(player_id.clone());
            }

            // Handle move message
            if let Ok(index) = client.rx_move.try_recv() {
                // Move the player
                if let Some(ref player_id) = client.player_id {
                    wanted_player_moves.push((player_id.clone(), index));
                }
            }
        }

        // Apply the moves and move them into an array of the moves that were actually executed
        for (id, index) in wanted_player_moves.into_iter() {
            match self.move_player(&id, &index) {
                Ok(_) => {}
                Err(err) => println!("Error moving player: {:?}", err),
            }
        }

        // Remove disconnections
        for client_id in disconnections.iter() {
            // Remove the client and make sure it worked
            if let Some(client) = self.clients.remove(&client_id) {
                // Remove the player, if exists
                if let Some(player_id) = client.player_id {
                    match self.map.remove_entity_with_id(&player_id) {
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

    fn update_gaps(&mut self) -> Result<(), GameError> {
        const GAP_LIFE: u64 = 7500;

        let current_time = time_milliseconds();

        // Find gaps to destroy
        let mut wanted_destroys = Vec::new();
        for (id, entity) in self.map.entities() {
            if let &EntityKind::Gap { ref spawn_time, .. } = entity.kind() {
                if spawn_time + GAP_LIFE <= current_time {
                    wanted_destroys.push(id.clone());
                }
            }
        }

        // Destroy the gaps
        for id in wanted_destroys.into_iter() {
            self.map.remove_entity_with_id(&id);
        }

        Ok(())
    }

    fn move_player(&mut self, player_id: &EntityId, target: &MapIndex) -> Result<(), GameError> {
        let map_size = self.map.map_size();

        // Validate the move
        if let Some(player_object) = self.map.entity_with_id_mut(player_id) {
            // Ensure not moving to the same place
            if player_object.index() == target {
                return Err(GameError::SameMovePosition);
            }

            // Ensure within map // TODO: Figure out how to use the method within `game_map`
            if target.x.abs() > map_size || target.y.abs() > map_size {
                return Err(GameError::OutOfMap);
            }

            // Ensure that the player can actually move
            if let &EntityKind::Player(ref player) = player_object.kind() {
                // Validate the target to move to
                let mut relative_index = player_object.index().clone();
                relative_index.negate().add(target);
                if !player.can_move_to(&relative_index) {
                    return Err(GameError::InvalidMovePosition);
                }
            } else {
                return Err(GameError::InvalidEntityKind);
            }

            // Ok to move at this point
        } else {
            return Err(GameError::MissingEntity);
        };

        // Determine what to squish
        enum SquishAction {
            None,
            KillPlayer { id: EntityId },
            AbsorbOrb { id: EntityId, points: u64 },
        }
        let squish_action =
            if let Some((id_at_target, entity_at_target)) = self.map.entity_at(target) {
                // Make sure it's not this player
                match entity_at_target.kind() {
                    &EntityKind::Gap { .. } => SquishAction::KillPlayer {
                        id: player_id.clone(),
                    },
                    &EntityKind::Player(_) => SquishAction::KillPlayer {
                        id: id_at_target.clone(),
                    },
                    &EntityKind::PointOrb { ref points } => SquishAction::AbsorbOrb {
                        id: id_at_target.clone(),
                        points: points.clone_value(),
                    },
                }
            } else {
                SquishAction::None
            };

        // Move the player
        let old_index = if let Some(entity) = self.map.entity_with_id_mut(player_id) {
            // Set player to moved
            match entity.kind_mut() {
                &mut EntityKind::Player(ref mut player) => player.moved(),
                _ => return Err(GameError::InvalidEntityKind),
            }

            // Save the old index
            let old_index = entity.index().clone();

            // Move the player
            entity.move_to(target);

            old_index
        } else {
            return Err(GameError::MissingEntity);
        };

        // Handle the squish action
        match squish_action {
            SquishAction::None => {}
            SquishAction::KillPlayer { id } => {
                // Get the point count
                let point_count = if let Some(entity) = self.map.entity_with_id(&id) {
                    if let &EntityKind::Player(ref player) = entity.kind() {
                        player.point_count().clone()
                    } else {
                        return Err(GameError::InvalidEntityKind);
                    }
                } else {
                    return Err(GameError::MissingEntity);
                };

                // Spawn the points
                self.spawn_points(point_count, target)?;

                // Remove the entity
                self.map.remove_entity_with_id(&id)?;
            }
            SquishAction::AbsorbOrb { id, points } => {
                // Give the points and destroy the orb
                if let Some(&mut EntityKind::Player(ref mut player)) =
                    self.map.entity_kind_with_id_mut(player_id)
                {
                    player.give_points(points);
                } else {
                    return Err(GameError::MissingEntity);
                }

                // Destroy the orb
                self.map.remove_entity_with_id(&id)?;
            }
        };

        // Spawn a gap where the player was
        let gap = Entity::new(
            old_index,
            EntityKind::Gap {
                spawner: player_id.clone(),
                spawn_time: time_milliseconds(),
            },
        );
        self.map.insert_entity(gap)?;

        Ok(())
    }

    fn spawn_points(&mut self, point_count: u64, center: &MapIndex) -> Result<(), GameError> {
        const POINT_CLUMP: u64 = 4; // How many points to distribute at a time

        // Iterate through every entity in the surroundings
        let mut rng = rand::thread_rng(); // TODO: Move this somewhere shared
        let mut tmp_index = MapIndex::new(0, 0);
        let angle_range: Range<f64> = Range::new(0., f64::consts::PI * 2.); // TODO: Const
        let distance_range: Range<f64> = Range::new(1.5, 3.5); // TODO: Const
        for _ in 0..(point_count / POINT_CLUMP) {
            // Determine the spawn position; uses `cos` to distribute the distances non-linearly
            let spawn_angle = angle_range.ind_sample(&mut rng);
            let spawn_distance = distance_range.ind_sample(&mut rng);
            tmp_index.x = center.x + (f64::cos(spawn_angle) * spawn_distance).round() as IndexType;
            tmp_index.y = center.y + (f64::sin(spawn_angle) * spawn_distance).round() as IndexType;

            // Make sure index within range
            if tmp_index.x.abs() > self.map.map_size() || tmp_index.y.abs() > self.map.map_size() {
                continue;
            }

            // Update or create an orb at the index
            match self.map.entity_kind_at_mut(&tmp_index) {
                Some(&mut EntityKind::PointOrb { ref mut points }) => {
                    points.get_mut().add_assign(POINT_CLUMP);
                    Ok(())
                }
                Some(&mut EntityKind::Gap { .. }) => {
                    // Points don't spawn if on gap
                    Ok(())
                }
                _ => Err(()),
            }
            .or_else(|_| {
                // Create an orb and remove the map index from the result
                let orb = Entity::new(
                    tmp_index.clone(),
                    EntityKind::PointOrb {
                        points: IncrementalValue::new(POINT_CLUMP),
                    },
                );
                self.map.insert_entity(orb).map(|_| ())
            })?;
        }

        Ok(())
    }
}

/* Bots */
lazy_static::lazy_static! {
    static ref BOT_NAMES: Vec<&'static str> = {
        vec![
            "test name 1",
            "test name 2",
            "another bot name"
        ]
    };
}

impl Game {
    fn update_bots(&mut self) -> Result<(), GameError> {
        // Find the bots still alive
        let mut bot_ids = Vec::new();
        for id in self.bot_ids.drain(..) {
            if self.map.entity_with_id(&id).is_some() {
                bot_ids.push(id);
            }
        }

        // Generate the bots
        for _ in bot_ids.len()..self.bot_count {
            // Find a bot name
            let username: String = rand::thread_rng().choose(&BOT_NAMES).unwrap().to_string();

            // Create the entity
            let mut entity = Entity::new(
                self.map.spawn_position(),
                EntityKind::Player(Player::new(username, PlayerClass::random())),
            );
            let bot_id = self.map.insert_entity(entity)?;
            bot_ids.push(bot_id);
        }

        // Update the bots
        for id in bot_ids.iter() {
            self.update_bot(id)?;
        }

        // Save the bot IDs
        self.bot_ids = bot_ids;

        Ok(())
    }

    pub fn update_bot(&mut self, id: &EntityId) -> Result<(), GameError> {
        let move_index = if let Some(entity) = self.map.entity_with_id(id) {
            if let &EntityKind::Player(ref player) = entity.kind() {
                // Don't do anything if not ready to move
                if !player.ready_to_move() {
                    return Ok(());
                }

                if let Some(position) = self.find_bot_move_position(entity.index(), player) {
                    position
                } else {
                    // If we reach this point, the a good move position couldn't be found.
                    // Therefore, just do nothing.
                    return Ok(());
                }
            } else {
                return Err(GameError::InvalidEntityKind);
            }
        } else {
            // If we reach this point, it means that a bot was killed by another bot within the same
            // update. We will skip this update and the bot will be purged next frame.
            return Ok(());
        };

        // Move the player
        match self.move_player(id, &move_index) {
            Ok(_) => {}
            Err(e) => println!("Error moving bot: {:?}", e),
        }

        Ok(())
    }

    pub fn find_bot_move_position(
        &self,
        base_index: &MapIndex,
        player: &Player,
    ) -> Option<MapIndex> {
        // How many times it'll choose a random position and see if it should move there
        const MOVE_TRIES: usize = 5;

        // Ranking for how good different move positions are; 0 = don't move there
        const GAP_RANK: u8 = 0;
        const EMPTY_RANK: u8 = 1;
        const POINT_ORB_RANK: u8 = 2;
        const PLAYER_RANK: u8 = 3;

        let mut tmp_index = MapIndex::default();
        let mut best_move = MapIndex::default();
        let mut best_rank = 0; // See ranks above
        for i in 0..MOVE_TRIES {
            // Find the index
            let rand_relative_index = rand::thread_rng()
                .choose(&player.player_class().move_positions())
                .unwrap();
            tmp_index.clone_from(base_index);
            tmp_index.add(rand_relative_index);

            // Ensure within map
            if !self.map.index_within_bounds(&tmp_index) {
                continue;
            }

            // Rank the index
            let rank = match self.map.entity_kind_at(&tmp_index) {
                Some(e) => match e {
                    &EntityKind::Player(_) => PLAYER_RANK,
                    &EntityKind::Gap { .. } => GAP_RANK,
                    &EntityKind::PointOrb { .. } => POINT_ORB_RANK,
                },
                None => EMPTY_RANK,
            };
            if rank > best_rank {
                best_move.clone_from(&tmp_index);
                best_rank = rank;
            }
        }

        // Return the best move, if one was found (this makes sure it's not jumping on a gap & makes
        // sure a position was actually chosen)
        if best_rank > 0 {
            Some(best_move)
        } else {
            None
        }
    }
}
