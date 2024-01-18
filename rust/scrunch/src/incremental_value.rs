#[derive(Debug)]
pub struct IncrementalValue<T> {
    /// The value that is being held by the structure
    value: T,

    /// If the value has changed; this is set to true if a mutable borrow or new value is set
    is_changed: bool
}

impl<T> IncrementalValue<T> {
    pub fn new(value: T) -> IncrementalValue<T> {
        IncrementalValue {
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
    pub fn updated(&mut self) { self.is_changed = false; }

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
        self.value = new_value;
        self.is_changed = true;
    }
}

impl<T: Clone> IncrementalValue<T> {
    pub fn clone_value(&self) -> T {
        self.value.clone()
    }
}
