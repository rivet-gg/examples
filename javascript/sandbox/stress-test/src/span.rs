use statrs::statistics::{Distribution, Max, Min, OrderStatistics};
use std::{
	collections::HashMap,
	sync::{Arc, Weak},
	time::Instant,
};
use tokio::sync::RwLock;

pub type Manager = Arc<ManagerInner>;

pub struct ManagerInner {
	spans: RwLock<HashMap<&'static str, Vec<f64>>>,
}

impl Default for ManagerInner {
	fn default() -> Self {
		ManagerInner {
			spans: Default::default(),
		}
	}
}

impl ManagerInner {
	pub fn start(self: &Manager, label: &'static str) -> Span {
		Span {
			manager: Arc::downgrade(&self),
			label,
			start: Instant::now(),
		}
	}

	pub async fn write_span(&self, label: &'static str, duration: f64) {
		self.spans
			.write()
			.await
			.entry(label)
			.or_default()
			.push(duration);
	}

	pub async fn stats(&self) -> Vec<Stats> {
		let spans = self.spans.read().await;
		let mut stats = tokio::task::block_in_place(|| {
			spans
				.iter()
				.map(|(label, values)| {
					let mut values = values.clone();
					let mut data = statrs::statistics::Data::new(values.as_mut_slice());
					Stats {
						label,
						mean: data.mean().unwrap_or_default(),
						median: data.median(),
						min: data.min(),
						max: data.max(),
						p95: data.percentile(95),
						p99: data.percentile(99),
					}
				})
				.collect::<Vec<_>>()
		});
		stats.sort_by_key(|x| x.label);
		stats
	}
}

pub struct Span {
	manager: Weak<ManagerInner>,
	label: &'static str,
	start: Instant,
}

impl Span {
	pub async fn finish(self) {
		let duration = Instant::now().duration_since(self.start).as_secs_f64();
		if let Some(manager) = self.manager.upgrade() {
			manager.write_span(self.label, duration).await;
		}
	}
}

pub struct Stats {
	pub label: &'static str,
	pub mean: f64,
	pub median: f64,
	pub min: f64,
	pub max: f64,
	pub p95: f64,
	pub p99: f64,
}
