use rusqlite::{Connection, params};
use tauri::State;
use crate::storage::Db;
use super::models::*;

pub fn init_replay_tables(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS replay_sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            remap_rules TEXT NOT NULL DEFAULT '[]',
            assertions TEXT NOT NULL DEFAULT '[]',
            chaos_config TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS replay_entries (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            original_request TEXT NOT NULL,
            original_response TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS replay_runs (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'completed',
            duration_ms INTEGER NOT NULL DEFAULT 0,
            environment_id TEXT,
            chaos_config TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS replay_entry_results (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            entry_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'completed',
            replayed_request TEXT,
            replayed_response TEXT,
            diff TEXT,
            assertion_results TEXT NOT NULL DEFAULT '[]',
            error TEXT,
            created_at TEXT NOT NULL
        );"
    )
}

// ─── Session CRUD ─────────────────────────────────────────────────────

pub fn get_replay_sessions(db: &State<Db>) -> Result<Vec<ReplaySession>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, description, remap_rules, assertions, chaos_config, created_at, updated_at FROM replay_sessions ORDER BY updated_at DESC"
    ).map_err(|e| e.to_string())?;
    let sessions = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let description: String = row.get(2)?;
        let remap_rules_json: String = row.get(3)?;
        let assertions_json: String = row.get(4)?;
        let chaos_config_json: String = row.get(5)?;
        let created_at: String = row.get(6)?;
        let updated_at: String = row.get(7)?;
        Ok((id, name, description, remap_rules_json, assertions_json, chaos_config_json, created_at, updated_at))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .map(|(id, name, description, rr_json, as_json, cc_json, created_at, updated_at)| {
        let remap_rules: Vec<RemapRule> = serde_json::from_str(&rr_json).unwrap_or_default();
        let assertions: Vec<ReplayAssertion> = serde_json::from_str(&as_json).unwrap_or_default();
        let chaos_config: ChaosConfig = serde_json::from_str(&cc_json).unwrap_or_default();
        ReplaySession { id, name, description, remap_rules, assertions, chaos_config, created_at, updated_at }
    })
    .collect();
    Ok(sessions)
}

pub fn create_replay_session(db: &State<Db>, name: &str, description: &str) -> Result<ReplaySession, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let remap_rules_json = serde_json::to_string(&Vec::<RemapRule>::new()).map_err(|e| e.to_string())?;
    let assertions_json = serde_json::to_string(&Vec::<ReplayAssertion>::new()).map_err(|e| e.to_string())?;
    let chaos_config_json = serde_json::to_string(&ChaosConfig::default()).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO replay_sessions (id, name, description, remap_rules, assertions, chaos_config, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, name, description, remap_rules_json, assertions_json, chaos_config_json, now, now],
    ).map_err(|e| e.to_string())?;
    Ok(ReplaySession {
        id, name: name.to_string(), description: description.to_string(),
        remap_rules: vec![], assertions: vec![], chaos_config: ChaosConfig::default(),
        created_at: now.clone(), updated_at: now,
    })
}

