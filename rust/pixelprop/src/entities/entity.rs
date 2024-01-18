use crate::entities::{Player, Prop};
use crate::game_config::PrefabConfig;
use crate::game_config::PrefabConfigHandle;
use crate::incremental_value::{IncrementalValue, IncrementalValueDiff};
use crate::utils::SerializableInitMut;
use crate::utils::{
    pack_incremental_value, pack_value, Counter, FloatType, PackData, PackFlag, PackFlagRaw, Rect,
    Serializable, SerializableInit, Vector,
};
use rmpv::Value;
use std::cell::{Ref, RefCell, RefMut};
use std::cmp::PartialEq;
use std::f64;
use std::mem::swap;
use std::rc::Rc;
use std::sync::Arc;
use std::sync::Mutex;

/// Trait that structures implement to implement callbacks from the game
pub trait EntityKindInner {
    /// Determines if the entity uses the dir for rotation
    fn uses_dir(&self) -> bool {
        false
    }

    /// Determines if the entity can be selected
    fn is_selectable(&self) -> bool {
        false
    }

    /// Returns the asset
    fn get_prefab(&self) -> PrefabConfigHandle;

    /// Creates a new rigid body
    fn create_body(&self) -> EntityBody;

    /// Called after every physics update; optional
    #[allow(unused_variables)]
    fn physics_will_update(&mut self, dt: f64, body: RefMut<EntityBody>) {}

    /// Called after every physics update; optional
    #[allow(unused_variables)]
    fn physics_did_update(&mut self, dt: f64, body: RefMut<EntityBody>) {}
}

/// Flag identifying misc data
#[derive(Copy, Clone)]
enum EntityPackFlag {
    Id = 0,
    Position = 1,
    Velocity = 2,
    Rotation = 3,
    Dir = 4,
    UsesDir = 8,
    Health = 11,
    Asset = 5,
    Label = 6,
    BodyRect = 7,
    Selectable = 9,
    Sleeping = 10,
}

impl PackFlag for EntityPackFlag {
    fn pack_flag(&self) -> PackFlagRaw {
        *self as PackFlagRaw
    }
}

/// Entities that are inside the game's map.
pub enum EntityKind {
    Player(Player),
    Prop(Prop),
}

impl EntityKind {
    pub fn kind_flag(&self) -> u8 {
        match *self {
            EntityKind::Player(_) => 0,
            EntityKind::Prop(_) => 1,
        }
    }

    pub fn inner(&self) -> &EntityKindInner {
        match *self {
            EntityKind::Player(ref e) => e,
            EntityKind::Prop(ref e) => e,
        }
    }

    pub fn inner_mut(&mut self) -> &mut EntityKindInner {
        match *self {
            EntityKind::Player(ref mut e) => e,
            EntityKind::Prop(ref mut e) => e,
        }
    }
}

/// Type used to identify entities
pub type EntityId = u64;

/// RC handle for the entity
pub type EntityHandle = Rc<RefCell<Entity>>;

lazy_static::lazy_static! {
    static ref ENTITY_COUNTER: Mutex<Counter<EntityId>> = {
        Mutex::new(Counter::new(0, 1))
    };
}

/// Body for an entity
#[derive(Debug)]
pub struct EntityBody {
    /// If the body is static or not
    is_static: bool,

    /// If the body is sleeping
    is_sleeping: IncrementalValue<bool>,

    /// Number of updates that the body has been in a state in which it can sleep
    sleepable_updates: usize,

    /// Position of the entity's body
    position: IncrementalValueDiff<Vector, FloatType>,

    /// The velocity of the body
    velocity: IncrementalValueDiff<Vector, FloatType>,

    /// Which way the entity is facing; 0 = 0º, 1 = 90º, 2 = 180º, 3 = 270º
    rotation: IncrementalValue<u8>,

    /// The collision rectangles for the object
    rects: IncrementalValue<Vec<Rect>>,

    /// All the rects rotated by rot.
    rotated_rects: Vec<Rect>,

