#nullable enable
using System;
using FishNet.Managing;
using FishNet.Transporting;
using Newtonsoft.Json.Linq;
using Rivet;
using UnityEngine;

public class Server : MonoBehaviour
{

    #region References

    private RivetAuthenticator _authenticator = null!;
    private NetworkManager _networkManager = null!;
    private RivetManager _rivetManager = null!;

    #endregion

    /// <summary>
    /// The game mode to start the game with.
    ///
    /// Only available on the server.
    /// </summary>
    [HideInInspector] public string? gameModeName = null;

    /// <summary>
    /// The lobby config provided for a custom lobby.
    /// </summary>
    private string? _lobbyConfigRaw = null;

    // Parse LobbyConfigRaw to JObject
    public JObject? LobbyConfig => _lobbyConfigRaw != null ? JObject.Parse(_lobbyConfigRaw) : null;


    // Start is called before the first frame update
    void Start()
    {
        _networkManager = FindObjectOfType<NetworkManager>();
        _rivetManager = FindObjectOfType<RivetManager>();

        // Configure client authentication
        _networkManager.ClientManager.OnClientConnectionState += ClientManager_OnClientConnectionState;
        _networkManager.ClientManager.RegisterBroadcast<RivetAuthenticator.TokenResponseBroadcast>(OnTokenResponseBroadcast);

        // Start server if testing in editor or running from CLI
        if (Application.isBatchMode)
        {
            StartServer();
        }
    }

    #region Server

    private ushort GetServerPort()
    {
        var port = Environment.GetEnvironmentVariable("PORT_default");
        return port != null ? ushort.Parse(port) : (ushort)7770;
    }

    private void StartServer()
    {
        Debug.Log("Starting server on port " + GetServerPort());

        // Read environment variables
        gameModeName = Environment.GetEnvironmentVariable("RIVET_GAME_MODE_NAME");
        _lobbyConfigRaw = Environment.GetEnvironmentVariable("RIVET_LOBBY_CONFIG");

        // Start server
        _networkManager.TransportManager.Transport.SetServerBindAddress("0.0.0.0", IPAddressType.IPv4);
        _networkManager.TransportManager.Transport.SetPort(GetServerPort());
        _networkManager.ServerManager.StartConnection();
        _networkManager.ServerManager.OnRemoteConnectionState += (conn, args) =>
        {
            Debug.Log("Remote connection state: " + conn.ClientId + " " + conn.GetAddress() + " " + args.ConnectionState);
        };

        // Create authentication
        _authenticator = gameObject.AddComponent<RivetAuthenticator>();
        _networkManager.ServerManager.SetAuthenticator(_authenticator);

        // Notify Rivet this server can start accepting players
        StartCoroutine(_rivetManager.LobbyReady(() => { Debug.Log("Lobby ready"); }, _ => { }));
    }
    #endregion

    #region Authentication

    private void ClientManager_OnClientConnectionState(ClientConnectionStateArgs args)
    {
        if (args.ConnectionState != LocalConnectionState.Started)
            return;

        // Send request
        var token = _rivetManager.FindLobbyResponse?.Player.Token;
        Debug.Log("Sending authenticate token request: " + token);
        var pb = new RivetAuthenticator.TokenRequestBroadcast()
        {
            Token = token
        };
        _networkManager.ClientManager.Broadcast(pb);
    }

    private void OnTokenResponseBroadcast(RivetAuthenticator.TokenResponseBroadcast trb)
    {
        Debug.Log("Token response: " + trb.Valid);
        string result = (trb.Valid) ? "Token authenticated." : "Token authentication failed.";
        _networkManager.Log(result);
    }

    #endregion

}
