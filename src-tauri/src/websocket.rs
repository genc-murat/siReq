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
