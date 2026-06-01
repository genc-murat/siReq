use reqwest::Client;
use tauri::{Emitter, State};
use crate::storage::Db;
use crate::http::RequestHandles;
use super::models::*;
use super::storage;
use super::engine;
use super::har_parser;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;

pub type ReplayTokenTuple = (Arc<AtomicBool>, Arc<AtomicBool>);
pub struct ReplayRunTokens(pub Mutex<std::collections::HashMap<String, ReplayTokenTuple>>);

#[tauri::command]
pub async fn replay_create_session(
    db: State<'_, Db>,
    name: String,
    description: Option<String>,
) -> Result<ReplaySession, String> {
    storage::create_replay_session(&db, &name, &description.unwrap_or_default())
}

#[tauri::command]
pub async fn replay_get_sessions(
    db: State<'_, Db>,
) -> Result<Vec<ReplaySession>, String> {
    storage::get_replay_sessions(&db)
}

#[tauri::command]
pub async fn replay_update_session(
    db: State<'_, Db>,
    session: ReplaySession,
) -> Result<(), String> {
    storage::update_replay_session(&db, &session)
}

#[tauri::command]
pub async fn replay_delete_session(
    db: State<'_, Db>,
    id: String,
) -> Result<(), String> {
    storage::delete_replay_session(&db, &id)
}

#[tauri::command]
pub async fn replay_get_entries(
    db: State<'_, Db>,
    session_id: String,
) -> Result<Vec<ReplayEntry>, String> {
    storage::get_replay_entries(&db, &session_id)
}

#[tauri::command]
pub async fn replay_add_entries(
    db: State<'_, Db>,
    session_id: String,
    entries: Vec<HarEntry>,
) -> Result<Vec<ReplayEntry>, String> {
    storage::add_replay_entries(&db, &session_id, &entries)
}

#[tauri::command]
pub async fn replay_import_har(
    db: State<'_, Db>,
    session_id: String,
    har_json: String,
) -> Result<Vec<ReplayEntry>, String> {
    let har_entries = har_parser::parse_har(&har_json)?;
    storage::add_replay_entries(&db, &session_id, &har_entries)
}

#[tauri::command]
pub async fn replay_remove_entry(
    db: State<'_, Db>,
    id: String,
) -> Result<(), String> {
    storage::delete_replay_entry(&db, &id)
}

#[tauri::command]
pub async fn replay_reorder_entries(
    db: State<'_, Db>,
    session_id: String,
    entry_ids: Vec<String>,
) -> Result<(), String> {
    storage::reorder_replay_entries(&db, &session_id, &entry_ids)
}

#[tauri::command]
pub async fn replay_update_entry(
    db: State<'_, Db>,
    entry: ReplayEntry,
) -> Result<(), String> {
    storage::update_replay_entry(&db, &entry)
}

#[tauri::command]
pub async fn replay_clear_entries(
    db: State<'_, Db>,
    session_id: String,
) -> Result<(), String> {
    storage::clear_replay_entries(&db, &session_id)
}

