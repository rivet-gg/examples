extends Node

# Default game server port. Can be any number between 1024 and 49151.
# Not on the list of registered or common ports as of November 2020:
# https://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers
const DEFAULT_PORT = 10567

# Max number of players.
const MAX_PEERS = 12

var peer = null

# Name for my player.
var player_name = "The Warrior"

# Names for remote players in id:name format.
var players = {}
var player_tokens = {}

# Signals to let lobby GUI know what's going on.
signal player_list_changed()
signal connection_failed()
signal connection_succeeded()
signal game_ended()
signal game_error(what)


func _ready():
	RivetHelper.start_server.connect(start_server)
	RivetHelper.setup_multiplayer()

	multiplayer.peer_connected.connect(self._player_connected)
	multiplayer.peer_disconnected.connect(self._player_disconnected)
	multiplayer.connected_to_server.connect(self._connected_ok)
	multiplayer.connection_failed.connect(self._connected_fail)
	multiplayer.server_disconnected.connect(self._server_disconnected)


func start_server():
	print("Starting server on %s" % DEFAULT_PORT)

	
	peer = ENetMultiplayerPeer.new()
	peer.create_server(DEFAULT_PORT, MAX_PEERS)
	multiplayer.set_multiplayer_peer(peer)
	
	RivetClient.lobby_ready({}, func(_x): pass, func(_x): pass)


# Callback from SceneTree.
func _player_connected(id):
	print("Player connected %s" % id)
	
	# Registration of a client beings here, tell the connected player that we are here.
	if !multiplayer.is_server():
		register_player.rpc_id(id, player_name)
	
	# Update player list if no other players present
	player_list_changed.emit()


# Callback from SceneTree.
func _player_disconnected(id):
	if has_node("/root/World"): # Game is in progress.
		if multiplayer.is_server():
			game_error.emit("Player " + players[id] + " disconnected")
			end_game()
	else: # Game is not in progress.
		# Unregister this player.
		unregister_player(id)


# Callback from SceneTree, only for clients (not server).
func _connected_ok():
	# We just connected to a server
	connection_succeeded.emit()


# Callback from SceneTree, only for clients (not server).
func _server_disconnected():
	game_error.emit("Server disconnected")
	end_game()


# Callback from SceneTree, only for clients (not server).
func _connected_fail():
	multiplayer.set_network_peer(null) # Remove peer
	connection_failed.emit()


# Lobby management functions.
@rpc("any_peer", "reliable")
func register_player(new_player_name):
	var id = multiplayer.get_remote_sender_id()
	players[id] = new_player_name
	player_list_changed.emit()


func unregister_player(id):
	players.erase(id)
	player_list_changed.emit()


@rpc("call_local", "reliable")
func load_world():
	# Change scene.
	var world = load("res://world.tscn").instantiate()
	get_tree().get_root().add_child(world)
	get_tree().get_root().get_node("Lobby").hide()

	# Set up score.
	world.get_node("Score").add_player(multiplayer.get_unique_id(), player_name)
	for pn in players:
		world.get_node("Score").add_player(pn, players[pn])
	get_tree().set_pause(false) # Unpause and unleash the game!


func join_game(new_player_name):
	player_name = new_player_name
	
	RivetClient.find_lobby({
		"game_modes": ["default"]
	}, _lobby_found, _lobby_find_failed)


func _lobby_found(response):
	RivetHelper.set_player_token(response.player.token)
	
	var port = response.ports.default
	print("Connecting to ", port.host)
	
	peer = ENetMultiplayerPeer.new()
	peer.create_client(port.hostname, port.port)
	multiplayer.set_multiplayer_peer(peer)


func _lobby_find_failed(error):
	game_error.emit(error)


func get_player_list():
	return players.values()


func get_player_name():
	return player_name


# TODO: Figure out why this doesn't work as "authority"
@rpc("any_peer")
func begin_game():
	if !multiplayer.is_server():
		return
	
	load_world.rpc()

	var world = get_tree().get_root().get_node("World")
	var player_scene = load("res://player.tscn")

	# Create a dictionary with peer id and respective spawn points, could be improved by randomizing.
	var spawn_points = {}
	var spawn_point_idx = 1
	for p in players:
		spawn_points[p] = spawn_point_idx
		spawn_point_idx += 1

	for p_id in spawn_points:
		var spawn_pos = world.get_node("SpawnPoints/" + str(spawn_points[p_id])).position
		var player = player_scene.instantiate()
		player.synced_position = spawn_pos
		player.name = str(p_id)
		player.set_player_name(player_name if p_id == multiplayer.get_unique_id() else players[p_id])
		world.get_node("Players").add_child(player)


func end_game():
	if has_node("/root/World"): # Game is in progress.
		# End it
		get_node("/root/World").queue_free()

	game_ended.emit()
	players.clear()
