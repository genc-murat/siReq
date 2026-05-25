use std::collections::HashMap;
use tauri::State;
use crate::models::*;
use crate::storage::*;
use crate::http::*;
use reqwest::Client;

#[tauri::command]
pub async fn send_request(
    request: HttpRequest,
    _timeout: u64,
    environment_id: Option<String>,
    client: State<'_, Client>,
    handles: State<'_, RequestHandles>,
    db: State<'_, Db>,
) -> Result<HttpResponse, String> {
    let env_vars: HashMap<String, String> = match environment_id {
        Some(ref env_id) => {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let env = get_environment_by_id(&conn, env_id)?;
            drop(conn);
            env.map(|e| e.variables.into_iter()
                .filter(|v| v.enabled && !v.key.is_empty())
                .map(|v| (v.key, v.value))
                .collect()
            ).unwrap_or_default()
        }
        None => HashMap::new()
    };

    let resolved = apply_env(&request, &env_vars);
    let owned_client = (*client).clone();

    // Load stored cookies for the request domain
    let stored_cookies: Vec<StoredCookie> = if let Some(domain) = extract_domain(&resolved.url) {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let cookies = load_cookies_for_domain_conn(&conn, &domain)?;
        drop(conn);
        cookies
    } else {
        vec![]
    };

    let request_id = request.id.clone();
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(HttpResponse, Vec<StoredCookie>), String>>();

    let handle = tokio::spawn(async move {
        let result = execute_request(&owned_client, &resolved, &stored_cookies).await;
        let _ = tx.send(result);
    });

    {
        let mut map = handles.0.lock().map_err(|e| e.to_string())?;
        map.insert(request_id, handle);
    }

    let (response, new_cookies) = rx.await.map_err(|_| "Request cancelled".to_string())??;

    // Save new cookies from Set-Cookie headers
    if !new_cookies.is_empty() {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        for cookie in &new_cookies {
            let _ = save_cookie_to_db(&conn, cookie);
        }
    }

    let entry = HistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        request,
        response: response.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = save_history_with_conn(&db, &entry);
    Ok(response)
}

#[tauri::command]
pub async fn cancel_request(
    request_id: String,
    handles: State<'_, RequestHandles>,
) -> Result<(), String> {
    crate::http::cancel_request(&handles, &request_id)
}

#[tauri::command]
pub fn get_history(
    limit: i64,
    offset: i64,
    db: State<'_, Db>,
) -> Result<Vec<HistoryEntry>, String> {
    get_history_list(&db, limit, offset)
}

#[tauri::command]
pub fn delete_history(
    id: String,
    db: State<'_, Db>,
) -> Result<(), String> {
    delete_history_entry(&db, &id)
}

#[tauri::command]
pub fn clear_history(db: State<'_, Db>) -> Result<(), String> {
    clear_all_history(&db)
}

#[tauri::command]
pub fn get_collections(db: State<'_, Db>) -> Result<Vec<Collection>, String> {
    get_all_collections(&db)
}

#[tauri::command]
pub fn create_collection(
    name: String,
    db: State<'_, Db>,
) -> Result<Collection, String> {
    create_new_collection(&db, &name)
}

#[tauri::command]
pub fn update_collection(
    collection: Collection,
    db: State<'_, Db>,
) -> Result<(), String> {
    update_existing_collection(&db, &collection)
}

#[tauri::command]
pub fn delete_collection(
    id: String,
    db: State<'_, Db>,
) -> Result<(), String> {
    delete_existing_collection(&db, &id)
}

#[tauri::command]
pub fn get_environments(db: State<'_, Db>) -> Result<Vec<Environment>, String> {
    get_all_environments(&db)
}

#[tauri::command]
pub fn create_environment(
    name: String,
    db: State<'_, Db>,
) -> Result<Environment, String> {
    create_new_environment(&db, &name)
}

#[tauri::command]
pub fn update_environment(
    environment: Environment,
    db: State<'_, Db>,
) -> Result<(), String> {
    update_existing_environment(&db, &environment)
}

#[tauri::command]
pub fn delete_environment(
    id: String,
    db: State<'_, Db>,
) -> Result<(), String> {
    delete_existing_environment(&db, &id)
}

#[tauri::command]
pub fn import_curl(curl_command: String) -> Result<HttpRequest, String> {
    crate::curl_parser::parse_curl(&curl_command)
}

#[tauri::command]
pub fn import_openapi(
    spec_content: String,
    collection_name: String,
    db: State<'_, Db>,
) -> Result<Collection, String> {
    let collection = crate::openapi_parser::parse_openapi(&spec_content, &collection_name)?;
    // Save the collection to the database
    insert_collection(&db, &collection)?;
    Ok(collection)
}

// --- Cookie management commands ---

#[tauri::command]
pub fn get_cookies(db: State<'_, Db>) -> Result<Vec<StoredCookie>, String> {
    get_all_cookies_list(&db)
}

#[tauri::command]
pub fn delete_cookie(
    id: String,
    db: State<'_, Db>,
) -> Result<(), String> {
    delete_cookie_entry(&db, &id)
}

#[tauri::command]
pub fn clear_cookies(db: State<'_, Db>) -> Result<(), String> {
    clear_all_cookies(&db)
}
