use crate::entities::MoveMessage;
use crate::entities::{EntityHandle, EntityId};
use crate::game::GameState;
use crate::game_world::GameWorld;
use crate::utils::time_milliseconds;
use crate::utils::Rect;
use crate::utils::Serializable;
use crate::utils::{FloatType, SerializableInit, SerializableInitMut, Vector};
use rmpv::decode::read_value;
use rmpv::encode::write_value;
use rmpv::Value;
use std::collections::HashSet;
use std::fmt::{Display, Formatter, Result as FormatResult};
use std::io::Cursor;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::thread;
use ws::{
    listen, CloseCode, Error, Handler, Handshake, Message, Result as WsResult, Sender as WsSender,
};

/// Starts a thread that hosts the websocket.
pub fn start_socket_server(address: &'static str, tx_client_handle: Sender<ClientHandleData>) {
    thread::spawn(move || {
        listen(address, |out| {
            // Create the client
            let (client, handle_data) = Client::new(out);

            // Send the handle to the game
            tx_client_handle.send(handle_data).unwrap();

            // Return the client
            client
        })
        .unwrap();
    });

    println!("Hosting socket server on {}.", address);
}

/*** Message Error ***/
/// Errors that occur when processing messages.
#[derive(Debug)]
pub enum MessageError {
    Malformed,
    MissingData,
    DataType,
    EventType,
}

impl Display for MessageError {
    fn fmt(&self, f: &mut Formatter) -> FormatResult {
        write!(f, "{:?}", self)
    }
}

/// Type used to identify clients.
pub type ClientId = u64;

/// Message data that was received from the client.
#[derive(Debug)]
pub enum ClientMessage {
    Auth {
        rivet_player_token: String,
    },
    Join {
        username: String,
        character_id: String,
    },
    MoveDir(MoveMessage),
    FaceDir {
        dir: f64,
    },
    Rotate {
        rot: u8,
    },
    Shoot {
        target: Vector,
    },
    Select {
        entity_id: EntityId,
    },
    Jump,
    ForcePing,
    CheatCode(String),
    TempData {
        data: String,
    },
    Leave,
}

impl ClientMessage {
    pub fn from_data(message_type: u64, data: &Value) -> Result<ClientMessage, MessageError> {
        match message_type {
            0 => ClientMessage::auth_message(data),
            1 => ClientMessage::join_message(data),
            2 => ClientMessage::move_message(data),
            3 => ClientMessage::face_dir_message(data),
            4 => ClientMessage::rotate_message(data),
            5 => ClientMessage::shoot_message(data),
            6 => ClientMessage::select_message(data),
            7 => Ok(ClientMessage::Jump),
            8 => Ok(ClientMessage::ForcePing),
            9 => ClientMessage::cheat_code(data),
            10 => ClientMessage::temp_data_message(data),
            _ => Err(MessageError::EventType),
        }
    }

    fn auth_message(data: &Value) -> Result<ClientMessage, MessageError> {
        let data: &Vec<Value> = unwrap_data!(data.as_array());
        if data.len() != 1 {
            return Err(MessageError::MissingData);
        }
        Ok(ClientMessage::Auth {
            rivet_player_token: unwrap_data!(data[0].as_str()).to_string(),
        })
    }

    fn join_message(data: &Value) -> Result<ClientMessage, MessageError> {
        let data: &Vec<Value> = unwrap_data!(data.as_array());
        if data.len() != 2 {
            return Err(MessageError::MissingData);
        }
        Ok(ClientMessage::Join {
            username: unwrap_data!(data[0].as_str()).to_string(),
            character_id: unwrap_data!(data[1].as_str()).to_string(),
        })
    }

    fn move_message(data: &Value) -> Result<ClientMessage, MessageError> {
        let data: &Vec<Value> = unwrap_data!(data.as_array());
        if data.len() != 2 {
            return Err(MessageError::MissingData);
        }
        Ok(ClientMessage::MoveDir(MoveMessage {
            timestamp: time_milliseconds(),
            move_dir: data[0].as_f64(),
            sprinting: unwrap_data!(data[1].as_bool()),
        }))
    }

    fn face_dir_message(data: &Value) -> Result<ClientMessage, MessageError> {
        Ok(ClientMessage::FaceDir {
            dir: unwrap_data!(data.as_f64()),
        })
    }

