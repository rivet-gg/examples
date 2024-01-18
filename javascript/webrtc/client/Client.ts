import { io, Socket } from "socket.io-client";
import * as sdpTransform from "sdp-transform";
import * as ss from "simple-statistics";

const PING_SAMPLE_COUNT: number = 128;

export class Client {
	public socket: Socket;

	public isDisconnected = false;
	public isConnected = false;

	private mouseX: number = 0;
	private mouseY: number = 0;
	private lastPing: number = Date.now();

	private name: string;
	private peer: RTCPeerConnection;
	private dc: RTCDataChannel;

	private connState: HTMLElement;
	private iceState: HTMLElement;

	private cursorWebSocketEl: HTMLDivElement;
	private statsWebSocketEl: HTMLSpanElement;

	private cursorWebRTCEl: HTMLDivElement;
	private statsWebRTCEl: HTMLSpanElement;

	private statsDiffEl: HTMLSpanElement;

	private pingsWebSocket: number[] = [];
	private pingsWebRTC: number[] = [];

	public constructor(public host: string, private playerToken: string) {
		console.log("Connecting", host, playerToken);

		this.name = `peer-${Math.floor(Math.random() * 100000)}`;

		this.socket = io(host);
		this.socket.on("connect", this._onConnect.bind(this));
		this.socket.on("disconnect", this._onDisconnect.bind(this));
		this.socket.on("new-ice-candidate", this._onNewIceCandidate.bind(this));
		this.socket.on("offer", this._onOffer.bind(this));

		this.socket.emit("init", playerToken, this._onInit.bind(this));
	}

	async _onInit() {
		console.log("Initiated");

		// Create peer
		this.peer = new RTCPeerConnection({
			iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
		});
		this.peer.addEventListener("icecandidateerror", (ev) => {
			console.log("ICE error", ev);
		});
		this.peer.addEventListener("iceconnectionstatechange", (ev) => {
			console.log("ICE connection state", this.peer.iceConnectionState);
			document.getElementById("ice-connection-state").innerText =
				this.peer.iceConnectionState;
		});
		this.peer.addEventListener("icegatheringstatechange", (ev) => {
			console.log("ICE gathering state", this.peer.iceGatheringState);
			document.getElementById("ice-gathering-state").innerText =
				this.peer.iceGatheringState;
		});

		this.peer.addEventListener("icecandidate", async (ev) => {
			if (ev.candidate) {
				console.log("New ICE candidate", ev.candidate);
				this.socket.emit("new-ice-candidate", ev.candidate);
			} else {
				console.log("No available ICE candidates");
			}
		});
		this.peer.addEventListener("connectionstatechange", (ev) => {
			console.log("WebRTC connection state", this.peer.connectionState);
			document.getElementById("peer-connection-state").innerText =
				this.peer.connectionState;
			if (this.peer.connectionState === "connected") {
				console.log("WebRTC connected");
			}
		});

		// Listen for data channel
		this.peer.addEventListener("datachannel", (ev) => {
			console.log("Received data channel");

			this.dc = ev.channel;
			document.getElementById("dc-ready-state").innerText =
				this.dc.readyState;
			this.dc.addEventListener("open", (ev) => {
				console.log("DataChannel open");
				document.getElementById("dc-ready-state").innerText =
					this.dc.readyState;
			});
			this.dc.addEventListener("close", (ev) => {
				console.log("DataChannel close");
				document.getElementById("dc-ready-state").innerText =
					this.dc.readyState;
			});
			this.dc.addEventListener("message", (ev) => {
				console.log("Message", ev.data);

				const { x, y, now } = JSON.parse(ev.data);
				this.cursorWebRTCEl.style.left = `${x}px`;
				this.cursorWebRTCEl.style.top = `${y}px`;
				this.pingsWebRTC.unshift(Date.now() - now);
				this.pingsWebRTC.length = Math.min(this.pingsWebRTC.length, PING_SAMPLE_COUNT);
				this._updatePingStats();
			});
		});

		// Listen for mouse move events
		this.cursorWebSocketEl = document.getElementById(
			"cursor-websocket"
		) as HTMLDivElement;
		this.statsWebSocketEl = document.getElementById(
			"stats-websocket"
		) as HTMLSpanElement;

		this.cursorWebRTCEl = document.getElementById(
			"cursor-webrtc"
		) as HTMLDivElement;
		this.statsWebRTCEl = document.getElementById(
			"stats-webrtc"
		) as HTMLSpanElement;
		
		this.statsDiffEl = document.getElementById(
			"stats-diff"
		) as HTMLSpanElement;

		document
			.getElementById("canvas")
			.addEventListener("mousemove", (ev) => {
				this.mouseX = ev.clientX;
				this.mouseY = ev.clientY;
				this._sendPing();
			});

		// Send ping @ 10 pps
		setInterval(() => this._sendPing(), 100);
	}