pub fn update_replay_session(db: &State<Db>, session: &ReplaySession) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let remap_rules_json = serde_json::to_string(&session.remap_rules).map_err(|e| e.to_string())?;
    let assertions_json = serde_json::to_string(&session.assertions).map_err(|e| e.to_string())?;
    let chaos_config_json = serde_json::to_string(&session.chaos_config).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE replay_sessions SET name = ?1, description = ?2, remap_rules = ?3, assertions = ?4, chaos_config = ?5, updated_at = ?6 WHERE id = ?7",
        params![session.name, session.description, remap_rules_json, assertions_json, chaos_config_json, now, session.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_replay_session(db: &State<Db>, id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM replay_entry_results WHERE run_id IN (SELECT id FROM replay_runs WHERE session_id = ?1)", params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM replay_runs WHERE session_id = ?1", params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM replay_entries WHERE session_id = ?1", params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM replay_sessions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Entry CRUD ───────────────────────────────────────────────────────

pub fn get_replay_entries(db: &State<Db>, session_id: &str) -> Result<Vec<ReplayEntry>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, session_id, position, original_request, original_response, created_at FROM replay_entries WHERE session_id = ?1 ORDER BY position ASC"
    ).map_err(|e| e.to_string())?;
    let entries = stmt.query_map(params![session_id], |row| {
        let id: String = row.get(0)?;
        let session_id: String = row.get(1)?;
        let position: i32 = row.get(2)?;
        let req_json: String = row.get(3)?;
        let resp_json: String = row.get(4)?;
        let created_at: String = row.get(5)?;
        Ok((id, session_id, position, req_json, resp_json, created_at))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .filter_map(|(id, session_id, position, req_json, resp_json, created_at)| {
        let original_request: crate::models::HttpRequest = serde_json::from_str(&req_json).ok()?;
        let original_response: crate::models::HttpResponse = serde_json::from_str(&resp_json).ok()?;
        Some(ReplayEntry { id, session_id, position, original_request, original_response, created_at })
    })
    .collect();
    Ok(entries)
}

pub fn add_replay_entries(db: &State<Db>, session_id: &str, history_entries: &[super::models::HarEntry]) -> Result<Vec<ReplayEntry>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let max_pos: i32 = conn.query_row(
        "SELECT COALESCE(MAX(position), -1) FROM replay_entries WHERE session_id = ?1",
        params![session_id],
        |row| row.get(0),
    ).unwrap_or(-1);

    let mut created = Vec::new();
    for (i, he) in history_entries.iter().enumerate() {
        let id = uuid::Uuid::new_v4().to_string();
        let position = max_pos + 1 + i as i32;
        let req_json = serde_json::to_string(&he.request).map_err(|e| e.to_string())?;
        let resp_json = serde_json::to_string(&he.response).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO replay_entries (id, session_id, position, original_request, original_response, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, session_id, position, req_json, resp_json, now],
        ).map_err(|e| e.to_string())?;
        created.push(ReplayEntry {
            id, session_id: session_id.to_string(), position,
            original_request: he.request.clone(), original_response: he.response.clone(),
            created_at: now.clone(),
        });
    }
    Ok(created)
}