    fn rotate_message(data: &Value) -> Result<ClientMessage, MessageError> {
        Ok(ClientMessage::Rotate {
            rot: unwrap_data!(data.as_u64()) as u8,
        })
    }

    fn shoot_message(data: &Value) -> Result<ClientMessage, MessageError> {
        let target: &Vec<Value> = unwrap_data!(data.as_array());
        if target.len() != 3 {
            return Err(MessageError::MissingData);
        }
        Ok(ClientMessage::Shoot {
            target: Vector::new(
                unwrap_data!(target[0].as_f64()),
                unwrap_data!(target[1].as_f64()),
                unwrap_data!(target[2].as_f64()),
            ),
        })
    }

    fn select_message(data: &Value) -> Result<ClientMessage, MessageError> {
        Ok(ClientMessage::Select {
            entity_id: unwrap_data!(data.as_u64()),
        })
    }

    fn cheat_code(data: &Value) -> Result<ClientMessage, MessageError> {
        Ok(ClientMessage::CheatCode(
            unwrap_data!(data.as_str()).to_string(),
        ))
    }

    fn temp_data_message(data: &Value) -> Result<ClientMessage, MessageError> {
        Ok(ClientMessage::TempData {
            data: unwrap_data!(data.as_str()).to_string(),
        })
    }
}

/*** Client Handle ***/
/// Used by the game to
pub struct ClientHandle {
    out: WsSender,

    pub is_admin: bool,

    pub rivet_player_token: Option<String>,
    pub sent_init_message: bool,

    watching_entities: Vec<EntityHandle>,

    /// Position at which the player is spectating from; this way if the player does not have
    /// a player and is not spectating anyone, they can still see. This also makes it easy to
    /// make it easy to know what the player sees.
    spectating_position: Vector,

    pub spectating_id: Option<EntityId>, // TODO: Convert to entity handle
    pub player_id: Option<EntityId>,     // TODO: Convert to entity handle

    pub rx_message: Receiver<ClientMessage>,
}

impl ClientHandle {
    pub fn new(client_data: ClientHandleData) -> ClientHandle {
        ClientHandle {
            out: client_data.0,
            is_admin: false,
            rivet_player_token: None,
            sent_init_message: false,
            watching_entities: Vec::new(),
            spectating_position: Vector::new(0., 0., 0.),
            player_id: None,
            spectating_id: None,
            rx_message: client_data.1,
        }
    }
}

impl SocketSender for ClientHandle {
    fn socket_out(&self) -> &WsSender {
        &self.out
    }
}

impl ClientHandle {
    /// If a specific rectangle or point is within range of a base vector. If there is a rect, `offset` is
    /// used; otherwise, it just tests if `offset` is within range.
    fn rect_or_point_in_range(
        range: FloatType,
        base: &Vector,
        rect: &Option<Rect>,
        offset: &Vector,
    ) -> bool {
        if let Some(ref rect) = *rect {
            rect.x_lower_extent(offset.x) <= base.x + range
                && rect.x_upper_extent(offset.x) >= base.x - range
                && rect.y_lower_extent(offset.y) <= base.y + range
                && rect.y_upper_extent(offset.y) >= base.y - range
        } else {
            ClientHandle::point_in_range(range, base, offset)
        }
    }

    /// If a given point is within range of a base vector.
    fn point_in_range(range: FloatType, base: &Vector, point: &Vector) -> bool {
        point.x <= base.x + range
            && point.x >= base.x - range
            && point.y <= base.y + range
            && point.y >= base.y - range
    }

