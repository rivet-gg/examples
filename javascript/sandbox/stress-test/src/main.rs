use anyhow::*;
use clap::Parser;

mod args;
mod client;
mod manager;
mod span;

// TODO: Write client (find stuff)
// TODO: Write state, store in mutex?
//

#[tokio::main]
async fn main() -> Result<()> {
	let args = args::Args::parse();
	manager::Manager::from(args).run().await
}