#[tauri::command]
pub async fn replay_execute_run(
    db: State<'_, Db>,
    client: State<'_, Client>,
    _handles: State<'_, RequestHandles>,
    session_id: String,
    environment_id: Option<String>,
) -> Result<ReplayRunDetail, String> {
    let sessions = storage::get_replay_sessions(&db)?;
    let session = sessions.into_iter().find(|s| s.id == session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let entries = storage::get_replay_entries(&db, &session_id)?;
    if entries.is_empty() {
        return Err("No entries in session".to_string());
    }

    let (run, entry_results) = engine::execute_replay_run(
        &db, &client, &_handles, &session, &entries, environment_id.as_deref(),
    ).await?;

    let detail = ReplayRunDetail {
        run: run.clone(),
        entry_results: entry_results.clone(),
    };

    storage::save_replay_run(&db, &run, &entry_results)?;

    Ok(detail)
}

#[tauri::command]
pub async fn replay_step_entry(
    db: State<'_, Db>,
    client: State<'_, Client>,
    _handles: State<'_, RequestHandles>,
    session_id: String,
    entry_id: String,
    environment_id: Option<String>,
) -> Result<ReplayEntryResult, String> {
    let sessions = storage::get_replay_sessions(&db)?;
    let session = sessions.into_iter().find(|s| s.id == session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let entries = storage::get_replay_entries(&db, &session_id)?;
    let entry = entries.into_iter().find(|e| e.id == entry_id)
        .ok_or_else(|| "Entry not found".to_string())?;

    let result = engine::execute_single_step(
        &db, &client, &entry, &session, environment_id.as_deref(),
    ).await;

    Ok(result)
}

#[tauri::command]
pub async fn replay_get_runs(
    db: State<'_, Db>,
    session_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ReplayRun>, String> {
    storage::get_replay_runs(&db, &session_id, limit.unwrap_or(50), offset.unwrap_or(0))
}

#[tauri::command]
pub async fn replay_get_run_detail(
    db: State<'_, Db>,
    run_id: String,
) -> Result<Option<ReplayRunDetail>, String> {
    storage::get_replay_run_detail(&db, &run_id)
}

#[tauri::command]
pub async fn replay_delete_run(
    db: State<'_, Db>,
    run_id: String,
) -> Result<(), String> {
    storage::delete_replay_run(&db, &run_id)
}

#[tauri::command]
pub async fn replay_compare_runs(
    db: State<'_, Db>,
    run_id_a: String,
    run_id_b: String,
) -> Result<ReplayRunComparison, String> {
    let detail_a = storage::get_replay_run_detail(&db, &run_id_a)?
        .ok_or_else(|| "Run A not found".to_string())?;
    let detail_b = storage::get_replay_run_detail(&db, &run_id_b)?
        .ok_or_else(|| "Run B not found".to_string())?;

    let mut comparisons = Vec::new();
    for er_a in &detail_a.entry_results {
        if let Some(er_b) = detail_b.entry_results.iter().find(|r| r.entry_id == er_a.entry_id) {
            let status_diff = er_a.status != er_b.status;
            let timing_diff_ms = match (&er_a.replayed_response, &er_b.replayed_response) {
                (Some(ra), Some(rb)) => Some(rb.time_ms as i64 - ra.time_ms as i64),
                _ => None,
            };
            let status_code_diff = match (&er_a.replayed_response, &er_b.replayed_response) {
                (Some(ra), Some(rb)) if ra.status != rb.status => Some((ra.status, rb.status)),
                _ => None,
            };
            let assertions_passed_a = er_a.assertion_results.iter().filter(|a| a.passed).count();
            let assertions_passed_b = er_b.assertion_results.iter().filter(|a| a.passed).count();

            comparisons.push(RunEntryComparison {
                entry_id: er_a.entry_id.clone(),
                status_diff,
                timing_diff_ms,
                status_code_diff,
                assertions_passed_a,
                assertions_passed_b,
                result_a: er_a.clone(),
                result_b: er_b.clone(),
            });
        }
    }

    Ok(ReplayRunComparison {
        run_a: detail_a.run,
        run_b: detail_b.run,
        comparisons,
    })
}

#[tauri::command]
pub async fn replay_start_streaming(
    db: State<'_, Db>,
    client: State<'_, Client>,
    tokens: State<'_, ReplayRunTokens>,
    app: tauri::AppHandle,
    session_id: String,
    environment_id: Option<String>,
) -> Result<ReplayRunDetail, String> {
    let sessions = storage::get_replay_sessions(&db)?;
    let session = sessions.into_iter().find(|s| s.id == session_id)
        .ok_or_else(|| "Session not found".to_string())?;

    let entries = storage::get_replay_entries(&db, &session_id)?;
    if entries.is_empty() {
        return Err("No entries in session".to_string());
    }

    let run_id = uuid::Uuid::new_v4().to_string();
    let cancel_token = Arc::new(AtomicBool::new(false));
    let pause_token = Arc::new(AtomicBool::new(false));

    {
        let mut map = tokens.0.lock().map_err(|e| e.to_string())?;
        map.insert(run_id, (cancel_token.clone(), pause_token.clone()));
    }

    let (run, entry_results) = engine::execute_replay_streaming(
        &app, &db, &client, &session, &entries, environment_id.as_deref(),
        &cancel_token, &pause_token, 0, vec![],
    ).await?;

    {
        let mut map = tokens.0.lock().map_err(|e| e.to_string())?;
        map.remove(&run.id);
    }

    let detail = ReplayRunDetail {
        run: run.clone(),
        entry_results: entry_results.clone(),
    };

    storage::save_replay_run(&db, &run, &entry_results)?;

    let _ = app.emit("replay-run-completed", &run);

    Ok(detail)
}

#[tauri::command]
pub async fn replay_pause_run(
    tokens: State<'_, ReplayRunTokens>,
    run_id: String,
) -> Result<(), String> {
    let map = tokens.0.lock().map_err(|e| e.to_string())?;
    if let Some((_, pause_token)) = map.get(&run_id) {
        pause_token.store(true, Ordering::Relaxed);
        Ok(())
    } else {
        Err("Run not found or already completed".to_string())
    }
}

#[tauri::command]
pub async fn replay_resume_run(
    tokens: State<'_, ReplayRunTokens>,
    run_id: String,
) -> Result<(), String> {
    let map = tokens.0.lock().map_err(|e| e.to_string())?;
    if let Some((_, pause_token)) = map.get(&run_id) {
        pause_token.store(false, Ordering::Relaxed);
        Ok(())
    } else {
        Err("Run not found or already completed".to_string())
    }
}

#[tauri::command]
pub async fn replay_cancel_run(
    tokens: State<'_, ReplayRunTokens>,
    run_id: String,
) -> Result<(), String> {
    let mut map = tokens.0.lock().map_err(|e| e.to_string())?;
    if let Some((cancel_token, pause_token)) = map.remove(&run_id) {
        cancel_token.store(true, Ordering::Relaxed);
        pause_token.store(false, Ordering::Relaxed);
    }
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RunEntryComparison {
    pub entry_id: String,
    pub status_diff: bool,
    pub timing_diff_ms: Option<i64>,
    pub status_code_diff: Option<(u16, u16)>,
    pub assertions_passed_a: usize,
    pub assertions_passed_b: usize,
    pub result_a: ReplayEntryResult,
    pub result_b: ReplayEntryResult,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ReplayRunComparison {
    pub run_a: ReplayRun,
    pub run_b: ReplayRun,
    pub comparisons: Vec<RunEntryComparison>,
}
