use crate::{
	args,
	client::{Client, ClientInner, ClientState},
};
use anyhow::*;
use futures_util::StreamExt;
use rand::seq::SliceRandom;
use std::{
	collections::HashMap,
	fmt::Display,
	sync::Arc,
	time::{Duration, Instant},
};

use crate::span;

enum ManagerState {
	Creating,
	WaitingConnected,
	Holding {
		/// Timestamp at which all clients were created successfully.
		all_created_ts: Instant,
	},
	Removing,
}

pub struct Manager {
	args: Arc<args::Args>,
	term: console::Term,
	spans: span::Manager,

	/// How many lines were printed on the last tick.
	last_print_lines: usize,

	state: ManagerState,
	clients: Vec<Client>,
}

impl From<args::Args> for Manager {
	fn from(args: args::Args) -> Self {
		Manager {
			args: Arc::new(args),
			term: console::Term::stdout(),
			spans: Default::default(),
			last_print_lines: 0,
			state: ManagerState::Creating,
			clients: Vec::new(),
		}
	}
}

impl Manager {
	pub async fn run(mut self) -> Result<()> {
		let mut next_update_ts = tokio::time::Instant::now();
		let mut print_interval =
			tokio::time::interval(Duration::from_secs_f64(self.args.print_interval()));
		loop {
			tokio::select! {
				_ = tokio::time::sleep_until(next_update_ts) => {
					if self.update_clients().await? {
						return Ok(());
					}

					// Schedule next update
					if matches!(self.state, ManagerState::Removing) {
						next_update_ts += Duration::from_secs_f64(self.args.disconnect_interval());
					} else {
						next_update_ts += Duration::from_secs_f64(self.args.request_interval());
					}
				}
				_ = print_interval.tick() => {
					let span = self.spans.start("print_output");

					self.print_output().await?;

					span.finish().await;
				}
			}
		}
	}

