use rand;
use rand::distributions::{IndependentSample, Range};
use rmpv::Value;
use std::ops::AddAssign;

use crate::game_map::MapIndex;
use crate::incremental_value::IncrementalValue;
use crate::utils::time_milliseconds;

/*** Base ***/
/// Entities that are inside the game's map.
#[derive(Debug)]
pub enum EntityKind {
    Player(Player),
    Gap { spawner: EntityId, spawn_time: u64 },
    PointOrb { points: IncrementalValue<u64> },
}

impl EntityKind {
    pub fn kind_flag(&self) -> u8 {
        match *self {
            EntityKind::Player(_) => 0,
            EntityKind::Gap { .. } => 1,
            EntityKind::PointOrb { .. } => 2,
        }
    }

    pub fn serialize(&self, init: bool) -> Value {
        match *self {
            EntityKind::Player(ref player) => player.serialize(init),
            EntityKind::Gap { .. } => Value::Nil,
            EntityKind::PointOrb { ref points } => {
                Value::Array(vec![Value::from(points.get().clone())])
            }
        }
    }

    /// Called when checking to see if the entity needs to be send to the client
    fn needs_update(&self) -> bool {
        match *self {
            EntityKind::Player(ref player) => player.needs_update(),
            EntityKind::Gap { .. } => false,
            EntityKind::PointOrb { ref points } => points.is_changed(),
        }
    }

    /// Called after an update occurred
    fn updated(&mut self) {
        match *self {
            EntityKind::Player(ref mut player) => player.updated(),
            EntityKind::Gap { .. } => {}
            EntityKind::PointOrb { ref mut points } => points.updated(),
        }
    }
}

/// Type used to identify entities
pub type EntityId = u64;

/// And entities within the map.
#[derive(Debug)]
pub struct Entity {
    // TODO: Add some form of destroy data to know how it was destroyed?
    /// If this is a new entity that needs to be sent to the clients
    is_new: bool,

    /// The current index of the entity
    index: IncrementalValue<MapIndex>,

    /// The kind of entity
    kind: EntityKind,
}

impl Entity {
    pub fn new(index: MapIndex, kind: EntityKind) -> Entity {
        Entity {
            is_new: true,
            index: IncrementalValue::new(index),
            kind,
        }
    }

    /// Called when checking to see if the entity needs to be send to the client
    pub fn needs_update(&self) -> bool {
        self.index.is_changed() || self.kind.needs_update()
    }

    /// Called after an update is executed in order to remove various flags.
    pub fn updated(&mut self) {
        // Notify update
        self.is_new = false;
        self.kind.updated();

        // Update incremental values
        self.index.updated();
    }

    pub fn index(&self) -> &MapIndex {
        &self.index.get()
    }

    pub fn move_to(&mut self, index: &MapIndex) {
        self.index.get_mut().clone_from(index);
    }

    pub fn kind(&self) -> &EntityKind {
        &self.kind
    }

    pub fn kind_mut(&mut self) -> &mut EntityKind {
        &mut self.kind
    }
}

impl Entity {
    pub fn serialize(&self, id: &EntityId, init: bool) -> Value {
        // TODO: Convert to an array structure
        // Create the data
        let mut data = Vec::<(Value, Value)>::new();
        data.push(("id".into(), id.clone().into()));

        // Init values
        if init {
            data.push(("kind".into(), self.kind.kind_flag().into()));
        }

        // Update values
        if init || self.index.is_changed() {
            data.push(("index".into(), self.index.get().serialize()));
        }
        if init || self.kind.needs_update() {
            data.push(("data".into(), self.kind.serialize(init)));
        }

        // Return the dictionary
        Value::Map(data)
    }
}

