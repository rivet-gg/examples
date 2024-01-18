import styles from '../styles/matchmaker.scss';
import { LitElement, html, unsafeCSS } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { when } from 'lit/directives/when.js';
import { RivetClient, Rivet } from '@rivet-gg/api-internal';

import * as ss from 'simple-statistics';
import { formatCode } from '../utils';
import { unsafeHTML } from 'lit/directives/unsafe-html';

const RIVET_TOKEN = typeof process !== 'undefined' ? process.env.RIVET_TOKEN : undefined;
console.log('Rivet token', RIVET_TOKEN);

const RIVET = new RivetClient({
	token: RIVET_TOKEN,
	environment: process.env.RIVET_API_ENDPOINT
});

// Add window "onload" handler
window.addEventListener('load', () => {
	let myApp = document.createElement('my-app');
	document.body.append(myApp);
});

/*
	This is a basic custom HTML element powered by the "lit" library.
	Our test game's environment exists within this class.
*/
@customElement('my-app')
export default class MyApp extends LitElement {
	static styles = unsafeCSS(styles);

	// === UI ===
	@query('#max-players')
	maxPlayersInput: HTMLInputElement;

	@query('#lobby-tags')
	lobbyTags: HTMLTextAreaElement;

	@query('#custom-lobby-config')
	customLobbyConfig: HTMLTextAreaElement;

	// === GAME VARIABLES ===
	@property({ type: String })
	status: string = 'Loading';

	@property({ type: Object })
	loadError: any = null;

	@property({ type: String })
	lobbyId: string = '';

	@property({ type: String })
	region: string = '';

	@property({ type: String })
	host: string = '';

	@property({ type: String })
	findDuration: string = '';

	@property({ type: Object })
	forwardedFor: string = null;

	@property({ type: Object })
	stateLobbyConfig: any = null;

	@property({ type: Object })
	stateLobbyTags: any = null;

	@property({ type: Object })
	stats: any = {};

	@property({ type: Array })
	pings: number[] = [];

	@property({ type: Array })
	leaderboard: { playerId: string; score: number }[] = [];

	@property({ type: Object })
	socket: WebSocket = null;

	@property({ type: Array })
	regions: string[] = [];

	@property({ type: Object })
	selectedRegions: Set<string> = new Set();

	@property({ type: Array })
	gameModes: string[] = ['default', 'custom'];

	@property({ type: Object })
	selectedGameModes: Set<string> = new Set(['default']);

	@property({ type: Boolean })
	isPublic: boolean = false;

	@property({ type: Boolean })
	allowRegionSelection: boolean = true;

	@property({ type: Boolean })
	loadedRegions: boolean = false;

	// === INPUT STORAGE ===
	@property({ type: Number })
	ppsValue: number = 20;

	@property({ type: Number })
	exitCodeValue: number = null;

	@property({ type: String })
	logValue: string = null;

	@property({ type: Number })
	pingInterval: number = null;

	// This is called when our app is inserted into the DOM
	connectedCallback() {
		super.connectedCallback();
		this.startApp();
	}

	async startApp() {
		// Get recommended regions
		this.status = 'Fetching recommended regions';
		try {
			let res = await RIVET.matchmaker.regions.list();
			this.regions = res.regions.map(region => region.regionId);
		} catch (err) {
			this.loadError = err;
			if (err.hasOwnProperty('body')) this.loadError = formatCode(err.body);
			return;
		}

		this.loadedRegions = true;
		this.status = 'Waiting for region select';
	}

	async findLobby() {
		this.allowRegionSelection = false;
		// Find lobby
		let findStartTs = Date.now();
		this.status = 'Finding lobby';
		let res;
		try {
			res = await RIVET.matchmaker.lobbies.find({
				gameModes: [...this.selectedGameModes],
				regions: this.selectedRegions.size ? Array.from(this.selectedRegions.values()) : null,
				tags: this.lobbyTags.value ? JSON.parse(this.lobbyTags.value) : null,
				maxPlayers: this.maxPlayersInput.value ? parseInt(this.maxPlayersInput.value) : null,
				preventAutoCreateLobby: false
			});
		} catch (err) {
			this.loadError = err;
			if (err.hasOwnProperty('body')) this.loadError = formatCode(err.body);
			return;
		}

		let findTime = Date.now() - findStartTs;
		this.findDuration = `${findTime / 1000}s`;

		await this.connectToLobby(res);
	}

