import url = require("url");
import md5 = require("md5");
import {int} from "./types";

// TODO: Replace rawIPs with detecting if the server sent a raw IP or prefixed with `ip_`

// export type ServerData = { ip: string, scheme: string, region: int, index: int, playerCount: int };
//
// export class VultrClient {
//     private static REGION_INFO = {
//         0: { name: "local", latitude: 0, longitude: 0 },
//         1: { name: "New Jersey", latitude: 40.1393329, longitude: -75.8521818 },
//         2: { name: "Chicago", latitude: 41.8339037, longitude: -87.872238 },
//         3: { name: "Dallas", latitude: 32.8208751, longitude: -96.8714229 },
//         4: { name: "Seattle", latitude: 47.6149942, longitude: -122.4759879 },
//         5: { name: "Los Angeles", latitude: 34.0207504, longitude: -118.691914 },
//         6: { name: "Atlanta", latitude: 33.7676334, longitude: -84.5610332 },
//         7: { name: "Amsterdam", latitude: 52.3745287, longitude: 4.7581878 },
//         8: { name: "London", latitude: 51.5283063, longitude: -0.382486 },
//         9: { name: "Frankfurt", latitude: 50.1211273, longitude: 8.496137 },
//         12: { name: "Silicon Valley", latitude: 37.4024714, longitude: -122.3219752 },
//         19: { name: "Sydney", latitude: -33.8479715, longitude: 150.651084 },
//         24: { name: "Paris", latitude: 48.8588376, longitude: 2.2773454 },
//         25: { name: "Tokyo", latitude: 35.6732615, longitude: 139.569959 },
//         39: { name: "Miami", latitude: 25.7823071, longitude: -80.3012156 },
//         40: { name: "Singapore", latitude: 1.3147268, longitude: 103.7065876 }
//     };
//
//     private static get predefinedData(): { scheme: string, servers: ServerData[] } {
//         const vultr = (window as any).vultr;
//         if (vultr == undefined) {
//             console.error("No global `vultr` variable.");
//         }
//         return vultr;
//     }
//
//     private servers: { [region: number]: ServerData[] };
//
//     public constructor(
//         /// The base URL of the domain; e.g. "galax.io"
//         private baseUrl: string,
//
//         /// The port that the development server is hosted on; it will connect to this is the main port is not `80`
//         private devPort: int,
//
//         /// How many players can fit in a lobby
//         private lobySize: int,
//
//         /// How many servers to randomly distribute players to. This is useful for if a lot of players try to join at
//         /// once, therefore preventing all the players trying to connect to server 1.
//         private lobbySpread: int,
//
//         /// Log debug messages about the connection.
//         private debugLog: boolean = false
//     ) {
//         // Redirect from "localhost" to "127.0.0.1" if needed; this is because the server
//         // manager uses "127.0.0.1" as the home
//         if (location.hostname == "localhost") {
//             window.location.hostname = "127.0.0.1";
//         }
//
//         // Process the servers
//         this.servers = this.processServers();
//     }
//
//     private processServers() {
//         // Group the servers by region
//         const servers: { [region: number]: ServerData[] } = { };
//         const serverList = VultrClient.predefinedData.servers;
//         for (let server of serverList) {
//             // Get or create the list
//             let list = servers[server.region];
//             if (list == undefined) {
//                 list = [];
//                 servers[server.region] = list;
//             }
//
//             // Add the server
//             list.push(server);
//         }
//
//         // Sort the servers
//         for (let region in servers) {
//             // Sort the servers
//             servers[region] = servers[region].sort((a, b) => { return a.index - b.index });
//         }
//
//         return servers;
//     }
//
//     public start(/*callback: () => undefined*/) {
//         // Set the callback
//         // this.callback = callback; // TODO: Callback?
//
//         // Parse the query for a server; if doesn't exist, ping the servers to find
//         // the right one
//         const server = this.parseServerQuery();
//         if (server) {
//             this.log("Found server in query.");
//             this.connect(server);
//         } else {
//             this.log("Pinging servers...");
//             this.pingServers();
//         }
//     }
// }
//
// VultrClient.prototype.start = function(callback) {
//
// };
//
// VultrClient.prototype.parseServerQuery = function() {
//     // Get the server from the query
//     var parsed = url.parse(location.href, true);
//     var serverRaw = parsed.query.server;
//     if (typeof serverRaw != "string") {
//         return;
//     }
//
//     // Parse the server string
//     var split = serverRaw.split(":");
//     if (split.length != 2) {
//         console.warn("Invalid number of server parameters in", serverRaw);
//         return;
//     }
//     var region = parseInt(split[0]);
//     var index = parseInt(split[1]);
//
//     // Find the list of servers for the region
//     var serverList = this.servers[region];
//     if (!Array.isArray(serverList)) {
//         console.warn("No server list for region", region)
//         return;
//     }
//
//     // Find the server matching the index
//     for (var i = 0; i < serverList.length; i++) {
//         var server = serverList[i];
//
//         if (server.index == index) {
//             return server;
//         }
//     }
//
//     // Otherwise, return nothing
//     console.warn("Could not find server in region " + region + " with index " + index + ".");
//     return;
// }
//
// VultrClient.prototype.pingServers = function() {
//     var _this = this;
//
//     // Ping random servers from each region
//     var requests = [];
//     for (var region in this.servers) {
//         // Find the server to ping
//         var serverList = this.servers[region];
//         var targetServer = serverList[Math.floor(Math.random() * serverList.length)];
//
//         // Ping the server
//         (function(serverList, targetServer) {
//             var request = new XMLHttpRequest();
//             request.onreadystatechange = function(requestEvent) {
//                 var request = requestEvent.target;
//
//                 // Ensure that the request finished
//                 if (request.readyState != 4)
//                     return;
//
//                 if (request.status == 200) {
//                     // Stop all other ping requests
//                     for (var i = 0; i < requests.length; i++) {
//                         requests[i].abort();
//                     }
//
//                     _this.log("Connecting to region", targetServer.region);
//
//                     // Seek the appropriate server
//                     _this.seekServer(targetServer.region);
//                 } else {
//                     console.warn("Error pinging " + targetServer.ip + " in region " + region);
//                 }
//             };
//             var targetAddress = "//" + _this.serverAddress(targetServer.ip, true) + ":" + _this.serverPort(targetServer) + "/ping";
//             request.open("GET", targetAddress, true);
//             request.send(null);
//
//             _this.log("Pinging", targetAddress);
//
//             // Save the request
//             requests.push(request);
//         })(serverList, targetServer);
//     }
// }
//
// /// Finds a new server; region is the index of the region to look in; game mode is the mode to search for;
// /// reload is wether a connection should be created or the page should be redirected
// VultrClient.prototype.seekServer = function(region, gameMode, redirect) {
//     if (gameMode == undefined) {
//         gameMode = "random";
//     }
//     if (redirect == undefined) {
//         redirect = false;
//     }
//
//     // Define configuration
//     const gameModeList = [ "random" ];
//     var lobbySize = this.lobbySize;
//     var lobbySpread = this.lobbySpread;
//
//     // Sort the servers by player count then filter by available servers
//     var servers = this.servers[region]
//         .filter(function(s) { // If not a random game mode, filter them to the proper mode
//             if (gameMode == "random") {
//                 return true;
//             } else {
//                 return gameModeList[s.index % gameModeList.length].key == gameMode;
//             }
//         })
//         .sort(function(a, b) { return b.playerCount - a.playerCount })
//         .filter(function(s) { return s.playerCount < lobbySize });
//
//     // Pick a random server; `lobbySpread` defines how many top lobbies to spread the players
//     // over
//     var randomSpread = Math.min(lobbySpread, servers.length);
//     var serverIndex = Math.floor(Math.random() * randomSpread);
//     serverIndex = Math.min(serverIndex, servers.length - 1);
//     var server = servers[serverIndex];
//     this.log("Found server.");
//     if (redirect) {
//         this.log("Redirecting...");
//         this.switchServer(server.region + ":" + server.index);
//     } else {
//         this.log("Connecting...");
//         this.connect(server);
//     }
// }
//
// VultrClient.prototype.connect = function(server) {
//     // Make sure not connected already
//     if (this.connected) {
//         return;
//     }
//
//     this.log("Connecting to server:", server);
//
//     // Replace the URL
//     window.history.replaceState(document.title, document.title, "?server=" + server.region + ":" + server.index);
//
//     // Save the srever
//     this.server = server;
//
//     // Return the address and port
//     this.log("Calling callback with address", this.serverAddress(server.ip), "on port", this.serverPort(server));
//     this.callback(this.serverAddress(server.ip), this.serverPort(server));
// }
//
// VultrClient.prototype.switchServer = function(server) {
//     // Save switching
//     this.switchingServers = true;
//
//     // Navigate to the server
//     window.location.href = "/?server=" + server;
// }
//
// /// Returns the server address for an IP using reverse DNS lookup; turn `forceSecure`
// /// on in order to force the server address to go through Cloudflare
// VultrClient.prototype.serverAddress = function(ip, forceSecure) {
//     // Determine the domain to connect to; this way it connects directly to localhost if needed
//     // "903d62ef5d1c2fecdcaeb5e7dd485eff" is the md5 hash for "127.0.0.1"
//     if (ip == "127.0.0.1" || ip == "7f000001" || ip == "903d62ef5d1c2fecdcaeb5e7dd485eff") {
//         // return "127.0.0.1";
//         return window.location.hostname; // This allows for connection over local IP networks
//     } else if (this.rawIPs) {
//         if (forceSecure) {
//             return "ip_" + this.hashIP(ip) + "." + this.baseUrl;
//         } else {
//             return ip;
//         }
//     } else {
//         return "ip_" + ip + "." + this.baseUrl;
//     }
// }
//
// /// Returns the port to connect to
// VultrClient.prototype.serverPort = function(server) {
//     // Return 8080 if development server
//     if (server.region == 0) {
//         return this.devPort;
//     }
//
//     // Otherwise return the port depending on the protocol
//     return location.protocol.startsWith("https") ? 443 : 80;
// }
//
//
// // TODO: Merge into VultrManager
// /// Converts an IP to a hex string
// VultrClient.prototype.ipToHex = function(ip) {
//     const encoded = ip.split(".") // Split by components
//         .map((component) =>
//             ("00" + parseInt(component).toString(16)) // Parses the component then converts it to a hex
//             .substr(-2) // Ensures there's 2 characters
//         )
//         .join("") // Join the string
//         .toLowerCase(); // Make sure it's lowercase
//     return encoded;
// };
//
// // TODO: Merge into VultrManager
// /// Hashes an IP to a cryptographically secure string; it does this by converting
// /// the ip to a hex string then doing an md5 hash on the string; e.g. "102.168.1.128" ->
// /// "c0a80180" -> "f8177f9878f2d00df00e51d786d97c0a"
// VultrClient.prototype.hashIP = function(ip) {
//     return md5(this.ipToHex(ip));
// };
//
// /// Logs debug information
// VultrClient.prototype.log = function() {
//     if (this.debugLog) {
//         return console.log.apply(undefined, arguments);
//     } else if (console.verbose) {
//         return console.verbose.apply(undefined, arguments);
//     }
// }
//
// module.exports = VultrClient;