	/// Prints the state of all the clients.
	async fn print_output(&mut self) -> Result<()> {
		// Clear last printed lines
		self.term.clear_last_lines(self.last_print_lines)?;
		self.last_print_lines = 0;

		let state_str = match self.state {
			ManagerState::Creating => {
				format!("Creating {}/{}", self.clients.len(), self.args.clients)
			}
			ManagerState::WaitingConnected => "Waiting connected".to_owned(),
			ManagerState::Holding { all_created_ts } => format!(
				"Holding {}s",
				format_duration_s(
					self.args.hold_duration.unwrap()
						- (Instant::now() - all_created_ts).as_secs_f64()
				)
			),
			ManagerState::Removing => "Removing".to_string(),
		};

		self.print_line("")?;
		self.print_line(&format!("State: {}", state_str))?;

		// Print states
		{
			self.print_line("")?;
			self.print_line("")?;
			self.print_line("=== Clients ===")?;

			let mut client_counts = vec![0; 12];
			for client in &self.clients {
				let state_idx = client.state.read().await.index();
				client_counts[state_idx] += 1;
			}

			let normal_states = [
				"Starting",
				"Finding",
				"Connecting",
				"CheckingConnection",
				"Connected",
				"Closed",
			]
			.into_iter()
			.enumerate()
			.map(|(i, title)| {
				StateColumn::new_with_values(title, vec![client_counts[i].to_string()])
			})
			.collect::<Vec<_>>();
			self.print_line("")?;
			self.print_columns(&normal_states)?;

			let err_states = [
				"FindLobby",
				"ConnectError",
				"SendError",
				"ConnectTimedOut",
				"EarlyClose",
				"Internal",
			]
			.into_iter()
			.enumerate()
			.map(|(i, title)| {
				StateColumn::new_with_values(
					title,
					vec![client_counts[i + normal_states.len()].to_string()],
				)
			})
			.collect::<Vec<_>>();
			self.print_line("")?;
			self.print_columns(&err_states)?;
		}

		// Log errors
		let mut errors = HashMap::<String, usize>::new();
		for client in &self.clients {
			let state = client.state.read().await;
			let stringify = match *state {
				ClientState::Starting
				| ClientState::Finding
				| ClientState::Connecting
				| ClientState::CheckingConnection
				| ClientState::Connected
				| ClientState::Closed => false,
				ClientState::FindLobby { .. }
				| ClientState::ConnectError { .. }
				| ClientState::SendError { .. }
				| ClientState::ConnectTimedOut
				| ClientState::EarlyClose
				| ClientState::Internal { .. } => true,
			};
			if stringify {
				let state_debug = format!("{:?}", *state);
				*errors.entry(state_debug).or_insert(0) += 1;
			}
		}
		let mut errors = errors.into_iter().collect::<Vec<_>>();
		errors.sort_by_key(|(err, _)| err.clone());
		errors.sort_by_key(|(_, count)| -(*count as i64));

		{
			let mut label = StateColumn::new("");
			let mut mean = StateColumn::new("Mean");
			let mut median = StateColumn::new("Median");
			let mut min = StateColumn::new("Min");
			let mut max = StateColumn::new("Max");
			let mut p95 = StateColumn::new("P95");
			let mut p99 = StateColumn::new("P99");

			for stat in self.spans.stats().await {
				label.push_value(stat.label);
				mean.push_value(format_duration_us(stat.mean));
				median.push_value(format_duration_us(stat.median));
				min.push_value(format_duration_us(stat.min));
				max.push_value(format_duration_us(stat.max));
				p95.push_value(format_duration_us(stat.p95));
				p99.push_value(format_duration_us(stat.p99));
			}

			self.print_line("")?;
			self.print_line("")?;
			self.print_line("=== Spans ===")?;
			self.print_line("")?;
			self.print_columns(&[label, mean, median, min, max, p95, p99])?;
		}

		self.print_line("")?;
		self.print_line("")?;
		self.print_line(&format!("=== Errors ({}) ===", errors.len()))?;
		for (i, (error, count)) in errors.iter().enumerate() {
			let max_errors = 8;
			if i > max_errors {
				self.print_line(&format!("  ...{} more...", errors.len() - max_errors))?;
				break;
			}

			self.print_line(&format!("  * ({}) {}", count, error))?;
		}

		Ok(())
	}

	/// Prints a single line to the console and records the line count so we can
	/// clear it in the next iteration.
	fn print_line(&mut self, line: &str) -> Result<()> {
		// TODO: Buffer this in to one write

		let width = self.term.size().1 as usize;
		for line in line.split("\n") {
			// Write line
			self.term.write_line(line)?;

			// Calculate number of lines occupied including line wrap
			let line_count = (line.len() + width) / width;
			self.last_print_lines += line_count;
		}

		Ok(())
	}

	fn print_columns(&mut self, columns: &[StateColumn]) -> Result<()> {
		// TODO: Assert all columns have the same value length

		// Headers
		{
			let mut line = String::new();
			for column in columns {
				line.push_str(&format!(
					"{title: >width$}│",
					title = column.title,
					width = column.width()
				));
			}
			self.print_line(&line)?;
		}

		// Values
		let mut lines = vec![String::new(); columns[0].values.len()];
		for column in columns {
			for (i, value) in column.values.iter().enumerate() {
				lines[i].push_str(&format!(
					"{value: >width$}│",
					value = value.to_string(),
					width = column.width()
				));
			}
		}
		for line in &lines {
			self.print_line(&line)?;
		}

		Ok(())
	}

