use crate::mock_server::models::LatencyProfile;
use rand::Rng;
use rand_distr::{Distribution, Normal};
use std::time::Duration;
use tokio::time::sleep as tokio_sleep;

pub async fn simulate_latency(profile: &Option<LatencyProfile>) {
    let profile = match profile {
        Some(p) => p,
        None => return,
    };

    let ms = match profile.mode.as_str() {
        "fixed" => profile.fixed_ms.unwrap_or(0),
        "random_range" => {
            let min = profile.min_ms.unwrap_or(0);
            let max = profile.max_ms.unwrap_or(min);
            if min >= max {
                min
            } else {
                rand::thread_rng().gen_range(min..=max)
            }
        }
        "normal_distribution" => {
            let mean = profile.mean_ms.unwrap_or(0.0);
            let std_dev = profile.std_dev_ms.unwrap_or(0.0);
            if std_dev <= 0.0 {
                mean.max(0.0) as u64
            } else {
                match Normal::new(mean, std_dev) {
                    Ok(normal) => {
                        let sample = normal.sample(&mut rand::thread_rng());
                        sample.max(0.0) as u64
                    }
                    Err(_) => mean.max(0.0) as u64,
                }
            }
        }
        _ => 0,
    };

    // Enforce 30 seconds max limit
    let clamped_ms = ms.min(30_000);

    if clamped_ms > 0 {
        tokio_sleep(Duration::from_millis(clamped_ms)).await;
    }
}
