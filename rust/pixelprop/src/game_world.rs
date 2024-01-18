use std::f64;
use crate::game_config::GAME_CONFIG;
use crate::game::GameError;
use crate::entities::{EntityId, Entity, EntityKind, EntityHandle, EntityBody};
use crate::utils::{FloatType, Vector};
use crate::quad_tree::{QuadTree, TreeBounds};
use crate::utils::Ray;
use crate::utils::Rect;
use crate::utils::time_milliseconds;

/// This holds the game's map data
pub struct GameWorld {
    /// The entities in the map
    entities: Vec<EntityHandle>,

    /// Create a quad tree
    quad_tree: QuadTree,

    /// List of entities that have been destroyed within the last update.
    destroyed_entities: Vec<EntityId>,

    /// If the tree data should be dumped after the next update
    pub needs_tree_dump: bool
}

impl GameWorld {
    pub fn new() -> GameWorld {
        // Get the max size of the world
        let world_max_size = GAME_CONFIG.map_size;
        let world_bounds = TreeBounds::new(
            -world_max_size / 2., -world_max_size / 2.,
            world_max_size, world_max_size
        );

        GameWorld {
            entities: Vec::new(),
            quad_tree: QuadTree::new(0, world_bounds),
            destroyed_entities: Vec::new(),
            needs_tree_dump: false
        }
    }

    /* Events */
    /// Called every time it updates
    pub fn update(&mut self, dt: FloatType) -> Result<(), GameError> {
        measure!("Update world");

        // Tell entities the physics will update
        {
            measure!("Physics will update event");

            for entity in self.entities.iter_mut() {
                entity.borrow_mut().physics_will_update(dt);
            }
        }

        // Update the world
        let steps = 2;
        let interval = dt / (steps as f64);
        for _ in 0..steps {
            self.step(interval);
        }

        // Print out the quad tree
//        println!("Tree:\n{}", self.quad_tree.draw_tree());

        // Tell entities the physics updated
        {
            measure!("Physics did update event");

            for entity in self.entities.iter_mut() {
                entity.borrow_mut().physics_did_update(dt);
            }
        }

        Ok(())
    }

    /// Performs physics calculations for a given dt
    fn step(&mut self, dt: f64) {
        measure!("Step");

        // Update velocity
        for entity in self.entities.iter_mut() {
            measure!("Update entity velocity");

            let mut entity = entity.borrow_mut();
            let mut body = entity.body_mut();

            // Don't process static entities
            if body.is_static() || *body.is_sleeping() {
                continue;
            }

            // Apply gravity
            body.get_vel_mut().z -= GAME_CONFIG.gravity * dt;

            // Move position by velocity
            // TODO: Improve performance and mutate position directly
            let mut new_pos = body.get_pos().clone();
            new_pos.add(body.get_vel(), dt);
            body.set_pos(new_pos);
        }

        // Do collisions
        self.quad_tree.perform_collisions();

        // Update the tree
        let mut missing_entities = Vec::new();
        self.quad_tree.update_tree(&mut missing_entities);
        for entity in missing_entities.iter() {
            let entity = entity.borrow();
            panic!("Entity {} was pushed out of tree during update.", entity.id());
        }

        // Dump the tree if needed
        if self.needs_tree_dump {
            println!("Tree @ {}:\n{}", time_milliseconds(), self.quad_tree.draw_tree());
            self.needs_tree_dump = false;
        }
    }

    /// Called after each update to clear the flags
    pub fn commit_update(&mut self) {
        measure!("Commit update");

        // Update the entities
        for entity in self.entities.iter_mut()  {
            entity.borrow_mut().committed();
        }

        // Drain the destroyed entities
        self.destroyed_entities.clear();
    }

    /* Entities */
    pub fn entities(&self) -> &Vec<EntityHandle> {
        &self.entities
    }

    pub fn destroyed_entities(&self) -> &Vec<EntityId> {
        &self.destroyed_entities
    }

    pub fn is_destroyed(&self, entity: &Entity) -> bool {
        self.destroyed_entities.contains(entity.id())
    }

    pub fn insert_entity(&mut self, entity: Entity) -> Result<EntityHandle, GameError> {
        measure!("Insert entity");

        // Add the entity
        let handle = entity.create_handle();
        self.entities.push(handle.clone());

        // Add the entity to the quad tree
        self.quad_tree.insert(handle.clone());

        Ok(handle)
    }

    pub fn remove_entity_with_id(&mut self, id: &EntityId) -> Result<EntityHandle, GameError> {
        measure!("Remove entity");

        // Find the index of the element to remove
        let remove_index = self.entities.iter().position(|e| e.borrow().id() == id);

        // Remove the entity
        let entity_handle = if let Some(index) = remove_index {
            self.entities.remove(index)
        } else {
            return Err(GameError::InvalidDeletion)
        };

        {
            // Remove from the quad tree
            let entity = entity_handle.borrow();
            let removed_entity = self.quad_tree.remove(&*entity);
            if removed_entity.is_none() {
                println!("Failed to remove entity from tree.")
            }

            // Add to destroyed entities
            self.destroyed_entities.push(entity.id().clone());
        }

        Ok(entity_handle)
    }

    /// Returns a reference to an entity with an id. There is no `entity_with_id_mut` since
    /// `borrow_mut` can be used instead on `EntityHandle`
    pub fn entity_with_id(&self, id: &EntityId) -> Option<&EntityHandle> {
        measure_verbose!("Find entity with ID");

        for entity in self.entities.iter() {
            if entity.borrow().id() == id {
                return Some(entity)
            }
        }

        None
    }

    /* Querying */
    pub fn cast_ray<F>(&self, ray: &Ray, filter: F) -> Option<(&EntityHandle, FloatType)>
        where F: Fn(&Entity) -> bool{
        self.quad_tree.cast_ray(ray, filter)
    }

    pub fn query_rect<F>(&self, rect: &Rect, offset: &Vector, use_bounding_rect: bool, check_origin: bool, filter: F) -> Option<&EntityHandle>
        where F: Fn(&Entity) -> bool {
        measure!("Query rect");
        self.quad_tree.query_rect(rect, offset, use_bounding_rect, check_origin, &filter)
    }

    pub fn query_rect_all<F>(&self, rect: &Rect, offset: &Vector, use_bounding_rect: bool, check_origin: bool, filter: F) -> Vec<&EntityHandle>
        where F: Fn(&Entity) -> bool {
        measure!("Query rect all");
        self.quad_tree.query_rect_all(rect, offset, use_bounding_rect, check_origin, &filter)
    }
}
