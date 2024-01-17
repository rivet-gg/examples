use futures_util::{FutureExt, SinkExt, StreamExt};
use std::{sync::Arc, time::Duration};
use tokio::sync::{Notify, RwLock};

use crate::{args::Args, span};

#[derive(Debug)]
pub enum ClientState {
	// Normal states
	Starting,
	Finding,
	Connecting,
	CheckingConnection,
	Connected,
	Closed, // Safely closed

	// Errors
	FindLobby {
		error: rivet_game_server::apis::Error<rivet_game_server::apis::client_api::FindLobbyError>,
	},
	ConnectError {
		error: tokio_tungstenite::tungstenite::Error,
	},
	SendError {
		error: tokio_tungstenite::tungstenite::Error,
	},
	ConnectTimedOut,
	EarlyClose,
	Internal {
		message: String,
	},
}

impl ClientState {
	pub fn index(&self) -> usize {
		match self {
			ClientState::Starting => 0,
			ClientState::Finding => 1,
			ClientState::Connecting => 2,
			ClientState::CheckingConnection => 3,
			ClientState::Connected => 4,
			ClientState::Closed => 5,
			ClientState::FindLobby { .. } => 6,
			ClientState::ConnectError { .. } => 7,
			ClientState::SendError { .. } => 8,
			ClientState::ConnectTimedOut => 9,
			ClientState::EarlyClose => 10,
			ClientState::Internal { .. } => 11,
		}
	}
}

impl PartialEq for ClientState {
	fn eq(&self, other: &Self) -> bool {
		self.index() == other.index()
	}
}

pub type Client = Arc<ClientInner>;

pub struct ClientInner {
	args: Arc<Args>,
	spans: span::Manager,
	api_config: rivet_game_server::apis::configuration::Configuration,
	pub id: String,
	pub region: String,
	pub lobby: RwLock<Option<Box<rivet_game_server::models::MatchmakerLobbyJoinInfo>>>,
	pub state: RwLock<ClientState>,
	pub close_notify: Notify,

	/// The data to spam the server with over the WebSocket.
	packet_data: String,
}

impl ClientInner {
	pub fn new(
		args: Arc<Args>,
		spans: span::Manager,
		api_config: rivet_game_server::apis::configuration::Configuration,
		id: String,
		region: String,
	) -> Client {
		let packet_data = std::iter::repeat('x').take(args.packet_bytes).collect();
		Arc::new(ClientInner {
			args,
			spans,
			api_config,
			id,
			region,
			lobby: RwLock::default(),
			state: RwLock::new(ClientState::Starting),
			close_notify: Notify::new(),
			packet_data,
		})
	}

	pub async fn start(self: Arc<Self>) {
		let lobby = match self.find_lobby().await {
			Ok(x) => x,
			Err(_) => return,
		};

		if !self.args.no_websocket {
			self.open_websocket(lobby).await;
		} else {
			// This will result in the players being unregistered
			*self.state.write().await = ClientState::Closed;
		}
	}

	async fn find_lobby(
		self: &Arc<Self>,
	) -> Result<Box<rivet_game_server::models::MatchmakerLobbyJoinInfo>, ()> {
		// Find lobby
		let find_span = self.spans.start("client_find");
		let find_err_span = self.spans.start("find_find_err");

		*self.state.write().await = ClientState::Finding;
		let find_res = rivet_game_server::apis::client_api::find_lobby(
			&self.api_config,
			rivet_game_server::models::FindLobbyRequest {
				game_modes: vec!["default".into()],
				regions: Some(vec![self.region.clone()]),
				prevent_auto_create_lobby: None,
				captcha: None,
			},
		)
		.await;
		let lobby = match find_res {
			std::result::Result::Ok(res) => {
				*self.lobby.write().await = Some(res.lobby.clone());
				find_span.finish().await;
				res.lobby
			}
			std::result::Result::Err(error) => {
				*self.state.write().await = ClientState::FindLobby { error };
				find_err_span.finish().await;
				return Err(());
			}
		};

		Ok(lobby)
	}