    /// The bounding rectangle for all of the child rectangles
    bounding_rect: Option<Rect>,

    /// The total volume of the entity
    volume: FloatType,
}

impl EntityBody {
    /// How fast the entity can be moving in order to let it sleep
    const MAX_SLEEPING_VELOCITY: FloatType = 0.01;

    /// Number of updates required to put the body to sleep
    const UPDATES_TO_SLEEP: usize = 10;

    pub fn new(
        is_static: bool,
        position: Vector,
        velocity: Vector,
        rotation: u8,
        rects: Vec<Rect>,
    ) -> EntityBody {
        measure!("New entity body");

        // Create the body
        let mut body = EntityBody {
            is_static,
            is_sleeping: IncrementalValue::new(is_static), // If static, then assume sleeping
            sleepable_updates: 0,
            position: IncrementalValueDiff::new(position, 0.1),
            velocity: IncrementalValueDiff::new(velocity, 0.1),
            rotation: IncrementalValue::new(rotation),
            rotated_rects: Vec::new(),
            bounding_rect: None,
            rects: IncrementalValue::new(rects),
            volume: 0.,
        };

        // Calculate the bounding box
        body.recalculate_rect_data();

        body
    }

    pub fn is_static(&self) -> bool {
        self.is_static
    }
    // Can't change to static, since that messes up the quad tree

    pub fn is_sleeping(&self) -> &bool {
        self.is_sleeping.get()
    }
    pub fn awaken(&mut self) {
        self.is_sleeping.set(false);
        self.sleepable_updates = 0;
    }
    pub fn sleep(&mut self) {
        self.is_sleeping.set(true);
    }

    pub fn get_pos(&self) -> &Vector {
        self.position.get()
    }
    pub fn get_pos_mut(&mut self) -> &mut Vector {
        self.position.get_mut()
    }
    pub fn set_pos(&mut self, pos: Vector) {
        self.position.set(pos)
    }

    pub fn get_vel(&self) -> &Vector {
        self.velocity.get()
    }
    pub fn get_vel_mut(&mut self) -> &mut Vector {
        self.velocity.get_mut()
    }
    pub fn set_vel(&mut self, vel: Vector) {
        self.velocity.set(vel)
    }

    pub fn get_rotation(&self) -> &u8 {
        self.rotation.get()
    }
    pub fn set_rotation(&mut self, rot: u8) {
        self.rotation.set(rot);
        self.recalculate_rect_data(); // Calculate new bounding box
    }

    pub fn rects_raw(&self) -> &Vec<Rect> {
        self.rects.get()
    }
    pub fn set_rects_raw(&mut self, rects: Vec<Rect>) {
        self.rects.set(rects);
        self.recalculate_rect_data(); // Calculate new bounding box
    }

    /// A copy of all of th rects rotated.
    pub fn rotated_rects(&self) -> &Vec<Rect> {
        &self.rotated_rects
    }

    /// Rect surrounding all of the child rects. `None` if there are no rects.
    pub fn bounding_rect(&self) -> &Option<Rect> {
        &self.bounding_rect
    }

    pub fn volume(&self) -> FloatType {
        self.volume
    }
    pub fn mass(&self) -> FloatType {
        self.volume
    } // For now, the mass is just the volume
}

impl EntityBody {
    /// Called when the rects are updated.
    fn recalculate_rect_data(&mut self) {
        self.calculate_rotated_rects();
        self.calculate_bounding_box();
        self.calculate_volume();
    }

    /// Calculates the rotated rects.
    fn calculate_rotated_rects(&mut self) {
        // Calculate the new rotated rects and save them
        let rotation = self.get_rotation();
        self.rotated_rects = self
            .rects
            .get()
            .iter()
            .map(|r| {
                let mut r = r.clone();
                r.rotate(rotation);
                r
            })
            .collect::<Vec<Rect>>();
    }