pub fn delete_replay_entry(db: &State<Db>, id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM replay_entries WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn reorder_replay_entries(db: &State<Db>, session_id: &str, ordered_ids: &[String]) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    for (pos, id) in ordered_ids.iter().enumerate() {
        conn.execute(
            "UPDATE replay_entries SET position = ?1 WHERE id = ?2 AND session_id = ?3",
            params![pos as i32, id, session_id],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn update_replay_entry(db: &State<Db>, entry: &ReplayEntry) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let req_json = serde_json::to_string(&entry.original_request).map_err(|e| e.to_string())?;
    let resp_json = serde_json::to_string(&entry.original_response).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE replay_entries SET position = ?1, original_request = ?2, original_response = ?3 WHERE id = ?4",
        params![entry.position, req_json, resp_json, entry.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear_replay_entries(db: &State<Db>, session_id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM replay_entries WHERE session_id = ?1", params![session_id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Run CRUD ─────────────────────────────────────────────────────────

pub fn save_replay_run(db: &State<Db>, run: &ReplayRun, entry_results: &[ReplayEntryResult]) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let chaos_json = serde_json::to_string(&run.chaos_config).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO replay_runs (id, session_id, status, duration_ms, environment_id, chaos_config, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![run.id, run.session_id, serde_json::to_string(&run.status).map_err(|e| e.to_string())?, run.duration_ms, run.environment_id, chaos_json, run.created_at],
    ).map_err(|e| e.to_string())?;

    for er in entry_results {
        let req_json = er.replayed_request.as_ref().map(serde_json::to_string).transpose().map_err(|e| e.to_string())?;
        let resp_json = er.replayed_response.as_ref().map(serde_json::to_string).transpose().map_err(|e| e.to_string())?;
        let diff_json = er.diff.as_ref().map(serde_json::to_string).transpose().map_err(|e| e.to_string())?;
        let ar_json = serde_json::to_string(&er.assertion_results).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO replay_entry_results (id, run_id, entry_id, status, replayed_request, replayed_response, diff, assertion_results, error, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![er.id, er.run_id, er.entry_id, serde_json::to_string(&er.status).map_err(|e| e.to_string())?, req_json, resp_json, diff_json, ar_json, er.error, er.created_at],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn get_replay_runs(db: &State<Db>, session_id: &str, limit: i64, offset: i64) -> Result<Vec<ReplayRun>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, session_id, status, duration_ms, environment_id, chaos_config, created_at FROM replay_runs WHERE session_id = ?1 ORDER BY created_at DESC LIMIT ?2 OFFSET ?3"
    ).map_err(|e| e.to_string())?;
    let runs = stmt.query_map(params![session_id, limit, offset], |row| {
        let id: String = row.get(0)?;
        let session_id: String = row.get(1)?;
        let status_json: String = row.get(2)?;
        let duration_ms: i64 = row.get(3)?;
        let environment_id: Option<String> = row.get(4)?;
        let chaos_config_json: String = row.get(5)?;
        let created_at: String = row.get(6)?;
        Ok((id, session_id, status_json, duration_ms, environment_id, chaos_config_json, created_at))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .filter_map(|(id, session_id, status_json, duration_ms, environment_id, cc_json, created_at)| {
        let status: ReplayRunStatus = serde_json::from_str(&status_json).ok()?;
        let chaos_config: ChaosConfig = serde_json::from_str(&cc_json).unwrap_or_default();
        Some(ReplayRun { id, session_id, status, duration_ms, environment_id, chaos_config, created_at })
    })
    .collect();
    Ok(runs)
}

pub fn get_replay_run_detail(db: &State<Db>, run_id: &str) -> Result<Option<ReplayRunDetail>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let run_row = conn.query_row(
        "SELECT id, session_id, status, duration_ms, environment_id, chaos_config, created_at FROM replay_runs WHERE id = ?1",
        params![run_id],
        |row| {
            let id: String = row.get(0)?;
            let session_id: String = row.get(1)?;
            let status_json: String = row.get(2)?;
            let duration_ms: i64 = row.get(3)?;
            let environment_id: Option<String> = row.get(4)?;
            let chaos_config_json: String = row.get(5)?;
            let created_at: String = row.get(6)?;
            Ok((id, session_id, status_json, duration_ms, environment_id, chaos_config_json, created_at))
        }
    );

    let run = match run_row {
        Ok((id, session_id, status_json, duration_ms, environment_id, cc_json, created_at)) => {
            let status: ReplayRunStatus = serde_json::from_str(&status_json).unwrap_or(ReplayRunStatus::Failed);
            let chaos_config: ChaosConfig = serde_json::from_str(&cc_json).unwrap_or_default();
            ReplayRun { id, session_id, status, duration_ms, environment_id, chaos_config, created_at }
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };

    let mut stmt = conn.prepare(
        "SELECT id, run_id, entry_id, status, replayed_request, replayed_response, diff, assertion_results, error, created_at FROM replay_entry_results WHERE run_id = ?1 ORDER BY created_at ASC"
    ).map_err(|e| e.to_string())?;

    let entry_results = stmt.query_map(params![run_id], |row| {
        let id: String = row.get(0)?;
        let run_id: String = row.get(1)?;
        let entry_id: String = row.get(2)?;
        let status_json: String = row.get(3)?;
        let req_json: Option<String> = row.get(4)?;
        let resp_json: Option<String> = row.get(5)?;
        let diff_json: Option<String> = row.get(6)?;
        let ar_json: String = row.get(7)?;
        let error: Option<String> = row.get(8)?;
        let created_at: String = row.get(9)?;
        Ok((id, run_id, entry_id, status_json, req_json, resp_json, diff_json, ar_json, error, created_at))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .filter_map(|(id, run_id, entry_id, status_json, req_json, resp_json, diff_json, ar_json, error, created_at)| {
        let status: EntryResultStatus = serde_json::from_str(&status_json).ok()?;
        let replayed_request: Option<crate::models::HttpRequest> = req_json.and_then(|j| serde_json::from_str(&j).ok());
        let replayed_response: Option<crate::models::HttpResponse> = resp_json.and_then(|j| serde_json::from_str(&j).ok());
        let diff: Option<ReplayDiff> = diff_json.and_then(|j| serde_json::from_str(&j).ok());
        let assertion_results: Vec<AssertionResult> = serde_json::from_str(&ar_json).unwrap_or_default();
        Some(ReplayEntryResult { id, run_id, entry_id, status, replayed_request, replayed_response, diff, assertion_results, error, created_at })
    })
    .collect();

    Ok(Some(ReplayRunDetail { run, entry_results }))
}

pub fn delete_replay_run(db: &State<Db>, id: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM replay_entry_results WHERE run_id = ?1", params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM replay_runs WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}


