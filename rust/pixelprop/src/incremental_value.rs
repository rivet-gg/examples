use std::ops::Sub;

/*** Incremental Value Like ***/
pub trait IncrementalValueLike<T> {
    /// If the value has changed since the last time it was committed.
    fn is_changed(&self) -> bool;

    /// Called after the value was committed and sets it to not changed.
    fn committed(&mut self);

    /// Returns the current value.
    fn get(&self) -> &T;

    /// Returns a mutable copy of the current value and checks if it changed.
    fn get_mut(&mut self) -> &mut T;

    /// Sets a new value.
    fn set(&mut self, value: T);
}

/*** Incremental Value ***/
/// Used to keep track of constantly changing values to see if they changed. This is useful for
/// preventing sending the same value over the network continuously.
#[derive(Debug)]
pub struct IncrementalValue<T> {
    /// The last previous value stored by the item before `committed` is called.
    previous_value: T,

    /// The value that is being held by the structure
    value: T
}

impl<T: IncrementalValueInner> IncrementalValue<T> {
    pub fn new(value: T) -> IncrementalValue<T> {
        IncrementalValue {
            previous_value: value.clone(),
            value
        }
    }

    pub fn is_changed(&self) -> bool {
        // Test their equality
        self.value != self.previous_value
    }

    pub fn committed(&mut self) {
        if self.is_changed() {
            self.previous_value.clone_from(&self.value);
        }
    }

    pub fn get(&self) -> &T {
        &self.value
    }

    pub fn get_test(&self) -> &T {
        &self.value
    }

    pub fn get_mut(&mut self) -> &mut T {
        &mut self.value
    }

    pub fn set(&mut self, new_value: T) {
        self.value = new_value;
    }

    pub fn clone_value(&self) -> T {
        self.value.clone()
    }
}

impl<T: IncrementalValueInner> IncrementalValueLike<T> for IncrementalValue<T> {
    fn is_changed(&self) -> bool { self.is_changed() }
    fn committed(&mut self) { self.committed() }
    fn get(&self) -> &T { self.get() }
    fn get_mut(&mut self) -> &mut T { self.get_mut() }
    fn set(&mut self, value: T) { self.set(value) }
}

/*** Incremental Value Manual ***/
#[derive(Debug)]
pub struct IncrementalValueManual<T> {
    /// The value that is being held by the structure
    value: T,

    /// If the value has changed; this is set to true if a mutable borrow or new value is set
    is_changed: bool
}

impl<T> IncrementalValueManual<T> {
    pub fn new(value: T) -> IncrementalValueManual<T> {
        IncrementalValueManual {
            value,
            is_changed: false
        }
    }

    /// If changed
    pub fn is_changed(&self) -> bool {
        self.is_changed
    }

    /// Forces the changed value to a certain value; usually, the structure should be allowed to
    /// set `is_changed` by itself and this never needs to be called.
    pub fn force_changed(&mut self, is_changed: bool) {
        self.is_changed = is_changed;
    }

    /// Called after the value was sent to the client, so it sets `is_changed` to false.
    pub fn committed(&mut self) { self.is_changed = false; }

    /// Returns the value
    pub fn get(&self) -> &T {
        &self.value
    }

    /// Returns the value and flags as changed
    pub fn get_mut(&mut self) -> &mut T {
        self.is_changed = true;
        &mut self.value
    }

    /// Sets a new value and flags changed
    pub fn set(&mut self, new_value: T) {
        self.is_changed = true;
        self.value = new_value;
    }
}

impl<T: Clone> IncrementalValueManual<T> {
    pub fn clone_value(&self) -> T {
        self.value.clone()
    }
}

impl<T> IncrementalValueLike<T> for IncrementalValueManual<T> {
    fn is_changed(&self) -> bool { self.is_changed() }
    fn committed(&mut self) { self.committed() }
    fn get(&self) -> &T { self.get() }
    fn get_mut(&mut self) -> &mut T { self.get_mut() }
    fn set(&mut self, value: T) { self.set(value) }
}

/*** Incremental Value Diff ***/
#[derive(Debug)]
pub struct IncrementalValueDiff<T, U> {
    /// The last previous value stored by the item before `committed` is called.
    previous_value: T,

    /// The value that is being held by the structure
    value: T,

    /// How much the value has to change before sending a new value
    diff: U,

    // We don't use `is_changed_cached` here since if we cached it, the diff could creep a long
    // distance without sending an update. e.g. with a value of 0 and a diff of 0.2, it could move
    // to 0.15 one update then 0.30 and 0.45 in subsequent updates without ever sending a changed
    // value.
}