    /// Calculates the bounding box that surrounds all of the child boxes.
    fn calculate_bounding_box(&mut self) {
        measure_verbose!("Calculate bounding box");

        if self.rects.get().len() == 0 {
            self.bounding_rect = None;
        } else {
            // Find the min and max of the rectangles
            let mut min = Vector::new(f64::MAX, f64::MAX, f64::MAX);
            let mut max = Vector::new(f64::MIN, f64::MIN, f64::MIN);
            for rect in self.rotated_rects().iter() {
                // Update X
                if rect.x_lower_extent(0.) < min.x {
                    min.x = rect.x_lower_extent(0.);
                }
                if rect.x_upper_extent(0.) > max.x {
                    max.x = rect.x_upper_extent(0.);
                }

                // Update Y
                if rect.y_lower_extent(0.) < min.y {
                    min.y = rect.y_lower_extent(0.);
                }
                if rect.y_upper_extent(0.) > max.y {
                    max.y = rect.y_upper_extent(0.);
                }

                // Update Z
                if rect.z_lower_extent(0.) < min.z {
                    min.z = rect.z_lower_extent(0.);
                }
                if rect.z_upper_extent(0.) > max.z {
                    max.z = rect.z_upper_extent(0.);
                }
            }

            // Create the new bounding rect
            let mut bounding_rect = Rect::new(
                Vector::new(
                    (min.x + max.x) / 2.,
                    (min.y + max.y) / 2.,
                    (min.z + max.z) / 2.,
                ),
                Vector::new(max.x - min.x, max.y - min.y, max.z - min.z),
            );

            // Rotate it
            bounding_rect.rotate(self.get_rotation());

            // Save it
            self.bounding_rect = Some(bounding_rect);
        }
    }

    /// Calculates the volume of the body based off all of the rects.
    fn calculate_volume(&mut self) {
        self.volume = self.rects.get().iter().fold(0., |v, r| v + r.volume());
    }

    /// Determines if the entity has a physics body, i.e. there are no rectangles in the body.
    pub fn has_body(&self) -> bool {
        self.bounding_rect.is_some() // Same as checking if self.rects_raw.len() == 0
    }

    /// Determines if two bodies should collide based on state as a static entity and
    /// if sleeping. Don't collide if both are static or both are sleeping. Note that
    /// this does not evaluate if the bodies intersect.
    pub fn should_collide(body_a: &mut EntityBody, body_b: &mut EntityBody) -> bool {
        !(body_a.is_static() && body_b.is_static())
            && !(*body_a.is_sleeping() && *body_b.is_sleeping())
    }

    /// Performs a collision between the bodies.
    pub fn collide(body_a: &mut EntityBody, body_b: &mut EntityBody) {
        measure_verbose!("Collide");

        // Make sure the bodies should collide
        if !EntityBody::should_collide(body_a, body_b) {
            return;
        }

        // Collide each rect
        for i in 0..body_a.rotated_rects().len() {
            for j in 0..body_b.rotated_rects().len() {
                EntityBody::collide_rects(body_a, body_b, i, j);
            }
        }
    }

