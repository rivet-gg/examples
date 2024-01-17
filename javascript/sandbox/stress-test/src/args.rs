use clap::Parser;

#[derive(Parser)]
pub struct Args {
	/// How many clients to create.
	///
	/// If `hold_duration` is defined, then we hold
	/// this number of active clients.
	///
	/// These clients will be spread evenly over the given regions.
	#[clap(long, short = 'c', default_value = "100")]
	pub clients: usize,

	/// Simulated requests per second, will not be exact.
	#[clap(long, short = 'r', default_value = "10")]
	pub requests_per_second: f64,

	/// How many clients will disconnect per second when the test is complete.
	#[clap(long, short = 'd', default_value = "500")]
	pub disconnects_per_second: f64,

	/// How many time to reprint the state per second.
	#[clap(long, default_value = "1")]
	pub prints_per_second: f64,

	// TODO:
	// /// If we should specify an auto-create cofiguration in our find argument.
	// /// if true, we'll manually create a lobby if none is found.
	// #[clap(long)]
	// manually_auto_create: bool,
	/// Duration in seconds to hold the current client count. This will keep
	/// adding clients at the rate of `requests_per_second` and randomly remove
	/// clients as needed.
	#[clap(long, short = 'h')]
	pub hold_duration: Option<f64>,

	/// If we should not open a WebSocket to the server.
	#[clap(long)]
	pub no_websocket: bool,

	/// How many packets to send to the server.
	#[clap(long, default_value = "20")]
	pub packets_per_second: f64,

	/// How many bytes to send in the packet.
	#[clap(long, default_value = "256")]
	pub packet_bytes: usize,

	#[clap(long, long = "base", default_value = "https://api-game.rivet.gg/v1")]
	pub base_path: String,

	#[clap(long, long = "ref", default_value = "https://test-game.rivet.game/")]
	pub origin: String,

	#[clap(long, default_values = &["do-sfo", "do-fra", "do-nyc"])]
	pub regions: Vec<String>,
}

impl Args {
	pub fn request_interval(&self) -> f64 {
		// Creates a client for each region all at once
		1. / self.requests_per_second * self.regions.len() as f64
	}

	pub fn disconnect_interval(&self) -> f64 {
		1. / self.disconnects_per_second
	}

	pub fn print_interval(&self) -> f64 {
		1. / self.prints_per_second
	}

	pub fn packet_interval(&self) -> f64 {
		1. / self.packets_per_second
	}
}
