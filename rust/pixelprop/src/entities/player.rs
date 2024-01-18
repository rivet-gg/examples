extern crate rmpv;

use std::cell::{RefMut};
use std::sync::Arc;
use crate::entities::{EntityBody, EntityKindInner};
use crate::game_config::GAME_CONFIG;
use crate::utils::{FloatType, Vector, Rect};
use crate::game_config::PrefabConfig;
use crate::game_config::PrefabConfigHandle;
use crate::game::Game;
use rand::{self, Rng};
use crate::utils::time_milliseconds;
use crate::incremental_value::IncrementalValue;
use crate::utils::Serializable;
use rmpv::Value;

/// Move message
#[derive(Debug)]
pub struct MoveMessage {
    pub timestamp: u64,
    pub move_dir: Option<f64>,
    pub sprinting: bool
}

/// Data associated with the hunter's state.
#[derive(Debug)]
pub struct HunterState {
    /// The last time that the prop pinged.
    pub last_shoot_time: u64
}

impl HunterState {
    pub fn new() -> HunterState {
        HunterState {
            last_shoot_time: 0
        }
    }
}

/// Data associated with the prop's state.
#[derive(Debug)]
pub struct PropState {
    /// The last time that the prop pinged.
    pub last_ping_time: u64,

    /// The time at which the next map ping will be forced.
    pub next_ping_time: u64
}

impl PropState {
    pub fn new() -> PropState {
        PropState {
            last_ping_time: 0,
            next_ping_time: 0
        }
    }
}

/// Player state
#[derive(Debug)]
pub enum PlayerState {
    Hunter(HunterState),
    Prop(PropState)
}

impl PlayerState {
    pub fn default_state() -> PlayerState {
        PlayerState::Hunter(HunterState::new())
    }
}

/// The player itself
#[derive(Debug)]
pub struct Player {
    /// If this user is an admin
    is_admin: bool,

    /// Data for the player's score
    score_counter: ScoreCounter,

    /// Display name for the player
    username: String,

    /// Character id for the player when a hunter
    character_id: String,

    /// The state the player is in
    state: PlayerState,

    /// Timestamp for the last input.
    last_input_time: u64,

    /// The move velocity to use for the next frame. This is calculated in `apply_input` since it
    /// will analyze the time between each input to allow for small, accurate inputs.
    move_vel: Vector,

    /// The move dir of the player
    move_dir: Option<f64>,

    /// If the player is sprinting.
    sprinting: bool,

    /// How much stamina is remaining, between 0 and 1
    stamina: IncrementalValue<f64>,

    /// The position at which the player spawned; this way we can pin the player to that position while hiding
    spawn_pos: Vector
}

impl Player {
    pub fn new(username: String, character_id: String, is_admin: bool) -> Player {
        Player {
            is_admin,
            score_counter: ScoreCounter::new(),
            username,
            character_id,
            state: PlayerState::default_state(),
            last_input_time: 0,
            move_dir: None,
            move_vel: Vector::zero(),
            sprinting: false,
            stamina: IncrementalValue::new(1.),
            spawn_pos: Vector::zero()
        }
    }

    pub fn set_admin(&mut self, admin: bool) { self.is_admin = admin; }

    pub fn username(&self) -> &String { &self.username }

    pub fn score_counter(&self) -> &ScoreCounter { &self.score_counter }
    pub fn score_counter_mut(&mut self) -> &mut ScoreCounter { &mut self.score_counter }

    pub fn state(&self) -> &PlayerState { &self.state }
    pub fn state_mut(&mut self) -> &mut PlayerState { &mut self.state }
    pub fn set_state(&mut self, state: PlayerState) { self.state = state; }

    pub fn move_dir(&self) -> &Option<f64> {
        &self.move_dir
    }

