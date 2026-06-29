use rusqlite::{Connection, params};
use std::sync::Mutex;
use tauri::State;
use crate::models::*;
use crate::mock_server::models::MockServerConfig;

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
        );
        CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            request TEXT NOT NULL,
            scope TEXT DEFAULT 'global',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS api_intelligence (
            id TEXT PRIMARY KEY,
            endpoint_key TEXT NOT NULL,
            method TEXT NOT NULL,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            request_count INTEGER DEFAULT 0,
            avg_time_ms REAL DEFAULT 0,
            p95_time_ms REAL DEFAULT 0,
            min_time_ms REAL DEFAULT 0,
            max_time_ms REAL DEFAULT 0,
            status_200_count INTEGER DEFAULT 0,
            status_400_count INTEGER DEFAULT 0,
            status_500_count INTEGER DEFAULT 0,
            status_other_count INTEGER DEFAULT 0,
            total_size_bytes INTEGER DEFAULT 0,
            schema_versions TEXT DEFAULT '[]',
            performance_history TEXT DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );"
    )?;

    // Initialize grpc_history table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS grpc_history (
            id TEXT PRIMARY KEY,
            address TEXT NOT NULL,
            tls INTEGER NOT NULL DEFAULT 0,
            service_name TEXT NOT NULL,
            method_name TEXT NOT NULL,
            method_kind TEXT NOT NULL,
            proto_content TEXT,
            input_json TEXT,
            input_jsons TEXT NOT NULL DEFAULT '[]',
            responses TEXT NOT NULL DEFAULT '[]',
            error TEXT,
            created_at TEXT NOT NULL
        );"
    )?;

    // Initialize mock_servers table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS mock_servers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            config TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );"
    )?;

    // Migrate collections table: add description, variables, auth columns
    {
        let cols: Vec<String> = conn
            .prepare("SELECT * FROM collections LIMIT 0")?
            .column_names()
            .iter()
            .map(|s| s.to_string())
            .collect();
        if !cols.contains(&"description".to_string()) {
            conn.execute_batch("ALTER TABLE collections ADD COLUMN description TEXT DEFAULT '';")?;
        }
        if !cols.contains(&"variables".to_string()) {
            conn.execute_batch("ALTER TABLE collections ADD COLUMN variables TEXT DEFAULT '[]';")?;
        }
        if !cols.contains(&"auth".to_string()) {
            conn.execute_batch("ALTER TABLE collections ADD COLUMN auth TEXT DEFAULT NULL;")?;
        }
    }

    // Migrate run_history table: add 'mode' column for test suite tracking
    // (functional | smoke | regression | load). Existing rows default to 'functional'.
    {
        let cols: Vec<String> = conn
            .prepare("SELECT * FROM run_history LIMIT 0")?
            .column_names()
            .iter()
            .map(|s| s.to_string())
            .collect();
        if !cols.contains(&"mode".to_string()) {
            conn.execute_batch(
                "ALTER TABLE run_history ADD COLUMN mode TEXT NOT NULL DEFAULT 'functional';"
            )?;
        }
    }

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
        "SELECT id, name, requests, created_at, updated_at, description, variables, auth FROM collections ORDER BY updated_at DESC"
    ).map_err(|e| e.to_string())?;
    let collections = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let requests_json: String = row.get(2)?;
        let created_at: String = row.get(3)?;
        let updated_at: String = row.get(4)?;
        let description: String = row.get(5)?;
        let variables_json: String = row.get(6)?;
        let auth_json: Option<String> = row.get(7)?;
        Ok((id, name, requests_json, created_at, updated_at, description, variables_json, auth_json))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .map(|(id, name, req_json, created_at, updated_at, description, vars_json, auth_json)| {
        let items: Vec<CollectionItem> = serde_json::from_str(&req_json).unwrap_or_else(|_| {
            serde_json::from_str::<Vec<HttpRequest>>(&req_json)
                .unwrap_or_default()
                .into_iter()
                .map(CollectionItem::Request)
                .collect()
        });
        let variables: Vec<KeyValue> = serde_json::from_str(&vars_json).unwrap_or_default();
        let auth: Option<AuthConfig> = auth_json.and_then(|j| serde_json::from_str(&j).ok());
        Collection {
            id, name, items,
            created_at, updated_at,
            variables,
            auth,
            description,
        }
    })
    .collect();
    Ok(collections)
}