	async createLobby() {
		this.allowRegionSelection = false;
		// Find lobby
		let findStartTs = Date.now();
		this.status = 'Finding lobby';
		let res;
		try {
			res = await RIVET.matchmaker.lobbies.create({
				gameMode: this.selectedGameModes.values().next().value,
				region: this.selectedRegions.size ? this.selectedRegions.values().next().value : null,
				tags: this.lobbyTags.value ? JSON.parse(this.lobbyTags.value) : null,
				maxPlayers: this.maxPlayersInput.value ? parseInt(this.maxPlayersInput.value) : null,
				publicity: this.isPublic ? 'public' : 'private',
				lobbyConfig: this.customLobbyConfig.value ? JSON.parse(this.customLobbyConfig.value) : null
			});
		} catch (err) {
			this.loadError = err;
			if (err.hasOwnProperty('body')) this.loadError = formatCode(err.body);
			return;
		}

		let findTime = Date.now() - findStartTs;
		this.findDuration = `${findTime / 1000}s`;

		await this.connectToLobby(res);
	}

	async connectToLobby(res: Rivet.matchmaker.FindLobbyResponse | Rivet.matchmaker.CreateLobbyResponse) {
		if (!res.lobby) {
			alert('Failed to find lobby');
			return;
		}
		let port = res.lobby.ports['default'];

		// Connect to server
		this.lobbyId = res.lobby.lobbyId;
		this.region = `${res.lobby.region.displayName} (${res.lobby.region.regionId})`;
		this.host = port.hostname;
		this.status = `Connecting`;

		let proto = port.isTls ? 'wss' : 'ws';
		this.socket = new WebSocket(`${proto}://${port.host}/?token=${res.lobby.player.token}`);

		this.socket.addEventListener('open', () => {
			this.status = 'Connected';
		});

		this.socket.addEventListener('close', () => {
			this.status = 'Disconnected';
		});

		this.socket.addEventListener('message', rawData => {
			let [event, data] = JSON.parse(rawData.data as string);
			switch (event) {
				case 'init':
					this.forwardedFor = data.forwardedFor;
					break;
				case 'state':
					this.stateLobbyConfig = data.lobbyConfig;
					this.stateLobbyTags = data.lobbyTags;

					this.leaderboard.length = 0;

					for (let playerId in data.scores) {
						this.leaderboard.push({
							playerId,
							score: data.scores[playerId]
						});
					}

					this.requestUpdate('leaderboard');
					break;
				case 'pong':
					let pingStartTs = data;
					let ping = Date.now() - pingStartTs;
					this.pings.push(ping);

					this.requestUpdate('pings');
					break;
				case 'stats':
					this.stats = data;
					break;
				default:
					console.warn('unknown event', event);
					break;
			}
		});

		// Start pinging the server
		this.updatePingLoop(20);
	}

	// Event handler for each region's checkbox
	selectRegion(regionId: string, event: Event) {
		let target = event.target as HTMLInputElement;

		if (target.checked) {
			this.selectedRegions.add(regionId);
		} else {
			this.selectedRegions.delete(regionId);
		}
	}

	selectGameMode(gameModeId: string, event: Event) {
		let target = event.target as HTMLInputElement;

		if (target.checked) {
			this.selectedGameModes.add(gameModeId);
		} else {
			this.selectedGameModes.delete(gameModeId);
		}
	}

	clickScoreButton() {
		this.socket.send(JSON.stringify(['score', null]));
	}

	clickExitButton() {
		this.socket.send(JSON.stringify(['force-exit', this.exitCodeValue ?? 0]));
	}

	clickLogButton(stream: 'stdout' | 'stderr') {
		this.socket.send(JSON.stringify(['log', { [stream]: this.logValue }]));
	}

	changeIsClosed(event: Event) {
		let target = event.target as HTMLInputElement;
		let isClosed = target.checked;
		this.socket.send(JSON.stringify(['set-closed', isClosed ? 1 : 0]));
	}

	// Event handler for the exit code input
	changeExitValue(event: Event) {
		let target = event.target as HTMLInputElement;

		this.exitCodeValue = parseInt(target.value);
	}

	// Our event handler for the "pings per second" select element
	changePpsSelection(event: Event) {
		let target = event.target as HTMLSelectElement;

		this.ppsValue = parseInt(target.value);
		this.updatePingLoop(this.ppsValue);
	}

	updatePingLoop(interval: number) {
		window.clearInterval(this.pingInterval);

		if (interval > 0) {
			this.pingInterval = window.setInterval(() => {
				if (this.socket.readyState == WebSocket.OPEN) {
					this.socket.send(JSON.stringify(['ping', Date.now()]));
				}
			}, 1000 / interval);
		}
	}

