#nullable enable
using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.Serialization;
using FishNet.Managing;
using FishNet.Transporting;
using UnityEngine;
using UnityEngine.Networking;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Linq;
using UnityEngine.Serialization;

[JsonConverter(typeof(StringEnumConverter))]
public enum CreateLobbyRequestPublicity
{
    [EnumMember(Value = "public")] Public,
    [EnumMember(Value = "private")] Private,
}

public struct FindLobbyRequest
{
    [JsonProperty("game_modes")] public string[] GameModes;
    [JsonProperty("regions")] public string[]? Regions;
}

public struct JoinLobbyRequest
{
    [JsonProperty("lobby_id")] public string LobbyId;
}

public struct CreateLobbyRequest
{
    [JsonProperty("game_mode")] public string GameMode;
    [JsonProperty("region")] public string? Region;
    [JsonProperty("publicity")] public CreateLobbyRequestPublicity Publicity;
    [JsonProperty("lobby_config")] public JObject? LobbyConfig;
}

public struct FindLobbyResponse
{
    [JsonProperty("lobby")] public RivetLobby Lobby;
    [JsonProperty("ports")] public Dictionary<string, RivetLobbyPort> Ports;
    [JsonProperty("player")] public RivetPlayer Player;
}

public struct RivetLobby
{
    [JsonProperty("lobby_id")] public string LobbyId;
    [JsonProperty("host")] public string Host;
    [JsonProperty("port")] public int Port;
}

public struct RivetLobbyPort
{
    [JsonProperty("hostname")] public string? Hostname;
    [JsonProperty("port")] public ushort Port;
    [JsonProperty("is_tls")] public bool IsTls;
}

public struct RivetPlayer
{
    [JsonProperty("token")] public string Token;
}

public class RivetManager : MonoBehaviour
{
    // const string MatchmakerApiEndpoint = "https://matchmaker.api.rivet.gg/v1";
    const string MatchmakerApiEndpoint = "https://matchmaker.api.staging.gameinc.io/v1";
    
    public string? rivetToken = null;
    
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

    #region References

    private NetworkManager _networkManager = null!;
    private RivetAuthenticator _authenticator = null!;

    #endregion

    /// <summary>
    /// The response from the last <see cref="FindLobby"/> call. Used to maintain information about the Rivet player &
    /// lobby.
    /// </summary>
    public FindLobbyResponse? FindLobbyResponse { get; private set; }

    private void Start()
    {
        _networkManager = FindObjectOfType<NetworkManager>();
        
        // Configure client authentication
        _networkManager.ClientManager.OnClientConnectionState += ClientManager_OnClientConnectionState;
        _networkManager.ClientManager.RegisterBroadcast<RivetAuthenticator.TokenResponseBroadcast>(OnTokenResponseBroadcast);

        // Start server if testing in editor or running from CLI
        if ((Application.isEditor && GetToken().StartsWith("dev_")) || Application.isBatchMode)
        {
            StartServer();
        }
    }