pub fn insert_collection(db: &State<Db>, collection: &Collection) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let items_json = serde_json::to_string(&collection.items).map_err(|e| e.to_string())?;
    let vars_json = serde_json::to_string(&collection.variables).map_err(|e| e.to_string())?;
    let auth_json = collection.auth.as_ref().map(serde_json::to_string).transpose().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO collections (id, name, requests, created_at, updated_at, description, variables, auth) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![collection.id, collection.name, items_json, collection.created_at, collection.updated_at, collection.description, vars_json, auth_json],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn create_new_collection(db: &State<Db>, name: &str) -> Result<Collection, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let items_json = serde_json::to_string(&Vec::<CollectionItem>::new()).map_err(|e| e.to_string())?;
    let vars_json = serde_json::to_string(&Vec::<KeyValue>::new()).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO collections (id, name, requests, created_at, updated_at, description, variables, auth) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, name, items_json, now, now, "", vars_json, Option::<String>::None],
    ).map_err(|e| e.to_string())?;
    Ok(Collection {
        id,
        name: name.to_string(),
        items: vec![],
        created_at: now.clone(),
        updated_at: now,
        variables: vec![],
        auth: None,
        description: String::new(),
    })
}

pub fn update_existing_collection(db: &State<Db>, collection: &Collection) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let items_json = serde_json::to_string(&collection.items).map_err(|e| e.to_string())?;
    let vars_json = serde_json::to_string(&collection.variables).map_err(|e| e.to_string())?;
    let auth_json = collection.auth.as_ref().map(serde_json::to_string).transpose().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE collections SET name = ?1, requests = ?2, updated_at = ?3, description = ?4, variables = ?5, auth = ?6 WHERE id = ?7",
        params![collection.name, items_json, now, collection.description, vars_json, auth_json, collection.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Tree manipulation functions ───────────────────────────────────────

struct CollectionRow {
    id: String,
    name: String,
    items: Vec<CollectionItem>,
    created_at: String,
    variables: Vec<KeyValue>,
    auth: Option<AuthConfig>,
    description: String,
}

fn read_collection_row(conn: &Connection, collection_id: &str) -> Result<CollectionRow, String> {
    let mut stmt = conn.prepare(
        "SELECT id, name, requests, created_at, updated_at, description, variables, auth FROM collections WHERE id = ?1"
    ).map_err(|e| e.to_string())?;
    let row = stmt.query_row(params![collection_id], |row| {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let requests_json: String = row.get(2)?;
        let created_at: String = row.get(3)?;
        let _updated_at: String = row.get(4)?;
        let description: String = row.get(5)?;
        let variables_json: String = row.get(6)?;
        let auth_json: Option<String> = row.get(7)?;
        Ok((id, name, requests_json, created_at, description, variables_json, auth_json))
    }).map_err(|e| e.to_string())?;
    let (id, name, req_json, created_at, description, vars_json, auth_json) = row;
    let items: Vec<CollectionItem> = serde_json::from_str(&req_json).unwrap_or_else(|_| {
        serde_json::from_str::<Vec<HttpRequest>>(&req_json)
            .unwrap_or_default()
            .into_iter()
            .map(CollectionItem::Request)
            .collect()
    });
    let variables: Vec<KeyValue> = serde_json::from_str(&vars_json).unwrap_or_default();
    let auth: Option<AuthConfig> = auth_json.and_then(|j| serde_json::from_str(&j).ok());
    Ok(CollectionRow { id, name, items, created_at, variables, auth, description })
}

fn save_collection_items(conn: &Connection, collection_id: &str, items: &[CollectionItem], now: &str) -> Result<(), String> {
    let items_json = serde_json::to_string(items).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE collections SET requests = ?1, updated_at = ?2 WHERE id = ?3",
        params![items_json, now, collection_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Add a folder to a collection (optionally inside a parent folder).
pub fn add_collection_folder(
    db: &State<Db>,
    collection_id: &str,
    parent_folder_id: Option<&str>,
    name: &str,
) -> Result<Collection, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let row = read_collection_row(&conn, collection_id)?;
    let mut items = row.items;

    let folder = CollectionItem::Folder(CollectionFolder {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        description: String::new(),
        items: vec![],
        auth: None,
        created_at: now.clone(),
        updated_at: now.clone(),
    });

    match parent_folder_id {
        Some(pid) => {
            if let Some(CollectionItem::Folder(f)) = find_item_by_id_mut(&mut items, pid) {
                f.items.push(folder);
                f.updated_at = now.clone();
            } else {
                return Err("Parent folder not found".to_string());
            }
        }
        None => items.push(folder),
    }

    save_collection_items(&conn, collection_id, &items, &now)?;

    Ok(Collection {
        id: row.id,
        name: row.name,
        items,
        created_at: row.created_at,
        updated_at: now,
        variables: row.variables,
        auth: row.auth,
        description: row.description,
    })
}

/// Add a request item to a collection (optionally inside a parent folder).
pub fn add_collection_request(
    db: &State<Db>,
    collection_id: &str,
    parent_folder_id: Option<&str>,
    request: HttpRequest,
    position: Option<usize>,
) -> Result<Collection, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let row = read_collection_row(&conn, collection_id)?;
    let mut items = row.items;

    let new_item = CollectionItem::Request(request);

    match parent_folder_id {
        Some(pid) => {
            if let Some(CollectionItem::Folder(f)) = find_item_by_id_mut(&mut items, pid) {
                if let Some(pos) = position {
                    f.items.insert(pos, new_item);
                } else {
                    f.items.push(new_item);
                }
                f.updated_at = now.clone();
            } else {
                return Err("Parent folder not found".to_string());
            }
        }
        None => {
            if let Some(pos) = position {
                items.insert(pos, new_item);
            } else {
                items.push(new_item);
            }
        }
    }

    save_collection_items(&conn, collection_id, &items, &now)?;

    Ok(Collection {
        id: row.id,
        name: row.name,
        items,
        created_at: row.created_at,
        updated_at: now,
        variables: row.variables,
        auth: row.auth,
        description: row.description,
    })
}

/// Delete an item (folder or request) by ID from a collection.
pub fn delete_collection_item_by_id(
    db: &State<Db>,
    collection_id: &str,
    item_id: &str,
) -> Result<Collection, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let row = read_collection_row(&conn, collection_id)?;
    let mut items = row.items;

    if remove_item_by_id(&mut items, item_id).is_none() {
        return Err("Item not found".to_string());
    }

    save_collection_items(&conn, collection_id, &items, &now)?;

    Ok(Collection {
        id: row.id,
        name: row.name,
        items,
        created_at: row.created_at,
        updated_at: now,
        variables: row.variables,
        auth: row.auth,
        description: row.description,
    })
}

