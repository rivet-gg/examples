using System.Collections;
using System.Collections.Generic;
using FishNet.Managing.Logging;
using UnityEngine;
using FishNet.Object;

public class Player : NetworkBehaviour
{
    private CharacterController _cc;
    private LobbyConfig _lc;

    void Start()
    {
        _cc = GetComponent<CharacterController>();
        _lc = FindObjectOfType<LobbyConfig>();
    }

    void Update()
    {
        Move();
    }

    [Client(Logging = LoggingType.Off, RequireOwnership = true)]
    void Move() {
        var horizontalInput = Input.GetAxisRaw("Horizontal");
        var verticalInput = Input.GetAxisRaw("Vertical");
        var offset = new Vector3(horizontalInput, Physics.gravity.y, verticalInput) * _lc.moveSpeed * Time.deltaTime;
        _cc.Move(offset);
    }
}
