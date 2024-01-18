use std::ops::{AddAssign, Index, IndexMut};
use std::time::{SystemTime, UNIX_EPOCH};
use std::sync::Mutex;
use std::sync::mpsc::{Sender, Receiver, channel};
use std::fmt;
use std::f64;
use std::mem::swap;
use rmpv::Value;
use crate::incremental_value::IncrementalValue;
use crate::incremental_value::IncrementalValueInner;
use crate::incremental_value::IncrementalValueDiffInner;
use crate::incremental_value::IncrementalValueLike;
use rand;
#[cfg(profile)] use flame;

/*** Counter ***/
/// Used to count items.
pub struct Counter<T: AddAssign + Copy> {
    count: T,
    increment: T
}

impl<T: AddAssign + Copy> Counter<T> {
    pub fn new(initial: T, increment: T) -> Counter<T> {
        Counter { count: initial, increment }
    }

    pub fn current(&self) -> &T {
        &self.count
    }

    pub fn tick(&mut self) -> T {
        // Save the old count
        let count = self.count;

        // Increment count
        self.count.add_assign(self.increment);

        // Return it
        count
    }
}

/*** Performance ***/
// Add guard profile
#[cfg(profile)]
#[macro_export]
macro_rules! measure {
    ($arg:tt) => (let _guard = ::flame::start_guard($arg);)
}

// Don't do anything if not profiling
#[cfg(not(profile))]
#[macro_export]
macro_rules! measure {
    ($arg:tt) => ()
}

// Used for profiling extra details; for now, do nothing
#[macro_export]
macro_rules! measure_verbose {
    ($arg:tt) => ()
}

/*** Macros ***/
#[macro_export]
macro_rules! unwrap_data {
    ($expr:expr) => ($expr.ok_or_else(|| $crate::network::MessageError::MissingData)?)
}

#[macro_export]
macro_rules! silence {
    ($expr:expr) => (match $expr {
        _ => { }
    })
}

#[macro_export]
macro_rules! try_or_continue_silent {
    ($expr:expr) => (match $expr {
        Ok(v) => v,
        Err(_) => continue
    })
}

#[macro_export]
macro_rules! try_or_continue {
    ($expr:expr) => (match $expr {
        Ok(v) => v,
        Err(err) => {
            println!("Player update error: {:?}", err);
            continue;
        }
    })
}


/*** Time utils ***/
pub fn time_milliseconds() -> u64 {
    let start = SystemTime::now();
    let since_the_epoch = start.duration_since(UNIX_EPOCH).expect("Time went backwards");
    return since_the_epoch.as_secs() * 1000 + since_the_epoch.subsec_nanos() as u64 / 1_000_000;
}

/*** Collection utils ***/
// From: https://github.com/rust-lang/rust/issues/19639#issuecomment-66200471
pub fn random_sample<A, T>(iter: A) -> Option<T> where A: Iterator<Item = T> {
    let mut elem = None;
    let mut i = 1f64;
    for new_item in iter {
        if rand::random::<f64>() < (1f64/i) {
            elem = Some(new_item);
        }
        i += 1.0;
    }
    elem
}

/*** Serializable ***/
/* Serializable */
pub trait Serializable {
    fn serialize(&self) -> Value;
}

pub trait SerializableMut {
    fn serialize_mut(&mut self) -> Value;
}

impl SerializableMut for Serializable {
    fn serialize_mut(&mut self) -> Value {
        self.serialize()
    }
}

/* SerializableInit */
pub trait SerializableInit {
    fn serialize(&self, init: bool) -> Value;
}

pub trait SerializableInitMut {
    fn serialize_mut(&mut self, init: bool) -> Value;
}

impl SerializableInit for Serializable {
    fn serialize(&self, _init: bool) -> Value {
        self.serialize()
    }
}

impl SerializableInitMut for SerializableInit {
    fn serialize_mut(&mut self, init: bool) -> Value {
        self.serialize(init)
    }
}