/// Move an item to a different parent folder / position within a collection.
pub fn move_collection_item_in_tree(
    db: &State<Db>,
    collection_id: &str,
    item_id: &str,
    target_folder_id: Option<&str>,
    target_index: usize,
) -> Result<Collection, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let row = read_collection_row(&conn, collection_id)?;
    let mut items = row.items;

    let removed = remove_item_by_id(&mut items, item_id)
        .ok_or_else(|| "Item not found".to_string())?;

    match target_folder_id {
        Some(tfid) => {
            if let Some(CollectionItem::Folder(f)) = find_item_by_id_mut(&mut items, tfid) {
                let idx = target_index.min(f.items.len());
                f.items.insert(idx, removed);
                f.updated_at = now.clone();
            } else {
                return Err("Target folder not found".to_string());
            }
        }
        None => {
            let idx = target_index.min(items.len());
            items.insert(idx, removed);
        }
    }

    save_collection_items(&conn, collection_id, &items, &now)?;

    Ok(Collection {
        id: row.id,
        name: row.name,
        items,
        created_at: row.created_at,
        updated_at: now,
        variables: row.variables,
        auth: row.auth,
        description: row.description,
    })
}

// ─── Templates ──────────────────────────────────────────────────────────

pub fn get_all_templates(db: &State<Db>) -> Result<Vec<RequestTemplate>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, description, request, scope, created_at, updated_at FROM templates ORDER BY name ASC"
    ).map_err(|e| e.to_string())?;
    let templates = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let description: String = row.get(2)?;
        let request_json: String = row.get(3)?;
        let scope: String = row.get(4)?;
        let created_at: String = row.get(5)?;
        let updated_at: String = row.get(6)?;
        Ok((id, name, description, request_json, scope, created_at, updated_at))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .filter_map(|(id, name, description, req_json, scope, created_at, updated_at)| {
        let request: HttpRequest = serde_json::from_str(&req_json).ok()?;
        Some(RequestTemplate { id, name, description, request, scope, created_at, updated_at })
    })
    .collect();
    Ok(templates)
}