	async fn update_clients(&mut self) -> Result<bool> {
		match self.state {
			ManagerState::Creating => {
				let span = self.spans.start("manager_creating");

				for region in &self.args.regions.clone() {
					self.add_client(region).await?;
				}

				if self.clients.len() >= self.args.clients {
					self.state = ManagerState::WaitingConnected;
				}

				span.finish().await;
			}
			ManagerState::WaitingConnected => {
				let span = self.spans.start("manager_waiting");

				let all_connected = futures_util::stream::iter(self.clients.iter())
					.all(|x| async {
						!matches!(
							*x.state.read().await,
							ClientState::Finding
								| ClientState::Connecting | ClientState::CheckingConnection
						)
					})
					.await;
				if all_connected {
					if self.args.hold_duration.is_some() {
						self.state = ManagerState::Holding {
							all_created_ts: Instant::now(),
						};
					} else {
						self.state = ManagerState::Removing;
					}
				}

				span.finish().await;
			}
			ManagerState::Holding { all_created_ts } => {
				let span = self.spans.start("manager_holding");

				// All clients are created, so remove one before adding another

				for region in self.args.regions.clone() {
					// TODO: Run while connected < clinet count
					// Find a random connected client to remove
					if let Some(remove_client) = self.random_connected_client().await {
						// Remove the client
						remove_client.close().await;
					}

					// TODO: Don't create if `starting + finding + connected > client count`
					// Create a new client
					self.add_client(&region).await?;
				}

				if (Instant::now() - all_created_ts).as_secs_f64()
					> self.args.hold_duration.unwrap()
				{
					self.state = ManagerState::Removing
				}

				span.finish().await;
			}
			ManagerState::Removing => {
				let span = self.spans.start("manager_removing");

				// Remove random client
				if let Some(remove_client) = self.random_connected_client().await {
					remove_client.close().await;
				} else {
					// No more clients to remove
					return Ok(true);
				}

				span.finish().await;
			}
		}

		Ok(false)
	}

	async fn random_connected_client(&self) -> Option<Client> {
		futures_util::stream::iter(self.clients.iter())
			.filter(|x| async {
				match *x.state.read().await {
					ClientState::Connected => true,
					_ => false,
				}
			})
			.collect::<Vec<_>>()
			.await
			.choose(&mut rand::thread_rng())
			.map(|x| (*x).clone())
	}

	async fn add_client(&mut self, region: &str) -> Result<()> {
		let span = self.spans.start("client_create");

		// Build client
		let mut default_headers = reqwest::header::HeaderMap::new();
		default_headers.insert(
			"Origin",
			reqwest::header::HeaderValue::from_str(&self.args.origin)?,
		);

		let client = reqwest::ClientBuilder::new()
			.default_headers(default_headers)
			.build()?;
		let config = rivet_game_server::apis::configuration::Configuration {
			client,
			base_path: self.args.base_path.clone(),
			..Default::default()
		};

		let client = ClientInner::new(
			self.args.clone(),
			self.spans.clone(),
			config,
			self.clients.len().to_string(),
			region.to_owned(),
		);
		tokio::spawn(client.clone().start());
		self.clients.push(client);

		span.finish().await;

		Ok(())
	}
}

struct StateColumn {
	title: &'static str,
	values: Vec<String>,
}

impl StateColumn {
	fn new(title: &'static str) -> Self {
		Self {
			title,
			values: Vec::new(),
		}
	}

	fn new_with_values(title: &'static str, values: Vec<String>) -> Self {
		Self { title, values }
	}

	fn width(&self) -> usize {
		5.max(self.title.len())
			.max(self.values.iter().map(|x| x.len()).max().unwrap_or(0))
	}

	fn push_value(&mut self, val: impl Display) {
		self.values.push(format!("{}", val));
	}
}

fn format_duration_s(secs: f64) -> humantime::FormattedDuration {
	let secs = secs.max(0.);
	humantime::format_duration(Duration::from_secs_f64(secs))
}

fn format_duration_us(secs: f64) -> humantime::FormattedDuration {
	let secs = secs.max(0.);
	let secs = (secs * 1_000_000.).trunc() / 1_000_000.; // Round to microseconds
	humantime::format_duration(Duration::from_secs_f64(secs))
}
