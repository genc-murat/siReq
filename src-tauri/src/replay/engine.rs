use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::State;
use rand::Rng;
use reqwest::Client;
use crate::storage::Db;
use crate::http::{execute_request, extract_domain, RequestHandles};
use crate::storage::{get_global_variables, get_environment_by_id, load_cookies_for_domain_conn, save_cookie_to_db};
use super::models::*;
use super::diff_engine::{compute_full_diff, evaluate_assertion};

fn apply_remap_rules(url: &str, rules: &[RemapRule]) -> String {
    let mut remapped = url.to_string();
    for rule in rules {
        if rule.enabled && !rule.pattern.is_empty() {
            remapped = remapped.replace(&rule.pattern, &rule.replacement);
        }
    }
    remapped
}

fn should_chaos(config: &ChaosConfig) -> Option<ChaosAction> {
    if !config.enabled {
        return None;
    }
    let mut rng = rand::thread_rng();
    let roll: f64 = rng.gen();

    if roll < config.error_probability {
        let idx = rng.gen_range(0..config.error_status_codes.len().max(1));
        let code = config.error_status_codes.get(idx).copied().unwrap_or(500);
        return Some(ChaosAction::Error(code));
    }

    let roll2: f64 = rng.gen();
    if roll2 < config.timeout_probability {
        return Some(ChaosAction::Timeout);
    }

    let roll3: f64 = rng.gen();
    if roll3 < config.delay_probability {
        let delay = rng.gen_range(config.delay_min_ms..=config.delay_max_ms.max(config.delay_min_ms));
        return Some(ChaosAction::Delay(delay));
    }

    None
}

enum ChaosAction {
    Timeout,
    Delay(u64),
    Error(u16),
}

pub async fn execute_replay_run(
    db: &State<'_, Db>,
    client: &State<'_, Client>,
    _handles: &State<'_, RequestHandles>,
    session: &ReplaySession,
    entries: &[ReplayEntry],
    environment_id: Option<&str>,
) -> Result<(ReplayRun, Vec<ReplayEntryResult>), String> {
    let run_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let start = Instant::now();

    let env_vars: HashMap<String, String> = match environment_id {
        Some(env_id) => {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let env = get_environment_by_id(&conn, env_id)?;
            drop(conn);
            env.map(|e| e.variables.into_iter()
                .filter(|v| v.enabled && !v.key.is_empty())
                .map(|v| (v.key, v.value))
                .collect()
            ).unwrap_or_default()
        }
        None => HashMap::new(),
    };

    let global_vars = get_global_variables(db)?;
    let all_vars: HashMap<String, String> = {
        let mut m = HashMap::new();
        for v in &global_vars.variables {
            if v.enabled && !v.key.is_empty() {
                m.insert(v.key.clone(), v.value.clone());
            }
        }
        for (k, v) in &env_vars {
            m.insert(k.clone(), v.clone());
        }
        m
    };

    let mut entry_results = Vec::new();
    let mut has_failure = false;

    for entry in entries {
        let er = execute_single_entry(
            db, client, entry, session, &all_vars, &run_id,
        ).await;

        if er.status == EntryResultStatus::Failed {
            has_failure = true;
        }
        entry_results.push(er);
    }

    let duration_ms = start.elapsed().as_millis() as i64;
    let status = if has_failure {
        if entry_results.iter().all(|r| r.status == EntryResultStatus::Failed) {
            ReplayRunStatus::Failed
        } else {
            ReplayRunStatus::Partial
        }
    } else {
        ReplayRunStatus::Completed
    };

    let run = ReplayRun {
        id: run_id,
        session_id: session.id.clone(),
        status,
        duration_ms,
        environment_id: environment_id.map(|s| s.to_string()),
        chaos_config: session.chaos_config.clone(),
        created_at: now,
    };

    Ok((run, entry_results))
}

