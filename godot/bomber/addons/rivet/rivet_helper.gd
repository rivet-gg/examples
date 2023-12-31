extends Node

## Triggered if running a dedicated server.
signal start_server()

## Triggered if running a client.
signal start_client()

var multiplayer_setup = false

## All player tokens for players that have authenticated.
##
## Server only
var player_tokens = {}

## The player token for this client that will be sent on the next
## authentication.
##
## Client only
var player_token = null


## Determines if running as a dedicated server.
func is_dedicated_server() -> bool:
	return OS.get_cmdline_user_args().has("--server")


## Sets up the authentication hooks on SceneMultiplayer.
func setup_multiplayer():
	RivetHelper._assert(!multiplayer_setup, "RivetHelper.setup_multiplayer already called")
	multiplayer_setup = true
	
	var scene_multiplayer = multiplayer as SceneMultiplayer
	
	scene_multiplayer.auth_callback = _auth_callback
	scene_multiplayer.auth_timeout = 5.0

	scene_multiplayer.peer_authenticating.connect(self._player_authenticating)
	scene_multiplayer.peer_authentication_failed.connect(self._player_authentication_failed)
	
	scene_multiplayer.peer_disconnected.connect(self._player_disconnected)
	
	if is_dedicated_server():
		rivet_print("Starting server")
		start_server.emit()
		
		# 
		# var request = RivetGlobal.lobby_ready({})
		# var response = request.request()
		# We now have the response object

		# If we want the request to call functions when it finishes, we can
		# build it like this
		# (RivetGlobal
		# 	.lobby_ready({})
		# 	.set_success_callback(_lobby_ready)
		# 	.set_failure_callback(_lobby_ready_fail)
		# 	.request()
		# )

		# var response = await Rivet.matchmaker.lobby.ready({})

		# if response == OK:
		# 	rivet_print("Lobby ready")
		# else:
		# 	OS.crash("Lobby ready failed")


		# If we want to get the response back and wait on it. This will block
		# the function, but not execution?
		# request = RivetGlobal.lobby_ready({})
		# # Need to start the request
		# request.request()
		# # Wait for the request to finish
		# response = await request.wait_completed()
	else:
		rivet_print("Starting client")
		start_client.emit()


## Sets the player token for the next authentication challenge.
func set_player_token(_player_token: String):
	RivetHelper._assert(multiplayer_setup, "RivetHelper.setup_multiplayer has not been called")
	RivetHelper._assert(!is_dedicated_server(), "cannot called RivetHelper.set_player_token on server")
	player_token = _player_token


# MARK: Authentication
func _auth_callback(id: int, buf: PackedByteArray):
	if multiplayer.is_server():
		# Authenticate the client if connecting to server
		
		var json = JSON.new()
		json.parse(buf.get_string_from_utf8())
		var data = json.get_data()
		
		rivet_print("Player authenticating %s: %s" % [id, data])
		player_tokens[id] = data.player_token

		var response = await Rivet.matchmaker.player.connected({
			"player_token": data.player_token
		})

		if response.result == OK:
			rivet_print("Player authenticated for %s" % id)
			(multiplayer as SceneMultiplayer).complete_auth(id)
		else:
			rivet_print("Player authentiation failed for %s: %s" % [id, response.body])
			(multiplayer as SceneMultiplayer).disconnect_peer(id)
	else:
		# Auto-approve if not a server
		(multiplayer as SceneMultiplayer).complete_auth(id)

func _player_authenticating(id):
	rivet_print("Authenticating %s" % id)
	var body = JSON.stringify({ "player_token": player_token })
	(multiplayer as SceneMultiplayer).send_auth(id, body.to_utf8_buffer())


func _player_authentication_failed(id):
	rivet_print("Authentication failed for %s" % id)
	multiplayer.set_multiplayer_peer(null)

func _player_disconnected(id):
	if multiplayer.is_server():
		var player_token = player_tokens.get(id)
		player_tokens.erase(id)
		rivet_print("Removing player %s" % player_token)
		
		# RivetGlobal.player_disconnected({
		# 	"player_token": player_token
		# }, func(_x): pass, func(_x): pass)
		# (RivetGlobal
		# 	.player_disconnected({
		# 		"player_token": player_token
		# 	})
		# 	.set_success_callback(func(_x): pass)
		# 	.set_failure_callback(func(_x): pass)
		# 	.request()
		# )

		var response = await Rivet.matchmaker.player.disconnected({
			"player_token": player_token
		})


func rivet_print(message: String):
	print("[Rivet] %s" % message)


func _assert(condition: bool, message: String = "Assertion failed"):
	if not condition:
		OS.crash(message)
