use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use tokio::sync::{oneshot, RwLock};
use tauri::{AppHandle, Emitter};

use crate::mock_server::models::{MockServerConfig, MockLogEntry, MockStats, MockServerStatus};
use crate::mock_server::router;

pub struct ServerHandle {
    pub shutdown_tx: oneshot::Sender<()>,
    pub config: Arc<RwLock<MockServerConfig>>,
    pub log: Arc<Mutex<VecDeque<MockLogEntry>>>,
    pub stats: Arc<Mutex<MockStats>>,
    pub port: u16,
    pub name: String,
}

pub struct MockServerManager {
    pub servers: Arc<Mutex<HashMap<String, ServerHandle>>>,
}

impl Default for MockServerManager {
    fn default() -> Self {
        Self::new()
    }
}

impl MockServerManager {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start_server(
        &self,
        config: MockServerConfig,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        let config_id = config.id.clone();
        let config_name = config.name.clone();
        let port = config.port;

        // Perform synchronous checks under the lock, then drop the lock early
        {
            let servers = self.servers.lock().unwrap();

            // Enforce the 5 concurrent servers limit
            if servers.len() >= 5 {
                return Err("Maximum limit of 5 concurrent mock servers reached. Please stop another server first.".to_string());
            }

            // Check if port is already in use by one of our managed servers
            for (id, handle) in servers.iter() {
                if handle.port == port {
                    return Err(format!(
                        "Port {} is already in use by mock server '{}' (ID: {}).",
                        port, handle.name, id
                    ));
                }
            }
        } // MutexGuard is dropped here!

        // Create shared thread-safe variables
        let config_arc = Arc::new(RwLock::new(config));
        let log_arc = Arc::new(Mutex::new(VecDeque::new()));
        let stats_arc = Arc::new(Mutex::new(MockStats::default()));

        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        // Bind the TcpListener immediately to catch port in-use errors synchronously
        let listener = match tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await {
            Ok(l) => l,
            Err(e) => {
                return Err(format!("Failed to bind to port {}: {}. It might be used by another system process.", port, e));
            }
        };

        // Build catch-all dynamic router
        let router = router::build_router(
            config_arc.clone(),
            log_arc.clone(),
            stats_arc.clone(),
            app_handle.clone(),
        );

        let app_handle_clone = app_handle.clone();
        let config_id_clone = config_id.clone();
        let config_name_clone = config_name.clone();

        // Spawn axum server to run on the background tokio event loop
        tokio::spawn(async move {
            let server_result = axum::serve(listener, router)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;

            if let Err(e) = server_result {
                let _ = app_handle_clone.emit("mock-status", MockServerStatus {
                    id: config_id_clone.clone(),
                    name: config_name_clone.clone(),
                    port,
                    status: "error".to_string(),
                    error_message: Some(e.to_string()),
                });
            } else {
                let _ = app_handle_clone.emit("mock-status", MockServerStatus {
                    id: config_id_clone.clone(),
                    name: config_name_clone.clone(),
                    port,
                    status: "stopped".to_string(),
                    error_message: None,
                });
            }
        });

        // Insert new running server handle under a fresh lock
        {
            let mut servers = self.servers.lock().unwrap();
            servers.insert(config_id.clone(), ServerHandle {
                shutdown_tx,
                config: config_arc,
                log: log_arc,
                stats: stats_arc,
                port,
                name: config_name.clone(),
            });
        }

        // Notify front-end of successful start
        let _ = app_handle.emit("mock-status", MockServerStatus {
            id: config_id,
            name: config_name,
            port,
            status: "running".to_string(),
            error_message: None,
        });

        Ok(())
    }

    pub fn stop_server(&self, id: &str) -> Result<(), String> {
        let mut servers = self.servers.lock().unwrap();
        if let Some(handle) = servers.remove(id) {
            let _ = handle.shutdown_tx.send(());
            Ok(())
        } else {
            Err("Mock server is not running.".to_string())
        }
    }

    pub fn stop_all(&self) {
        let mut servers = self.servers.lock().unwrap();
        for (_, handle) in servers.drain() {
            let _ = handle.shutdown_tx.send(());
        }
    }

    pub fn get_server_status(&self, id: &str) -> String {
        let servers = self.servers.lock().unwrap();
        if servers.contains_key(id) {
            "running".to_string()
        } else {
            "stopped".to_string()
        }
    }

    pub async fn update_server_config(&self, new_config: MockServerConfig) -> Result<(), String> {
        let config_arc_opt = {
            let servers = self.servers.lock().unwrap();
            if let Some(handle) = servers.get(&new_config.id) {
                if handle.port != new_config.port {
                    return Err("Cannot change port of a running mock server. Please stop the server first.".to_string());
                }
                Some(handle.config.clone())
            } else {
                None
            }
        };

        if let Some(config_arc) = config_arc_opt {
            let mut config_write = config_arc.write().await;
            *config_write = new_config;
        }
        Ok(())
    }

