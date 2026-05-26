use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

/// A handle to an active WebSocket connection.
pub struct WsConnection {
    pub sender: mpsc::UnboundedSender<String>,
}

/// Shared state: connection_id → WsConnection sender
pub struct WsState(pub Arc<Mutex<HashMap<String, WsConnection>>>);

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct WsMessageEvent {
    pub connection_id: String,
    pub direction: String, // "sent" | "received" | "system"
    pub data: String,
    pub is_binary: bool,
}

/// Resolve variables in a WebSocket URL or message string.
///
/// First resolves dynamic variables (`{{$timestamp}}`, `{{$uuid}}`, etc.),
/// then applies global and environment variable substitution (`{{key}}` patterns).
/// Priority (highest wins): env_vars > global_vars
#[allow(dead_code)]
pub fn resolve_ws_variables(
    input: &str,
    global_vars: &[crate::models::KeyValue],
    env_vars: &HashMap<String, String>,
) -> String {
    // First resolve dynamic variables
    let mut result = crate::variables::resolve_dynamic_vars(input);

    // Build variable map (global → env)
    let map = crate::variables::build_variable_map(global_vars, &[], env_vars, &[]);

    // Substitute {{key}} patterns
    for (key, value) in &map {
        let pattern = format!("{{{{{}}}}}", key);
        result = result.replace(&pattern, value);
    }

    result
}

/// Connect to a WebSocket URL and start listening for messages.
/// Returns a connection ID that can be used to send/disconnect.
#[tauri::command]
pub async fn ws_connect(
    url: String,
    app: AppHandle,
    state: State<'_, WsState>,
) -> Result<String, String> {
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let id = uuid::Uuid::new_v4().to_string();

    // Store the sender before spawning so the frontend can immediately send
    {
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        map.insert(id.clone(), WsConnection { sender: tx });
    }

    let app_clone = app.clone();
    let id_clone = id.clone();
    // Need to access the state inside the spawned task for cleanup
    let state_clone = state.0.clone();

    // Emit connecting status
    let _ = app.emit("ws-status", serde_json::json!({
        "connectionId": &id_clone,
        "status": "connecting"
    }));

    tauri::async_runtime::spawn(async move {
        let result = connect_and_listen(&url, &id_clone, &mut rx, &app_clone).await;

        // Clean up the connection entry from the state map
        if let Ok(mut map) = state_clone.lock() {
            map.remove(&id_clone);
        }

        // Emit disconnected
        let _ = app_clone.emit("ws-status", serde_json::json!({
            "connectionId": &id_clone,
            "status": "disconnected"
        }));

        if let Err(e) = result {
            let _ = app_clone.emit("ws-error", serde_json::json!({
                "connectionId": &id_clone,
                "error": e
            }));
        }
    });

    Ok(id)
}

async fn connect_and_listen(
    url: &str,
    id: &str,
    rx: &mut mpsc::UnboundedReceiver<String>,
    app: &AppHandle,
) -> Result<(), String> {
    // Use connect_async with a URL string directly (supports custom URI via parse)
    let (ws_stream, _response) = tokio_tungstenite::connect_async(url)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    let _ = app.emit("ws-status", serde_json::json!({
        "connectionId": id,
        "status": "connected"
    }));

    let (mut write, mut read) = ws_stream.split();

    loop {
        tokio::select! {
            // Outgoing message from frontend via channel
            Some(msg) = rx.recv() => {
                if write.send(Message::Text(msg.clone())).await.is_err() {
                    break;
                }
                let _ = app.emit("ws-message", WsMessageEvent {
                    connection_id: id.to_string(),
                    direction: "sent".to_string(),
                    data: msg,
                    is_binary: false,
                });
            }
            // Incoming message from server
            Some(Ok(msg)) = read.next() => {
                match msg {
                    Message::Text(text) => {
                        let _ = app.emit("ws-message", WsMessageEvent {
                            connection_id: id.to_string(),
                            direction: "received".to_string(),
                            data: text.to_string(),
                            is_binary: false,
                        });
                    }
                    Message::Binary(data) => {
                        let preview = format!("[binary {} bytes]", data.len());
                        let _ = app.emit("ws-message", WsMessageEvent {
                            connection_id: id.to_string(),
                            direction: "received".to_string(),
                            data: preview,
                            is_binary: true,
                        });
                    }
                    Message::Close(frame) => {
                        let reason = frame
                            .map(|f| format!("Close: {} {}", f.code, f.reason))
                            .unwrap_or_else(|| "Close".to_string());
                        let _ = app.emit("ws-message", WsMessageEvent {
                            connection_id: id.to_string(),
                            direction: "system".to_string(),
                            data: reason,
                            is_binary: false,
                        });
                        break;
                    }
                    Message::Ping(_) | Message::Pong(_) => {}
                    Message::Frame(_) => {}
                }
            }
            else => break,
        }
    }

    Ok(())
}