	render() {
		if (this.loadError) {
			return html`<div id="base">
				<div id="error">
					<h2>Error</h2>
					<p>${this.loadError}</p>
				</div>
			</div>`;
		}

		if (this.allowRegionSelection) {
			return html`<div id="base">
				${this.loadedRegions
					? html`<div id="center">
							<h3>Select a region</h3>
							${this.renderRegionSelections()}

							<h3>Select a game mode</h3>
							${this.renderGameModeSelections()}

							<h3>Config</h3>
							${this.renderConfig()}

							<h3>Custom</h3>
							${this.renderCustomConfig()}

							<div id="actions">
								<button @click=${this.findLobby.bind(this)} .disabled=${!this.loadedRegions}>
									Find Lobby
								</button>
								<button
									@click=${this.createLobby.bind(this)}
									.disabled=${!this.loadedRegions}
								>
									Create Custom Lobby
								</button>
							</div>
					  </div>`
					: html`<div class="loading-wheel"></div>`}
			</div> `;
		} else {
			return html`<div id="base">
				<div id="center">
					<div id="status-bar">
						<div id="status">
							${this.status}
							${this.status != 'Connected' && this.status != 'Disconnected'
								? html`<div class="loading-wheel"></div>`
								: null}
						</div>
					</div>
					<div class="data-table stats odd">
						${this.renderFindInfo()} ${this.renderTags()} ${this.renderPPS()} ${this.renderPing()}
						${this.renderStats()}
					</div>

					<div class="info-group">
						<h4>Custom game</h4>
						${formatCode(this.stateLobbyConfig)}
					</div>

					${this.renderLeaderboard()}

					<div class="info-group">
						<h4>State</h4>
						<div class="actions">
							<label>Is Closed</label>
							<input
								type="checkbox"
								placeholder="Is Closed"
								@change=${this.changeIsClosed.bind(this)}
							/>
						</div>
					</div>

					<div class="info-group">
						<h4>Exit</h4>
						<div class="actions">
							<input
								type="text"
								placeholder="Exit code"
								@change=${this.changeExitValue.bind(this)}
							/>
							<button @click=${this.clickExitButton.bind(this)}>Exit</button>
						</div>
					</div>

					<div class="info-group">
						<h4>Log</h4>
						<div class="actions">
							<input
								type="text"
								placeholder="Log"
								@change=${(ev: InputEvent) =>
									(this.logValue = (ev.target as HTMLInputElement).value)}
							/>
							<button @click=${this.clickLogButton.bind(this, 'stdout')}>stdout</button>
							<button @click=${this.clickLogButton.bind(this, 'stderr')}>stderr</button>
						</div>
					</div>
				</div>
			</div>`;
		}
	}

	renderRegionSelections() {
		return html`<div id="region-select">
			${repeat(
				this.regions,
				r => r,
				r =>
					html`<div class="region">
						<input
							type="checkbox"
							value=${r}
							name=${r}
							.checked=${this.selectedRegions.has(r)}
							@change=${this.selectRegion.bind(this, r)}
						/>
						<label for=${r}>${r}</label>
					</div>`
			)}
		</div>`;
	}

	renderGameModeSelections() {
		return html`<div id="game-mode-select">
			${repeat(
				this.gameModes,
				gm => gm,
				gm =>
					html`<div class="game-mode">
						<input
							type="checkbox"
							value=${gm}
							name=${gm}
							.checked=${this.selectedGameModes.has(gm)}
							@change=${this.selectGameMode.bind(this, gm)}
						/>
						<label for=${gm}>${gm}</label>
					</div>`
			)}
		</div>`;
	}

	renderConfig() {
		let defaultTags = {
			worldId: '06320'
		};
		let defaultMaxPLayerCount = 128;

		return html`<div class="config-details">
			<div style="margin-top: 4px; font-weight: bold">Max Player Count</div>
			<input
				id="max-players"
				type="text"
				name="max-player-count"
				placeholder="Max player count"
				value=${defaultMaxPLayerCount}
			/>
			<div style="margin-top: 4px; font-weight: bold">Lobby Tags</div>
			<textarea
				id="lobby-tags"
				name="lobby-tags"
				rows="10"
				cols="50"
				.value=${JSON.stringify(defaultTags)}
			></textarea>
		</div>`;
	}

	renderCustomConfig() {
		let defaultLobbyConfig = {
			scoreIncr: 2
		};

		return html`<div class="config-details">
			<input
				type="checkbox"
				name="is-public"
				.checked=${this.isPublic}
				@change=${(event: InputEvent) => (this.isPublic = (event.target as HTMLInputElement).checked)}
			/>
			<label for="is-public">Is Public</label>

			<div style="margin-top: 4px; font-weight: bold">Lobby Config</div>
			<textarea
				id="custom-lobby-config"
				name="lobby-config"
				rows="10"
				cols="50"
				.value=${JSON.stringify(defaultLobbyConfig)}
			></textarea>
		</div>`;
	}

