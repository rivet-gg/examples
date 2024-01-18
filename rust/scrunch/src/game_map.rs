use rand;
use rand::distributions::{IndependentSample, Range};
use rmpv::Value;
use std::collections::HashMap;

use crate::entities::{Entity, EntityId, EntityKind};
use crate::game::GameError;
use crate::utils::Counter;

/// Identifies the number component on the map
pub type IndexType = i64;

/// Used to identify positions within the map.
#[derive(PartialEq, Eq, Hash, Debug, Clone, Default)]
pub struct MapIndex {
    pub x: IndexType,
    pub y: IndexType,
}

impl MapIndex {
    pub fn new(x: IndexType, y: IndexType) -> MapIndex {
        MapIndex { x, y }
    }

    pub fn random(size: IndexType) -> MapIndex {
        let mut rng = rand::thread_rng(); // TODO: Move this somewhere shared
        let between = Range::new(-size, size);
        MapIndex {
            x: between.ind_sample(&mut rng),
            y: between.ind_sample(&mut rng),
        }
    }
}

impl MapIndex {
    // TODO: implement std::ops::*
    pub fn add(&mut self, index: &MapIndex) -> &mut Self {
        self.x += index.x;
        self.y += index.y;
        self
    }

    pub fn negate(&mut self) -> &mut Self {
        self.x = -self.x;
        self.y = -self.y;
        self
    }
}

impl MapIndex {
    pub fn serialize(&self) -> Value {
        Value::Array(vec![self.x.into(), self.y.into()])
    }
}

/// This holds the game's map data
pub struct GameMap {
    /// The size of the map
    map_size: IndexType,

    /// The entities in the map
    map: HashMap<EntityId, Entity>,

    /// Counter for the entity id
    entity_id: Counter<EntityId>,

    /// List of entities that have been destroyed within the last update.
    destroyed_entities: HashMap<EntityId, Entity>,
}

impl GameMap {
    pub fn new() -> GameMap {
        GameMap {
            map_size: 0,
            map: HashMap::new(),
            entity_id: Counter::new(0, 1),
            destroyed_entities: HashMap::new(),
        }
    }

    /* Events */
    /// Called after each update to clear the flags
    pub fn updated(&mut self) {
        // Update the entities
        for (_, entity) in self.map.iter_mut() {
            entity.updated();
        }

        // Drain the destroyed entities
        self.destroyed_entities.clear();
    }

    /* Map size */
    pub fn map_size(&self) -> IndexType {
        self.map_size
    }

    pub fn update_map_size(&mut self) {
        const BASE_MAP_SIZE: IndexType = 4; // Minimum size for the map with 0 players
        const UNITS_PER_PLAYER: IndexType = 1; // How much the map grows for each player

        // Count the players
        let player_count: IndexType = self.map.values().fold(0, |sum, e| match e.kind() {
            &EntityKind::Player(_) => sum + 1,
            _ => sum,
        });

        // Count the players and find the one furthest from the center
        let mut furthest_player = -1;
        for (_, entity) in self.entities().iter() {
            if let &EntityKind::Player(_) = entity.kind() {
                // Find the distance
                let distance = IndexType::max(entity.index().x.abs(), entity.index().y.abs());
                if distance > furthest_player {
                    furthest_player = distance;
                }
            }
        }

        // Shrink map to the base size or the furthest player
        let target_map_size = BASE_MAP_SIZE + player_count * UNITS_PER_PLAYER;
        self.map_size = IndexType::max(target_map_size, furthest_player);
    }

    pub fn index_within_bounds(&self, index: &MapIndex) -> bool {
        return index.x.abs() <= self.map_size && index.y.abs() <= self.map_size;
    }

    /* Entities */
    pub fn tmp_delete_me_soon_next_id(&self) -> &EntityId {
        self.entity_id.current()
    }

    pub fn entities(&self) -> &HashMap<EntityId, Entity> {
        &self.map
    }

    pub fn destroyed_entities(&self) -> &HashMap<EntityId, Entity> {
        &self.destroyed_entities
    }

    pub fn insert_entity(&mut self, entity: Entity) -> Result<EntityId, GameError> {
        // Generate an ID
        let id = self.entity_id.tick();

        // Check if there is an entity at the index already
        if let Some(_) = self.entity_with_id(&id) {
            return Err(GameError::InvalidId);
        }

        // Check if there's an entity there
        if let Some(_) = self.entity_at(entity.index()) {
            return Err(GameError::EntityAlreadyAtIndex);
        }

        // Add the entity
        self.map.insert(id, entity);

        Ok(id)
    }

    pub fn remove_entity_with_id(&mut self, id: &EntityId) -> Result<(), GameError> {
        // Attempt to remove the item from the map and add to to the destroyed entities
        if let Some(entity) = self.map.remove(id) {
            self.destroyed_entities.insert(id.clone(), entity);
            Ok(())
        } else {
            Err(GameError::InvalidDeletion)
        }
    }

    pub fn entity_at(&self, index: &MapIndex) -> Option<(&EntityId, &Entity)> {
        // Check every entity to see if it matches the index
        for (id, entity) in self.map.iter() {
            if entity.index() == index {
                return Some((id, &entity));
            }
        }

        // Otherwise return none
        None
    }

    pub fn entity_kind_at(&self, index: &MapIndex) -> Option<&EntityKind> {
        // Check every entity to see if it matches the index
        for (_, entity) in self.map.iter() {
            if entity.index() == index {
                return Some(entity.kind());
            }
        }

        // Otherwise return none
        None
    }

    pub fn entity_kind_at_mut(&mut self, index: &MapIndex) -> Option<&mut EntityKind> {
        // Check every entity to see if it matches the index
        for (_, entity) in self.map.iter_mut() {
            if entity.index() == index {
                return Some(entity.kind_mut());
            }
        }

        // Otherwise return none
        None
    }

    pub fn entity_with_id(&self, id: &EntityId) -> Option<&Entity> {
        self.map.get(id)
    }

    pub fn entity_kind_with_id(&self, id: &EntityId) -> Option<&EntityKind> {
        self.map.get(id).map(|e| e.kind())
    }

    pub fn entity_kind_with_id_mut(&mut self, id: &EntityId) -> Option<&mut EntityKind> {
        self.map.get_mut(id).map(|e| e.kind_mut())
    }

    pub fn entity_with_id_mut(&mut self, id: &EntityId) -> Option<&mut Entity> {
        self.map.get_mut(id)
    }
}

// Utils
impl GameMap {
    pub fn spawn_position(&self) -> MapIndex {
        // Search for a valid index until found
        loop {
            let index = MapIndex::random(self.map_size);
            if self.entity_at(&index).is_none() {
                return index;
            }
        }
    }
}

