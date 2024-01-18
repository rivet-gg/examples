#[macro_use]
mod utils;

mod entities;
mod game;
mod game_map;
mod incremental_value;
mod network;
mod rivet;

fn main() {
    // Start the game
    let game = game::Game::new();

    rivet::lobby_ready().expect("lobby_ready");

    let game = game.clone();
    ws::listen("0.0.0.0:3000", |out| {
        network::Client::new(game.clone(), out)
    })
    .unwrap();
}
