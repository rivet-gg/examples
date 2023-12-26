use std::sync::Arc;

use anyhow::{Context, Result};
use futures_util::{
    stream::{SplitSink, SplitStream},
    SinkExt, StreamExt, TryStreamExt,
};
use tokio::{io::AsyncBufReadExt, sync::Notify};
use tokio_tungstenite::{tungstenite::Message, WebSocketStream};

type MyWebSocketStream = WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();

    let rivet_client_token = std::env::var("RIVET_CLIENT_TOKEN")?;

    // Build client
    let raw_client = rivet_matchmaker::Builder::dyn_https()
        .middleware(tower::layer::util::Identity::new())
        .sleep_impl(None)
        .build();
    let config = rivet_matchmaker::Config::builder()
        .set_uri("https://matchmaker.api.rivet.gg/v1")
        .set_bearer_token(rivet_client_token)
        .build();
    let mm_api = rivet_matchmaker::Client::with_config(raw_client, config);

    // Find lobby
    println!("Finding lobby");
    let lobby_res = mm_api.find_lobby().game_modes("default").send().await?;
    let lobby = lobby_res.lobby().context("lobby_res.lobby")?;
    let player_token = lobby
        .player()
        .and_then(|x| x.token())
        .context("lobby.player.token")?;
    let port = lobby
        .ports()
        .and_then(|x| x.get("default"))
        .context("lobby.ports[\"default\"]")?;
    let host = port.host().context("port.host")?;
    let proto = if port.is_tls().context("port.is_tls")? {
        "wss"
    } else {
        "ws"
    };
    let url = format!("{proto}://{host}");

    // Connect ot server
    println!("Connecting to {url}");
    let (ws_stream, _) = tokio_tungstenite::connect_async(url)
        .await
        .context("failed to connect")?;
    let (mut write, read) = ws_stream.split();
    println!("Connected");

    // Send player token
    println!("Sending player token {player_token}");
    write.send(Message::text(player_token)).await?;

    // Build input/output futures
    let notify = Arc::new(Notify::new());
    let listen_ctrl_c_wait = tokio::spawn(listen_ctrl_c(notify.clone()));
    let read_stdin_fut = tokio::spawn(read_stdin(write, notify.clone()));
    let write_stdout_fut = tokio::spawn(write_stdout(read, notify.clone()));

    // Wait for any future to finish/exit
    futures_util::future::join_all([listen_ctrl_c_wait, read_stdin_fut, write_stdout_fut]).await;
    println!("All tasks shut down");

    // Force exit since `read_line` future cannot be cancelled.
    std::process::exit(0);
}

async fn listen_ctrl_c(notify: Arc<Notify>) -> Result<()> {
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            notify.notify_waiters();
        }
        _ = notify.notified() => {}
    }
    Ok(())
}

async fn read_stdin(
    mut sink: SplitSink<MyWebSocketStream, Message>,
    notify: Arc<Notify>,
) -> Result<()> {
    let stdin = tokio::io::stdin();
    let reader = tokio::io::BufReader::new(stdin);
    let mut lines = reader.lines();
    loop {
        tokio::select! {
            res = lines.next_line() => {
                if let Some(line) = res? {
                    sink.send(Message::text(line)).await?;
                } else {
                    println!("No more lines");
                    notify.notify_waiters();
                    break;
                }
            }
            _ = notify.notified() => {
                sink.send(Message::Close(None)).await?;
                break;
            }
        }
    }

    Ok(())
}
async fn write_stdout(
    mut stream: SplitStream<MyWebSocketStream>,
    notify: Arc<Notify>,
) -> Result<()> {
    loop {
        tokio::select! {
            res = stream.try_next() => {
                if let Some(msg) = res? {
                    println!("Received: {:?}", msg);
                } else {
                    println!("Socket closed");
                    notify.notify_waiters();
                    break;
                }
            }
            _ = notify.notified() => {
                break;
            }
        }
    }

    Ok(())
}