pub fn create_new_template(db: &State<Db>, template: &RequestTemplate) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let request_json = serde_json::to_string(&template.request).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO templates (id, name, description, request, scope, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![template.id, template.name, template.description, request_json, template.scope, template.created_at, template.updated_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_existing_template(db: &State<Db>, id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM templates WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
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

// ─── gRPC History ────────────────────────────────────────────────────────────

pub fn save_grpc_history_entry(db: &State<Db>, entry: &GrpcHistoryEntry) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let responses_json = serde_json::to_string(&entry.responses).map_err(|e| e.to_string())?;
    let input_jsons_json = serde_json::to_string(&entry.input_jsons).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO grpc_history (id, address, tls, service_name, method_name, method_kind, proto_content, input_json, input_jsons, responses, error, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            entry.id,
            entry.address,
            entry.tls as i32,
            entry.service_name,
            entry.method_name,
            entry.method_kind,
            entry.proto_content,
            entry.input_json,
            input_jsons_json,
            responses_json,
            entry.error,
            entry.created_at,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_grpc_history_list(db: &State<Db>, limit: i64, offset: i64) -> Result<Vec<GrpcHistoryEntry>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, address, tls, service_name, method_name, method_kind, proto_content, input_json, input_jsons, responses, error, created_at FROM grpc_history ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
    ).map_err(|e| e.to_string())?;
    let entries = stmt.query_map(params![limit, offset], |row| {
        let id: String = row.get(0)?;
        let address: String = row.get(1)?;
        let tls_int: i32 = row.get(2)?;
        let service_name: String = row.get(3)?;
        let method_name: String = row.get(4)?;
        let method_kind: String = row.get(5)?;
        let proto_content: Option<String> = row.get(6)?;
        let input_json: Option<String> = row.get(7)?;
        let input_jsons_json: String = row.get(8)?;
        let responses_json: String = row.get(9)?;
        let error: Option<String> = row.get(10)?;
        let created_at: String = row.get(11)?;
        Ok((id, address, tls_int, service_name, method_name, method_kind, proto_content, input_json, input_jsons_json, responses_json, error, created_at))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .map(|(id, address, tls_int, service_name, method_name, method_kind, proto_content, input_json, input_jsons_json, responses_json, error, created_at)| {
        let tls = tls_int != 0;
        let input_jsons: Vec<String> = serde_json::from_str(&input_jsons_json).unwrap_or_default();
        let responses: Vec<GrpcResponse> = serde_json::from_str(&responses_json).unwrap_or_default();
        GrpcHistoryEntry {
            id, address, tls, service_name, method_name, method_kind,
            proto_content, input_json, input_jsons, responses, error, created_at,
        }
    })
    .collect();
    Ok(entries)
}

pub fn delete_grpc_history_entry(db: &State<Db>, id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM grpc_history WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear_all_grpc_history(db: &State<Db>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM grpc_history", []).map_err(|e| e.to_string())?;
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

// ─── Mock Servers CRUD ──────────────────────────────────────────────────

pub fn get_all_mock_configs(db: &State<Db>) -> Result<Vec<MockServerConfig>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, config, created_at, updated_at FROM mock_servers ORDER BY updated_at DESC"
    ).map_err(|e| e.to_string())?;
    let entries = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let config_json: String = row.get(2)?;
        let _created_at: String = row.get(3)?;
        let _updated_at: String = row.get(4)?;
        Ok((id, name, config_json))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .filter_map(|(_id, _name, config_json)| {
        let config: MockServerConfig = serde_json::from_str(&config_json).ok()?;
        Some(config)
    })
    .collect();
    Ok(entries)
}

pub fn insert_mock_config(db: &State<Db>, config: &MockServerConfig) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let config_json = serde_json::to_string(config).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO mock_servers (id, name, config, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![config.id, config.name, config_json, now, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_mock_config(db: &State<Db>, config: &MockServerConfig) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let config_json = serde_json::to_string(config).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE mock_servers SET name = ?1, config = ?2, updated_at = ?3 WHERE id = ?4",
        params![config.name, config_json, now, config.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_mock_config(db: &State<Db>, id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM mock_servers WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