/* Implementations */
impl<T> Serializable for Vec<T> where T: Serializable {
    fn serialize(&self) -> Value {
        Value::Array(self.iter().map(|v| v.serialize()).collect())
    }
}

impl Serializable for Vector {
    fn serialize(&self) -> Value {
        Value::Array(vec![self.x.into(), self.y.into(), self.z.into()])
    }
}

impl Serializable for Rect {
    fn serialize(&self) -> Value {
        Value::Array(vec![self.center.serialize(), self.size.serialize()])
    }
}

impl Vector {
    pub fn serialize_with_offset(&self, offset: &Vector) -> Value {
        Value::Array(vec![(self.x + offset.x).into(), (self.y + offset.y).into(), (self.z + offset.z).into()])
    }
}

impl Rect {
    pub fn serialize_with_offset(&self, offset: &Vector) -> Value {
        Value::Array(vec![self.center.serialize_with_offset(offset), self.size.serialize()])
    }
}

/* Implement serializable for primitive types */
#[macro_export]
macro_rules! serializable_impl (
    ($t:ty) => {
        impl Serializable for $t {
            fn serialize(&self) -> Value { self.clone().into() }
        }

        impl Serializable for Option<$t> {
            fn serialize(&self) -> Value {
                match self {
                    &Some(ref v) => v.clone().into(),
                    &None => Value::Nil,
                }
            }
        }
    }
);

serializable_impl!(bool);

serializable_impl!(u8);
serializable_impl!(u16);
serializable_impl!(u32);
serializable_impl!(usize);

serializable_impl!(i8);
serializable_impl!(i16);
serializable_impl!(i32);
serializable_impl!(i64);
serializable_impl!(isize);

serializable_impl!(f32);
serializable_impl!(f64);

serializable_impl!(String);

//serializable_impl!(Vec<u8>);
//serializable_impl!(Vec<Value>);
//serializable_impl!(Vec<(Value, Value)>);

/*** Math ***/
pub type FloatType = f64;

/*** Vector ***/
#[derive(Clone, Debug)]
pub struct Vector {
    pub x: FloatType,
    pub y: FloatType,
    pub z: FloatType
}

impl Vector {
    #[inline]
    pub fn new(x: FloatType, y: FloatType, z: FloatType) -> Vector {
        Vector { x, y, z }
    }

    #[inline]
    pub fn scalar(v: FloatType) -> Vector {
        Vector::new(v, v, v)
    }

    #[inline]
    pub fn copy_from(&mut self, other: &Vector) {
        self.x = other.x;
        self.y = other.y;
        self.z = other.z;
    }

    #[inline]
    pub fn zero() -> Vector {
        return Vector::new(0., 0., 0.);
    }

    #[inline]
    pub fn set(&mut self, x: FloatType, y: FloatType, z: FloatType) {
        self.x = x;
        self.y = y;
        self.z = z;
    }

    #[inline]
    pub fn scale(&mut self, scale: &FloatType) {
        self.x *= scale;
        self.y *= scale;
        self.z *= scale;
    }

    #[inline]
    pub fn add(&mut self, other: &Vector, multiplier: FloatType) {
        self.x += other.x * multiplier;
        self.y += other.y * multiplier;
        self.z += other.z * multiplier;
    }

    #[inline]
    pub fn magnitude(&self) -> FloatType {
        (self.x.powf(2.) + self.y.powf(2.) + self.z.powf(2.)).powf(0.5)
    }

    #[inline]
    pub fn distance(&self, other: &Vector) -> FloatType {
        // Calculate the absolute differences
        let diff_x = (self.x - other.x).abs();
        let diff_y = (self.y - other.y).abs();
        let diff_z = (self.z - other.z).abs();

        // Return the distance
        (diff_x.powf(2.) + diff_y.powf(2.) + diff_z.powf(2.)).powf(0.5)
    }
}