    pub fn build_update_message(
        &mut self,
        state: &GameState,
        state_timer: f64,
        world: &GameWorld,
        events: &Vec<Box<ClientEventData>>,
        minimap_data: &Value,
        minimap_changed: bool,
        view_range: FloatType,
    ) {
        measure!("Build update message");

        /* Determine items */
        // Create lists to hold the data
        let mut appeared_entities = Vec::<EntityHandle>::new();
        let mut updated_entities = Vec::<EntityHandle>::new();
        let mut disappeared_entities = Vec::<EntityId>::new(); // Entities that moved out of range
        let mut destroyed_entities = Vec::<EntityId>::new();

        // Get the basic pos
        {
            measure!("Find spectating position");

            if let Some(ref player_id) = self.player_id {
                if let Some(player_object) = world.entity_with_id(player_id) {
                    let player_object = player_object.borrow();
                    self.spectating_position
                        .clone_from(player_object.body().get_pos());
                }
            } else if let Some(ref spectating_id) = self.spectating_id {
                if let Some(spectating_object) = world.entity_with_id(spectating_id) {
                    let spectating_object = spectating_object.borrow();
                    self.spectating_position
                        .clone_from(spectating_object.body().get_pos());
                }
            }
        }

        // Add events
        let events = {
            measure!("Serialize events");

            events
                .iter()
                .filter(|e| {
                    // If provides pos, check if it's in range; otherwise, send it to everyone
                    e.event_pos()
                        .map(|pos| {
                            ClientHandle::point_in_range(
                                view_range,
                                &self.spectating_position,
                                &pos,
                            )
                        })
                        .unwrap_or(true)
                })
                .map(|e| Value::Array(vec![e.event_flag().flag_raw().into(), e.serialize()])) // Serialize the flag and event
                .collect::<Vec<_>>()
        };

        {
            measure!("Determine entity changes");

            // Find all the entities currently being watched
            let mut past_watching_entities = self.watching_entities.drain(..).collect::<Vec<_>>();

            // Compare with entities that are currently visible; we only query the origin and bounding
            // box since it's faster & not all entities have bodies
            let spectating_rect = Rect {
                // TODO: Make this a constant
                center: Vector::new(0., 0., 0.),
                size: Vector::new(view_range * 2., view_range * 2., 99999.),
            };
            let visible_entities = world.query_rect_all(
                &spectating_rect,
                &self.spectating_position,
                true,
                true,
                |_| true,
            );
            for entity_handle in visible_entities.into_iter() {
                let entity = entity_handle.borrow();

                // If this visible entity is already in the watching entities, remove it from the list
                if let Some(index) = past_watching_entities
                    .iter()
                    .position(|x| *x == *entity_handle)
                {
                    let entity_handle = past_watching_entities.remove(index);

                    // Entity updated, since it's still visible between the past two frames
                    updated_entities.push(entity_handle);
                } else {
                    // Entity appeared
                    appeared_entities.push(entity_handle.clone());
                }
            }

            // Compare the remaining non-visible entities to see if they were destroyed or disappeared
            for watching_entity in past_watching_entities.into_iter() {
                let entity = watching_entity.borrow();
                if world.is_destroyed(&*entity) {
                    // Destroyed
                    destroyed_entities.push(entity.id().clone());
                } else if world.entities().contains(&watching_entity) {
                    // The entity is still in the world, so it must have disappeared
                    disappeared_entities.push(entity.id().clone());
                } else {
                    // This state should be unreachable
                    println!(
                        "Entity {} is not visible, not in the world, and not flagged as destroyed.",
                        entity.id()
                    );
                }
            }
        }

        /* Serialize message */
        {
            measure!("Serialize message");

            let message = Value::Array(vec![
                // Player and spectating id
                self.player_id.map_or_else(|| Value::Nil, |id| id.into()),
                self.spectating_id
                    .map_or_else(|| Value::Nil, |id| id.into()),
                // State
                state.serialize(),
                state_timer.into(),
                // Map data
                if minimap_changed || !self.sent_init_message {
                    minimap_data.clone()
                } else {
                    Value::Nil
                },
                // Events
                events.into(),
                // Entity updates
                appeared_entities
                    .iter()
                    .map(|e| e.borrow().serialize(true)) // Serialize it
                    .collect::<Vec<Value>>()
                    .into(),
                updated_entities
                    .iter()
                    .map(|e| e.borrow().serialize(false)) // Serialize it
                    .collect::<Vec<Value>>()
                    .into(),
                disappeared_entities
                    .iter()
                    .map(|id| Value::from(id.clone()))
                    .collect::<Vec<Value>>()
                    .into(),
                destroyed_entities
                    .iter()
                    .map(|id| Value::from(id.clone()))
                    .collect::<Vec<Value>>()
                    .into(),
            ]);
            self.send_update(message);
        }

        /* Update watching entities list */
        {
            measure!("Clean up update");

            // Add appeared and updated entities back to the watching entities
            self.watching_entities.extend(appeared_entities.into_iter());
            self.watching_entities.extend(updated_entities.into_iter());
        }

        // Update init message
        if !self.sent_init_message {
            self.sent_init_message = true;
        }
    }
}

