use tauri::{AppHandle, State};
use crate::storage::{self, Db};
use crate::mock_server::models::{MockServerConfig, MockLogEntry, MockStats};
use crate::mock_server::manager::MockServerManager;

#[tauri::command]
pub fn get_mock_configs(db: State<'_, Db>) -> Result<Vec<MockServerConfig>, String> {
    storage::get_all_mock_configs(&db)
}

#[tauri::command]
pub fn create_mock_config(db: State<'_, Db>, config: MockServerConfig) -> Result<(), String> {
    storage::insert_mock_config(&db, &config)
}

#[tauri::command]
pub fn update_mock_config_cmd(
    db: State<'_, Db>,
    manager: State<'_, MockServerManager>,
    config: MockServerConfig,
) -> Result<(), String> {
    // Save to SQLite
    storage::update_mock_config(&db, &config)?;

    // Live update the running instance if active
    let _ = tauri::async_runtime::block_on(async {
        manager.update_server_config(config).await
    });
    
    Ok(())
}

#[tauri::command]
pub fn delete_mock_config_cmd(
    db: State<'_, Db>,
    manager: State<'_, MockServerManager>,
    id: String,
) -> Result<(), String> {
    // If the server is running, stop it first
    let _ = manager.stop_server(&id);
    
    // Delete from SQLite
    storage::delete_mock_config(&db, &id)
}

#[tauri::command]
pub async fn start_mock_server_cmd(
    manager: State<'_, MockServerManager>,
    config: MockServerConfig,
    app: AppHandle,
) -> Result<(), String> {
    manager.start_server(config, app).await
}

#[tauri::command]
pub fn stop_mock_server_cmd(
    manager: State<'_, MockServerManager>,
    id: String,
) -> Result<(), String> {
    manager.stop_server(&id)
}

#[tauri::command]
pub fn get_mock_server_status(
    manager: State<'_, MockServerManager>,
    id: String,
) -> Result<String, String> {
    Ok(manager.get_server_status(&id))
}

#[tauri::command]
pub fn get_mock_server_logs(
    manager: State<'_, MockServerManager>,
    id: String,
) -> Result<Vec<MockLogEntry>, String> {
    manager.get_server_logs(&id)
}

#[tauri::command]
pub fn get_mock_server_stats(
    manager: State<'_, MockServerManager>,
    id: String,
) -> Result<MockStats, String> {
    manager.get_server_stats(&id)
}

#[tauri::command]
pub fn import_openapi_mock(
    db: State<'_, Db>,
    spec: String,
    name: String,
    port: u16,
) -> Result<MockServerConfig, String> {
    let config = crate::mock_server::openapi::openapi_to_mock_config(&spec, &name, port)?;
    storage::insert_mock_config(&db, &config)?;
    Ok(config)
}

#[tauri::command]
pub fn import_collection_mock(
    db: State<'_, Db>,
    collection_id: String,
    name: String,
    port: u16,
) -> Result<MockServerConfig, String> {
    let collections = storage::get_all_collections(&db)?;
    let collection = collections.iter()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| "Collection not found".to_string())?;
        
    let config = crate::mock_server::collection_import::collection_to_mock_config(collection, &name, port);
    storage::insert_mock_config(&db, &config)?;
    
    Ok(config)
}
