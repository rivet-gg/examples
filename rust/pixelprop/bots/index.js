const WebSocket = require("ws");
const msgpack = require("msgpack-lite");
const redis = require("redis");

const OutgoingMessageType = {
    Join: 0,
    Move: 1,
    FaceDir: 2,
    Rotate: 3,
    Shoot: 4,
    Select: 5,
    Jump: 6,
    ForcePing: 7,
    TempData: 8,
};

// Connect to redis
// const redis_client = redis.createClient(6379, "45.63.87.3", { auth_pass: "RoVXiDTUnAzUwwp7" });
// redis_client.on("error", function (err) {
// 	console.log("Redis error " + err);
// });

// Start the clients
let clientCount = 30;
for (let i = 0; i < clientCount; i++) {
	setTimeout(() => {
		// Generate a key
		generateKey((key) => {
			// Connect to the websocket
			// const ws = new WebSocket("ws://pixelprop_prod.pixelprop.io:3000/");
			const ws = new WebSocket("ws://127.0.0.1:3000/");

			ws.on("open", () => {
				console.log(`${i}: Connected.`)

				// Send the handshake
				// console.log(`${i} Sending handshake...`);
				// ws.sendMessage("handshake", {
				// 	key: key
				// });

				// Join every few seconds
				console.log(`${i} Sending initial join...`);
				ws.sendMessage(OutgoingMessageType.Join, [`bot-${i}`, randomCharacter()]);
				// setInterval(() => {
				// 	console.log(`${i} Sending join...`);
				// 	ws.sendMessage(OutgoingMessageType.Join, [`bot-${i}-rejoin`, randomCharacter()]);
				// }, 10000 + Math.random() * 5000);

				// Send seemingly random input every few seconds
				setInterval(() => {
					const moveDir = Math.random() > 0.2 ? Math.random() * Math.PI * 2 : undefined;
					// const sprint = Math.random() > 0.8;
					const sprint = false;
					ws.sendMessage(OutgoingMessageType.Move, [moveDir, sprint]);
				}, 1000 + Math.random() * 1000);
				setInterval(() => {
					ws.sendMessage(OutgoingMessageType.Jump);
				}, 1000 + Math.random() * 2000);
				setInterval(() => {
					ws.sendMessage(OutgoingMessageType.FaceDir, Math.random() * Math.PI * 2);
				}, 3000);
				// setInterval(() => {
				// 	const target = [
				// 		(Math.random() - 0.5) * 4000,
				// 		(Math.random() - 0.5) * 4000,
				// 		0
				// 	];
				// 	ws.sendMessage(OutgoingMessageType.Shoot, target);
				// }, 1000 + Math.random() * 500);
				// setInterval(() => {
				// 	ws.sendMessage(OutgoingMessageType.Select, Math.floor(Math.random() * 100));
				// }, 200 + Math.random() * 500);
			});

			// Log messages
			// ws.on("message", (message) => {
			// 	console.log(message);

			// 	messageData = msgpack.decode(message.data);

			// 	console.log("data", messageData);
			// });
		});
	}, 1000 * i);
}

// Extensions
WebSocket.prototype.sendMessage = function (type, data) {
	this.send(msgpack.encode([type, data]));
};

// Redis utils
// function generateKey(callback) {
// 	const key = "bot_" + Math.floor(Math.random() * 100000);
// 	redis_client.sadd("keys", key, function () {
// 		console.log("Generated key", key);
// 		callback(key);
// 	});
// }
function generateKey(callback) {
	callback("no key");
}

// Gets a random ship id
const shipIds = [
	"basic",
	"nathan",
	"nicholas",
	"sidney"
];
function randomCharacter() {
	return shipIds[Math.floor(Math.random() * shipIds.length)];
}
