using System;
using System.Collections.Generic;
using FishNet.Authenticating;
using FishNet.Broadcast;
using FishNet.Connection;
using FishNet.Managing;
using FishNet.Transporting;
using Unity.VisualScripting.Antlr3.Runtime;
using UnityEngine;

public class RivetAuthenticator : Authenticator
{
    #region Types

    public struct TokenRequestBroadcast : IBroadcast
    {
        public string Token;
    }

    public struct TokenResponseBroadcast : IBroadcast
    {
        public bool Valid;
    }

    #endregion

    #region References

    private RivetManager _rivetManager;

    #endregion

    #region State

    /// <summary>
    /// Tokens for each client. Used to tell Rivet which clients are disconnected on the server.
    /// </summary>
    private Dictionary<int, string> _clientTokens = new Dictionary<int, string>();

    #endregion

    void Start()
    {
        _rivetManager = FindObjectOfType<RivetManager>();
    }

    #region Authentication

    public override event Action<NetworkConnection, bool> OnAuthenticationResult;

    public override void InitializeOnce(NetworkManager networkManager)
    {
        base.InitializeOnce(networkManager);

        base.NetworkManager.ServerManager.RegisterBroadcast<TokenRequestBroadcast>(OnTokenRequestBroadcast, false);
        base.NetworkManager.ServerManager.OnRemoteConnectionState += ServerManager_OnRemoteConnectionState;
    }

    private void SendAuthenticationResponse(NetworkConnection conn, bool isValid)
    {
        // Remove token if invalid
        if (!isValid)
        {
            _clientTokens.Remove(conn.ClientId);
        }

        // Send response
        var trb = new TokenResponseBroadcast()
        {
            Valid = isValid,
        };
        base.NetworkManager.ServerManager.Broadcast(conn, trb, false);
        OnAuthenticationResult?.Invoke(conn, isValid);
    }

    #endregion


    #region Connection events

    private void ServerManager_OnRemoteConnectionState(NetworkConnection conn, RemoteConnectionStateArgs state)
    {
        if (state.ConnectionState == RemoteConnectionState.Stopped)
        {
            // Notify Rivet of player disconnect
            if (_clientTokens.ContainsKey(conn.ClientId))
            {
                // Remove token
                var token = _clientTokens[conn.ClientId];
                _clientTokens.Remove(conn.ClientId);

                // Send player disconnect
                Debug.Log("Disconnecting player: " + token);
                StartCoroutine(_rivetManager.PlayerDisconnected(
                    token,
                    () => { },
                    (_) => { }
                ));
            }
            else
            {
                Debug.LogWarning("Client disconnected without token: " + conn.ClientId);
            }
        }
    }

    private void OnTokenRequestBroadcast(NetworkConnection conn, TokenRequestBroadcast trb)
    {
        // Client already authenticated, potentially an attack
        if (conn.Authenticated)
        {
            Debug.Log("Client already authenticated");
            conn.Disconnect(true);
            return;
        }

        // Save token
        _clientTokens[conn.ClientId] = trb.Token;

        // Check validity
        Debug.Log("Validating token: " + trb.Token);
        StartCoroutine(_rivetManager.PlayerConnected(
            trb.Token,
            () => { SendAuthenticationResponse(conn, true); },
            (_) => { SendAuthenticationResponse(conn, false); }
        ));
    }

    #endregion
}