	renderFindInfo() {
		return html`<div class="data-row">
				<span class="data-label">Lobby ID</span>
				<span class="data-value">${this.lobbyId || '--'}</span>
			</div>
			<div class="data-row">
				<span class="data-label">Region</span>
				<span class="data-value">${this.region || '--'}</span>
			</div>
			<div class="data-row">
				<span class="data-label">Host</span>
				<span class="data-value">${this.host || '--'}</span>
			</div>
			<div class="data-row">
				<span class="data-label">Find duration</span>
				<span class="data-value">${this.findDuration || '--'}</span>
			</div>
			<div class="data-row">
				<span class="data-label">X-Forwarded-For</span>
				<span class="data-value">${this.forwardedFor || '?'}</span>
			</div>`;
	}

	renderTags() {
		return html`<div class="data-row ping">
			<span class="data-label">Tags</span>
			<div class="data-table">
				<div class="data-row">
					<span class="data-label"></span>
					<span class="data-value">&nbsp;</span>
				</div>
				${when(this.stateLobbyTags != null, () => {
					return html`
						${repeat(
							Object.entries(this.stateLobbyTags),
							([k]) => k,
							([k, v]) => {
								return html`
									<div class="data-row">
										<span class="data-label">${k}</span>
										<span class="data-value">${v}</span>
									</div>
								`;
							}
						)}
					`;
				})}
			</div>
		</div>`;
	}

	renderPPS() {
		return html`<div class="data-row">
			<span class="data-label">PPS</span>
			<select name="pps" id="pps" @change=${this.changePpsSelection.bind(this)}>
				<option value="0">0</option>
				<option value="1">1</option>
				<option value="5">5</option>
				<option value="10">10</option>
				<option value="20" selected>20</option>
				<option value="60">60</option>
				<option value="120">120</option>
			</select>
		</div>`;
	}

	renderPing() {
		let last5Seconds = this.pings.slice(-this.ppsValue * 5);
		last5Seconds = last5Seconds.length ? last5Seconds : [0];

		let latest = last5Seconds[last5Seconds.length - 1] || 0;

		return html`<div class="data-row ping">
			<span class="data-label">Ping</span>
			<div class="data-table">
				<div class="data-row">
					<span class="data-label"></span>
					<span class="data-value">${latest.toFixed(0)}ms</span>
				</div>
				<div class="data-row">
					<span class="data-label">min</span>
					<span class="data-value">${ss.min(last5Seconds).toFixed(0)}ms</span>
				</div>
				<div class="data-row">
					<span class="data-label">max</span>
					<span class="data-value">${ss.max(last5Seconds).toFixed(0)}ms</span>
				</div>
				<div class="data-row">
					<span class="data-label">avg</span>
					<span class="data-value">${ss.average(last5Seconds).toFixed(1)}ms</span>
				</div>
				<div class="data-row">
					<span class="data-label">p95</span>
					<span class="data-value">${ss.quantile(last5Seconds, 0.95).toFixed(1)}ms</span>
				</div>
				<div class="data-row">
					<span class="data-label">p99</span>
					<span class="data-value">${ss.quantile(last5Seconds, 0.99).toFixed(1)}ms</span>
				</div>
			</div>
		</div>`;
	}

	renderStats() {
		return html`<div class="data-row stats">
			<span class="data-label">Stats</span>
			<div class="data-table">
				<div class="data-row">
					<span class="data-label"></span>
					<span class="data-value">&nbsp;</span>
				</div>
				<div class="data-row memory">
					<span class="data-label">Memory</span>
					<div class="data-table">
						<div class="data-row">
							<span class="data-label"></span>
							<span class="data-value">&nbsp;</span>
						</div>
						${when(
							this.stats.memory != undefined,
							() =>
								html`<div class="data-row">
										<span class="data-label">rss</span>
										<span class="data-value">${this.stats.memory.rss}</span>
									</div>
									<div class="data-row">
										<span class="data-label">heapTotal</span>
										<span class="data-value">${this.stats.memory.heapTotal}</span>
									</div>
									<div class="data-row">
										<span class="data-label">heapUsed</span>
										<span class="data-value">${this.stats.memory.heapUsed}</span>
									</div>
									<div class="data-row">
										<span class="data-label">external</span>
										<span class="data-value">${this.stats.memory.external}</span>
									</div>
									<div class="data-row">
										<span class="data-label">arrayBuffers</span>
										<span class="data-value">${this.stats.memory.arrayBuffers}</span>
									</div>`
						)}
					</div>
				</div>
			</div>
		</div>`;
	}

	renderLeaderboard() {
		if (!this.leaderboard.length) return null;

		return html`<div id="leaderboard" class="info-group">
			<h4>Leaderboard</h4>
			<div class="data-table">
				${repeat(
					this.leaderboard,
					item => item.playerId,
					item =>
						html`<div class="data-row">
							<span class="data-label">${item.playerId}</span>
							<span class="data-value">${item.score}</span>
						</div>`
				)}
			</div>
			<button id="score-button" @click=${this.clickScoreButton.bind(this)}>Score</button>
		</div>`;
	}
}