    #region Server
    
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
        StartCoroutine(LobbyReady(() => { Debug.Log("Lobby ready"); }, _ => { }));
    }
    
    private ushort GetServerPort()
    {
        var port = Environment.GetEnvironmentVariable("PORT_default");
        return port != null ? ushort.Parse(port) : (ushort) 7770;
    }
    
    #endregion
    
    #region Authentication

    private void ClientManager_OnClientConnectionState(ClientConnectionStateArgs args)
    {
        if (args.ConnectionState != LocalConnectionState.Started)
            return;

        // Send request
        var token = FindLobbyResponse?.Player.Token;
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

    #region API: Matchmaker.Lobbies

    /// <summary>
    /// <a href="https://rivet.gg/docs/matchmaker/api/lobbies/find">Documentation</a>
    /// </summary>
    /// 
    /// <param name="request"></param>
    /// <param name="success"></param>
    /// <param name="fail"></param>
    /// <returns></returns>
    public IEnumerator FindLobby(FindLobbyRequest request, Action<FindLobbyResponse> success,
        Action<string> fail)
    {
        yield return PostRequest<FindLobbyRequest, FindLobbyResponse>(MatchmakerApiEndpoint + "/lobbies/find",
            request, res =>
            {
                // Save response
                FindLobbyResponse = res;

                // Connect to server
                var port = res.Ports["default"];
                Debug.Log("Connecting to " + port.Hostname + ":" + port.Port);
                _networkManager.ClientManager.StartConnection(port.Hostname, port.Port);

                success(res);
            }, fail);
    }
    
    /// <summary>
    /// <a href="https://rivet.gg/docs/matchmaker/api/lobbies/join">Documentation</a>
    /// </summary>
    /// 
    /// <param name="request"></param>
    /// <param name="success"></param>
    /// <param name="fail"></param>
    /// <returns></returns>
    public IEnumerator JoinLobby(JoinLobbyRequest request, Action<FindLobbyResponse> success,
        Action<string> fail)
    {
        yield return PostRequest<JoinLobbyRequest, FindLobbyResponse>(MatchmakerApiEndpoint + "/lobbies/join",
            request, res =>
            {
                // Save response
                FindLobbyResponse = res;

                // Connect to server
                var port = res.Ports["default"];
                Debug.Log("Connecting to " + port.Hostname + ":" + port.Port);
                _networkManager.ClientManager.StartConnection(port.Hostname, port.Port);

                success(res);
            }, fail);
    }
    
    /// <summary>
    /// <a href="https://rivet.gg/docs/matchmaker/api/lobbies/create">Documentation</a>
    /// </summary>
    /// 
    /// <param name="request"></param>
    /// <param name="success"></param>
    /// <param name="fail"></param>
    /// <returns></returns>
    public IEnumerator CreateLobby(CreateLobbyRequest request, Action<FindLobbyResponse> success,
        Action<string> fail)
    {
        yield return PostRequest<CreateLobbyRequest, FindLobbyResponse>(MatchmakerApiEndpoint + "/lobbies/create",
            request, res =>
            {
                // Save response
                FindLobbyResponse = res;

                // Connect to server
                var port = res.Ports["default"];
                Debug.Log("Connecting to " + port.Hostname + ":" + port.Port);
                _networkManager.ClientManager.StartConnection(port.Hostname, port.Port);

                success(res);
            }, fail);
    }

    /// <summary>
    /// <a href="https://rivet.gg/docs/matchmaker/api/lobbies/ready">Documentation</a>
    /// </summary>
    /// 
    /// <param name="success"></param>
    /// <param name="fail"></param>
    /// <returns></returns>
    public IEnumerator LobbyReady(Action success, Action<string> fail)
    {
        yield return PostRequest<Dictionary<string, string>, object>(MatchmakerApiEndpoint + "/lobbies/ready",
            new Dictionary<string, string>(), (_) => success(), fail);
    }

    #endregion

    #region API: Matchmaker.Players

    /// <summary>
    /// <a href="https://rivet.gg/docs/matchmaker/api/players/connected">Documentation</a>
    /// </summary>
    /// 
    /// <param name="playerToken"></param>
    /// <param name="success"></param>
    /// <param name="fail"></param>
    /// <returns></returns>
    public IEnumerator PlayerConnected(string playerToken, Action success, Action<string> fail)
    {
        yield return PostRequest<Dictionary<string, string>, object>(
            MatchmakerApiEndpoint + "/players/connected",
            new Dictionary<string, string>
            {
                { "player_token", playerToken },
            }, (_) => success(), fail);
    }

    /// <summary>
    /// <a href="https://rivet.gg/docs/matchmaker/api/players/disconnected">Documentation</a>
    /// </summary>
    /// 
    /// <param name="playerToken"></param>
    /// <param name="success"></param>
    /// <param name="fail"></param>
    /// <returns></returns>
    public IEnumerator PlayerDisconnected(string playerToken, Action success, Action<string> fail)
    {
        yield return PostRequest<Dictionary<string, string>, object>(
            MatchmakerApiEndpoint + "/players/disconnected", new Dictionary<string, string>
            {
                { "player_token", playerToken },
            }, (_) => success(), fail);
    }

    #endregion

    #region API Requests

    private string GetToken()
    {
        var token = Environment.GetEnvironmentVariable("RIVET_TOKEN");
        if (token != null)
        {
            return token;
        }

        if (rivetToken != null && rivetToken.Length > 0)
        {
            return rivetToken;
        }

        throw new Exception("RIVET_TOKEN not set");
    }

    private IEnumerator PostRequest<TReq, TRes>(string url, TReq requestBody, Action<TRes> success, Action<string> fail)
    {
        var debugRequestDescription = "POST " + url;

        var requestBodyStr = JsonConvert.SerializeObject(requestBody,
            new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore });
        Debug.Log(debugRequestDescription + " Request: " + requestBodyStr + "\n" + Environment.StackTrace);

        var www = UnityWebRequest.Post(url, requestBodyStr, "application/json");
        www.SetRequestHeader("Authorization", "Bearer " + GetToken());

        yield return www.SendWebRequest();

        switch (www.result)
        {
            case UnityWebRequest.Result.InProgress:
                Debug.Log("In progress");
                break;
            case UnityWebRequest.Result.Success:
                if (www.responseCode == 200)
                {
                    Debug.Log(debugRequestDescription + " Success: " + www.downloadHandler.text);
                    var responseBody = JsonConvert.DeserializeObject<TRes>(www.downloadHandler.text);
                    success(responseBody!);
                }
                else
                {
                    string statusError = "Error status " + www.responseCode + ": " + www.downloadHandler.text;
                    Debug.LogError(debugRequestDescription + " " + statusError);
                    fail(statusError);
                }

                break;
            case UnityWebRequest.Result.ConnectionError:
                string connectionError = "ConnectionError: " + www.error;
                Debug.LogError(debugRequestDescription + " " + connectionError + "\n" + Environment.StackTrace);
                fail(connectionError);
                break;
            case UnityWebRequest.Result.ProtocolError:
                string protocolError = "ProtocolError: " + www.error + " " + www.downloadHandler.text;
                Debug.LogError(debugRequestDescription + " " + protocolError + "\n" + Environment.StackTrace);
                fail(protocolError);
                break;
            case UnityWebRequest.Result.DataProcessingError:
                string dpe = "DataProcessingError: " + www.error;
                Debug.LogError(debugRequestDescription + " " + dpe + "\n" + Environment.StackTrace);
                fail(dpe);
                break;
            default:
                throw new ArgumentOutOfRangeException();
        }
    }

    #endregion
}