impl<T: IncrementalValueDiffInner<U>, U> IncrementalValueDiff<T, U> {
    pub fn new(value: T, diff: U) -> IncrementalValueDiff<T, U> {
        IncrementalValueDiff {
            previous_value: value.clone(),
            value,
            diff
        }
    }

    /// If the value has changed.
    pub fn is_changed(&self) -> bool {
        // Check if there was a difference
        self.value.is_changed(&self.previous_value, &self.diff)
    }

    /// Called after the value was sent to the client, so it sets `is_changed` to false.
    pub fn committed(&mut self) {
        if self.is_changed() {
            self.previous_value.clone_from(&self.value);
        }
    }

    /// Returns the value
    pub fn get(&self) -> &T {
        &self.value
    }

    /// Returns the value and flags as changed
    pub fn get_mut(&mut self) -> &mut T {
        &mut self.value
    }

    /// Sets a new value and flags changed
    pub fn set(&mut self, new_value: T) {
        self.value = new_value;
    }

    /// Clones and returns the value.
    pub fn clone_value(&self) -> T {
        self.value.clone()
    }
}

impl<T: IncrementalValueDiffInner<U>, U> IncrementalValueLike<T> for IncrementalValueDiff<T, U> {
    fn is_changed(&self) -> bool { self.is_changed() }
    fn committed(&mut self) { self.committed() }
    fn get(&self) -> &T { self.get() }
    fn get_mut(&mut self) -> &mut T { self.get_mut() }
    fn set(&mut self, value: T) { self.set(value) }
}

/*** Incremental Value Inner ***/
/// Type that can be used inside an `IncrementalValue`.
pub trait IncrementalValueInner: PartialEq + Clone { }
pub trait IncrementalValueDiffInner<U>: Clone {
    /// Returns if there is enough difference between the two values that the value should be
    /// considered changed. Should be using >= rather than > to compare if values changed enough.
    fn is_changed(&self, other: &Self, max_diff: &U) -> bool;
}

// Implement incremental inner for many common types
impl<T> IncrementalValueInner for Vec<T> where T: IncrementalValueInner {

}

impl<T> IncrementalValueInner for Option<T> where T: IncrementalValueInner {

}

#[macro_export]
macro_rules! incremental_value_inner_impl (
    ($t:ty) => {
        impl IncrementalValueInner for $t { }
    }
);

#[macro_export]
macro_rules! incremental_value_diff_inner_impl (
    ($t:ty) => {
        impl IncrementalValueDiffInner<$t> for $t {
            fn is_changed(&self, other: &Self, max_diff: &$t) -> bool {
                let diff = if self > other {
                    self - other
                } else {
                    other - self
                };
                diff >= *max_diff
            }
        }
    }
);

incremental_value_inner_impl!(bool);
incremental_value_inner_impl!(u8);
incremental_value_inner_impl!(u16);
incremental_value_inner_impl!(u32);
incremental_value_inner_impl!(usize);
incremental_value_inner_impl!(i8);
incremental_value_inner_impl!(i16);
incremental_value_inner_impl!(i32);
incremental_value_inner_impl!(i64);
incremental_value_inner_impl!(isize);
incremental_value_inner_impl!(f32);
incremental_value_inner_impl!(f64);
incremental_value_inner_impl!(String);

incremental_value_diff_inner_impl!(u8);
incremental_value_diff_inner_impl!(u16);
incremental_value_diff_inner_impl!(u32);
incremental_value_diff_inner_impl!(usize);
incremental_value_diff_inner_impl!(i8);
incremental_value_diff_inner_impl!(i16);
incremental_value_diff_inner_impl!(i32);
incremental_value_diff_inner_impl!(i64);
incremental_value_diff_inner_impl!(isize);
incremental_value_diff_inner_impl!(f32);
incremental_value_diff_inner_impl!(f64);

impl<T, U> IncrementalValueDiffInner<U> for Option<T> where T: IncrementalValueDiffInner<U> {
    fn is_changed(&self, other: &Self, max_diff: &U) -> bool {
        match (self, other) {
            (&Some(_), &None) => true, // Changed from some to none
            (&None, &Some(_)) => true, // Changed from none to some
            (&Some(ref inner_left), &Some(ref inner_right)) => inner_left.is_changed(inner_right, max_diff),
            _ => false
        }
    }
}

/* Tests */
#[cfg(test)]
mod test {
    // TODO: Add tests for if you change the value then change it back to the original value before committing

    use super::*;

    /* IncrementalValue */
    #[cfg(test)]
    mod incremental_value {
        use super::{IncrementalValue};