impl fmt::Display for Vector {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "[{},{},{}]", self.x, self.y, self.z)
    }
}

impl PartialEq for Vector {
    fn eq(&self, other: &Vector) -> bool {
        self.x == other.x && self.y == other.y && self.z == other.z
    }
}

impl Index<usize> for Vector {
    type Output = FloatType;

    fn index(&self, index: usize) -> &FloatType {
        match index {
            0 => &self.x,
            1 => &self.y,
            2 => &self.z,
            _ => panic!("Invalid vector index {}", index)
        }
    }
}

impl IndexMut<usize> for Vector {
    fn index_mut(&mut self, index: usize) -> &mut FloatType {
        match index {
            0 => &mut self.x,
            1 => &mut self.y,
            2 => &mut self.z,
            _ => panic!("Invalid vector index {}", index)
        }
    }
}

impl IncrementalValueInner for Vector { }

impl IncrementalValueDiffInner<FloatType> for Vector {
    fn is_changed(&self, other: &Self, max_diff: &FloatType) -> bool {
        self.distance(other) >= *max_diff
    }
}

/*** Rect ***/
#[derive(Clone, Debug)]
pub struct Rect {
    pub center: Vector,
    pub size: Vector
}

impl Rect {
    pub fn new(center: Vector, size: Vector) -> Rect {
        Rect { center, size }
    }

    pub fn copy_from(&mut self, other: &Rect) {
        self.center.copy_from(&other.center);
        self.size.copy_from(&other.size);
    }

    pub fn x_upper_extent(&self, offset: FloatType) -> FloatType { self.center.x + self.size.x / 2. + offset }
    pub fn x_lower_extent(&self, offset: FloatType) -> FloatType { self.center.x - self.size.x / 2. + offset }

    pub fn y_upper_extent(&self, offset: FloatType) -> FloatType { self.center.y + self.size.y / 2. + offset }
    pub fn y_lower_extent(&self, offset: FloatType) -> FloatType { self.center.y - self.size.y / 2. + offset }

    pub fn z_upper_extent(&self, offset: FloatType) -> FloatType { self.center.z + self.size.z / 2. + offset }
    pub fn z_lower_extent(&self, offset: FloatType) -> FloatType { self.center.z - self.size.z / 2. + offset }

    pub fn rotate(&mut self, rotation: &u8) {
        measure_verbose!("Rotate rect");

        for i in 0..*rotation {
            // Rotate center (x, y) = (-y, x)
            self.center.y *= -1.;
            swap(&mut self.center.x, &mut self.center.y);

            // Swap size (w, h) = (h, w)
            swap(&mut self.size.x, &mut self.size.y);
        }
    }

    /// Checks if the ray intersects this rectangle and returns the % of the ray length that
    /// it collided.
    /// Based on https://tavianator.com/fast-branchless-raybounding-box-intersections/
    /// (found from https://github.com/tmpvar/ray-aabb-slab)
    pub fn intersects_ray(&self, r: &Ray, offset: &Vector) -> Option<FloatType> {
        // Define lower and upper bounds for the AABB test
        let min = Vector::new(
            self.x_lower_extent(offset.x),
            self.y_lower_extent(offset.y),
            self.z_lower_extent(offset.z)
        );
        let max = Vector::new(
            self.x_upper_extent(offset.x),
            self.y_upper_extent(offset.y),
            self.z_upper_extent(offset.z)
        );

        // Get the dir inverse for the ray
        let r_dir_inv = Vector::new(1. / r.dir.x, 1. / r.dir.y, 1. / r.dir.z);

        // Determine min and max rays
        let mut tmin = -f64::INFINITY;
        let mut tmax = f64::INFINITY;

        // Determine the min and max for each dimention
        for i in 0..3 {
            let t1 = (min[i] - r.origin[i]) * r_dir_inv[i];
            let t2 = (max[i] - r.origin[i]) * r_dir_inv[i];

            tmin = FloatType::max(tmin, FloatType::min(t1, t2));
            tmax = FloatType::min(tmax, FloatType::max(t1, t2));
        }

        // Return the collision distance or none, depending on if it collided
        if tmax > FloatType::max(tmin, 0.0) {
            Some(tmin)
        } else {
            None
        }
    }

