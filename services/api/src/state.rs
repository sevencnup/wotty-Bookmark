use sqlx::PgPool;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub data_dir: PathBuf,
    pub version: Arc<str>,
    pub auth_rate_limiter: Arc<AuthRateLimiter>,
}

#[derive(Default)]
pub struct AuthRateLimiter {
    entries: Mutex<HashMap<String, RateLimitEntry>>,
}

struct RateLimitEntry {
    started_at: Instant,
    attempts: u32,
}

const MAX_RATE_LIMIT_ENTRIES: usize = 10_000;

impl AuthRateLimiter {
    pub fn try_acquire(
        &self,
        key: &str,
        max_attempts: u32,
        window: Duration,
    ) -> Result<(), Duration> {
        let now = Instant::now();
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        entries.retain(|_, entry| now.duration_since(entry.started_at) < window);

        if !entries.contains_key(key) && entries.len() >= MAX_RATE_LIMIT_ENTRIES {
            if let Some(oldest_key) = entries
                .iter()
                .min_by_key(|(_, entry)| entry.started_at)
                .map(|(key, _)| key.clone())
            {
                entries.remove(&oldest_key);
            }
        }

        let entry = entries.entry(key.to_owned()).or_insert(RateLimitEntry {
            started_at: now,
            attempts: 0,
        });
        if entry.attempts >= max_attempts.max(1) {
            return Err(window
                .saturating_sub(now.duration_since(entry.started_at))
                .max(Duration::from_secs(1)));
        }
        entry.attempts += 1;
        Ok(())
    }

    pub fn reset(&self, key: &str) {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        entries.remove(key);
    }
}

#[cfg(test)]
mod tests {
    use super::AuthRateLimiter;
    use std::time::Duration;

    #[test]
    fn rate_limiter_blocks_after_limit_and_resets_successfully() {
        let limiter = AuthRateLimiter::default();
        let window = Duration::from_secs(60);
        assert!(limiter.try_acquire("login:alice", 2, window).is_ok());
        assert!(limiter.try_acquire("login:alice", 2, window).is_ok());
        assert!(limiter.try_acquire("login:alice", 2, window).is_err());
        limiter.reset("login:alice");
        assert!(limiter.try_acquire("login:alice", 2, window).is_ok());
    }

    #[test]
    fn rate_limiter_keeps_keys_isolated() {
        let limiter = AuthRateLimiter::default();
        let window = Duration::from_secs(60);
        assert!(limiter.try_acquire("login:alice", 1, window).is_ok());
        assert!(limiter.try_acquire("login:bob", 1, window).is_ok());
    }
}
