pub mod meta;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Config {
    pub meta: meta::Meta,
    pub display: Display,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Display {
    pub title: String,
    pub tutorial_url: Option<String>,
    pub preview_file: Option<String>,
    pub overview_weight: Option<f64>,
}
