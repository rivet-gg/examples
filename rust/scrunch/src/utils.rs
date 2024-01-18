use rand;
use std::{
    ops::AddAssign,
    time::{SystemTime, UNIX_EPOCH},
};

/*** Counter ***/
/// Used to count items.
pub struct Counter<T: AddAssign + Copy> {
    count: T,
    increment: T,
}

impl<T: AddAssign + Copy> Counter<T> {
    pub fn new(initial: T, increment: T) -> Counter<T> {
        Counter {
            count: initial,
            increment,
        }
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

/*** Result ***/
//pub trait ResultHandler<T> {
//    fn log_err(&self) -> T;
//}
//
//impl<T, E: Display> ResultHandler<T> for Result<T, E> {
//    fn log_err(&self) -> T {
//        match *self {
//            Ok(value) => value,
//            Err(err) => println!("Result error: {}", err)
//        }
//    }
//}
//
//impl<T> ResultHandler<T> for Option<T> {
//    fn log_err(&self) -> T {
//        match *self {
//            Some(value) => value,
//            None => println!("Invalid option unwrap.")
//        }
//    }
//}

/*** Macros ***/
#[macro_export]
macro_rules! unwrap_data {
    ($expr:expr) => {
        match $expr {
            Option::Some(val) => val,
            Option::None => return Err($crate::network::MessageError::MissingData),
        }
    };
}

#[macro_export]
macro_rules! silence {
    ($expr:expr) => {
        match $expr {
            _ => {}
        }
    };
}

/*** Time utils ***/
pub fn time_milliseconds() -> u64 {
    let start = SystemTime::now();
    let since_the_epoch = start
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards");
    return since_the_epoch.as_secs() * 1000 + since_the_epoch.subsec_nanos() as u64 / 1_000_000;
}

/*** Collection utils ***/
// From: https://github.com/rust-lang/rust/issues/19639#issuecomment-66200471
pub fn random_sample<A, T>(iter: A) -> Option<T>
where
    A: Iterator<Item = T>,
{
    let mut elem = None;
    let mut i = 1f64;
    for new_item in iter {
        if rand::random::<f64>() < (1f64 / i) {
            elem = Some(new_item);
        }
        i += 1.0;
    }
    elem
}