    /// Performs a collision between two child rectangles of body a and body b.
    pub fn collide_rects(
        body_a: &mut EntityBody,
        body_b: &mut EntityBody,
        index_a: usize,
        index_b: usize,
    ) {
        measure_verbose!("Collide rects");

        // Get the rectangles
        let rect_a = &body_a.rotated_rects()[index_a];
        let rect_b = &body_b.rotated_rects()[index_b];

        // Make sure they intersect
        if !rect_a.intersects(&rect_b, body_a.get_pos(), body_b.get_pos()) {
            return;
        }

        measure_verbose!("Collide rects (after intersects)");

        // TODO: Generalize this code to reuse more code

        // TEMP: Declare masses based on if the object is static
        let mass_a: FloatType = if body_a.is_static {
            f64::MAX
        } else {
            body_a.mass()
        };
        let mass_b: FloatType = if body_b.is_static {
            f64::MAX
        } else {
            body_b.mass()
        };

        // Find the adjusted center for each item
        let mut center_a = rect_a.center.clone();
        center_a.add(body_a.get_pos(), 1.);
        let mut center_b = rect_b.center.clone();
        center_b.add(body_b.get_pos(), 1.);

        // Calculate the total sizes
        let max_distance_x = (rect_a.size.x + rect_b.size.x) / 2.;
        let max_distance_y = (rect_a.size.y + rect_b.size.y) / 2.;
        let max_distance_z = (rect_a.size.z + rect_b.size.z) / 2.;

        // Calculate the differences in distance
        let diff_x = (center_a.x - center_b.x).abs();
        let diff_y = (center_a.y - center_b.y).abs();
        let diff_z = (center_a.z - center_b.z).abs();

        // How much overlap there is in each dimension
        let overlap_x = max_distance_x - diff_x;
        let overlap_y = max_distance_y - diff_y;
        let overlap_z = max_distance_z - diff_z;

        // Determine which dimension to push the boxes away from each other
        if overlap_x <= overlap_y && overlap_x <= overlap_z {
            // Push in x dir
            // Find how much to weight the push-away
            let weight_a = rect_a.size.x / mass_a;
            let weight_b = rect_b.size.x / mass_b;
            let weight_total = weight_a + weight_b;

            // Find how much to push each item
            let push_a = weight_a / weight_total * overlap_x;
            let push_b = weight_b / weight_total * overlap_x;

            // Remove velocity
            body_a.get_vel_mut().x = 0.;
            body_b.get_vel_mut().x = 0.;

            // Move the items
            let pos_a = body_a.get_pos_mut();
            let pos_b = body_b.get_pos_mut();
            if center_a.x < center_b.x {
                pos_a.x -= push_a;
                pos_b.x += push_b;
            } else {
                pos_a.x += push_a;
                pos_b.x -= push_b;
            }
        } else if overlap_y <= overlap_x && overlap_y < overlap_z {
            // Push in y dir
            // Find how much to weight the push-away
            let weight_a = rect_a.size.y / mass_a;
            let weight_b = rect_b.size.y / mass_b;
            let weight_total = weight_a + weight_b;

            // Find how much to push each item
            let push_a = weight_a / weight_total * overlap_y;
            let push_b = weight_b / weight_total * overlap_y;

            // Remove velocity
            body_a.get_vel_mut().y = 0.;
            body_b.get_vel_mut().y = 0.;

            // Move the items
            let pos_a = body_a.get_pos_mut();
            let pos_b = body_b.get_pos_mut();
            if center_a.y < center_b.y {
                pos_a.y -= push_a;
                pos_b.y += push_b;
            } else {
                pos_a.y += push_a;
                pos_b.y -= push_b;
            }
        } else if overlap_z <= overlap_x && overlap_z <= overlap_y {
            // Push in z dir
            // Find how much to weight the push-away
            let weight_a = rect_a.size.z / mass_a;
            let weight_b = rect_b.size.z / mass_b;
            let weight_total = weight_a + weight_b;

            // Find how much to push each item
            let push_a = weight_a / weight_total * overlap_z;
            let push_b = weight_b / weight_total * overlap_z;

            // Remove velocity
            body_a.get_vel_mut().z = 0.;
            body_b.get_vel_mut().z = 0.;

            // Move the items
            let pos_a = body_a.get_pos_mut();
            let pos_b = body_b.get_pos_mut();
            if center_a.z < center_b.z {
                pos_a.z -= push_a;
                pos_b.z += push_b;
            } else {
                pos_a.z += push_a;
                pos_b.z -= push_b;
            }
        } else {
            unreachable!(
                "Should not be at this point. overlap_x: {}, overlap_y: {}, overlap_z: {}",
                overlap_x, overlap_y, overlap_z
            )
        }
    }

    pub fn is_changed(&self) -> bool {
        self.is_sleeping.is_changed()
            || self.position.is_changed()
            || self.velocity.is_changed()
            || self.rotation.is_changed()
            || self.rects.is_changed()
    }