	private _onConnect() {
		this.isDisconnected = false;
		this.isConnected = true;

		console.log("WebSocket connected");
		document.getElementById("ws-connected").innerText =
			this.socket.connected.toString();
	}

	private _onDisconnect() {
		this.isDisconnected = true;
		this.isConnected = false;

		console.log("WebSocket disconnected");
	}

	private _onNewIceCandidate(candidate: any) {
		console.log("Received candidate", candidate);
		this.peer.addIceCandidate(candidate);
	}

	private async _onOffer(offer: any) {
		const offerSdp = sdpTransform.parse(offer.sdp);
		console.log("Received offer", offerSdp);
		document.getElementById("offer-sdp").innerText =
			JSON.stringify(offerSdp);

		await this.peer.setRemoteDescription(new RTCSessionDescription(offer));

		const answer = await this.peer.createAnswer();
		const answerSdp = sdpTransform.parse(answer.sdp);
		console.log("Created answer", answerSdp);
		document.getElementById("answer-sdp").innerText =
			JSON.stringify(answerSdp);
		await this.peer.setLocalDescription(answer);
		this.socket.emit("answer", answer);
	}

	private _sendPing() {
		// Ensure that it's been at least 1ms since the last ping
		let now = Date.now();
		if (now - this.lastPing <= 1) return;
		this.lastPing = now;

		// Send over WebSocket
		if (this.socket) {
			this.socket.emit(
				"echo",
				{ x: this.mouseX, y: this.mouseY, now },
				(data: any) => {
					this.cursorWebSocketEl.style.left = `${data.x}px`;
					this.cursorWebSocketEl.style.top = `${data.y}px`;
					this.pingsWebSocket.unshift(Date.now() - data.now);
					this.pingsWebSocket.length = Math.min(this.pingsWebSocket.length, PING_SAMPLE_COUNT);
					this._updatePingStats();
				}
			);
		}

		// Send over WebRTC
		if (this.dc) {
			this.dc.send(
				JSON.stringify({ x: this.mouseX, y: this.mouseY, now })
			);
		}
	}

	private _updatePingStats() {
		let ws = this._generatePingStats(this.pingsWebSocket);
		let webrtc = this._generatePingStats(this.pingsWebRTC);

		this.statsWebSocketEl.innerText = this._genStatsText(ws);
		this.statsWebRTCEl.innerText = this._genStatsText(webrtc);
		this.statsDiffEl.innerText = this._genStatsText({
			min: webrtc.min - ws.min,
			max: webrtc.max - ws.max,
			avg: webrtc.avg - ws.avg,
			p95: webrtc.p95 - ws.p95,
			p99: webrtc.p99 - ws.p99,
		});
	}

	private _generatePingStats(samples: number[]): any {
		if (samples.length == 0) samples = [0];
		return {
			min: ss.min(samples),
			max: ss.max(samples),
			avg: ss.average(samples),
			p95: ss.quantile(samples, 0.95),
			p99: ss.quantile(samples, 0.99),
		}
	}

	private _genStatsText({ min, max, avg, p95, p99 }): string {
		return `[min=${min.toFixed(0)}ms] [max=${max.toFixed(0)}ms] [avg=${avg.toFixed(1)}ms] [p95=${p95.toFixed(1)}ms] [p99=${p99.toFixed(1)}ms]`;
	}
}
