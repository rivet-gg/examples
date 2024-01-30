extends CharacterBody2D

const MOTION_SPEED = 90.0

@export
var synced_position := Vector2()

@export
var motion = Vector2() :
	set(value):
		# This will be sent by players, make sure values are within limits.
		motion = clamp(value, Vector2(-1, -1), Vector2(1, 1))

func _enter_tree():
	print(name, ", ", multiplayer.get_unique_id())
	$MultiplayerSynchronizer.set_multiplayer_authority(str(name).to_int())

# Called when the node enters the scene tree for the first time.
func _ready():
	pass
	# print(name)
	# if str(name).is_valid_int():
	# 	print("setting authority for player ", str(name))
	# 	$MultiplayerSynchronizer.set_multiplayer_authority(str(name).to_int())


func _physics_process(_delta):
	# The client which this player represent will update the controls state, and notify it to everyone.
	if str(multiplayer.get_unique_id()) == str(name):
		update()

	# print(is_multiplayer_authority())

	if $MultiplayerSynchronizer.is_multiplayer_authority():
		# The server updates the position that will be notified to the clients.
		synced_position = position
	else:
		# The client simply updates the position to the last known one.
		position = synced_position

	# Everybody runs physics. I.e. clients tries to predict where they will be during the next frame.
	velocity = motion * MOTION_SPEED
	move_and_slide()

func update():
	var m = Vector2()
	if Input.is_action_pressed("move_left"):
		m += Vector2(-1, 0)
	if Input.is_action_pressed("move_right"):
		m += Vector2(1, 0)
	if Input.is_action_pressed("move_up"):
		m += Vector2(0, -1)
	if Input.is_action_pressed("move_down"):
		m += Vector2(0, 1)

	motion = m
