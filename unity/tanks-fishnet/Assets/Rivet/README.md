# Rivet Unity Plugin

The Rivet Unity Plugin allows you to connect your game with Rivet, and easily
build and ship your multiplayer games to the world in under a minute.

More learning content related to Unity and Rivet can be found in the [Rivet
Learning Center](https://rivet.gg/learn/unity). You can also find an example of
this plugin being used in the [Rivet examples
repository](https://github.com/rivet-gg/examples/tree/main/unity/tanks-fishnet).

# 1.0 Table of Contents

- [Rivet Unity Plugin](#rivet-unity-plugin)
- [1.0 Table of Contents](#10-table-of-contents)
- [2.0 Plugin Usage](#20-plugin-usage)
  - [2.1 Linking](#21-linking)
  - [2.2 Playtest Tab](#22-playtest-tab)
  - [2.3 Deploy Tab](#23-deploy-tab)
  - [2.4 Settings Tab](#24-settings-tab)
  - [2.5 API Usage and Reference](#25-api-usage-and-reference)

# 2.0 Plugin Usage

## 2.1 Linking

First, you'll need to link the Rivet Unity Plugin to your project on the Rivet
Hub. You can open the Rivet Unity Plugin window by going to `Window > Rivet
Plugin`.

At this point, if the Rivet CLI isn't installed, the plugin shows a button that
handles the installation for you.

After the installation, you'll be prompted to link your project with the Rivet
Hub. By clicking "Sign in with Rivet", a browser window will be opened and let
you select or create a project on the Rivet Hub.

## 2.2 Playtest Tab

The playtesting tab allows you to select how your local game and game builds
will connect to Rivet servers. There are two items you can change here:

- **Server**: This allows you to select if you want to connect to a locally
  hosted server with `This machine`, or Rivet servers with `Rivet servers`. More
  often, you'll likely want to use Rivet servers so that you can quickly get
  others testing the game with publically accessible lobbies. Local testing can
  allow you to run a server on your machine for better debugging purposes.
- **Namespace**: This will allow you to choose which namespace you'd like to
  connect to. By default, the options are "Production" and "Staging", but others
  can be added on the Rivet Hub.

## 2.3 Deploy Tab

The Deploy tab allows you to build your game server and upload it to Rivet. You
can choose which namespace you'd like to deploy to. By default, the options are
"Production" and "Staging".

Staging can be used for testing, or to playtest with others. After you upload to
staging, make sure to go back to the Playtest tab and select the "Staging"
namespace, and change the server to "Rivet Servers".

Once you're ready to deploy to production, you can select the "Production"
namespace and deploy your server there. As soon as you deploy to production,
your updated server will be live for any future lobbies that are started.

## 2.4 Settings Tab

From the settings tab, you may unlink your game. This will bring you back to the
login screen, allowing you to re-link your project if needed.

## 2.5 API Usage and Reference

You can find the full Rivet API reference
[here](https://rivet.gg/docs/matchmaker). Items under the Matchmaker API
(`lobbies`, `players`, and `regions`) are all implemented in the Unity plugin.
Here's how you might use the `matchmaker/lobbies/find` endpoint:

```csharp
// Find lobby and connect with FishNet
var rivetManager = FindObjectOfType<RivetManager>();
StartCoroutine(rivetManager.FindLobby(new FindLobbyRequest
{
    GameModes = new[] { gameMode },
}, res =>
{
    // Connect to server
    var port = res.Ports["default"];
    Debug.Log("Connecting to " + port.Hostname + ":" + port.Port);
    var networkManager = FindObjectOfType<NetworkManager>();
    networkManager.ClientManager.StartConnection(port.Hostname, port.Port);

    UpdateConnectionInfo();
}, fail => { Debug.Log($"Failed to find lobby: {fail}"); }));
```
