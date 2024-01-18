#[macro_use]
mod utils;

mod entities;
mod game;
mod game_config;
mod game_world;
mod incremental_value;
mod network;
mod quad_tree;
mod rivet;

use std::sync::mpsc::channel;

use crate::network::start_socket_server;

fn main() {
    // Start the game
    let (tx_client_handle, rx_client_handle) = channel();
    let game = game::Game::new(rx_client_handle);

    // Start socket server
    start_socket_server("0.0.0.0:3000", tx_client_handle);

    rivet::lobby_ready().expect("rivet::lobby_ready");

    // Start the game loop
    game.launch();
}