/// Send a text message on an active WebSocket connection.
#[tauri::command]
pub async fn ws_send(
    connection_id: String,
    message: String,
    state: State<'_, WsState>,
) -> Result<(), String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let conn = map
        .get(&connection_id)
        .ok_or_else(|| "No active WebSocket connection with that ID".to_string())?;
    conn.sender
        .send(message)
        .map_err(|_| "Failed to send message (connection may be closed)".to_string())
}

/// Disconnect an active WebSocket connection.
#[tauri::command]
pub async fn ws_disconnect(
    connection_id: String,
    state: State<'_, WsState>,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    map.remove(&connection_id);
    // Dropping the sender causes the spawned task's rx to poll None,
    // which breaks the select! loop and closes the connection gracefully.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::KeyValue;
    use tokio_tungstenite::accept_async;
    use tokio::net::TcpListener;

    /// Start a local WebSocket echo server on 127.0.0.1:0.
    /// Returns the port and a receiver for captured messages.
    async fn start_ws_echo_server() -> (u16, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let captured = Arc::new(Mutex::new(Vec::new()));
        let captured_clone = captured.clone();

        tokio::spawn(async move {
            if let Ok((stream, _)) = listener.accept().await {
                let ws_stream = accept_async(stream).await.unwrap();
                let (mut write, mut read) = ws_stream.split();

                while let Some(Ok(msg)) = read.next().await {
                    if let Message::Text(text) = &msg {
                        // Capture the incoming message
                        {
                            let mut guard = captured_clone.lock().unwrap();
                            guard.push(text.clone());
                        }
                        // Echo back
                        let _ = write.send(Message::Text(text.clone())).await;
                    } else if msg.is_close() {
                        break;
                    }
                }
            }
        });

        (port, captured)
    }

    /// Connect to a WebSocket server and send a message, returning the echo response.
    async fn ws_connect_and_echo(
        url: &str,
        message: &str,
    ) -> String {
        let (ws_stream, _) = tokio_tungstenite::connect_async(url).await.unwrap();
        let (mut write, mut read) = ws_stream.split();

        // Send the message
        write.send(Message::Text(message.to_string())).await.unwrap();

        // Read the echo response with a timeout
        let timeout = tokio::time::timeout(
            std::time::Duration::from_secs(3),
            read.next(),
        )
        .await
        .expect("Timeout waiting for echo response")
        .expect("Stream ended")
        .expect("Error reading message");

        match timeout {
            Message::Text(text) => text,
            _ => panic!("Expected text message"),
        }
    }

    // ─── resolve_ws_variables unit tests ─────────────────────────────────────

    #[test]
    fn test_resolve_ws_variables_basic() {
        let input = "wss://{{host}}/socket?token={{token}}";
        let global = vec![
            KeyValue { key: "host".into(), value: "echo.example.com".into(), enabled: true, is_secret: false },
        ];
        let mut env = HashMap::new();
        env.insert("token".into(), "abc123".into());

        let result = resolve_ws_variables(input, &global, &env);
        assert_eq!(result, "wss://echo.example.com/socket?token=abc123");
    }

    #[test]
    fn test_resolve_ws_variables_dynamic() {
        let input = "ws://localhost:8080/chat?uuid={{$uuid}}";
        let result = resolve_ws_variables(input, &[], &HashMap::new());
        // UUID should be 36 chars
        assert!(result.starts_with("ws://localhost:8080/chat?uuid="));
        let uuid_part = &result["ws://localhost:8080/chat?uuid=".len()..];
        assert_eq!(uuid_part.len(), 36);
    }

    #[test]
    fn test_resolve_ws_variables_env_overrides_global() {
        let input = "wss://{{host}}/{{mode}}";
        let global = vec![
            KeyValue { key: "host".into(), value: "global.example.com".into(), enabled: true, is_secret: false },
            KeyValue { key: "mode".into(), value: "global_mode".into(), enabled: true, is_secret: false },
        ];
        let mut env = HashMap::new();
        env.insert("mode".into(), "env_mode".into());

        let result = resolve_ws_variables(input, &global, &env);
        // mode should be "env_mode" (env overrides global)
        assert_eq!(result, "wss://global.example.com/env_mode");
    }

    #[test]
    fn test_resolve_ws_variables_missing_var_stays() {
        let input = "wss://{{host}}/{{missing_key}}";
        let global = vec![
            KeyValue { key: "host".into(), value: "example.com".into(), enabled: true, is_secret: false },
        ];

        let result = resolve_ws_variables(input, &global, &HashMap::new());
        // host should be resolved, missing_key should stay raw
        assert!(result.contains("example.com"));
        assert!(result.contains("{{missing_key}}"));
    }

    #[test]
    fn test_resolve_ws_variables_empty_input() {
        let result = resolve_ws_variables("", &[], &HashMap::new());
        assert_eq!(result, "");
    }

    #[test]
    fn test_resolve_ws_variables_no_vars() {
        let input = "wss://example.com/socket";
        let result = resolve_ws_variables(input, &[], &HashMap::new());
        assert_eq!(result, "wss://example.com/socket");
    }

    #[test]
    fn test_resolve_ws_variables_disabled_global_skipped() {
        let input = "wss://{{host}}/key={{key}}";
        let global = vec![
            KeyValue { key: "host".into(), value: "example.com".into(), enabled: true, is_secret: false },
            KeyValue { key: "key".into(), value: "should_not_appear".into(), enabled: false, is_secret: false },
        ];

        let result = resolve_ws_variables(input, &global, &HashMap::new());
        // host is resolved, but disabled key stays raw
        assert!(result.contains("example.com"));
        assert!(result.contains("{{key}}"));
    }

    #[test]
    fn test_resolve_ws_variables_mixed_dynamic_and_static() {
        let input = "wss://{{host}}/log?ts={{$timestamp}}";
        let global = vec![
            KeyValue { key: "host".into(), value: "logger.example.com".into(), enabled: true, is_secret: false },
        ];

        let result = resolve_ws_variables(input, &global, &HashMap::new());
        // host resolved, timestamp is numeric
        assert!(result.starts_with("wss://logger.example.com/log?ts="));
        let ts_part = &result["wss://logger.example.com/log?ts=".len()..];
        let ts_val: i64 = ts_part.parse().unwrap();
        assert!(ts_val > 1_700_000_000_000);
    }

    // ─── Integration tests with real WebSocket echo server ───────────────────

    #[tokio::test]
    async fn test_ws_integration_variable_url_resolved() {
        // Start a local WebSocket echo server
        let (port, _captured) = start_ws_echo_server().await;

        // URL with {{port}} variable — resolve it before connecting
        let global = vec![];
        let mut env = HashMap::new();
        env.insert("port".into(), port.to_string());

        let resolved_url = resolve_ws_variables("ws://127.0.0.1:{{port}}", &global, &env);
        assert_eq!(resolved_url, format!("ws://127.0.0.1:{}", port));

        // Actually connect using the resolved URL and send a test message
        let echo = ws_connect_and_echo(&resolved_url, "hello").await;
        assert_eq!(echo, "hello");
    }

    #[tokio::test]
    async fn test_ws_integration_variable_message_resolved() {
        let (port, captured) = start_ws_echo_server().await;
        let url = format!("ws://127.0.0.1:{}", port);

        // Resolve a message with variables before sending
        let global = vec![
            KeyValue { key: "user".into(), value: "alice".into(), enabled: true, is_secret: false },
        ];
        let mut env = HashMap::new();
        env.insert("channel".into(), "general".into());

        let resolved_msg = resolve_ws_variables(
            "Hello {{user}}, welcome to #{{channel}}",
            &global,
            &env,
        );
        assert_eq!(resolved_msg, "Hello alice, welcome to #general");

        // Send the resolved message and verify echo
        let echo = ws_connect_and_echo(&url, &resolved_msg).await;
        assert_eq!(echo, "Hello alice, welcome to #general");

        // Verify the server received the resolved message
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let msgs = captured.lock().unwrap();
        assert!(msgs.iter().any(|m| m == "Hello alice, welcome to #general"));
    }

    #[tokio::test]
    async fn test_ws_integration_dynamic_vars_in_message() {
        let (port, captured) = start_ws_echo_server().await;
        let url = format!("ws://127.0.0.1:{}", port);

        // Resolve a message with dynamic variables
        let resolved_msg = resolve_ws_variables(
            "id={{$uuid}}&ts={{$timestamp}}",
            &[],
            &HashMap::new(),
        );

        // Verify the structure
        assert!(resolved_msg.starts_with("id="), "Should start with id=");
        assert!(resolved_msg.contains("&ts="), "Should contain &ts=");

        // Parse the parts
        let parts: Vec<&str> = resolved_msg.split("&ts=").collect();
        assert_eq!(parts.len(), 2, "Should have two parts after split");

        let uuid_part = parts[0].strip_prefix("id=").unwrap();
        assert_eq!(uuid_part.len(), 36, "UUID should be 36 chars");

        let ts_val: i64 = parts[1].parse().unwrap();
        assert!(ts_val > 1_700_000_000_000, "Timestamp should be plausible for 2026");

        // Send and verify echo
        let echo = ws_connect_and_echo(&url, &resolved_msg).await;
        assert_eq!(echo, resolved_msg);

        // Verify the server received the resolved message
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let msgs = captured.lock().unwrap();
        assert!(msgs.iter().any(|m| m == &resolved_msg));
    }

    #[tokio::test]
    async fn test_ws_integration_missing_var_passthrough() {
        let (port, captured) = start_ws_echo_server().await;
        let url = format!("ws://127.0.0.1:{}", port);

        // Resolve with empty variables — {{missing}} stays as-is
        let resolved_msg = resolve_ws_variables(
            "Hello {{missing}}",
            &[],
            &HashMap::new(),
        );
        assert_eq!(resolved_msg, "Hello {{missing}}");

        // Send and verify echo contains raw placeholder
        let echo = ws_connect_and_echo(&url, &resolved_msg).await;
        assert_eq!(echo, "Hello {{missing}}");

        // Verify the server received the raw placeholder
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let msgs = captured.lock().unwrap();
        assert!(msgs.iter().any(|m| m == "Hello {{missing}}"));
    }

    #[tokio::test]
    async fn test_ws_integration_scope_priority() {
        let (port, captured) = start_ws_echo_server().await;
        let url = format!("ws://127.0.0.1:{}", port);

        // Same variable in global and env — env should win
        let global = vec![
            KeyValue { key: "shared".into(), value: "global_val".into(), enabled: true, is_secret: false },
        ];
        let mut env = HashMap::new();
        env.insert("shared".into(), "env_val".into());

        let resolved_msg = resolve_ws_variables("value={{shared}}", &global, &env);
        assert_eq!(resolved_msg, "value=env_val", "env should override global");

        // Send and verify echo
        let echo = ws_connect_and_echo(&url, &resolved_msg).await;
        assert_eq!(echo, "value=env_val");

        // Verify server received the env-priority value
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let msgs = captured.lock().unwrap();
        assert!(msgs.iter().any(|m| m == "value=env_val"));
    }

    #[tokio::test]
    async fn test_ws_integration_disabled_global_skipped() {
        let (port, captured) = start_ws_echo_server().await;
        let url = format!("ws://127.0.0.1:{}", port);

        // Disabled global var should not resolve
        let global = vec![
            KeyValue { key: "key".into(), value: "should_not_appear".into(), enabled: false, is_secret: false },
        ];

        let resolved_msg = resolve_ws_variables("secret={{key}}", &global, &HashMap::new());
        assert_eq!(resolved_msg, "secret={{key}}", "disabled var should stay unresolved");

        // Send and verify echo
        let echo = ws_connect_and_echo(&url, &resolved_msg).await;
        assert_eq!(echo, "secret={{key}}");

        // Verify server received the unresolved value
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let msgs = captured.lock().unwrap();
        assert!(msgs.iter().any(|m| m == "secret={{key}}"));
    }
}