/*** Client ***/
/// The data required to construct a `ClientHandle`. We need to pass this data instead of an actual
/// client handle because the client handle holds `EntityHandle` values, which can not be moved
/// between threads.
pub type ClientHandleData = (WsSender, Receiver<ClientMessage>);

/// Handles incoming connections; one is created for every individual WebSocket connection created.
/// This just forwards important messages to the connection itself.
pub struct Client {
    out: WsSender,
    is_open: bool,
    tx_message: Sender<ClientMessage>,
}

impl Client {
    pub fn new(out: WsSender) -> (Client, ClientHandleData) {
        // Create the channels
        let (tx_message, rx_message) = channel();

        // Create an out for the handle
        let client_handle_data = (out.clone(), rx_message);

        // Create the client
        let client = Client {
            out,
            is_open: false,
            tx_message,
        };

        // Return both
        (client, client_handle_data)
    }

    fn close(&mut self) {
        // Send leave message
        self.tx_message.send(ClientMessage::Leave).unwrap();

        // Close the socket
        self.out.close(CloseCode::Empty).unwrap();

        // Set to not open
        self.is_open = false;
    }
}

impl Client {
    fn parse_message(&self, msg: Message) -> Result<(), MessageError> {
        measure!("Parse message");

        // Get the data from the message
        let message_value = match msg {
            Message::Binary(data) => {
                // Create a cursor to read the data and convert it to a MessagePack value
                let mut cursor = Cursor::new(data);
                read_value(&mut cursor).map_err(|_| MessageError::Malformed)?
            }
            Message::Text(_) => return Err(MessageError::Malformed),
        };

        // Parse the base of the message
        let message: &Vec<Value> = unwrap_data!(message_value.as_array());
        if message.len() != 2 {
            return Err(MessageError::MissingData);
        }
        let message_type = unwrap_data!(message[0].as_u64());
        let message_body = &message[1];

        // Parse and send the message
        let message = ClientMessage::from_data(message_type, message_body)?;
        self.tx_message.send(message).unwrap();

        Ok(())
    }
}

impl Handler for Client {
    fn on_open(&mut self, shake: Handshake) -> WsResult<()> {
        println!("Connection: {:?}", shake.request.client_addr());

        // Set to open
        self.is_open = true;

        Ok(())
    }

    fn on_message(&mut self, msg: Message) -> WsResult<()> {
        match self.parse_message(msg) {
            Ok(_) => Ok(()),
            Err(err) => {
                // TODO: Send error back, maybe with Err(...)
                println!("Error: {}", err);
                Ok(())
            }
        }
    }

    fn on_close(&mut self, code: CloseCode, reason: &str) {
        // Print the error
        match code {
            CloseCode::Normal => println!("The client is done with the connection."),
            CloseCode::Away => println!("The client is leaving the site."),
            _ => println!("The client encountered an error: {}", reason),
        }

        self.close();
    }

    fn on_error(&mut self, err: Error) {
        println!("Socket error: {}", err);

        self.close();
    }
}

impl SocketSender for Client {
    fn socket_out(&self) -> &WsSender {
        &self.out
    }
}

/*** Socket sender ***/
/// Declares the type of message
pub enum MessageType {
    Init,
    Update,
    PingDelay,
    ShootDelay,
    Stamina,
    GameResults,
}

impl MessageType {
    pub fn message_flag(&self) -> u8 {
        match *self {
            MessageType::Init => 0,
            MessageType::Update => 1,
            MessageType::PingDelay => 2,
            MessageType::ShootDelay => 3,
            MessageType::Stamina => 4,
            MessageType::GameResults => 5,
        }
    }
}

/// Trait used to easily serialize and send messages.
pub trait SocketSender {
    fn socket_out(&self) -> &WsSender;

    fn send_message(&self, message_type: MessageType, message_body: Value) {
        measure!("Send message");

        // Create new message
        let message = Value::Array(vec![Value::from(message_type.message_flag()), message_body]);

        // Serialize the message
        let mut buf = Vec::new();
        write_value(&mut buf, &message).unwrap();

        // Send the message
        self.socket_out().send(buf).unwrap();
    }

