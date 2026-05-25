use rusqlite::{Connection, params};
use std::sync::Mutex;
use tauri::State;
use crate::models::*;

pub struct Db(pub Mutex<Connection>);

pub fn init_db(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            request TEXT NOT NULL,
            response TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            requests TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS environments (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            variables TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );"
    )?;
    Ok(())
}

pub fn save_history_with_conn(db: &State<Db>, entry: &HistoryEntry) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let request_json = serde_json::to_string(&entry.request).map_err(|e| e.to_string())?;
    let response_json = serde_json::to_string(&entry.response).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO history (id, request, response, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![entry.id, request_json, response_json, entry.created_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_history_list(db: &State<Db>, limit: i64, offset: i64) -> Result<Vec<HistoryEntry>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, request, response, created_at FROM history ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
    ).map_err(|e| e.to_string())?;
    let entries = stmt.query_map(params![limit, offset], |row| {
        let id: String = row.get(0)?;
        let request_json: String = row.get(1)?;
        let response_json: String = row.get(2)?;
        let created_at: String = row.get(3)?;
        Ok((id, request_json, response_json, created_at))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .map(|(id, req_json, resp_json, created_at)| {
        let request: HttpRequest = serde_json::from_str(&req_json).unwrap();
        let response: HttpResponse = serde_json::from_str(&resp_json).unwrap();
        HistoryEntry { id, request, response, created_at }
    })
    .collect();
    Ok(entries)
}

pub fn delete_history_entry(db: &State<Db>, id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM history WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear_all_history(db: &State<Db>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM history", []).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_all_collections(db: &State<Db>) -> Result<Vec<Collection>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, requests, created_at, updated_at FROM collections ORDER BY updated_at DESC"
    ).map_err(|e| e.to_string())?;
    let collections = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let requests_json: String = row.get(2)?;
        let created_at: String = row.get(3)?;
        let updated_at: String = row.get(4)?;
        Ok((id, name, requests_json, created_at, updated_at))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .map(|(id, name, req_json, created_at, updated_at)| {
        let requests: Vec<HttpRequest> = serde_json::from_str(&req_json).unwrap_or_default();
        Collection { id, name, requests, created_at, updated_at }
    })
    .collect();
    Ok(collections)
}

pub fn create_new_collection(db: &State<Db>, name: &str) -> Result<Collection, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let requests_json = serde_json::to_string(&Vec::<HttpRequest>::new()).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO collections (id, name, requests, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, name, requests_json, now, now],
    ).map_err(|e| e.to_string())?;
    Ok(Collection {
        id,
        name: name.to_string(),
        requests: vec![],
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn update_existing_collection(db: &State<Db>, collection: &Collection) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let requests_json = serde_json::to_string(&collection.requests).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE collections SET name = ?1, requests = ?2, updated_at = ?3 WHERE id = ?4",
        params![collection.name, requests_json, now, collection.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_existing_collection(db: &State<Db>, id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM collections WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_all_environments(db: &State<Db>) -> Result<Vec<Environment>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, variables, created_at, updated_at FROM environments ORDER BY updated_at DESC"
    ).map_err(|e| e.to_string())?;
    let environments = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let variables_json: String = row.get(2)?;
        let created_at: String = row.get(3)?;
        let updated_at: String = row.get(4)?;
        Ok((id, name, variables_json, created_at, updated_at))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .map(|(id, name, vars_json, created_at, updated_at)| {
        let variables: Vec<KeyValue> = serde_json::from_str(&vars_json).unwrap_or_default();
        Environment { id, name, variables, created_at, updated_at }
    })
    .collect();
    Ok(environments)
}

pub fn create_new_environment(db: &State<Db>, name: &str) -> Result<Environment, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let vars_json = serde_json::to_string(&Vec::<KeyValue>::new()).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO environments (id, name, variables, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, name, vars_json, now, now],
    ).map_err(|e| e.to_string())?;
    Ok(Environment {
        id,
        name: name.to_string(),
        variables: vec![],
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn update_existing_environment(db: &State<Db>, environment: &Environment) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let vars_json = serde_json::to_string(&environment.variables).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE environments SET name = ?1, variables = ?2, updated_at = ?3 WHERE id = ?4",
        params![environment.name, vars_json, now, environment.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_existing_environment(db: &State<Db>, id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM environments WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_environment_by_id(conn: &Connection, id: &str) -> Result<Option<Environment>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, name, variables, created_at, updated_at FROM environments WHERE id = ?1"
    ).map_err(|e| e.to_string())?;
    let result = stmt.query_row(params![id], |row| {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let variables_json: String = row.get(2)?;
        let created_at: String = row.get(3)?;
        let updated_at: String = row.get(4)?;
        Ok((id, name, variables_json, created_at, updated_at))
    });

    match result {
        Ok((id, name, vars_json, created_at, updated_at)) => {
            let variables: Vec<KeyValue> = serde_json::from_str(&vars_json).unwrap_or_default();
            Ok(Some(Environment { id, name, variables, created_at, updated_at }))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