    pub fn committed(&mut self) {
        self.is_sleeping.committed();
        self.position.committed();
        self.velocity.committed();
        self.rotation.committed();
        self.rects.committed();
    }
}

impl EntityBody {
    fn physics_will_update(&mut self) {}

    fn physics_did_update(&mut self) {
        // Update sleepable updates or reset to a non-sleeping state
        let is_sleeping = *self.is_sleeping();
        let sleepable_state = self.sleepable_state();
        if !is_sleeping && sleepable_state {
            // Increment sleeping updates
            self.sleepable_updates += 1;

            // Set sleeping if needed
            if self.sleepable_updates > EntityBody::UPDATES_TO_SLEEP {
                self.sleep();
            }
        } else if is_sleeping && !sleepable_state {
            // Set the entity to not sleeping
            self.awaken();
        }
    }

    /// If the entity is in a valid state to put it to sleep
    fn sleepable_state(&mut self) -> bool {
        self.velocity.get().magnitude() < EntityBody::MAX_SLEEPING_VELOCITY
            && !self.position.is_changed()
            && !self.velocity.is_changed()
    }
}

/// And entities within the map.
pub struct Entity {
    /// The ID for the entity
    id: EntityId,

    /// If this is a new entity that needs to be sent to the clients
    is_new: bool,

    /// The kind of entity
    kind: RefCell<EntityKind>,

    /// The physics body
    body: RefCell<EntityBody>,

    /// Facing dir; this is just the rotation that displays on the client
    dir: IncrementalValue<f64>,

    /// If the entity uses the dir for rotation
    uses_dir: IncrementalValue<bool>,

    /// The health of the entity.
    health: IncrementalValue<f64>,

    /// The asset to show; leave as empty string to not display anything; this a path relative to `../public/assets`
    /// or a custom string that the client handles
    asset: IncrementalValue<String>,

    /// The label to display above the entity; this is used for usernames and such
    label: IncrementalValue<Option<String>>,

    /// If props can switch to this entity
    selectable: IncrementalValue<bool>,
}

impl Entity {
    pub fn new(kind: EntityKind) -> Entity {
        // Save the prefab
        let prefab = kind.inner().get_prefab();

        // Misc data
        let mut entity_body = kind.inner().create_body();
        let uses_dir = kind.inner().uses_dir();
        let is_selectable = kind.inner().is_selectable();

        // Create the entity
        let mut entity = Entity {
            id: ENTITY_COUNTER.lock().unwrap().tick(),
            is_new: true,
            kind: RefCell::new(kind),
            body: RefCell::new(entity_body),
            dir: IncrementalValue::new(0.),
            uses_dir: IncrementalValue::new(uses_dir),
            health: IncrementalValue::new(1.),
            asset: IncrementalValue::new(prefab.asset()),
            label: IncrementalValue::new(None),
            selectable: IncrementalValue::new(is_selectable),
        };

        // Apply the prefab
        entity.apply_prefab(prefab);

        entity
    }

    pub fn create_handle(self) -> EntityHandle {
        Rc::new(RefCell::new(self))
    }

    pub fn apply_prefab(&mut self, prefab: PrefabConfigHandle) {
        self.set_asset(prefab.asset());
        self.body_mut().set_rects_raw(prefab.rects.clone());
    }

    pub fn id(&self) -> &EntityId {
        &self.id
    }

    pub fn asset(&self) -> &String {
        self.asset.get()
    }
    pub fn set_asset(&mut self, asset: String) {
        self.asset.set(asset)
    }

    pub fn body(&self) -> Ref<EntityBody> {
        self.body.borrow()
    }
    pub fn body_mut(&self) -> RefMut<EntityBody> {
        self.body.borrow_mut()
    }

    pub fn dir(&self) -> &f64 {
        self.dir.get()
    }
    pub fn set_dir(&mut self, dir: f64) {
        self.dir.set(dir);
    }

    pub fn uses_dir(&self) -> &bool {
        &self.uses_dir.get()
    }
    pub fn set_uses_dir(&mut self, uses: bool) {
        self.uses_dir.set(uses)
    }

