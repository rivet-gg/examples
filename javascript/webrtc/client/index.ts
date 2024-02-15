import { Client } from "./Client";
import { RivetClient, fetcher, apiResponse } from "@rivet-gg/api";

window.addEventListener("load", async () => {
	const RIVET = new RivetClient({
		token: process.env.RIVET_TOKEN,
        fetcher: async args => {
            modifyFernArgs(args)
            return await fetcher.fetcher(args);
        },
	});

	const res = await RIVET.matchmaker.lobbies.find({
		gameModes: ["default"],
	});
	const signalingPort = res.lobby.ports["signaling"];

	new Client(signalingPort.host, res.lobby.player.token);
});

// TODO: Remove this after https://github.com/rivet-gg/rivet/issues/493
function modifyFernArgs(args: fetcher.Fetcher.Args) {
	// Remove headers starting with `x-fern-` since this is not white listed in our CORS policy
	for (let key in args.headers) {
		if (key.toLowerCase().startsWith('x-fern-')) delete args.headers[key];
	}
}