async fn execute_single_entry(
    db: &State<'_, Db>,
    client: &State<'_, Client>,
    entry: &ReplayEntry,
    session: &ReplaySession,
    all_vars: &HashMap<String, String>,
    run_id: &str,
) -> ReplayEntryResult {
    let now = chrono::Utc::now().to_rfc3339();
    let result_id = uuid::Uuid::new_v4().to_string();

    let remapped_url = apply_remap_rules(&entry.original_request.url, &session.remap_rules);

    let mut request = entry.original_request.clone();
    request.url = substitute_variables(&remapped_url, all_vars);
    request.body = substitute_variables(&request.body, all_vars);
    for kv in &mut request.headers {
        if kv.enabled {
            kv.value = substitute_variables(&kv.value, all_vars);
        }
    }

    match should_chaos(&session.chaos_config) {
        Some(ChaosAction::Timeout) => {
            let assertion_results: Vec<AssertionResult> = session.assertions.iter()
                .map(|a| AssertionResult {
                    id: a.id.clone(),
                    assertion_type: a.assertion_type.clone(),
                    expression: a.expression.clone(),
                    expected: a.expected.clone(),
                    passed: false,
                    actual: Some("Chaos: timeout injected".to_string()),
                    enabled: a.enabled,
                })
                .collect();
            return ReplayEntryResult {
                id: result_id, run_id: run_id.to_string(), entry_id: entry.id.clone(),
                status: EntryResultStatus::Failed,
                replayed_request: Some(request), replayed_response: None,
                diff: None, assertion_results, error: Some("Chaos: simulated timeout".to_string()),
                created_at: now,
            };
        }
        Some(ChaosAction::Error(code)) => {
            let fake_response = crate::models::HttpResponse {
                status: code, status_text: format!("Chaos Error {}", code),
                headers: vec![], cookies: vec![], body: format!("{{\"error\": \"Chaos injected {}\"}}", code),
                body_base64: None, size: 0, time_ms: 0,
                script_logs: vec![], test_results: vec![], modified_variables: vec![],
            };
            let diff = compute_full_diff(&entry.original_response, &fake_response);
            let assertion_results: Vec<AssertionResult> = session.assertions.iter()
                .map(|a| evaluate_assertion(a, &fake_response))
                .collect();
            return ReplayEntryResult {
                id: result_id, run_id: run_id.to_string(), entry_id: entry.id.clone(),
                status: EntryResultStatus::Completed,
                replayed_request: Some(request), replayed_response: Some(fake_response),
                diff: Some(diff), assertion_results, error: None,
                created_at: now,
            };
        }
        Some(ChaosAction::Delay(ms)) => {
            tokio::time::sleep(Duration::from_millis(ms)).await;
        }
        None => {}
    }

    let domain = extract_domain(&request.url);
    let stored_cookies = match domain {
        Some(ref d) => {
            let conn = db.0.lock().map_err(|e| e.to_string()).ok();
            match conn {
                Some(c) => load_cookies_for_domain_conn(&c, d).unwrap_or_default(),
                None => vec![],
            }
        }
        None => vec![],
    };

    match execute_request(client, &request, &stored_cookies).await {
        Ok((response, new_cookies)) => {
            if !new_cookies.is_empty() {
                if let Ok(conn) = db.0.lock() {
                    for c in &new_cookies {
                        let _ = save_cookie_to_db(&conn, c);
                    }
                }
            }

            let diff = compute_full_diff(&entry.original_response, &response);
            let assertion_results: Vec<AssertionResult> = session.assertions.iter()
                .map(|a| evaluate_assertion(a, &response))
                .collect();

            let has_failed = assertion_results.iter().any(|a| a.enabled && !a.passed);

            ReplayEntryResult {
                id: result_id, run_id: run_id.to_string(), entry_id: entry.id.clone(),
                status: if has_failed { EntryResultStatus::Failed } else { EntryResultStatus::Completed },
                replayed_request: Some(request), replayed_response: Some(response),
                diff: Some(diff), assertion_results, error: None,
                created_at: now,
            }
        }
        Err(err) => {
            let assertion_results: Vec<AssertionResult> = session.assertions.iter()
                .map(|a| AssertionResult {
                    id: a.id.clone(),
                    assertion_type: a.assertion_type.clone(),
                    expression: a.expression.clone(),
                    expected: a.expected.clone(),
                    passed: false,
                    actual: None,
                    enabled: a.enabled,
                })
                .collect();
            ReplayEntryResult {
                id: result_id, run_id: run_id.to_string(), entry_id: entry.id.clone(),
                status: EntryResultStatus::Failed,
                replayed_request: Some(request), replayed_response: None,
                diff: None, assertion_results, error: Some(err),
                created_at: now,
            }
        }
    }
}

