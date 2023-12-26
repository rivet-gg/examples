#nullable enable
using FishNet.Managing;
using FishNet.Transporting;
using Newtonsoft.Json.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.Serialization;
using UnityEngine.UI;

public class RivetUI : MonoBehaviour
{
    private NetworkManager _networkManager = null!;
    private RivetManager _rivetManager = null!;
    [HideInInspector] public LobbyConfig? lobbyConfig;  // Assigned on LobbyConfig.OnNetworkStart

    public GameObject joinMenuPanel = null!;
    public TMP_Text connectionInfoText = null!;
    public TMP_InputField lobbyIdInputField = null!;
    public Slider moveSpeedSlider = null!;

    private LocalConnectionState? _connectionState;

    private void Start()
    {
        _networkManager = FindObjectOfType<NetworkManager>();
        _rivetManager = FindObjectOfType<RivetManager>();

        _networkManager.ClientManager.OnClientConnectionState += ClientManager_OnClientConnectionState;
        _networkManager.ClientManager.OnAuthenticated += UpdateConnectionInfo;
        _networkManager.ClientManager.OnRemoteConnectionState += (_) => UpdateConnectionInfo();

        UpdateConnectionInfo();
    }

    private void OnDestroy()
    {
        _networkManager.ClientManager.OnClientConnectionState -= ClientManager_OnClientConnectionState;
    }

    private void ClientManager_OnClientConnectionState(ClientConnectionStateArgs obj)
    {
        _connectionState = obj.ConnectionState;
        UpdateConnectionInfo();
    }

    #region UI events

    public void OnClick_Find(string gameMode)
    {
        // Hide menu
        joinMenuPanel.SetActive(false);

        // Find lobby
        StartCoroutine(_rivetManager.FindLobby(new FindLobbyRequest
        {
            GameModes = new[] { gameMode },
        }, _ => UpdateConnectionInfo(), fail => { Debug.Log($"Failed to find lobby: {fail}"); }));
    }
    
    public void OnClick_Join()
    {
        // Hide menu
        joinMenuPanel.SetActive(false);

        // Find lobby
        StartCoroutine(_rivetManager.JoinLobby(new JoinLobbyRequest
        {
            LobbyId = lobbyIdInputField.text,
        }, _ => UpdateConnectionInfo(), fail => { Debug.Log($"Failed to join lobby: {fail}"); }));
    }
    
    public void OnClick_Create()
    {
        // Hide menu
        joinMenuPanel.SetActive(false);

        // Find lobby
        StartCoroutine(_rivetManager.CreateLobby(new CreateLobbyRequest
        {
            GameMode = "custom",
            LobbyConfig = new JObject
            {
                { "move_speed", moveSpeedSlider.value }
            },
        }, _ => UpdateConnectionInfo(), fail => { Debug.Log($"Failed to create lobby: {fail}"); }));
    }
    
    public void OnClick_CopyLobbyId()
    {
        GUIUtility.systemCopyBuffer = _rivetManager.FindLobbyResponse?.Lobby.LobbyId ?? "";
    }

    #endregion

    #region UI

    public void UpdateConnectionInfo()
    {
        // Choose connection state text
        string connectionState;
        switch (_connectionState)
        {
            case null:
                connectionState = "?";
                break;
            case LocalConnectionState.Stopped:
                connectionState = "Stopped";
                break;
            case LocalConnectionState.Started:
                connectionState = "Started";
                break;
            case LocalConnectionState.Starting:
                connectionState = "Starting";
                break;
            default:
                connectionState = "Unknown";
                break;
        }

        // Update UI
        var flr = _rivetManager.FindLobbyResponse;
        connectionInfoText.text =
            $"Lobby ID: {(flr.HasValue ? flr.Value.Lobby.LobbyId : "?")}\n" +
            $"Host: {(flr.HasValue ? flr.Value.Ports["default"].Hostname : "?")}\n" +
            $"Port: {(flr.HasValue ? flr.Value.Ports["default"].Port : "?")}\n" +
            $"Connection state: {connectionState}\n\n" +
            $"Game mode: {(lobbyConfig != null ? lobbyConfig.gameMode.ToString() : "?")}\n" +
            $"Move speed: {(lobbyConfig != null ? lobbyConfig.moveSpeed.ToString() : "?")}\n";
    }

    #endregion
}