    pub fn get_server_logs(&self, id: &str) -> Result<Vec<MockLogEntry>, String> {
        let servers = self.servers.lock().unwrap();
        if let Some(handle) = servers.get(id) {
            let logs = handle.log.lock().unwrap();
            Ok(logs.iter().cloned().collect())
        } else {
            Err("Mock server is not running.".to_string())
        }
    }

    pub fn get_server_stats(&self, id: &str) -> Result<MockStats, String> {
        let servers = self.servers.lock().unwrap();
        if let Some(handle) = servers.get(id) {
            let stats = handle.stats.lock().unwrap();
            Ok(stats.clone())
        } else {
            Err("Mock server is not running.".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mock_server::models::CorsConfig;
    use std::collections::HashMap;

    fn dummy_config(id: &str, name: &str, port: u16) -> MockServerConfig {
        MockServerConfig {
            id: id.to_string(),
            name: name.to_string(),
            port,
            endpoints: vec![],
            cors_enabled: false,
            cors_config: CorsConfig::default(),
            headers: HashMap::new(),
        }
    }

    fn dummy_handle(port: u16, name: &str) -> ServerHandle {
        let (tx, _rx) = oneshot::channel();
        ServerHandle {
            shutdown_tx: tx,
            config: Arc::new(RwLock::new(dummy_config("dummy", name, port))),
            log: Arc::new(Mutex::new(VecDeque::new())),
            stats: Arc::new(Mutex::new(MockStats::default())),
            port,
            name: name.to_string(),
        }
    }

    fn insert_server(manager: &MockServerManager, id: &str, port: u16, name: &str) {
        manager
            .servers
            .lock()
            .unwrap()
            .insert(id.to_string(), dummy_handle(port, name));
    }

    // ─── new / Default ───────────────────────────────────────────

    #[test]
    fn test_new_creates_empty_manager() {
        let manager = MockServerManager::new();
        assert!(manager.servers.lock().unwrap().is_empty());
    }

    #[test]
    fn test_default_creates_empty_manager() {
        let manager = MockServerManager::default();
        assert!(manager.servers.lock().unwrap().is_empty());
    }

    // ─── stop_server ─────────────────────────────────────────────

    #[test]
    fn test_stop_server_nonexistent_returns_error() {
        let manager = MockServerManager::new();
        let result = manager.stop_server("nonexistent");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Mock server is not running.");
    }

    #[test]
    fn test_stop_server_running_server_removes_and_returns_ok() {
        let manager = MockServerManager::new();
        insert_server(&manager, "srv-1", 3000, "Test Server");
        assert_eq!(manager.servers.lock().unwrap().len(), 1);

        let result = manager.stop_server("srv-1");
        assert!(result.is_ok());
        assert!(manager.servers.lock().unwrap().is_empty());
    }

    #[test]
    fn test_stop_server_does_not_affect_other_servers() {
        let manager = MockServerManager::new();
        insert_server(&manager, "srv-1", 3000, "First");
        insert_server(&manager, "srv-2", 3001, "Second");

        let _ = manager.stop_server("srv-1");
        let remaining = manager.servers.lock().unwrap();
        assert_eq!(remaining.len(), 1);
        assert!(remaining.contains_key("srv-2"));
        assert!(!remaining.contains_key("srv-1"));
    }

    // ─── stop_all ────────────────────────────────────────────────

    #[test]
    fn test_stop_all_empty_does_not_panic() {
        let manager = MockServerManager::new();
        manager.stop_all(); // should not panic
    }

    #[test]
    fn test_stop_all_removes_all_servers() {
        let manager = MockServerManager::new();
        insert_server(&manager, "srv-1", 3000, "A");
        insert_server(&manager, "srv-2", 3001, "B");
        insert_server(&manager, "srv-3", 3002, "C");

        manager.stop_all();
        assert!(manager.servers.lock().unwrap().is_empty());
    }

    // ─── get_server_status ───────────────────────────────────────

    #[test]
    fn test_get_server_status_stopped_for_nonexistent() {
        let manager = MockServerManager::new();
        assert_eq!(manager.get_server_status("ghost"), "stopped");
    }

    #[test]
    fn test_get_server_status_running_for_existing() {
        let manager = MockServerManager::new();
        insert_server(&manager, "srv-1", 3000, "Test");
        assert_eq!(manager.get_server_status("srv-1"), "running");
    }

    #[test]
    fn test_get_server_status_transitions_to_stopped_after_stop() {
        let manager = MockServerManager::new();
        insert_server(&manager, "srv-1", 3000, "Test");
        assert_eq!(manager.get_server_status("srv-1"), "running");
        let _ = manager.stop_server("srv-1");
        assert_eq!(manager.get_server_status("srv-1"), "stopped");
    }

    // ─── update_server_config ────────────────────────────────────

    #[tokio::test]
    async fn test_update_server_config_nonexistent_is_noop() {
        let manager = MockServerManager::new();
        let config = dummy_config("ghost", "Ghost", 3000);
        let result = manager.update_server_config(config).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_update_server_config_rejects_port_change() {
        let manager = MockServerManager::new();
        insert_server(&manager, "srv-1", 3000, "Test");

        let new_config = dummy_config("srv-1", "Test", 4000); // different port
        let result = manager.update_server_config(new_config).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Cannot change port"));
    }

    #[tokio::test]
    async fn test_update_server_config_updates_config() {
        let manager = MockServerManager::new();
        insert_server(&manager, "srv-1", 3000, "Original");

        let mut updated = dummy_config("srv-1", "Updated", 3000); // same port
        updated.name = "Updated Name".to_string();
        updated.cors_enabled = true;

        let result = manager.update_server_config(updated).await;
        assert!(result.is_ok());

        // Verify the config was actually updated — use .read().await within tokio runtime
        let config_arc = {
            let servers = manager.servers.lock().unwrap();
            servers.get("srv-1").unwrap().config.clone()
        };
        let cfg = config_arc.read().await;
        assert_eq!(cfg.name, "Updated Name");
        assert!(cfg.cors_enabled);
    }

    // ─── get_server_logs ─────────────────────────────────────────

    #[test]
    fn test_get_server_logs_nonexistent_returns_error() {
        let manager = MockServerManager::new();
        let result = manager.get_server_logs("ghost");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Mock server is not running.");
    }

    #[test]
    fn test_get_server_logs_running_returns_empty_logs() {
        let manager = MockServerManager::new();
        insert_server(&manager, "srv-1", 3000, "Test");
        let logs = manager.get_server_logs("srv-1").unwrap();
        assert!(logs.is_empty());
    }

    #[test]
    fn test_get_server_logs_returns_stored_entries() {
        let manager = MockServerManager::new();
        insert_server(&manager, "srv-1", 3000, "Test");

        // Manually push a log entry
        let entry = MockLogEntry {
            id: "log-1".into(),
            timestamp: "2024-01-01T00:00:00Z".into(),
            method: "GET".into(),
            path: "/test".into(),
            request_headers: HashMap::new(),
            request_body: String::new(),
            response_status: 200,
            response_headers: HashMap::new(),
            response_body: "ok".into(),
            latency_ms: 10,
            matched_scenario: None,
            warnings: vec![],
        };
        {
            let handle = manager.servers.lock().unwrap();
            let h = handle.get("srv-1").unwrap();
            h.log.lock().unwrap().push_back(entry.clone());
        }

        let logs = manager.get_server_logs("srv-1").unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].id, "log-1");
        assert_eq!(logs[0].method, "GET");
        assert_eq!(logs[0].path, "/test");
        assert_eq!(logs[0].response_status, 200);
    }

    // ─── get_server_stats ────────────────────────────────────────

    #[test]
    fn test_get_server_stats_nonexistent_returns_error() {
        let manager = MockServerManager::new();
        let result = manager.get_server_stats("ghost");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Mock server is not running.");
    }

    #[test]
    fn test_get_server_stats_running_returns_default_stats() {
        let manager = MockServerManager::new();
        insert_server(&manager, "srv-1", 3000, "Test");
        let stats = manager.get_server_stats("srv-1").unwrap();
        assert_eq!(stats.request_count, 0);
        assert_eq!(stats.error_count, 0);
        assert_eq!(stats.average_latency_ms, 0.0);
    }

    #[test]
    fn test_get_server_stats_returns_updated_stats() {
        let manager = MockServerManager::new();
        insert_server(&manager, "srv-1", 3000, "Test");

        // Manually update stats
        {
            let handle = manager.servers.lock().unwrap();
            let h = handle.get("srv-1").unwrap();
            let mut stats = h.stats.lock().unwrap();
            stats.request_count = 10;
            stats.error_count = 2;
            stats.average_latency_ms = 42.5;
        }

        let stats = manager.get_server_stats("srv-1").unwrap();
        assert_eq!(stats.request_count, 10);
        assert_eq!(stats.error_count, 2);
        assert_eq!(stats.average_latency_ms, 42.5);
    }

    // ─── verify get_* functions return distinct clones ───────────

    #[test]
    fn test_get_server_logs_isolation_between_calls() {
        let manager = MockServerManager::new();
        insert_server(&manager, "srv-1", 3000, "Test");

        let logs1 = manager.get_server_logs("srv-1").unwrap();
        assert!(logs1.is_empty());

        // Push a log entry
        {
            let handle = manager.servers.lock().unwrap();
            let h = handle.get("srv-1").unwrap();
            h.log.lock().unwrap().push_back(MockLogEntry {
                id: "log-1".into(),
                timestamp: String::new(),
                method: "POST".into(),
                path: "/create".into(),
                request_headers: HashMap::new(),
                request_body: String::new(),
                response_status: 201,
                response_headers: HashMap::new(),
                response_body: String::new(),
                latency_ms: 0,
                matched_scenario: None,
                warnings: vec![],
            });
        }

        let logs2 = manager.get_server_logs("srv-1").unwrap();
        assert_eq!(logs2.len(), 1);
        assert_eq!(logs2[0].id, "log-1");
    }
}
