pub mod meta;
pub mod tpl;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Config {
    pub meta: meta::Meta,
    pub display: Display,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Display {
    pub title: String,
    pub tutorial_url: Option<String>,
    pub preview_file: Option<String>,

    /// A higher number will show it before other examples.
    pub overview_weight: Option<i64>,
}
