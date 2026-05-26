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
