use crate::utils::{FloatType, Rect, Vector};
use serde::de::{Deserializer, SeqAccess, Visitor};
use serde::{Deserialize, Serialize};
use serde_yaml;
use std::collections::HashMap;
use std::fmt;
use std::fs::File;
use std::io::prelude::*;
use std::sync::Arc;

// TODO: Custom deserializer for the vec

lazy_static::lazy_static! {
    pub static ref GAME_CONFIG: GameConfig = {
        // Read the config
        let mut file = File::open("./game-config.yaml").expect("Unable to open the game config");
        let mut contents = String::new();
        file.read_to_string(&mut contents).expect("Unable to read the game config");
//        println!("Config file:\n{}", contents);

        // Parse the config
        let config = serde_yaml::from_str::<GameConfig>(&contents).unwrap();
//        println!("Config data: {:?}", config);

        config
    };

    pub static ref STORE_JSON: String = serde_json::to_string(&GAME_CONFIG.store).expect("serialize store json");
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameConfig {
    pub gravity: FloatType,
    pub map_size: FloatType,
    pub view_range: FloatType,

    pub store: Arc<StoreConfig>,
    pub player: PlayerConfig,
    pub scoring: ScoringConfig,
    pub prefabs: Vec<PrefabConfigHandle>,
    pub maps: HashMap<String, MapConfig>,
}

impl GameConfig {
    pub fn prefab_with_id(&self, id: &String) -> Option<&PrefabConfigHandle> {
        // Find and return the prefab
        for prefab in self.prefabs.iter() {
            if &prefab.id == id {
                return Some(&prefab);
            }
        }

        // No results
        None
    }
}

/* Store */
#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StoreConfig {
    pub characters: Vec<CharacterConfig>,
}

#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CharacterConfig {
    pub id: String,
    pub name: String,
}

/* Player */
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlayerConfig {
    pub prop_prefab: String, // Default asset for the prop
    pub shoot_pos: Vector,
    pub move_speed: FloatType,
    pub sprint_speed: FloatType,
    pub prop_stamina: FloatType,
    pub hunter_stamina: FloatType,
    pub jump_velocity: FloatType,
    pub min_shoot_delay: FloatType,
    pub ping_delay_min: FloatType,
    pub ping_delay_base: (FloatType, FloatType),
    pub ping_delay_unit: (FloatType, FloatType),
}

/* Scoring */
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScoringConfig {
    pub winning_team: u64,
    pub first: u64,
    pub second: u64,
    pub third: u64,

    pub killed_player: u64,
    pub hit_shot: u64,
    pub percent_hit_scale: u64,

    pub prop_health: u64,
    pub ping: u64,
    pub ping_per_unit: u64,
    pub sleeping_per_second: f64,
}

/* Prefab */
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind")]
pub enum PrefabKind {
    Prop,
    Fixture,
}

pub type PrefabConfigHandle = Arc<PrefabConfig>;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PrefabConfig {
    pub id: String,

    #[serde(default = "default_kind")]
    pub kind: PrefabKind,

    #[serde(default = "default_health")]
    pub health: f64,

    #[serde(default = "default_asset")]
    pub asset: Option<String>,

    pub rects: Vec<Rect>, // Rect center is defined at the bottom center; this will be adjusted when loaded

    #[serde(default = "default_color")]
    pub minimap_color: String,

    #[serde(default = "default_rects")]
    pub minimap_rects: Vec<Rect>, // Same as `rects`, but it doesn't actually do anything in the physics engine; just shows on minimap
}

impl PrefabConfig {
    pub fn asset(&self) -> String {
        self.asset.clone().unwrap_or_else(|| self.id.clone())
    }
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MapConfig {
    pub name: String,
    pub objects: Vec<MapObjectKind>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum MapObjectKind {
    Object(ObjectConfigHandle),
    Group(Arc<GroupConfig>),
    Building(Arc<BuildingConfig>),
}

pub type ObjectConfigHandle = Arc<ObjectConfig>;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ObjectConfig {
    pub prefab_id: String,

    #[serde(default = "default_pos")]
    pub position: Vector,

    #[serde(default = "default_rot")]
    pub rotation: u8,

    #[serde(default = "default_spawn_chance")]
    pub spawn_chance: f64,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GroupConfig {
    pub group_name: String,
    pub offset: Vector,
    pub objects: Vec<MapObjectKind>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BuildingConfig {
    /*
    Visual building constructor
    The map is a grid of letters for laying out the walls and corners
    Use the `|-` operator in YAML for multiline strings

    Example lookup:
    x: corner
    a: wall
    b: wall 2
    f: floor


    Example map: (number after the letter is the rotation)
    x0a0xb0x0
    a0f0af0b0
    x0a0xb0x0
    */
    pub building_name: String,
    pub offset: Vector,
    pub room_size: FloatType,
    #[serde(default = "default_bool_false")]
    pub centered: bool,
    pub lookup_table: HashMap<String, ObjectConfigHandle>, // Lookup for the map grid
    pub map: String,
}

/* Default values */
fn default_kind() -> PrefabKind {
    PrefabKind::Prop
}
fn default_health() -> f64 {
    3.
}
fn default_asset() -> Option<String> {
    None
}
fn default_pos() -> Vector {
    Vector::zero()
}
fn default_rot() -> u8 {
    0
}
fn default_spawn_chance() -> f64 {
    1.0
}
fn default_wall() -> Option<ObjectConfigHandle> {
    None
}
fn default_rects() -> Vec<Rect> {
    Vec::new()
}
fn default_color() -> String {
    "#ffffff".to_string()
}
fn default_bool_false() -> bool {
    false
}

/* Deserialize Vector */
struct VectorVisitor;

impl<'de> Visitor<'de> for VectorVisitor {
    type Value = Vector;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a vector with three floating point values")
    }

    fn visit_seq<A>(self, mut seq: A) -> Result<Vector, A::Error>
    where
        A: SeqAccess<'de>,
    {
        // Create a vector from the elements
        Ok(Vector::new(
            seq.next_element()?.unwrap(),
            seq.next_element()?.unwrap(),
            seq.next_element()?.unwrap(),
        ))
    }
}

impl<'de> Deserialize<'de> for Vector {
    fn deserialize<D>(deserializer: D) -> Result<Vector, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(VectorVisitor)
    }
}

/* Deserialize Rect */
struct RectVisitor;

impl<'de> Visitor<'de> for RectVisitor {
    type Value = Rect;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a rect with two vectors")
    }

    fn visit_seq<A>(self, mut seq: A) -> Result<Rect, A::Error>
    where
        A: SeqAccess<'de>,
    {
        // Extract the vectors
        let mut position: Vector = seq.next_element()?.unwrap();
        let center: Vector = seq.next_element()?.unwrap();

        // Adjust the position so it indicates the bottom center of the rect
        position.z += center.z / 2.;

        // Create a rect
        Ok(Rect::new(position, center))
    }
}

impl<'de> serde::de::Deserialize<'de> for Rect {
    fn deserialize<D>(deserializer: D) -> Result<Rect, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(RectVisitor)
    }
}