    pub fn apply_move_messages(&mut self, inputs: Vec<MoveMessage>) {
        // Time since the last input
        let now = time_milliseconds();
        let update_length = if now > self.last_input_time {
            now - self.last_input_time
        } else {
            println!("`time_milliseconds()` > `last_input_time`, resulting in negative update length.");
            1
        };

        // Create the weighted move velocity; this is weighted based on how long the player was
        // moving in a given direction during the frame. This way, the player can move really small
        // amounts between frames, even with a low refresh rate.
        let mut weighted_move_vel = Vector::zero();

        // Add the initial movement to the weighted value; i.e. time between the beginning of the
        // update and the first input.
        let default_weight = if let Some(first_input) = inputs.first() { // Weight for the first value
            // Use u64::max to make sure we don't go below 0
            u64::max(first_input.timestamp, self.last_input_time) - self.last_input_time
        } else {
            update_length
        };
        if let Some(move_dir) = self.move_dir {
            weighted_move_vel.add(
                &Vector::new(move_dir.cos(), move_dir.sin(), 0.),
                default_weight as FloatType
            );
        } else {
            // Assumed to be 0 since no move velocity
        };

        // Handle the inputs
        for (i, input) in inputs.iter().enumerate() {
            // Compute the custom move velocity
            if let Some(move_dir) = input.move_dir {
                // Calculate the move weight based on how long until the next input
                let move_weight = if let Some(next_input) = inputs.get(i + 1) {
                    next_input.timestamp - input.timestamp
                } else {
                    now - input.timestamp
                };

                // Add to the weighted velocity
                weighted_move_vel.add(
                    &Vector::new(move_dir.cos(), move_dir.sin(), 0.),
                    move_weight as FloatType
                );
            } else {
                // Assumed to be 0 since no move velocity
            }

            // Save values
            self.move_dir = input.move_dir;
            self.sprinting = input.sprinting;
        }

        // Weight the move vel by the total time between the inputs (since this is the maximum
        // time that can be used between the updates)
        weighted_move_vel.scale(&(1. / (update_length as FloatType)));

        // Assign move velocity
        self.move_vel = weighted_move_vel;

        // Save last input time
        self.last_input_time = now;

        // Aim dir set direction only `Entity.dir` when the message is received
    }

    pub fn stamina(&mut self) -> &mut IncrementalValue<f64> { &mut self.stamina }

    pub fn spawn_pos(&self) -> &Vector { &self.spawn_pos }
    pub fn set_spawn_pos(&mut self, pos: &Vector) {
        self.spawn_pos.copy_from(pos);
    }
}

impl Player {
    pub fn prop_ping_delay(volume: FloatType) -> u64 {
        let mut rng = rand::thread_rng();

        // Calculate min and max delays
        let adjusted_volume = volume.powf(1./3.);
        let min_delay = GAME_CONFIG.player.ping_delay_min; // Minimum delay possible
        let min = f64::max(min_delay, adjusted_volume * GAME_CONFIG.player.ping_delay_unit.0 + GAME_CONFIG.player.ping_delay_base.0);
        let max = f64::max(min, adjusted_volume * GAME_CONFIG.player.ping_delay_unit.1 + GAME_CONFIG.player.ping_delay_base.1);

        // Return the range
        rng.gen_range((min * 1000.) as u64, (max * 1000.) as u64 + 1) // Add 1 to max so they aren't equal
    }
}

impl EntityKindInner for Player {
    fn uses_dir(&self) -> bool {
        match self.state {
            PlayerState::Hunter { .. } => true,
            PlayerState::Prop { .. } => false
        }
    }

    fn get_prefab(&self) -> PrefabConfigHandle {
        GAME_CONFIG.prefab_with_id(&match self.state {
            PlayerState::Hunter { .. } => format!("player:{}", self.character_id),
            PlayerState::Prop { .. } => GAME_CONFIG.player.prop_prefab.clone()
        }).unwrap().clone()
    }

    fn create_body(&self) -> EntityBody {
        EntityBody::new(
            false,
            Vector::zero(),
            Vector::zero(),
            0,
            vec![] // The body will be created automatically based on the prefab
        )
    }

    fn physics_will_update(&mut self, dt: f64, mut body: RefMut<EntityBody>) {
        // Decrease or increase stamina
        let stamina_amount = match self.state {
            PlayerState::Hunter(_) => GAME_CONFIG.player.hunter_stamina,
            PlayerState::Prop(_) => GAME_CONFIG.player.prop_stamina
        };
        let delta_stamina = dt / stamina_amount * if self.sprinting { -1. } else { 1. };
        let mut new_stamina = f64::min(f64::max(self.stamina.get() + delta_stamina, 0.), 1.);
        if self.is_admin { new_stamina = 1.; } // Always have full stamina if admin
        self.stamina.set(new_stamina);

        // Set the move velocity
        let move_speed = if self.sprinting && new_stamina > 0. {
            if self.is_admin { 250. } else { GAME_CONFIG.player.sprint_speed }
        } else {
            GAME_CONFIG.player.move_speed
        };
        let mut vel_mut = body.get_vel_mut();
        vel_mut.x = self.move_vel.x * move_speed;
        vel_mut.y = self.move_vel.y * move_speed;
    }
}

/* Score counter */
#[derive(Debug)]
pub struct ScoreCounter {
    /* Hunters */
    killed_players: u64,
    hit_shots: u64,
    missed_shots: u64,

    /* Props */
    health: f64,
    pings: u64,
    total_ping_volume: f64,
    sleeping_time: f64
}