	async fn open_websocket(self: &Arc<Self>, lobby: Box<rivet_game_server::models::MatchmakerLobbyJoinInfo>) {
		// Open connection
		*self.state.write().await = ClientState::Connecting;
		let port = if let Some(x) = lobby.ports.get("insecure").cloned() {
			x
		} else {
			*self.state.write().await = ClientState::Internal {
				message: "missing port".into(),
			};
			return;
		};

		let connect_span = self.spans.start("client_connect");
		let connect_res = tokio_tungstenite::connect_async(format!(
			"ws://{}/?token={}",
			port.hostname, lobby.player.token
		))
		.await;
		let (mut ws_stream, _) = match connect_res {
			std::result::Result::Ok(x) => x,
			std::result::Result::Err(error) => {
				*self.state.write().await = ClientState::ConnectError { error };
				return;
			}
		};
		*self.state.write().await = ClientState::CheckingConnection;
		connect_span.finish().await;

		// Handle connection
		let mut conn_checked = false;
		let mut conn_check_span = Some(self.spans.start("client_conn_check"));
		let mut timeout = Some(tokio::time::sleep(Duration::from_secs(10)).boxed());
		let mut packet_interval =
			tokio::time::interval(Duration::from_secs_f64(self.args.packet_interval()));
		loop {
			tokio::select! {
				// WebSocket message
				msg = ws_stream.next() => {
					let msg = match msg {
						Some(std::result::Result::Ok(msg)) => msg,
						Some(Err(error)) => {
							*self.state.write().await = ClientState::ConnectError { error };
							return;
						},
						None => {
							let mut state = self.state.write().await;
							if matches!(*state, ClientState::CheckingConnection | ClientState::Connected) {
								*state = ClientState::EarlyClose;
							}
							return;
						}
					};

					// Decode message
					let msg_data = if let std::result::Result::Ok(x) = msg.into_text() {
						x
					} else {
						*self.state.write().await = ClientState::Internal { message: "message not text".into() };
						return;
					};
					let (event, data) = if let std::result::Result::Ok(x) = serde_json::from_str::<(String, Box<serde_json::value::RawValue>)>(&msg_data) {
						x
					} else {
						*self.state.write().await = ClientState::Internal { message: format!("invalid json: {}", msg_data) };
						return;
					};

					// Handle event
					match event.as_str() {
						"state" => {
							if !conn_checked {
								if let Some(conn_check_span) = conn_check_span.take() {
									conn_check_span.finish().await;
								}

								conn_checked = true;
								*self.state.write().await = ClientState::Connected;
							}
						}
						"pong" => {
							let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs_f64();
							let (ping_ts, _payload) = serde_json::from_str::<(f64, Box<serde_json::value::RawValue>)>(data.get()).unwrap();
							let ts = ts - ping_ts;

							// Record the ping
							self.spans.write_span("ping", ts).await;
						}
						_ => {
							*self.state.write().await = ClientState::Internal { message: "unknown event".into() };
							return;
						}
					}
				}

				// Send message
				_ = packet_interval.tick() => {
					let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs_f64();

					let send_span = self.spans.start("client_send");
					let res = ws_stream.send(tokio_tungstenite::tungstenite::Message::Text(serde_json::to_string(&("ping", (ts, &self.packet_data))).unwrap())).await;
					send_span.finish().await;

					match res {
						std::result::Result::Ok(_) => {}
						std::result::Result::Err(error) => {
							*self.state.write().await = ClientState::SendError { error };
							return;
						}
					}
				}

				// Connect timeout
				_ = async {
					if let Some(timeout) = timeout.as_mut() {
						timeout.await;
					} else {
						std::future::pending().await
					}
				} => {
					timeout = None;
					let mut state = self.state.write().await;
					if matches!(*state, ClientState::CheckingConnection) {
						*state = ClientState::ConnectTimedOut;
					}
				}

				// Client closed
				_ = self.close_notify.notified() => {
					return;
				}
			}
		}
	}

	pub async fn close(&self) {
		*self.state.write().await = ClientState::Closed;
		self.close_notify.notify_waiters();
	}
}
