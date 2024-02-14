import { Server } from "./Server";
import { Socket } from "socket.io";
import { RTCPeerConnection, RTCDataChannel, RTCSessionDescription } from "wrtc";
import * as sdpTransform from "sdp-transform";
import { PORT_WEBRTC_MIN, PORT_WEBRTC_MAX } from "./env";

export class Connection {
	private name: string;
	private playerToken?: string;
	private peer: RTCPeerConnection;
	private dc: RTCDataChannel;

	public constructor(private _server: Server, private _socket: Socket) {
		this.name = `peer-${Math.floor(Math.random() * 1000000)}`;
		console.log("Connection", this.name);

		this._socket.once("init", this._onInit.bind(this));
	}

	async _onInit(playerToken: string, cb: () => void) {
		console.log("Received init", playerToken);

		this.playerToken = playerToken;

		// Validate player
		try {
			await Server.rivet.matchmaker.players.connected({ playerToken });
			console.log("Matchmaker player connected");
		} catch (err) {
			console.warn("Player failed to connect", err);
			this._socket.disconnect();
			return;
		}

		// Send success
		cb();

		// Finish setting up socket
		this._socket.on(
			"new-ice-candidate",
			this._onNewIceCandidate.bind(this)
		);
		this._socket.on("answer", this._onAnswer.bind(this));

		// Create echo over WebSocket to compare it WebRTC
		this._socket.on("echo", (data, cb) => cb(data));

		// Create peer
		this.peer = new RTCPeerConnection({
			iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
			portRange: {
				min: PORT_WEBRTC_MIN,
				max: PORT_WEBRTC_MAX,
			},
		});
		this.peer.addEventListener("iceconnectionstatechange", (ev) => {
			console.log("ICE connection state", this.peer.iceConnectionState);
		});
		this.peer.addEventListener("icegatheringstatechange", (ev) => {
			console.log("ICE gathering state", this.peer.iceGatheringState);
		});
		this.peer.addEventListener("icecandidate", (ev) => {
			if (ev.candidate) {
				console.log("New ICE candidate", ev.candidate);
				this._socket.emit("new-ice-candidate", ev.candidate);
			} else {
				console.log("No available ICE candidates");
			}
		});
		this.peer.addEventListener("connectionstatechange", (ev) => {
			console.log("New connection state", this.peer.connectionState);
			if (this.peer.connectionState === "connected") {
				console.log("WebRTC connected");
			}
		});

		// Create unreliable data channel for UDP communication
		//
		// This will echo all messages from the client
		this.dc = this.peer.createDataChannel("echo", {
			ordered: false,
			maxRetransmits: 0,
		});
		this.dc.addEventListener("open", (ev) => {
			console.log("DataChannel open");
		});
		this.dc.addEventListener("close", (ev) => {
			console.log("DataChannel close");
		});
		this.dc.addEventListener("message", (ev) => {
			console.log("Message", ev.data);

			this.dc.send(ev.data);
		});

		// Send offer
		this.peer.createOffer().then(async (offer) => {
			console.log("Created offer", sdpTransform.parse(offer.sdp));
			await this.peer.setLocalDescription(offer);
			this._socket.emit("offer", offer);
		});
	}

	private _onDisconnect() {
		console.log("WebSocket disconnected");
		if (this.peer) this.peer.close();
		if (this.playerToken)
			Server.rivet.matchmaker.players.disconnected({
				playerToken: this.playerToken,
			});
	}

	private _onNewIceCandidate(candidate: any) {
		console.log("Received candidate", candidate);
		if (candidate.candidate.startsWith("candidate:")) {
			this.peer.addIceCandidate(candidate);
		} else {
			// This may be caused by an empty candidate string in Firefox
			// https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/icecandidate_event#indicating_the_end_of_a_generation_of_candidates
			//
			// Relevant Firefox bug:
			// https://bugzilla.mozilla.org/show_bug.cgi?id=1540614
			//
			// Relevant WebKit bug:
			// https://bugs.chromium.org/p/chromium/issues/detail?id=978582
			console.log("Received invalid candidate", candidate);
		}
	}

	private async _onAnswer(answer: any) {
		console.log("Received answer", sdpTransform.parse(answer.sdp));

		await this.peer.setRemoteDescription(new RTCSessionDescription(answer));
	}
}
