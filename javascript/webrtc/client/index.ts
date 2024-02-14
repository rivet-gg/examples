import { Client } from "./Client";
import { RivetClient } from "@rivet-gg/api";

window.addEventListener("load", async () => {
	const RIVET = new RivetClient({
		token: process.env.RIVET_TOKEN,
	});

	const res = await RIVET.matchmaker.lobbies.find({
		gameModes: ["default"],
	});
	const signalingPort = res.lobby.ports["signaling"];

	new Client(signalingPort.host, res.lobby.player.token);
});