/*** Player ***/
// Define the player
lazy_static::lazy_static! {
    static ref PLAYER_CLASSES: Vec<PlayerClass> = {
        vec![
//            // TESTER
//            PlayerClass::new(
//                0xd12727,
//                0,
//                vec![
//                    MapIndex::new(1, 0), MapIndex::new(2, 0), MapIndex::new(3, 0), MapIndex::new(4, 0),
//                    MapIndex::new(-1, 0), MapIndex::new(-2, 0), MapIndex::new(-3, 0), MapIndex::new(-4, 0),
//                    MapIndex::new(0, 1), MapIndex::new(0, 2), MapIndex::new(0, 3), MapIndex::new(0, 4),
//                    MapIndex::new(0, -1), MapIndex::new(0, -2), MapIndex::new(0, -3), MapIndex::new(0, -4)
//                ]
//            ),

            // Horizontal
            PlayerClass::new(
                0xd12727,
                500,
                vec![
                    MapIndex::new(1, 0), MapIndex::new(2, 0),
                    MapIndex::new(-1, 0), MapIndex::new(-2, 0),
                    MapIndex::new(0, 1), MapIndex::new(0, 2),
                    MapIndex::new(0, -1), MapIndex::new(0, -2)
                ]
            ),

            // Diagonal
            PlayerClass::new(
                0x4286f4,
                300,
                vec![
                    MapIndex::new(1, 1), MapIndex::new(2, 2),
                    MapIndex::new(-1, 1), MapIndex::new(-2, 2),
                    MapIndex::new(1, -1), MapIndex::new(2, -2),
                    MapIndex::new(-1, -1), MapIndex::new(-2, -2),
                ]
            ),

            // Threes on all sides
            PlayerClass::new(
                0x3df78e,
                700,
                vec![
                    MapIndex::new(2, -1), MapIndex::new(2, 0), MapIndex::new(2, 1),
                    MapIndex::new(-2, -1), MapIndex::new(-2, 0), MapIndex::new(-2, 1),
                    MapIndex::new(-1, 2), MapIndex::new(0, 2), MapIndex::new(1, 2),
                    MapIndex::new(-1, -2), MapIndex::new(0, -2), MapIndex::new(1, -2),
                ]
            ),

            // All sides
            PlayerClass::new(
                0x96f73d,
                700,
                vec![
                    MapIndex::new(-1, -1),
                    MapIndex::new(0, -1),
                    MapIndex::new(1, -1),
                    MapIndex::new(1, 0),
                    MapIndex::new(1, 1),
                    MapIndex::new(0, 1),
                    MapIndex::new(-1, 1),
                    MapIndex::new(-1, 0),
                ]
            ),

            // Horizontal with skips
            PlayerClass::new(
                0xf76b3d,
                1000,
                vec![
                    MapIndex::new(1, 0), MapIndex::new(3, 0),
                    MapIndex::new(-1, 0), MapIndex::new(-3, 0),
                    MapIndex::new(0, 1), MapIndex::new(0, 3),
                    MapIndex::new(0, -1), MapIndex::new(0, -3)
                ]
            ),

            // Diagonal corners
            PlayerClass::new(
                0x773df7,
                600,
                vec![
                    MapIndex::new(-2, -1), MapIndex::new(-1, -2),
                    MapIndex::new(2, -1), MapIndex::new(1, -2),
                    MapIndex::new(2, 1), MapIndex::new(1, 2),
                    MapIndex::new(-2, 1), MapIndex::new(-1, 2),
                ]
            ),
        ]
    };
}

/// The class of the player
#[derive(Debug, Clone)]
pub struct PlayerClass {
    /// The color for the class
    color: u64,

    /// Time in between moves, in milliseconds
    move_wait: u64,

    /// Positions relative to the player's base in which they can move
    move_positions: Vec<MapIndex>,
}

impl PlayerClass {
    pub fn new(color: u64, move_wait: u64, move_positions: Vec<MapIndex>) -> PlayerClass {
        PlayerClass {
            color,
            move_wait,
            move_positions,
        }
    }

    // TODO: Remove this temporary method
    pub fn random() -> PlayerClass {
        // Find a random player class
        let mut rng = rand::thread_rng();
        let index_range = Range::new(0, PLAYER_CLASSES.len());
        let class_index = index_range.ind_sample(&mut rng);

        // Lookup and clone the class
        PLAYER_CLASSES[class_index].clone()
    }

    pub fn move_positions(&self) -> &Vec<MapIndex> {
        &self.move_positions
    }

    pub fn valid_move_position(&self, relative_index: &MapIndex) -> bool {
        self.move_positions.contains(relative_index)
    }
}

impl PlayerClass {
    pub fn serialize(&self) -> Value {
        // Convert the move positions from a set to an array
        let move_positions = self
            .move_positions
            .iter()
            .map(|x| x.serialize())
            .collect::<Vec<Value>>()
            .into();

        // Convert the data to a map
        Value::Map(vec![
            ("color".into(), self.color.into()),
            ("movePositions".into(), move_positions),
            ("moveWait".into(), self.move_wait.into()),
        ])
    }
}

/// The player itself
#[derive(Debug)]
pub struct Player {
    /// Display name for the player
    username: String,

    /// Number of points the player has
    points: IncrementalValue<u64>,

    /// The class of the player
    class: PlayerClass,

    /// The last time the player moved in milliseconds
    move_time: u64,
}

impl Player {
    const STARTING_POINTS: u64 = 15;

    pub fn new(username: String, class: PlayerClass) -> Player {
        Player {
            username,
            class,
            points: IncrementalValue::new(Player::STARTING_POINTS),
            move_time: 0,
        }
    }

    pub fn player_class(&self) -> &PlayerClass {
        &self.class
    }

    pub fn ready_to_move(&self) -> bool {
        self.ready_to_move_with_wait(self.class.move_wait)
    }

    pub fn ready_to_move_with_wait(&self, wait: u64) -> bool {
        self.move_time + wait <= time_milliseconds()
    }

    pub fn can_move_to(&self, relative_index: &MapIndex) -> bool {
        // Return if it can move
        self.ready_to_move() && self.class.valid_move_position(relative_index)
    }

    pub fn moved(&mut self) {
        self.move_time = time_milliseconds();
    }

    pub fn serialize(&self, init: bool) -> Value {
        // Create the data
        let mut data = Vec::<(Value, Value)>::new();

        // Init values
        if init {
            data.push(("username".into(), self.username.clone().into()));
            data.push(("class".into(), self.class.serialize()));
        }

        // Update values
        if init || self.points.is_changed() {
            data.push(("points".into(), self.points.clone_value().into()));
        }

        // Return the map
        Value::Map(data)
    }

    pub fn give_points(&mut self, points: u64) {
        self.points.get_mut().add_assign(points);
    }

    pub fn point_count(&self) -> &u64 {
        self.points.get()
    }

    /// Called when checking to see if the entity needs to be send to the client
    fn needs_update(&self) -> bool {
        self.points.is_changed()
    }

    /// Called after an update occurred
    fn updated(&mut self) {
        self.points.updated()
    }
}
