extends Control

var game = preload("res://game.tscn").instantiate()

func _ready():
	if !RivetHelper.is_dedicated_server():
		Gamestate.join_game()
	
	get_tree().root.add_child.call_deferred(game)
	get_node("/root/Loading").queue_free()