    fn send_init(&self) {
        self.send_message(
            MessageType::Init,
            Value::Array(vec![crate::game_config::STORE_JSON.clone().into()]),
        );
    }

    fn send_update(&self, message: Value) {
        self.send_message(MessageType::Update, message);
    }

    fn send_ping_delay(&self, delay: Option<u64>) {
        let data = delay.map_or_else(|| Value::Nil, |d| d.into());
        self.send_message(MessageType::PingDelay, data);
    }

    fn send_shoot_delay(&self, delay: Option<u64>) {
        let data = delay.map_or_else(|| Value::Nil, |d| d.into());
        self.send_message(MessageType::ShootDelay, data);
    }

    fn send_stamina(&self, stamina: f64) {
        self.send_message(MessageType::Stamina, stamina.into());
    }

    fn send_game_results(&self, props_win: bool, scoreboard: Value, score_breakdown: Value) {
        self.send_message(
            MessageType::GameResults,
            Value::Array(vec![props_win.into(), scoreboard, score_breakdown]),
        );
    }
}

/*** Client Events ***/
/// Identifier for the client event data.
pub enum ClientEventFlag {
    GameState,
    Shoot,
    Ping,
    PlayerDeath,
    ScoreboardUpdate,
}

impl ClientEventFlag {
    fn flag_raw(&self) -> u8 {
        match *self {
            ClientEventFlag::GameState => 0,
            ClientEventFlag::Shoot => 1,
            ClientEventFlag::Ping => 2,
            ClientEventFlag::PlayerDeath => 3,
            ClientEventFlag::ScoreboardUpdate => 4,
        }
    }
}

/// Data that can be sent to the client in an event.
pub trait ClientEventData: Serializable {
    /// Event that
    fn event_flag(&self) -> ClientEventFlag;

    /// The position that the event occurs at. This way, we can determine which clients it should
    /// be sent to.
    fn event_pos(&self) -> Option<&Vector>;
}

// Game state event
pub struct GameStateEvent {
    pub state: GameState,
}

impl ClientEventData for GameStateEvent {
    fn event_flag(&self) -> ClientEventFlag {
        ClientEventFlag::GameState
    }

    fn event_pos(&self) -> Option<&Vector> {
        None
    }
}

impl Serializable for GameStateEvent {
    fn serialize(&self) -> Value {
        self.state.serialize()
    }
}

// Shoot event
pub struct ShootEvent {
    pub shooter: EntityId,
    pub start: Vector,
    pub end: Vector,
}

impl ClientEventData for ShootEvent {
    fn event_flag(&self) -> ClientEventFlag {
        ClientEventFlag::Shoot
    }

    fn event_pos(&self) -> Option<&Vector> {
        Some(&self.start)
    }
}

impl Serializable for ShootEvent {
    fn serialize(&self) -> Value {
        Value::Array(vec![
            self.shooter.into(),
            self.start.serialize(),
            self.end.serialize(),
        ])
    }
}

// Ping event
pub struct PingEvent {
    pub point: Vector,
}

impl ClientEventData for PingEvent {
    fn event_flag(&self) -> ClientEventFlag {
        ClientEventFlag::Ping
    }

    fn event_pos(&self) -> Option<&Vector> {
        None // Show the ping to the whole map
    }
}

impl Serializable for PingEvent {
    fn serialize(&self) -> Value {
        self.point.serialize()
    }
}

// Player death event
pub struct PlayerDeathEvent {
    pub player_id: EntityId,
}

impl ClientEventData for PlayerDeathEvent {
    fn event_flag(&self) -> ClientEventFlag {
        ClientEventFlag::PlayerDeath
    }

    fn event_pos(&self) -> Option<&Vector> {
        None
    }
}

impl Serializable for PlayerDeathEvent {
    fn serialize(&self) -> Value {
        self.player_id.into()
    }
}

// Scoreboard update event
pub struct ScoreboardUpdateEvent {
    pub data: Value,
}

impl ClientEventData for ScoreboardUpdateEvent {
    fn event_flag(&self) -> ClientEventFlag {
        ClientEventFlag::ScoreboardUpdate
    }

    fn event_pos(&self) -> Option<&Vector> {
        None
    }
}

impl Serializable for ScoreboardUpdateEvent {
    fn serialize(&self) -> Value {
        self.data.clone()
    }
}
