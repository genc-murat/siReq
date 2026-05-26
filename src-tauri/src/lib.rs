mod api_intelligence;
mod commands;
mod curl_parser;
mod grpc;
mod http;
mod models;
mod openapi_parser;
mod postman_parser;
mod scripts;
mod secrets;
mod storage;
mod variables;
mod websocket;

use reqwest::Client;
use storage::Db;
use grpc::GrpcState;

use websocket::WsState;
use std::sync::{Arc, Mutex};
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
            app.manage(GrpcState(Arc::new(Mutex::new(HashMap::new()))));
            app.manage(WsState(Arc::new(Mutex::new(HashMap::new()))));
            app.manage(http::RequestHandles(Mutex::new(HashMap::new())));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::send_request,
            commands::cancel_request,
            commands::benchmark_request,
            commands::get_benchmark_history,
            commands::delete_benchmark_history,
            commands::clear_benchmark_history,
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
            commands::import_openapi,
            commands::import_postman_collection,
            commands::export_postman_collection,
            commands::get_global_variables_cmd,
            commands::save_global_variables_cmd,
            commands::encrypt_secret_value,
            commands::decrypt_secret_value,
            commands::export_postman_collection,
            commands::run_collection,
            commands::run_collection_data_driven,
            commands::get_run_history,
            commands::delete_run_history,
            commands::clear_run_history,
            commands::create_collection_folder,
            commands::add_request_to_collection,
            commands::delete_collection_item,
            commands::move_collection_item,
            commands::get_templates,
            commands::create_template,
            commands::delete_template,
            commands::get_cookies,
            commands::delete_cookie,
            commands::clear_cookies,
            commands::grpc_parse_proto,
            commands::grpc_call_unary,
            commands::grpc_call_server_streaming,
            commands::grpc_call_client_streaming,
            commands::grpc_call_bidi_streaming,
            commands::get_grpc_history,
            commands::delete_grpc_history,
            commands::clear_grpc_history,
            commands::grpc_reflect_list_services,
            commands::grpc_reflect_get_proto,
            api_intelligence::analyze_api_behavior_cmd,
            api_intelligence::get_api_intelligence_overview,
            api_intelligence::get_all_endpoint_insights,
            api_intelligence::get_endpoint_detail_cmd,
            api_intelligence::get_performance_timeline_cmd,
            api_intelligence::get_schema_evolution_cmd,
            api_intelligence::get_performance_regressions,
            websocket::ws_connect,
            websocket::ws_send,
            websocket::ws_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
