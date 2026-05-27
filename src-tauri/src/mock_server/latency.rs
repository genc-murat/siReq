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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mock_server::models::LatencyProfile;

    #[tokio::test]
    async fn test_latency_none_returns_immediately() {
        simulate_latency(&None).await;
    }

    #[tokio::test]
    async fn test_latency_fixed() {
        let profile = Some(LatencyProfile {
            mode: "fixed".into(),
            fixed_ms: Some(5),
            min_ms: None,
            max_ms: None,
            mean_ms: None,
            std_dev_ms: None,
        });
        let start = std::time::Instant::now();
        simulate_latency(&profile).await;
        let elapsed = start.elapsed().as_millis();
        assert!(elapsed >= 3, "fixed 5ms should take at least 3ms, got {}", elapsed);
    }

    #[tokio::test]
    async fn test_latency_fixed_zero() {
        let profile = Some(LatencyProfile {
            mode: "fixed".into(),
            fixed_ms: Some(0),
            min_ms: None,
            max_ms: None,
            mean_ms: None,
            std_dev_ms: None,
        });
        simulate_latency(&profile).await; // should not hang
    }

    #[tokio::test]
    async fn test_latency_random_range() {
        let profile = Some(LatencyProfile {
            mode: "random_range".into(),
            fixed_ms: None,
            min_ms: Some(3),
            max_ms: Some(10),
            mean_ms: None,
            std_dev_ms: None,
        });
        let start = std::time::Instant::now();
        simulate_latency(&profile).await;
        let elapsed = start.elapsed().as_millis();
        assert!(elapsed >= 1, "random range 3-10 should sleep");
    }

    #[tokio::test]
    async fn test_latency_random_range_min_equals_max() {
        let profile = Some(LatencyProfile {
            mode: "random_range".into(),
            fixed_ms: None,
            min_ms: Some(5),
            max_ms: Some(5),
            mean_ms: None,
            std_dev_ms: None,
        });
        simulate_latency(&profile).await;
    }

    #[tokio::test]
    async fn test_latency_random_range_min_greater_than_max() {
        // When min > max, the code should use min
        let profile = Some(LatencyProfile {
            mode: "random_range".into(),
            fixed_ms: None,
            min_ms: Some(100),
            max_ms: Some(0),
            mean_ms: None,
            std_dev_ms: None,
        });
        simulate_latency(&profile).await;
    }

    #[tokio::test]
    async fn test_latency_normal_distribution() {
        let profile = Some(LatencyProfile {
            mode: "normal_distribution".into(),
            fixed_ms: None,
            min_ms: None,
            max_ms: None,
            mean_ms: Some(5.0),
            std_dev_ms: Some(2.0),
        });
        simulate_latency(&profile).await;
    }

    #[tokio::test]
    async fn test_latency_unknown_mode_uses_zero() {
        let profile = Some(LatencyProfile {
            mode: "unknown".into(),
            fixed_ms: None,
            min_ms: None,
            max_ms: None,
            mean_ms: None,
            std_dev_ms: None,
        });
        simulate_latency(&profile).await;
    }

    #[tokio::test]
    async fn test_latency_clamps_at_30_seconds() {
        let profile = Some(LatencyProfile {
            mode: "fixed".into(),
            fixed_ms: Some(999_999), // well over 30s
            min_ms: None,
            max_ms: None,
            mean_ms: None,
            std_dev_ms: None,
        });
        let start = std::time::Instant::now();
        simulate_latency(&profile).await;
        let elapsed = start.elapsed().as_millis();
        assert!(elapsed < 31_000, "should clamp to 30s max, got {}ms", elapsed);
    }
}
