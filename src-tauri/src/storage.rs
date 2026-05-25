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
        );
        CREATE TABLE IF NOT EXISTS benchmark_history (
            id TEXT PRIMARY KEY,
            request TEXT NOT NULL,
            result TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS run_history (
            id TEXT PRIMARY KEY,
            collection_id TEXT NOT NULL,
            collection_name TEXT NOT NULL,
            environment_id TEXT,
            result TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cookies (
            id TEXT PRIMARY KEY,
            domain TEXT NOT NULL,
            path TEXT NOT NULL,
            name TEXT NOT NULL,
            value TEXT NOT NULL,
            secure INTEGER NOT NULL DEFAULT 0,
            http_only INTEGER NOT NULL DEFAULT 0,
            expires TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(domain, path, name)
        );
        CREATE TABLE IF NOT EXISTS global_variables (
            id TEXT PRIMARY KEY,
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
    .filter_map(|(id, req_json, resp_json, created_at)| {
        let request: HttpRequest = serde_json::from_str(&req_json).ok()?;
        let response: HttpResponse = serde_json::from_str(&resp_json).ok()?;
        Some(HistoryEntry { id, request, response, created_at })
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
        Collection { id, name, requests, created_at, updated_at, variables: vec![] }
    })
    .collect();
    Ok(collections)
}

pub fn insert_collection(db: &State<Db>, collection: &Collection) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let requests_json = serde_json::to_string(&collection.requests).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO collections (id, name, requests, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![collection.id, collection.name, requests_json, collection.created_at, collection.updated_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
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
        variables: vec![],
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

pub fn save_cookie_to_db(conn: &Connection, cookie: &StoredCookie) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO cookies (id, domain, path, name, value, secure, http_only, expires, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            cookie.id,
            cookie.domain,
            cookie.path,
            cookie.name,
            cookie.value,
            cookie.secure as i32,
            cookie.http_only as i32,
            cookie.expires,
            cookie.created_at,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}



pub fn delete_cookie_entry(db: &State<Db>, id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM cookies WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear_all_cookies(db: &State<Db>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM cookies", []).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_all_cookies_list(db: &State<Db>) -> Result<Vec<StoredCookie>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, domain, path, name, value, secure, http_only, expires, created_at
         FROM cookies ORDER BY domain ASC, name ASC"
    ).map_err(|e| e.to_string())?;
    let cookies = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let domain: String = row.get(1)?;
        let path: String = row.get(2)?;
        let name: String = row.get(3)?;
        let value: String = row.get(4)?;
        let secure: i32 = row.get(5)?;
        let http_only: i32 = row.get(6)?;
        let expires: Option<String> = row.get(7)?;
        let created_at: String = row.get(8)?;
        Ok((id, domain, path, name, value, secure, http_only, expires, created_at))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .map(|(id, domain, path, name, value, secure, http_only, expires, created_at)| {
        StoredCookie {
            id, domain, path, name, value,
            secure: secure != 0,
            http_only: http_only != 0,
            expires, created_at,
        }
    })
    .collect();
    Ok(cookies)
}

pub fn save_benchmark_history(db: &State<Db>, entry: &BenchmarkHistoryEntry) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let request_json = serde_json::to_string(&entry.request).map_err(|e| e.to_string())?;
    let result_json = serde_json::to_string(&entry.result).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO benchmark_history (id, request, result, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![entry.id, request_json, result_json, entry.created_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_benchmark_history_list(db: &State<Db>, limit: i64, offset: i64) -> Result<Vec<BenchmarkHistoryEntry>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, request, result, created_at FROM benchmark_history ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
    ).map_err(|e| e.to_string())?;
    let entries = stmt.query_map(params![limit, offset], |row| {
        let id: String = row.get(0)?;
        let request_json: String = row.get(1)?;
        let result_json: String = row.get(2)?;
        let created_at: String = row.get(3)?;
        Ok((id, request_json, result_json, created_at))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .filter_map(|(id, req_json, res_json, created_at)| {
        let request: HttpRequest = serde_json::from_str(&req_json).ok()?;
        let result: BenchmarkResult = serde_json::from_str(&res_json).ok()?;
        Some(BenchmarkHistoryEntry { id, request, result, created_at })
    })
    .collect();
    Ok(entries)
}

pub fn delete_benchmark_history_entry(db: &State<Db>, id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM benchmark_history WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear_all_benchmark_history(db: &State<Db>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM benchmark_history", []).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load_cookies_for_domain_conn(conn: &Connection, domain: &str) -> Result<Vec<StoredCookie>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, domain, path, name, value, secure, http_only, expires, created_at
         FROM cookies
         WHERE domain = ?1 OR instr(?1, domain) > 0
         ORDER BY created_at ASC"
    ).map_err(|e| e.to_string())?;
    let cookies = stmt.query_map(params![domain], |row| {
        let id: String = row.get(0)?;
        let domain: String = row.get(1)?;
        let path: String = row.get(2)?;
        let name: String = row.get(3)?;
        let value: String = row.get(4)?;
        let secure: i32 = row.get(5)?;
        let http_only: i32 = row.get(6)?;
        let expires: Option<String> = row.get(7)?;
        let created_at: String = row.get(8)?;
        Ok((id, domain, path, name, value, secure, http_only, expires, created_at))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .map(|(id, domain, path, name, value, secure, http_only, expires, created_at)| {
        StoredCookie {
            id, domain, path, name, value,
            secure: secure != 0,
            http_only: http_only != 0,
            expires, created_at,
        }
    })
    .collect();
    Ok(cookies)
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

// --- Run history functions ---

pub fn save_run_result(db: &State<Db>, entry: &CollectionRunResult) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let result_json = serde_json::to_string(entry).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO run_history (id, collection_id, collection_name, environment_id, result, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![entry.id, entry.collection_id, entry.collection_name, entry.environment_id, result_json, entry.started_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_run_history_list(db: &State<Db>, limit: i64, offset: i64) -> Result<Vec<CollectionRunResult>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, collection_id, collection_name, environment_id, result, created_at FROM run_history ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
    ).map_err(|e| e.to_string())?;
    let entries = stmt.query_map(params![limit, offset], |row| {
        let id: String = row.get(0)?;
        let collection_id: String = row.get(1)?;
        let collection_name: String = row.get(2)?;
        let environment_id: Option<String> = row.get(3)?;
        let result_json: String = row.get(4)?;
        let created_at: String = row.get(5)?;
        Ok((id, collection_id, collection_name, environment_id, result_json, created_at))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .filter_map(|(id, col_id, col_name, env_id, res_json, _created_at)| {
        let mut result: CollectionRunResult = serde_json::from_str(&res_json).ok()?;
        // Override the id/collection fields to ensure consistency
        result.id = id;
        result.collection_id = col_id;
        result.collection_name = col_name;
        result.environment_id = env_id;
        Some(result)
    })
    .collect();
    Ok(entries)
}

pub fn delete_run_history_entry(db: &State<Db>, id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM run_history WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear_all_run_history(db: &State<Db>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM run_history", []).map_err(|e| e.to_string())?;
    Ok(())
}

// --- Global variables ---

pub fn get_global_variables(db: &State<Db>) -> Result<GlobalVariables, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, variables, created_at, updated_at FROM global_variables ORDER BY created_at ASC LIMIT 1"
    ).map_err(|e| e.to_string())?;

    let result = stmt.query_row([], |row| {
        let id: String = row.get(0)?;
        let variables_json: String = row.get(1)?;
        let created_at: String = row.get(2)?;
        let updated_at: String = row.get(3)?;
        Ok((id, variables_json, created_at, updated_at))
    });

    match result {
        Ok((id, vars_json, created_at, updated_at)) => {
            let variables: Vec<KeyValue> = serde_json::from_str(&vars_json).unwrap_or_default();
            Ok(GlobalVariables { id, variables, created_at, updated_at })
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Return empty global variables
            let now = chrono::Utc::now().to_rfc3339();
            Ok(GlobalVariables {
                id: uuid::Uuid::new_v4().to_string(),
                variables: vec![],
                created_at: now.clone(),
                updated_at: now,
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

pub fn save_global_variables(db: &State<Db>, global: &GlobalVariables) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let vars_json = serde_json::to_string(&global.variables).map_err(|e| e.to_string())?;

    // Upsert: delete existing then insert
    conn.execute("DELETE FROM global_variables", []).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO global_variables (id, variables, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![global.id, vars_json, global.created_at, now],
    ).map_err(|e| e.to_string())?;
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
