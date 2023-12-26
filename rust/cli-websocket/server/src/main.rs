use std::net::SocketAddr;

use anyhow::{Context, Result};
use futures_util::{
    stream::{SplitSink, SplitStream},
    SinkExt, StreamExt, TryStreamExt,
};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{tungstenite::Message, WebSocketStream};

pub type MatchmakerApi =
    rivet_matchmaker::Client<aws_smithy_client::erase::DynConnector, tower::layer::util::Identity>;

type MyWebSocketStream = WebSocketStream<tokio::net::TcpStream>;

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();

    let rivet_lobby_token = std::env::var("RIVET_LOBBY_TOKEN")?;
    let port = std::env::var("PORT")
        .ok()
        .and_then(|x| x.parse::<u16>().ok())
        .unwrap_or(5000);

    // Build client
    let raw_client = rivet_matchmaker::Builder::dyn_https()
        .middleware(tower::layer::util::Identity::new())
        .sleep_impl(None)
        .build();
    let config = rivet_matchmaker::Config::builder()
        .set_uri("https://matchmaker.api.rivet.gg/v1")
        .set_bearer_token(rivet_lobby_token)
        .build();
    let mm_api = rivet_matchmaker::Client::with_config(raw_client, config);

    // Create the event loop and TCP listener we'll accept connections on.
    let listener = TcpListener::bind(("0.0.0.0", port)).await?;
    println!("Listening on {}", port);

    // Flag server as ready to accept connections
    mm_api.lobby_ready().send().await?;
    println!("Lobby ready");

    // Start runtime
    loop {
        let (stream, _) = listener.accept().await?;
        tokio::spawn(accept_connection(mm_api.clone(), stream));
    }
}

async fn accept_connection(mm_api: MatchmakerApi, stream: TcpStream) {
    match accept_connection_inner(mm_api, stream).await {
        Ok(()) => {}
        Err(err) => println!("Connection error: {}", err),
    }
}

async fn accept_connection_inner(mm_api: MatchmakerApi, stream: TcpStream) -> Result<()> {
    let addr = stream.peer_addr()?;
    let ws_stream = tokio_tungstenite::accept_async(stream).await?;

    println!("{addr}: Connected");

    let (mut write, mut read) = ws_stream.split();

    // Read init message
    println!("{addr}: Waiting for player token");
    let player_token = read
        .try_next()
        .await?
        .context("player token not provided")?
        .into_text()
        .context("player token not text")?;

    println!("{addr}: Verifying player token {player_token}");
    mm_api
        .player_connected()
        .player_token(&player_token)
        .send()
        .await?;
    println!("{addr}: Player verified");

    // Read messages
    //
    // Gracefully catch errors so `player_disconnected` is called regardless of
    // the result.
    let read_res = read_messages(&addr, &mut write, &mut read).await;

    println!("{addr}: Removing player from matchmaker");
    mm_api
        .player_disconnected()
        .player_token(&player_token)
        .send()
        .await?;

    println!("{addr}: Disconnected");

    read_res
}

async fn read_messages(
    addr: &SocketAddr,
    write: &mut SplitSink<MyWebSocketStream, Message>,
    read: &mut SplitStream<MyWebSocketStream>,
) -> Result<()> {
    while let Some(msg) = read.try_next().await? {
        println!("{addr}: Received {msg:?}");
        write.send(msg).await?;
    }

    Ok(())
}