    pub fn kind(&self) -> Ref<EntityKind> {
        self.kind.borrow()
    }
    pub fn kind_mut(&self) -> RefMut<EntityKind> {
        self.kind.borrow_mut()
    }

    pub fn health(&self) -> &f64 {
        self.health.get()
    }
    pub fn set_health(&mut self, health: f64) {
        self.health.set(health)
    }
    pub fn damage(&mut self, amount: f64) {
        *self.health.get_mut() -= amount;
    }
    pub fn is_dead(&self) -> bool {
        *self.health.get() <= 0.001
    }

    pub fn get_label(&self) -> &Option<String> {
        self.label.get()
    }
    pub fn set_label(&mut self, label: Option<String>) {
        self.label.set(label);
    }

    pub fn is_selectable(&self) -> &bool {
        self.selectable.get()
    }
}

impl Entity {
    pub fn physics_will_update(&mut self, dt: f64) {
        // Call `physics_will_update` on the inner kind
        let mut body = self.body_mut();
        body.physics_will_update();
        self.kind_mut().inner_mut().physics_will_update(dt, body);
    }

    pub fn physics_did_update(&mut self, dt: f64) {
        // Call `physics_did_update` on the inner kind
        let mut body = self.body_mut();
        body.physics_did_update();
        self.kind_mut().inner_mut().physics_did_update(dt, body);
    }
}

impl PartialEq for Entity {
    fn eq(&self, other: &Entity) -> bool {
        self.id == other.id
    }

    fn ne(&self, other: &Entity) -> bool {
        self.id != other.id
    }
}

impl SerializableInit for Entity {
    fn serialize(&self, init: bool) -> Value {
        measure!("Serialize entity");

        // Create the data
        let mut data = PackData::new();

        pack_value(&mut data, &EntityPackFlag::Id, self.id.clone().into()); // Id

        pack_incremental_value(
            init,
            &mut data,
            &EntityPackFlag::Position,
            &self.body().position,
        );
        pack_incremental_value(
            init,
            &mut data,
            &EntityPackFlag::Velocity,
            &self.body().velocity,
        );
        pack_incremental_value(
            init,
            &mut data,
            &EntityPackFlag::Rotation,
            &self.body().rotation,
        );
        pack_incremental_value(init, &mut data, &EntityPackFlag::Dir, &self.dir);
        pack_incremental_value(init, &mut data, &EntityPackFlag::Health, &self.health);
        pack_incremental_value(init, &mut data, &EntityPackFlag::Asset, &self.asset);
        pack_incremental_value(init, &mut data, &EntityPackFlag::Label, &self.label);
        pack_incremental_value(
            init,
            &mut data,
            &EntityPackFlag::Selectable,
            &self.selectable,
        ); // TODO: Don't send selectable to hunters
        pack_incremental_value(
            init,
            &mut data,
            &EntityPackFlag::BodyRect,
            &self.body().rects,
        );
        pack_incremental_value(init, &mut data, &EntityPackFlag::UsesDir, &self.uses_dir);
        pack_incremental_value(
            init,
            &mut data,
            &EntityPackFlag::Sleeping,
            &self.body().is_sleeping,
        );

        // Return the dictionary
        Value::Map(data)
    }
}

impl Entity {
    /// Called when checking to see if the entity needs to be send to the client
    pub fn is_changed(&self) -> bool {
        if self.body().is_changed() {
            return true;
        }
        self.health.is_changed()
            || self.dir.is_changed()
            || self.uses_dir.is_changed()
            || self.asset.is_changed()
            || self.label.is_changed()
            || self.selectable.is_changed()
    }

    /// Called after an update is executed in order to remove various flags.
    pub fn committed(&mut self) {
        // Notify update
        self.is_new = false;

        // Update incremental values
        self.body_mut().committed();
        self.health.committed();
        self.dir.committed();
        self.uses_dir.committed();
        self.asset.committed();
        self.label.committed();
        self.selectable.committed();
    }
}
