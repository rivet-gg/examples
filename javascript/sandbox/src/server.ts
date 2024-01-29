// Since we can't inherit the cert from mkcert
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

import 'dotenv/config';
import { RivetClient } from '@rivet-gg/api-internal';
import { URL } from 'url';
import { WebSocket, Server as WebSocketServer } from 'ws';
import * as http from 'http';
import express from 'express';

console.log(process.env);

logTimestamp('start');

const RIVET = new RivetClient({
	token: process.env.RIVET_TOKEN,
	environment: process.env.RIVET_API_ENDPOINT
});

retryDns(() => RIVET.matchmaker.lobbies.ready())
	.then(() => {
		logTimestamp('server-ready');
	})
	.catch(err => {
		console.error('Failed to start lobby', err);
		process.exit(1);
	});

// Test SIGTERM handling
process.on('SIGTERM', () => {
	console.log('SIGTERM signal received');
	setTimeout(() => {
		console.log('Exiting');
		process.exit(0);
	}, 1000);
});

// Apply lobby config
let gameConfig = {
	scoreIncr: 1
};
if (process.env.RIVET_LOBBY_CONFIG) {
	let config = JSON.parse(process.env.RIVET_LOBBY_CONFIG);
	let scoreIncr = parseInt(config.scoreIncr);
	if (scoreIncr) gameConfig.scoreIncr = scoreIncr;
}

// Create game state
interface GameState {
	lobbyConfig: any;
	lobbyTags: any;
	scores: { [id: number]: number };
}

const gameState: GameState = {
	lobbyConfig: process.env.RIVET_LOBBY_CONFIG ? JSON.parse(process.env.RIVET_LOBBY_CONFIG) : null,
	lobbyTags: process.env.RIVET_LOBBY_TAGS ? JSON.parse(process.env.RIVET_LOBBY_TAGS) : null,
	scores: {}
};

// Setup HTTP server
const app = express();
app.get('/health', (_req, res) => {
    res.send('ok');
});

// Setup server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const port = parseInt(process.env.PORT!) || 8080;
console.log(`Listening on port ${port}`);
server.listen(port);

// Handle connections
let clients = new Map<number, WebSocket>();

function broadcast(event: string, data: any) {
	clients.forEach(client => {
		client.send(JSON.stringify([event, data]));
	});
}

let counter = 0;
wss.on('connection', async (ws, req) => {
	let idx = counter++;
	const playerId = idx;

	clients.set(idx, ws);

	logTimestamp(`player-connect-${idx}`);

	ws.send(
		JSON.stringify([
			'init',
			{
				forwardedFor: req.headers['x-forwarded-for']
			}
		])
	);

	let url = new URL(req.url!, 'http://test.com');
	let playerToken = url.searchParams.get('token') as string;

	ws.on('close', async () => {
		logTimestamp(`player-disconnect-${idx}`);

		// Remove client
		clients.delete(idx);

		// Delete player
		delete gameState.scores[playerId];
		broadcast('state', gameState);

		// Unregister player
		try {
			await retryDns(() => RIVET.matchmaker.players.disconnected({ playerToken }));
			logTimestamp(`player-disconnect-complete-${idx}`);
		} catch (err) {
			console.error('failed to disconnect player', err);
		}
	});

	try {
		await retryDns(() => RIVET.matchmaker.players.connected({ playerToken }));
		logTimestamp(`player-connect-complete-${idx}`);
	} catch (err) {
		console.error('failed to connect player', idx, err);
		ws.close();
	}

	gameState.scores[playerId] = 0;
	broadcast('state', gameState);

	ws.on('message', (rawData: string) => {
		let [event, data] = JSON.parse(rawData.slice(0, 2 ** 13));
		switch (event) {
			case 'ping':
				ws.send(JSON.stringify(['pong', data]));
				break;
			case 'score':
				gameState.scores[playerId] += gameConfig.scoreIncr;
				broadcast('state', gameState);
				break;
			case 'log':
				if (data.stdout) {
					console.log(data.stdout);
				} else if (data.stderr) {
					console.error(data.stderr);
				}
				break;
			case 'set-closed':
				let isClosed = parseInt(data) == 1;
				console.log('Setting closed: ', isClosed);
				RIVET.matchmaker.lobbies
					.setClosed({ isClosed })
					.then(() => console.log('Set closed success'));
				break;
			case 'force-exit':
				let code = parseInt(data);
				console.log('forcing exit with code', code);
				process.exit(code);
				break;
			case 'demo:kv:put':
				handleKvPutProxy(ws, data.key, data.data);
				break;
			case 'demo:kv:put':
				handleKvDeleteProxy(ws, data.key);
				break;

			default:
				console.warn('unknown event', event);
				break;
		}
	});
});

setInterval(() => {
	broadcastStats();
}, 1000);

async function handleKvPutProxy(ws: WebSocket, key: string, data: any) {
	let res;
	try {
		res = await RIVET.kv.put({ key, value: data });
	} catch (err) {
		console.error(err);

		if (err.hasOwnProperty('$response')) {
			res = {
				code: err.status,
				response: JSON.parse(await err.$response.body.text())
			};
		}
	}

	ws.send(JSON.stringify(['demo:kv:put', res]));
}

async function handleKvDeleteProxy(ws: WebSocket, key: string) {
	let res;
	try {
		res = await RIVET.kv.delete({ key });
	} catch (err) {
		console.error(err);

		if (err.hasOwnProperty('$response')) {
			res = {
				code: err.status,
				response: JSON.parse(await err.$response.body.text())
			};
		}
	}

	ws.send(JSON.stringify(['demo:kv:delete', res]));
}

function broadcastStats() {
	broadcast('stats', {
		memory: process.memoryUsage()
	});
}

// TODO: Figure out the DNS issue
// When running on localhost, we occasionally get `getaddrinfo ENOTFOUND` errors when we shouldn't.
async function retryDns<T>(cb: () => Promise<T>): Promise<T> {
	while (true) {
		try {
			return await cb();
		} catch (err: any) {
			if ((err + '').indexOf('getaddrinfo ENOTFOUND') != -1) {
				console.error('getaddrinfo ENOTFOUND error, retrying');
				continue;
			} else {
				let text = err.text && (await err.text());
				console.error('request error', err.url, err.status, text, err);
				throw err;
			}
		}
	}
}

function logTimestamp(label: string) {
	let date = new Date();
	console.log(`${label}: ${date.toISOString()}`);
}
