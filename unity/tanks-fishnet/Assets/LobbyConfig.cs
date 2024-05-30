using FishNet.Object;
using FishNet.Object.Synchronizing;
using Rivet;
using UnityEngine;

public enum GameMode
{
    ModeA,
    ModeB,
    Custom,
}

public class LobbyConfig : NetworkBehaviour
{
    private RivetManager _rm;
    private Server _server;

    [SyncVar] public GameMode gameMode = GameMode.ModeA;
    [SyncVar] public float moveSpeed = 5f;

    void Start()
    {
        _rm = FindObjectOfType<RivetManager>();
        _server = FindObjectOfType<Server>();

        if (IsServer)
        {
            UpdateConfig();
        }

        Debug.Log("Game mode: " + gameMode);
    }

    public override void OnStartNetwork()
    {
        base.OnStartNetwork();

        // Update UI
        if (IsClient)
        {
            var ui = FindObjectOfType<RivetUI>();
            ui.lobbyConfig = this;
            ui.UpdateConnectionInfo();
        }
    }


    /// <summary>
    /// Updates the config from the Rivet-provided config.
    /// </summary>
    private void UpdateConfig()
    {
        // Update game mode
        if (!Application.isEditor)
        {
            switch (_server.gameModeName)
            {
                case "mode-a":
                    gameMode = GameMode.ModeA;
                    break;
                case "mode-b":
                    gameMode = GameMode.ModeB;
                    break;
                case "custom":
                    gameMode = GameMode.Custom;
                    break;
                default:
                    Debug.LogError("Invalid game mode name: " + _server.gameModeName);
                    break;
            }
        }

        // Update properties
        var lc = _server.LobbyConfig;
        if (lc == null) return;
        moveSpeed = (float)lc["move_speed"];
    }
}