pub async fn execute_single_step(
    db: &State<'_, Db>,
    client: &State<'_, Client>,
    entry: &ReplayEntry,
    session: &ReplaySession,
    environment_id: Option<&str>,
) -> ReplayEntryResult {
    let env_vars: HashMap<String, String> = match environment_id {
        Some(env_id) => {
            let conn = db.0.lock().map_err(|e| e.to_string()).ok();
            match conn {
                Some(c) => get_environment_by_id(&c, env_id).ok().flatten()
                    .map(|e| e.variables.into_iter()
                        .filter(|v| v.enabled && !v.key.is_empty())
                        .map(|v| (v.key, v.value))
                        .collect()
                    ).unwrap_or_default(),
                None => HashMap::new(),
            }
        }
        None => HashMap::new(),
    };

    let global_vars = get_global_variables(db).unwrap_or_else(|_| crate::models::GlobalVariables {
        id: String::new(), variables: vec![], created_at: String::new(), updated_at: String::new(),
    });

    let all_vars: HashMap<String, String> = {
        let mut m = HashMap::new();
        for v in &global_vars.variables {
            if v.enabled && !v.key.is_empty() { m.insert(v.key.clone(), v.value.clone()); }
        }
        for (k, v) in &env_vars { m.insert(k.clone(), v.clone()); }
        m
    };

    let now = chrono::Utc::now().to_rfc3339();
    let result_id = uuid::Uuid::new_v4().to_string();
    let run_id = uuid::Uuid::new_v4().to_string();

    let mut request = entry.original_request.clone();
    let remapped_url = apply_remap_rules(&entry.original_request.url, &session.remap_rules);
    request.url = substitute_variables(&remapped_url, &all_vars);
    request.body = substitute_variables(&request.body, &all_vars);
    for kv in &mut request.headers {
        if kv.enabled { kv.value = substitute_variables(&kv.value, &all_vars); }
    }

    let domain = extract_domain(&request.url);
    let stored_cookies = match domain {
        Some(ref d) => {
            let conn = db.0.lock().ok();
            match conn {
                Some(c) => load_cookies_for_domain_conn(&c, d).unwrap_or_default(),
                None => vec![],
            }
        }
        None => vec![],
    };

    match execute_request(client, &request, &stored_cookies).await {
        Ok((response, new_cookies)) => {
            if !new_cookies.is_empty() {
                if let Ok(conn) = db.0.lock() {
                    for c in &new_cookies { let _ = save_cookie_to_db(&conn, c); }
                }
            }
            let diff = compute_full_diff(&entry.original_response, &response);
            let assertion_results: Vec<AssertionResult> = session.assertions.iter()
                .map(|a| evaluate_assertion(a, &response))
                .collect();
            let has_failed = assertion_results.iter().any(|a| a.enabled && !a.passed);
            ReplayEntryResult {
                id: result_id, run_id: run_id, entry_id: entry.id.clone(),
                status: if has_failed { EntryResultStatus::Failed } else { EntryResultStatus::Completed },
                replayed_request: Some(request), replayed_response: Some(response),
                diff: Some(diff), assertion_results, error: None,
                created_at: now,
            }
        }
        Err(err) => ReplayEntryResult {
            id: result_id, run_id: run_id, entry_id: entry.id.clone(),
            status: EntryResultStatus::Failed,
            replayed_request: Some(request), replayed_response: None,
            diff: None, assertion_results: vec![], error: Some(err),
            created_at: now,
        }
    }
}

fn substitute_variables(input: &str, vars: &HashMap<String, String>) -> String {
    let mut result = input.to_string();
    for (key, value) in vars {
        result = result.replace(&format!("{{{{%{}%}}}}", key), value);
        result = result.replace(&format!("{{{{{}}}}}", key), value);
    }
    result
}
