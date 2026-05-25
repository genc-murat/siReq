mod commands;
mod curl_parser;
mod http;
mod models;
mod storage;

use reqwest::Client;
use storage::Db;
use http::RequestHandles;
use std::sync::Mutex;
use std::collections::HashMap;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
            let db_path = format!("{}/sireq.db", app_dir.to_string_lossy());
            let conn = rusqlite::Connection::open(&db_path).expect("Failed to open database");
            storage::init_db(&conn).expect("Failed to initialize database");

            app.manage(Db(Mutex::new(conn)));
            app.manage(Client::new());
            app.manage(RequestHandles(Mutex::new(HashMap::new())));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::send_request,
            commands::cancel_request,
            commands::get_history,
            commands::delete_history,
            commands::clear_history,
            commands::get_collections,
            commands::create_collection,
            commands::update_collection,
            commands::delete_collection,
            commands::get_environments,
            commands::create_environment,
            commands::update_environment,
            commands::delete_environment,
            commands::import_curl,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