impl ScoreCounter {
    fn new() -> ScoreCounter {
        ScoreCounter {
            killed_players: 0,
            hit_shots: 0,
            missed_shots: 0,

            health: 0.0,
            pings: 0,
            total_ping_volume: 0.0,
            sleeping_time: 0.,
        }
    }

    /* Hunters */
    pub fn killed_player(&mut self) { self.killed_players += 1; }

    pub fn shot(&mut self, hit: bool) {
        if hit {
            self.hit_shots += 1;
        } else {
            self.missed_shots += 1;
        }
    }

    /* Props */
    pub fn update_prop_health(&mut self, health: f64) { self.health = health; }

    pub fn pinged(&mut self, volume: f64) {
        self.pings += 1;
        self.total_ping_volume += volume.powf(1./3.); // Use cubed root to make it less extreme
    }

    pub fn sleeping(&mut self, dt: f64) { self.sleeping_time += dt; }

    /* Calculations */
    fn killed_players(&self) -> u64 { self.killed_players * GAME_CONFIG.scoring.killed_player }
    fn hit_shots(&self) -> u64 { self.hit_shots * GAME_CONFIG.scoring.hit_shot }
    fn percent_hit(&self) -> u64 {
        if self.missed_shots > 0 {
            ((self.hit_shots as f64 / (self.hit_shots as f64 + self.missed_shots as f64)) * GAME_CONFIG.scoring.percent_hit_scale as f64) as u64
        } else {
            0
        }
    }
    fn health(&self) -> u64 { (self.health * GAME_CONFIG.scoring.prop_health as f64) as u64 }
    fn pings(&self) -> u64 { self.pings * GAME_CONFIG.scoring.ping }
    fn volume_pings(&self) -> u64 { self.total_ping_volume as u64 * GAME_CONFIG.scoring.ping_per_unit }
    fn sleeping_time(&self) -> u64 { (self.sleeping_time * GAME_CONFIG.scoring.sleeping_per_second) as u64 }
    pub fn placement(placement: Option<u64>) -> (String, u64) {
        match placement {
            Some(0) => ("firstScoring".to_string(), GAME_CONFIG.scoring.first),
            Some(1) => ("secondScoring".to_string(), GAME_CONFIG.scoring.second),
            Some(2) => ("thirdScoring".to_string(), GAME_CONFIG.scoring.third),
            _ => ("didNotPlaceScoring".to_string(), 0)
        }
    }
    pub fn calculate(&self, placement: Option<u64>, winning_team: Option<bool>) -> u64 {
        let mut score = self.killed_players() + self.hit_shots() + self.percent_hit(); // Hunter
        score += self.health() + self.pings() + self.volume_pings() + self.sleeping_time(); // Prop
        score += if winning_team.unwrap_or_else(|| false) { GAME_CONFIG.scoring.winning_team } else { 0 }; // Team
        score += ScoreCounter::placement(placement).1; // Placement
        score
    }

    pub fn score_breakdown(&self, placement: Option<u64>, winning_team: bool) -> Value {
        let (placement_label, placement_score) = ScoreCounter::placement(placement);
        let percent_hit = if self.missed_shots > 0 {
            self.hit_shots as f64 / self.missed_shots as f64
        } else {
            0.
        };

        // Create the breakdown of the score
        let mut breakdown = vec![
            // Hunter:
            Some(("killedPlayersScoring".to_string(), self.killed_players.to_string(), self.killed_players())),
            Some(("hitShotsScoring".to_string(), self.hit_shots.to_string(), self.hit_shots())),
            Some(("percentHitScoring".to_string(), format!("{:.1}%", percent_hit * 100.), self.percent_hit())),
            None, // Spacing

            // Prop:
            Some(("propHealthScoring".to_string(), format!("{:.1}%", self.health * 100.), self.health())),
            Some(("propPingCountScoring".to_string(), self.pings.to_string(), self.pings())),
            Some(("propTotalPingVolumeScoring".to_string(), (self.total_ping_volume as u64).to_string(), self.volume_pings())),
            None, // Spacing

            // Winning team:
            Some((if winning_team { "winningTeamScoring".to_string() } else { "losingTeamScoring".to_string() }, "".to_string(), if winning_team { GAME_CONFIG.scoring.winning_team } else { 0 })),
            None, // Spacing

            // Placement
            Some((placement_label, "".to_string(), placement_score)),
            None, // Spacing

            // Total:
            Some(("totalScoring".to_string(), "".to_string(), self.calculate(placement, Some(winning_team))))
        ];

        // Convert into RMPV value
        breakdown.into_iter()
            .map(|b| b.map_or(Value::Nil, |b| Value::Array(vec![b.0.into(), b.1.into(), b.2.into()])))
            .collect::<Vec<_>>()
            .into()
    }
}
