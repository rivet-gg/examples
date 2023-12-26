export const PORT_SIGNALING = parseInt(process.env.PORT_signaling || "3000");
export const PORT_WEBRTC_MIN = parseInt(
	process.env.PORT_RANGE_MIN_webrtc || "26000"
);
export const PORT_WEBRTC_MAX = parseInt(
	process.env.PORT_RANGE_MAX_webrtc || "31999"
);
console.table({ PORT_SIGNALING, PORT_WEBRTC_MIN, PORT_WEBRTC_MAX });