    pub fn intersects(&self, other: &Rect, offset: &Vector, other_offset: &Vector) -> bool {
        measure_verbose!("Intersects");

        // This can be merged into `collide` to reuse some code (just find distance in each dimension
        // but this is more performance and doesn't allocate as much memory/calculations)
        return
            self.x_upper_extent(offset.x) > other.x_lower_extent(other_offset.x) &&
            self.x_lower_extent(offset.x) < other.x_upper_extent(other_offset.x) &&

            self.y_upper_extent(offset.y) > other.y_lower_extent(other_offset.y) &&
            self.y_lower_extent(offset.y) < other.y_upper_extent(other_offset.y) &&

            self.z_upper_extent(offset.z) > other.z_lower_extent(other_offset.z) &&
            self.z_lower_extent(offset.z) < other.z_upper_extent(other_offset.z)
    }

    pub fn contains_point(&self, other: &Vector, offset: &Vector) -> bool {
        return
            other.x < self.x_upper_extent(offset.x) &&
            other.x > self.x_lower_extent(offset.x) &&

            other.y < self.y_upper_extent(offset.y) &&
            other.y > self.y_lower_extent(offset.y) &&

            other.z < self.z_upper_extent(offset.z) &&
            other.z > self.z_lower_extent(offset.z)
    }

    pub fn volume(&self) -> FloatType {
        return self.size.x * self.size.y * self.size.z
    }
}

impl fmt::Display for Rect {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "[{},{}]", self.center, self.size)
    }
}

impl PartialEq for Rect {
    fn eq(&self, other: &Rect) -> bool {
        self.center == other.center && self.size == other.size
    }
}

impl IncrementalValueInner for Rect { }

/*** Rays ***/
#[derive(Clone, Debug)]
pub struct Ray {
    /// The origin point of the ray
    origin: Vector,

    /// Which direction the ray extends in
    dir: Vector,

    /// How long the ray extends
    length: FloatType
}

impl Ray {
    pub fn new(origin: Vector, dir: Vector, length: FloatType) -> Ray {
        Ray { origin, dir, length }
    }

    pub fn origin(&self) -> &Vector { &self.origin }
    pub fn dir(&self) -> &Vector { &self.dir }
    pub fn length(&self) -> &FloatType { &self.length }
}

/*** Pack incremental values ((*/
/// Data structure that values are packed into
pub type PackData = Vec<(Value, Value)>;

/// The type of flag to use in the data
pub trait PackFlag {
    fn pack_flag(&self) -> PackFlagRaw;
}

/// The type of flag that will be used to write to MessagePack
pub type PackFlagRaw = u8;

pub fn pack_incremental_value<T: IncrementalValueInner>(init: bool, data: &mut PackData, flag: &PackFlag, incremental_value: &IncrementalValueLike<T>) where T: Serializable {
    measure!("Pack incremental value");

    // Add the incremental value to the dictionary, if it's changed
    if init || incremental_value.is_changed() {
        let value = incremental_value.get().serialize();
        pack_value(data, flag, value);
    }
}

pub fn pack_incremental_value_init<T: IncrementalValueInner>(data: &mut PackData, init: bool, flag: &PackFlag, incremental_value: &IncrementalValueLike<T>) where T: SerializableInit {
    measure!("Pack incremental value init");

    // Add the incremental value to the dictionary, if it's changed
    if incremental_value.is_changed() {
        let value = incremental_value.get().serialize(init);
        pack_value(data, flag, value);
    }
}

pub fn pack_value(data: &mut PackData, flag: &PackFlag, value: Value) {
    measure!("Pack value");

    data.push((Value::from(flag.pack_flag()), value));
}