        #[test]
        fn test_cached() {
            let mut iv = IncrementalValue::new(0);
            assert!(!iv.is_changed());

            iv.set(5);
            assert!(iv.is_changed()); // Uses previous value
            assert!(iv.is_changed()); // Uses cached value

            iv.committed();
            assert!(!iv.is_changed());
            assert!(!iv.is_changed());
        }

        #[test]
        fn test_set_same_value() {
            let mut iv = IncrementalValue::new("my string".to_string());
            assert!(!iv.is_changed());

            iv.set("my string".to_string());
            assert!(!iv.is_changed());

            iv.set("my string 2".to_string());
            assert!(iv.is_changed());

            iv.committed();
            assert!(!iv.is_changed());

            let mut my_string = iv.get_mut();
            my_string.clone_from(&"my string 2".to_string());
            assert!(!iv.is_changed());

            let mut my_string = iv.get_mut();
            my_string.clone_from(&"my string 3".to_string());
            assert!(iv.is_changed());
        }

        #[test]
        fn test_vector() {
            use crate::utils::Vector;

            let mut iv = IncrementalValue::new(Vector::zero());
            assert!(!iv.is_changed());

            iv.set(Vector::zero());
            assert!(!iv.is_changed());

            iv.set(Vector::new(1., 1., 1.));
            assert!(iv.is_changed());

            iv.committed();
            assert!(!iv.is_changed());
        }

        #[test]
        fn test_rect() {
            use crate::utils::{Vector, Rect};

            let mut iv = IncrementalValue::new(Rect::new(Vector::zero(), Vector::zero()));
            assert!(!iv.is_changed());

            iv.set(Rect::new(Vector::zero(), Vector::zero()));
            assert!(!iv.is_changed());

            iv.set(Rect::new(Vector::new(1., 1., 1.), Vector::new(1., 1., 1.)));
            assert!(iv.is_changed());

            iv.committed();
            assert!(!iv.is_changed());
        }

        #[test]
        fn test_vec() {
            let mut iv = IncrementalValue::new(vec![0,1,2]);
            assert!(!iv.is_changed());

            iv.set(vec![0,1,2]);
            assert!(!iv.is_changed());

            iv.set(vec![1,2,3]);
            assert!(iv.is_changed());

            iv.committed();
            assert!(!iv.is_changed());
        }

        #[test]
        fn test_bool() {
            let mut iv = IncrementalValue::new(true);
            assert!(!iv.is_changed());

            iv.set(false);
            assert!(iv.is_changed());
            assert!(iv.is_changed());
            assert!(iv.is_changed());

            iv.set(true);
            assert!(!iv.is_changed());
            assert!(!iv.is_changed());
            assert!(!iv.is_changed());

            iv.set(false);
            assert!(iv.is_changed());
            iv.committed();
            assert!(!iv.is_changed());
            assert!(!iv.is_changed());
            assert!(!iv.is_changed());
        }
    }

    mod incremental_value_diff {
        use super::{IncrementalValueDiff};

        #[test]
        fn test_normal() {
            let mut iv = IncrementalValueDiff::new(0., 0.5);
            assert!(!iv.is_changed());

            iv.set(5.);
            assert!(iv.is_changed());

            iv.committed();
            assert!(!iv.is_changed());
        }

        #[test]
        fn test_range() {
            let mut iv = IncrementalValueDiff::new(0., 0.5);
            assert!(!iv.is_changed());

            iv.set(0.25);
            assert!(!iv.is_changed());

            iv.set(0.4);
            assert!(!iv.is_changed());

            iv.set(1.);
            assert!(iv.is_changed());

            iv.committed();
            assert!(!iv.is_changed());
        }

        #[test]
        fn test_ge() {
            let mut iv = IncrementalValueDiff::new(0., 0.5);
            assert!(!iv.is_changed());

            iv.set(0.5);
            assert!(iv.is_changed());

            iv.set(1.);
            assert!(iv.is_changed());

            iv.set(0.25);
            assert!(!iv.is_changed());

            iv.committed();
            assert!(!iv.is_changed());
        }

        #[test]
        fn test_vector() {
            use crate::utils::Vector;

            let mut iv = IncrementalValueDiff::new(Vector::zero(), 0.5);
            assert!(!iv.is_changed());

            iv.set(Vector::zero());
            assert!(!iv.is_changed());

            iv.set(Vector::new(1., 1., 1.));
            assert!(iv.is_changed());

            iv.committed();
            assert!(!iv.is_changed());
        }
    }

    // TODO: Unit tests for incremental value
}
