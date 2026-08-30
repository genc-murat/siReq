use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::State;
use crate::models::*;
use crate::storage::*;
use crate::http::*;
use crate::scripts::*;
use crate::variables::*;
use crate::secrets::*;
use crate::grpc::{self, GrpcState};

#[tauri::command]
pub async fn send_request(
    request: HttpRequest,
    environment_id: Option<String>,
    db: State<'_, Db>,
    handles: State<'_, RequestHandles>,
) -> Result<HttpResponse, String> {
    // Load global variables
    let global_vars = get_global_variables(&db)?;

    // Load environment variables
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

    // Step 1: Execute pre-request script (uses raw env vars, before substitution)
    let (modified_request, pre_script_results) = execute_pre_request(
        &request.pre_script,
        &request,
        &env_vars,
    )?;

    // Merge any variables set by the pre-script
    let script_vars = pre_script_results.modified_variables.clone();

    // Step 2: Apply full variable resolution (dynamic -> global -> env -> script)
    let resolved = apply_variables(
        &modified_request,
        &global_vars.variables,
        &[], // No collection vars for single request
        &env_vars,
        &script_vars,
    );

    // Load stored cookies for the request domain
    let stored_cookies: Vec<StoredCookie> = load_cookies_for_url(&db, &resolved.url)?;
    let request_client = crate::http::build_client_for_settings(&resolved.settings)?;

    let request_id = request.id.clone();
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(HttpResponse, Vec<StoredCookie>), String>>();

    let handle = tokio::spawn(async move {
        let result = execute_request(&request_client, &resolved, &stored_cookies).await;
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

    // Build a merged env for the post script (including script-modified vars)
    let post_script_env: HashMap<String, String> = env_vars.clone();

    // Step 3: Execute post-response script
    let post_script_results = execute_post_response(
        &request.post_script,
        &modified_request,
        &response,
        &post_script_env,
    )?;

    // Step 4: Execute variable extractions
    let extracted_vars = execute_extractions(
        &request.extractions,
        &response.body,
    ).unwrap_or_default();

    // Step 5: Collect all modified variables from pre and post scripts + extractions
    let mut all_modified_vars = pre_script_results.modified_variables.clone();
    all_modified_vars.extend(post_script_results.modified_variables.clone());
    for (var_name, var_value) in &extracted_vars {
        all_modified_vars.push(KeyValue {
            key: var_name.clone(),
            value: var_value.clone(),
            enabled: true,
            is_secret: false,
        });
    }

    // Step 6: Persist modified variables back to the environment in DB
    if let Some(ref env_id) = environment_id {
        if !all_modified_vars.is_empty() {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            if let Some(mut env) = get_environment_by_id(&conn, env_id)? {
                for kv in &all_modified_vars {
                    // Update existing variable or add new one
                    if let Some(existing) = env.variables.iter_mut().find(|v| v.key == kv.key) {
                        existing.value = kv.value.clone();
                        existing.enabled = true;
                    } else {
                        env.variables.push(kv.clone());
                    }
                }
                env.updated_at = chrono::Utc::now().to_rfc3339();
                let vars_json = serde_json::to_string(&env.variables).map_err(|e| e.to_string())?;
                conn.execute(
                    "UPDATE environments SET variables = ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![vars_json, env.updated_at, env.id],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    // Step 7: Attach script results and extracted variables to response
    let mut response_with_scripts = response.clone();
    let mut all_logs = pre_script_results.logs.clone();
    all_logs.extend(post_script_results.logs.clone());
    let mut all_tests = pre_script_results.tests.clone();
    all_tests.extend(post_script_results.tests.clone());
    let mut all_errors = pre_script_results.errors.clone();
    all_errors.extend(post_script_results.errors.clone());

    response_with_scripts.script_logs = all_logs;
    response_with_scripts.test_results = all_tests;

    if !all_errors.is_empty() {
        response_with_scripts.script_logs.push(ScriptLog {
            level: "error".to_string(),
            message: all_errors.join("\n"),
        });
    }

    // Smart history: if the same request (method + url + body) was the most
    // recent entry, update it in-place instead of creating a duplicate.
    match find_latest_history_by_fingerprint(&db, &request) {
        Ok(Some(existing)) => {
            let _ = update_history_entry_response(&db, &existing.id, &response_with_scripts);
        }
        _ => {
            let entry = HistoryEntry {
                id: uuid::Uuid::new_v4().to_string(),
                request,
                response: response_with_scripts.clone(),
                created_at: chrono::Utc::now().to_rfc3339(),
            };
            let _ = save_history_with_conn(&db, &entry);
        }
    }
    Ok(response_with_scripts)
}

#[tauri::command]
pub async fn cancel_request(
    request_id: String,
    handles: State<'_, RequestHandles>,
) -> Result<(), String> {
    crate::http::cancel_request(&handles, &request_id)
}

/// Load stored cookies matching the host of `url`.
/// Returns an empty vec if the URL cannot be parsed or has no host.
fn load_cookies_for_url(db: &State<'_, Db>, url: &str) -> Result<Vec<StoredCookie>, String> {
    match extract_domain(url) {
        Some(domain) => {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let cookies = load_cookies_for_domain_conn(&conn, &domain)?;
            drop(conn);
            Ok(cookies)
        }
        None => Ok(vec![]),
    }
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

#[tauri::command]
pub async fn benchmark_request(
    request: HttpRequest,
    count: u64,
    environment_id: Option<String>,
    db: State<'_, Db>,
) -> Result<BenchmarkResult, String> {
    use std::time::Instant;

    if count == 0 || count > 1000 {
        return Err("Count must be between 1 and 1000".to_string());
    }

    // Resolve environment variables
    let global_vars = crate::storage::get_global_variables(&db)?;
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
    let resolved = apply_variables(&request, &global_vars.variables, &[], &env_vars, &[]);

    // Build a single client honoring request settings (timeout/redirects/SSL/proxy)
    // and reuse it across all iterations to benefit from keep-alive connection pooling.
    let client = crate::http::build_client_for_settings(&resolved.settings)?;
    let stored_cookies: Vec<StoredCookie> = vec![];

    let mut times_ms: Vec<u64> = Vec::with_capacity(count as usize);
    let mut statuses: Vec<u16> = Vec::with_capacity(count as usize);
    let mut errors: Vec<String> = Vec::new();
    let mut total_bytes: u64 = 0;

    // NOTE: Benchmark intentionally measures raw HTTP timing only — pre/post scripts,
    // extractions, and cookie persistence are skipped to keep measurements consistent.
    for _ in 0..count {
        let start = Instant::now();
        match execute_request(&client, &resolved, &stored_cookies).await {
            Ok((resp, _)) => {
                times_ms.push(start.elapsed().as_millis() as u64);
                statuses.push(resp.status);
                total_bytes += resp.size;
            }
            Err(e) => {
                times_ms.push(start.elapsed().as_millis() as u64);
                errors.push(e);
            }
        }
    }

    let total = times_ms.len() as u64;
    let success_count = statuses.len() as u64;
    let failure_count = errors.len() as u64;
    let mut sorted = times_ms.clone();
    sorted.sort_unstable();

    let avg_ms = if total > 0 {
        let sum: u64 = times_ms.iter().sum();
        sum as f64 / total as f64
    } else {
        0.0
    };

    let min_ms = *sorted.first().unwrap_or(&0);
    let max_ms = *sorted.last().unwrap_or(&0);
    let median_ms = percentile(&sorted, 50.0);
    let p95_ms = percentile(&sorted, 95.0);
    let p99_ms = percentile(&sorted, 99.0);

    let result = BenchmarkResult {
        iterations: count,
        times_ms,
        min_ms,
        max_ms,
        avg_ms,
        median_ms,
        p95_ms,
        p99_ms,
        success_count,
        failure_count,
        statuses,
        errors,
        total_bytes,
    };

    // Auto-save to benchmark history
    let history_entry = BenchmarkHistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        request: request.clone(),
        result: result.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = save_benchmark_history(&db, &history_entry);

    Ok(result)
}

fn percentile(sorted: &[u64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((p / 100.0) * (sorted.len() as f64 - 1.0)).round() as usize;
    sorted[idx.min(sorted.len() - 1)] as f64
}

#[tauri::command]
pub fn get_benchmark_history(
    limit: i64,
    offset: i64,
    db: State<'_, Db>,
) -> Result<Vec<BenchmarkHistoryEntry>, String> {
    get_benchmark_history_list(&db, limit, offset)
}

#[tauri::command]
pub fn delete_benchmark_history(
    id: String,
    db: State<'_, Db>,
) -> Result<(), String> {
    delete_benchmark_history_entry(&db, &id)
}

#[tauri::command]
pub fn clear_benchmark_history(db: State<'_, Db>) -> Result<(), String> {
    clear_all_benchmark_history(&db)
}

// --- Global variables ---

#[tauri::command]
pub fn get_global_variables_cmd(
    db: State<'_, Db>,
) -> Result<GlobalVariables, String> {
    get_global_variables(&db)
}

#[tauri::command]
pub fn save_global_variables_cmd(
    global: GlobalVariables,
    db: State<'_, Db>,
) -> Result<(), String> {
    save_global_variables(&db, &global)
}

// --- Secret management ---

#[tauri::command]
pub fn encrypt_secret_value(
    plaintext: String,
) -> Result<String, String> {
    encrypt_secret(&plaintext)
}

#[tauri::command]
pub fn decrypt_secret_value(
    ciphertext: String,
) -> Result<String, String> {
    decrypt_secret(&ciphertext)
}

// --- Postman collection import/export ---

#[tauri::command]
pub fn import_postman_collection(
    spec_content: String,
    collection_name: Option<String>,
    db: State<'_, Db>,
) -> Result<Collection, String> {
    let collection = crate::postman_parser::parse_postman_collection(
        &spec_content,
        collection_name.as_deref(),
    )?;
    // Save to database
    insert_collection(&db, &collection)?;
    Ok(collection)
}

#[tauri::command]
pub fn export_postman_collection(
    collection_id: String,
    db: State<'_, Db>,
) -> Result<String, String> {
    let collections = get_all_collections(&db)?;
    let collection = collections.into_iter()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| "Collection not found".to_string())?;
    crate::postman_parser::export_to_postman(&collection)
}

// --- Collection runner commands ---

#[tauri::command]
pub async fn run_collection(
    collection_id: String,
    environment_id: Option<String>,
    delay_ms: u64,
    stop_on_failure: bool,
    db: State<'_, Db>,
) -> Result<CollectionRunResult, String> {
    // Load the collection
    let collections = get_all_collections(&db)?;
    let collection = collections.into_iter()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| "Collection not found".to_string())?;

    // Load global variables
    let global_vars = get_global_variables(&db)?;

    // Load collection variables (already on the collection object)
    let collection_vars = collection.variables.clone();

    // Load environment variables if specified
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

    let started_at = chrono::Utc::now().to_rfc3339();
    let start_instant = Instant::now();
    let mut results: Vec<RunRequestResult> = Vec::new();
    let mut passed: u32 = 0;
    let mut failed: u32 = 0;

    // ── Request Chaining: accumulated vars extracted during the run ──
    // These flow from one request to the next, at env-var priority level.
    let mut run_vars: HashMap<String, String> = HashMap::new();

    let flat_requests = flatten_collection_items(&collection.items);
    let total = flat_requests.len();

    for (idx, request) in flat_requests.iter().enumerate() {
        // Inherit collection auth if request has none
        let effective_request = if request.auth.auth_type == AuthType::none {
            if let Some(ref col_auth) = collection.auth {
                let mut r = (*request).clone();
                r.auth = col_auth.clone();
                r
            } else {
                (*request).clone()
            }
        } else {
            (*request).clone()
        };

        // Merge run_vars into env so extracted variables from previous
        // requests are available as {{variable}} in subsequent requests.
        let merged_env: HashMap<String, String> = {
            let mut m = env_vars.clone();
            for (k, v) in &run_vars {
                m.insert(k.clone(), v.clone());
            }
            m
        };

        // Step 1: Execute pre-request script (gets access to chained vars)
        let (modified_request, pre_script_results) = execute_pre_request(
            &effective_request.pre_script,
            &effective_request,
            &merged_env,
        )?;

        // Script variables (from pre-script pm.variables.set())
        let script_vars = pre_script_results.modified_variables.clone();

        // Step 2: Apply full variable resolution (dynamic -> global -> collection -> env -> run_vars -> script)
        let resolved = apply_variables(
            &modified_request,
            &global_vars.variables,
            &collection_vars,
            &merged_env,
            &script_vars,
        );

        let stored_cookies: Vec<StoredCookie> = load_cookies_for_url(&db, &resolved.url)?;

        let request_start = Instant::now();

        // Step 3: Execute the request using a dedicated client honoring per-request settings
        let client = crate::http::build_client_for_settings(&resolved.settings)?;

            let req_result = match execute_request(&client, &resolved, &stored_cookies).await {
            Ok((response, new_cookies)) => {
                let elapsed = response.time_ms;

                // Persist any new cookies from Set-Cookie headers
                if !new_cookies.is_empty() {
                    let conn = db.0.lock().map_err(|e| e.to_string())?;
                    for cookie in &new_cookies {
                        let _ = save_cookie_to_db(&conn, cookie);
                    }
                }

                // Step 4: Execute post-response script
                let post_script_results = execute_post_response(
                    &request.post_script,
                    &modified_request,
                    &response,
                    &merged_env,
                )?;

                // Step 5: Collect all script results
                let mut all_logs = pre_script_results.logs.clone();
                all_logs.extend(post_script_results.logs.clone());
                let mut all_tests = pre_script_results.tests.clone();
                all_tests.extend(post_script_results.tests.clone());
                let mut all_errors = pre_script_results.errors.clone();
                all_errors.extend(post_script_results.errors.clone());

                if !all_errors.is_empty() {
                    all_logs.push(ScriptLog {
                        level: "error".to_string(),
                        message: all_errors.join("\n"),
                    });
                }

                // Step 6: Execute variable extractions
                let extracted_vars = execute_extractions(
                    &request.extractions,
                    &response.body,
                ).unwrap_or_default();

                // ── Chain extracted vars to next request ──
                // Include both post-script modified vars and JSONPath extractions
                for kv in &post_script_results.modified_variables {
                    if kv.enabled && !kv.key.is_empty() {
                        run_vars.insert(kv.key.clone(), kv.value.clone());
                    }
                }
                for (var_name, var_value) in &extracted_vars {
                    run_vars.insert(var_name.clone(), var_value.clone());
                }

                let run_req = RunRequestResult {
                    request_name: request.name.clone(),
                    request_method: format!("{:?}", request.method),
                    request_url: request.url.clone(),
                    status_code: response.status,
                    status_text: response.status_text.clone(),
                    time_ms: elapsed,
                    size: response.size,
                    test_results: all_tests,
                    script_logs: all_logs,
                    error: None,
                    extracted_variables: extracted_vars,
                    iteration: None,
                };

                if response.status >= 200 && response.status < 400 {
                    passed += 1;
                } else {
                    failed += 1;
                }

                run_req
            }
            Err(e) => {
                let mut all_logs = pre_script_results.logs.clone();
                let mut all_errors = pre_script_results.errors.clone();
                all_errors.push(e.clone());
                if !all_errors.is_empty() {
                    all_logs.push(ScriptLog {
                        level: "error".to_string(),
                        message: all_errors.join("\n"),
                    });
                }

                failed += 1;

                RunRequestResult {
                    request_name: request.name.clone(),
                    request_method: format!("{:?}", request.method),
                    request_url: request.url.clone(),
                    status_code: 0,
                    status_text: String::new(),
                    time_ms: request_start.elapsed().as_millis() as u64,
                    size: 0,
                    test_results: pre_script_results.tests.clone(),
                    script_logs: all_logs,
                    error: Some(e),
                    extracted_variables: vec![],
                    iteration: None,
                }
            }
        };

        results.push(req_result);

        // Stop on failure if requested
        if stop_on_failure && failed > 0 {
            break;
        }

        // Delay between requests (but not after the last one)
        if delay_ms > 0 && idx < total - 1 {
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        }
    }

    let total_time_ms = start_instant.elapsed().as_millis() as u64;
    let completed_at = chrono::Utc::now().to_rfc3339();

    // Flatten accumulated run_vars for the result summary
    let all_extracted: Vec<(String, String)> = run_vars.into_iter().collect();

    let result = CollectionRunResult {
        id: uuid::Uuid::new_v4().to_string(),
        collection_id,
        collection_name: collection.name.clone(),
        environment_id,
        started_at,
        completed_at,
        delay_ms,
        stop_on_failure,
        results,
        total: (passed + failed),
        passed,
        failed,
        total_time_ms,
        extracted_variables: all_extracted,
        mode: RunMode::Functional,
        tags_filter: vec![],
        baseline_id: None,
    };

    // Save to run history
    let _ = save_run_result(&db, &result);

    Ok(result)
}

#[tauri::command]
pub fn get_run_history(
    limit: i64,
    offset: i64,
    db: State<'_, Db>,
) -> Result<Vec<CollectionRunResult>, String> {
    get_run_history_list(&db, limit, offset)
}

#[tauri::command]
pub fn delete_run_history(
    id: String,
    db: State<'_, Db>,
) -> Result<(), String> {
    delete_run_history_entry(&db, &id)
}

#[tauri::command]
pub fn clear_run_history(db: State<'_, Db>) -> Result<(), String> {
    clear_all_run_history(&db)
}

// ─── Data-driven runner command ────────────────────────────────────────

#[tauri::command]
pub async fn run_collection_data_driven(
    collection_id: String,
    environment_id: Option<String>,
    delay_ms: u64,
    stop_on_failure: bool,
    dataset: RunDataset,
    db: State<'_, Db>,
) -> Result<CollectionRunResult, String> {
    // Load collection
    let collections = get_all_collections(&db)?;
    let collection = collections.into_iter()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| "Collection not found".to_string())?;

    let global_vars = get_global_variables(&db)?;
    let collection_vars = collection.variables.clone();

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

    let started_at = chrono::Utc::now().to_rfc3339();
    let start_instant = Instant::now();
    let mut results: Vec<RunRequestResult> = Vec::new();
    let mut passed: u32 = 0;
    let mut failed: u32 = 0;

    let flat_requests = flatten_collection_items(&collection.items);
    let total = flat_requests.len();

    // For each dataset row, run through the collection
    for (row_idx, row) in dataset.rows.iter().enumerate() {
        // ── Request Chaining: per-iteration accumulator ──
        // Reset for each new iteration, but accumulates across requests within it.
        let mut run_vars: HashMap<String, String> = HashMap::new();

        // Merge dataset variables into base env (base env is constant across iterations)
        let mut iteration_env: HashMap<String, String> = env_vars.clone();
        for (k, v) in &row.values {
            iteration_env.insert(k.clone(), v.clone());
        }

        for (idx, request) in flat_requests.iter().enumerate() {
            // Inherit collection auth if request has none
            let effective_request = if request.auth.auth_type == AuthType::none {
                if let Some(ref col_auth) = collection.auth {
                    let mut r = (*request).clone();
                    r.auth = col_auth.clone();
                    r
                } else {
                    (*request).clone()
                }
            } else {
                (*request).clone()
            };

            // Merge run_vars into iteration_env so extracted variables from
            // previous requests are available as {{variable}} in subsequent ones.
            let merged_env: HashMap<String, String> = {
                let mut m = iteration_env.clone();
                for (k, v) in &run_vars {
                    m.insert(k.clone(), v.clone());
                }
                m
            };

            // Pre-request script
            let (modified_request, pre_script_results) = execute_pre_request(
                &effective_request.pre_script,
                &effective_request,
                &merged_env,
            )?;

            let script_vars = pre_script_results.modified_variables.clone();

            // Variable resolution (includes dataset vars + chained vars via merged_env)
            let resolved = apply_variables(
                &modified_request,
                &global_vars.variables,
                &collection_vars,
                &merged_env,
                &script_vars,
            );

            let stored_cookies: Vec<StoredCookie> = load_cookies_for_url(&db, &resolved.url)?;
            let request_start = Instant::now();

            let client = crate::http::build_client_for_settings(&resolved.settings)?;

        let req_result = match execute_request(&client, &resolved, &stored_cookies).await {
                Ok((response, new_cookies)) => {
                    let elapsed = response.time_ms;

                    // Persist any new cookies from Set-Cookie headers
                    if !new_cookies.is_empty() {
                        let conn = db.0.lock().map_err(|e| e.to_string())?;
                        for cookie in &new_cookies {
                            let _ = save_cookie_to_db(&conn, cookie);
                        }
                    }

                    let post_script_results = execute_post_response(
                        &request.post_script,
                        &modified_request,
                        &response,
                        &merged_env,
                    )?;

                    let extracted_vars = execute_extractions(
                        &request.extractions,
                        &response.body,
                    ).unwrap_or_default();

                    // ── Chain extracted vars to next request within this iteration ──
                    for kv in &post_script_results.modified_variables {
                        if kv.enabled && !kv.key.is_empty() {
                            run_vars.insert(kv.key.clone(), kv.value.clone());
                        }
                    }
                    for (var_name, var_value) in &extracted_vars {
                        run_vars.insert(var_name.clone(), var_value.clone());
                    }

                    let mut all_logs = pre_script_results.logs.clone();
                    all_logs.extend(post_script_results.logs.clone());
                    let mut all_tests = pre_script_results.tests.clone();
                    all_tests.extend(post_script_results.tests.clone());
                    let mut all_errors = pre_script_results.errors.clone();
                    all_errors.extend(post_script_results.errors.clone());

                    if !all_errors.is_empty() {
                        all_logs.push(ScriptLog {
                            level: "error".to_string(),
                            message: all_errors.join("\n"),
                        });
                    }

                    if response.status >= 200 && response.status < 400 {
                        passed += 1;
                    } else {
                        failed += 1;
                    }

                    RunRequestResult {
                        request_name: format!("[Iteration {}] {}", row_idx + 1, request.name),
                        request_method: format!("{:?}", request.method),
                        request_url: request.url.clone(),
                        status_code: response.status,
                        status_text: response.status_text.clone(),
                        time_ms: elapsed,
                        size: response.size,
                        test_results: all_tests,
                        script_logs: all_logs,
                        error: None,
                        extracted_variables: extracted_vars,
                        iteration: Some(row_idx),
                    }
                }
                Err(e) => {
                    let mut all_logs = pre_script_results.logs.clone();
                    let mut all_errors = pre_script_results.errors.clone();
                    all_errors.push(e.clone());
                    if !all_errors.is_empty() {
                        all_logs.push(ScriptLog {
                            level: "error".to_string(),
                            message: all_errors.join("\n"),
                        });
                    }

                    failed += 1;

                    RunRequestResult {
                        request_name: format!("[Iteration {}] {}", row_idx + 1, request.name),
                        request_method: format!("{:?}", request.method),
                        request_url: request.url.clone(),
                        status_code: 0,
                        status_text: String::new(),
                        time_ms: request_start.elapsed().as_millis() as u64,
                        size: 0,
                        test_results: pre_script_results.tests.clone(),
                        script_logs: all_logs,
                        error: Some(e),
                        extracted_variables: vec![],
                        iteration: Some(row_idx),
                    }
                }
            };

            results.push(req_result);

            if stop_on_failure && failed > 0 {
                break;
            }

            if delay_ms > 0 && (row_idx < dataset.rows.len() - 1 || idx < total - 1) {
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            }
        }

        if stop_on_failure && failed > 0 {
            break;
        }
    }

    let total_time_ms = start_instant.elapsed().as_millis() as u64;
    let completed_at = chrono::Utc::now().to_rfc3339();

    // Collect all unique extracted variables across results for the summary
    let all_extracted: Vec<(String, String)> = {
        let mut seen = std::collections::HashSet::new();
        results.iter()
            .flat_map(|r| r.extracted_variables.clone())
            .filter(|(k, _)| seen.insert(k.clone()))
            .collect()
    };

    let result = CollectionRunResult {
        id: uuid::Uuid::new_v4().to_string(),
        collection_id,
        collection_name: format!("{} (Data-driven)", collection.name),
        environment_id,
        started_at,
        completed_at,
        delay_ms,
        stop_on_failure,
        results,
        total: (passed + failed),
        passed,
        failed,
        total_time_ms,
        extracted_variables: all_extracted,
        mode: RunMode::Functional,
        tags_filter: vec![],
        baseline_id: None,
    };

    let _ = save_run_result(&db, &result);

    Ok(result)
}

// ─── Test Suite: unified runner for Functional / Smoke / Regression / Load ─

/// Filter a flat list of collection requests by the requested tags (OR semantics).
/// Returns the original list if `tags` is empty (no filter = include all).
fn filter_requests_by_tags<'a>(
    requests: &'a [&HttpRequest],
    tags: &[String],
) -> Vec<&'a HttpRequest> {
    if tags.is_empty() {
        requests.to_vec()
    } else {
        requests
            .iter()
            .copied()
            .filter(|r| tags.iter().any(|t| r.tags.iter().any(|rt| rt == t)))
            .collect()
    }
}

/// Unified test suite runner. Currently supports:
/// - `Functional`: identical to `run_collection` (no filtering)
/// - `Smoke`: filters requests by `config.tags` (OR semantics)
/// - `Regression`/`Load`: reserved for future phases; currently behave like Functional
///
/// The result is persisted in `run_history` with the active `mode` column so
/// the UI can split smoke runs from functional runs in the history list.
#[tauri::command]
pub async fn run_test_suite(
    collection_id: String,
    mode: RunMode,
    environment_id: Option<String>,
    config: TestSuiteConfig,
    db: State<'_, Db>,
) -> Result<CollectionRunResult, String> {
    // Load the collection
    let collections = get_all_collections(&db)?;
    let collection = collections.into_iter()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| "Collection not found".to_string())?;

    // Load global + collection + environment variables
    let global_vars = get_global_variables(&db)?;
    let collection_vars = collection.variables.clone();
    let env_vars: HashMap<String, String> = match &environment_id {
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

    // Flatten and (optionally) filter by tags. Smoke mode without tags acts as
    // a plain functional run (sensible default rather than running nothing).
    let flat_refs: Vec<&HttpRequest> = flatten_collection_items(&collection.items);
    let filtered_refs: Vec<&HttpRequest> = match mode {
        RunMode::Smoke => filter_requests_by_tags(&flat_refs, &config.tags),
        // Functional / Regression / Load: no tag filtering in this phase.
        // Regression will add baseline diffing; Load will replace the engine.
        _ => flat_refs,
    };

    let total = filtered_refs.len();
    if total == 0 {
        return Err(format!(
            "No requests match the current {} configuration (collection '{}')",
            match mode {
                RunMode::Smoke => "smoke tag",
                RunMode::Regression => "regression",
                RunMode::Load => "load",
                RunMode::Functional => "functional",
            },
            collection.name
        ));
    }

    let delay_ms = config.delay_ms;
    let stop_on_failure = config.stop_on_failure;

    let started_at = chrono::Utc::now().to_rfc3339();
    let start_instant = Instant::now();
    let mut results: Vec<RunRequestResult> = Vec::with_capacity(total);
    let mut passed: u32 = 0;
    let mut failed: u32 = 0;
    let mut run_vars: HashMap<String, String> = HashMap::new();

    for (idx, request) in filtered_refs.iter().enumerate() {
        // Inherit collection auth if request has none
        let effective_request = if request.auth.auth_type == AuthType::none {
            if let Some(ref col_auth) = collection.auth {
                let mut r = (*request).clone();
                r.auth = col_auth.clone();
                r
            } else {
                (*request).clone()
            }
        } else {
            (*request).clone()
        };

        // Merge run_vars into env (chained extractions from prior requests)
        let merged_env: HashMap<String, String> = {
            let mut m = env_vars.clone();
            for (k, v) in &run_vars {
                m.insert(k.clone(), v.clone());
            }
            m
        };

        let (modified_request, pre_script_results) = execute_pre_request(
            &effective_request.pre_script,
            &effective_request,
            &merged_env,
        )?;
        let script_vars = pre_script_results.modified_variables.clone();

        let resolved = apply_variables(
            &modified_request,
            &global_vars.variables,
            &collection_vars,
            &merged_env,
            &script_vars,
        );

        let stored_cookies = load_cookies_for_url(&db, &resolved.url)?;
        let request_start = Instant::now();
        let client = crate::http::build_client_for_settings(&resolved.settings)?;

        let req_result = match execute_request(&client, &resolved, &stored_cookies).await {
            Ok((response, new_cookies)) => {
                let elapsed = response.time_ms;

                if !new_cookies.is_empty() {
                    let conn = db.0.lock().map_err(|e| e.to_string())?;
                    for cookie in &new_cookies {
                        let _ = save_cookie_to_db(&conn, cookie);
                    }
                }

                let post_script_results = execute_post_response(
                    &request.post_script,
                    &modified_request,
                    &response,
                    &merged_env,
                )?;

                let mut all_logs = pre_script_results.logs.clone();
                all_logs.extend(post_script_results.logs.clone());
                let mut all_tests = pre_script_results.tests.clone();
                all_tests.extend(post_script_results.tests.clone());
                let mut all_errors = pre_script_results.errors.clone();
                all_errors.extend(post_script_results.errors.clone());

                if !all_errors.is_empty() {
                    all_logs.push(ScriptLog {
                        level: "error".to_string(),
                        message: all_errors.join("\n"),
                    });
                }

                let extracted_vars = execute_extractions(
                    &request.extractions,
                    &response.body,
                ).unwrap_or_default();

                for kv in &post_script_results.modified_variables {
                    if kv.enabled && !kv.key.is_empty() {
                        run_vars.insert(kv.key.clone(), kv.value.clone());
                    }
                }
                for (var_name, var_value) in &extracted_vars {
                    run_vars.insert(var_name.clone(), var_value.clone());
                }

                if response.status >= 200 && response.status < 400 {
                    passed += 1;
                } else {
                    failed += 1;
                }

                RunRequestResult {
                    request_name: request.name.clone(),
                    request_method: format!("{:?}", request.method),
                    request_url: request.url.clone(),
                    status_code: response.status,
                    status_text: response.status_text.clone(),
                    time_ms: elapsed,
                    size: response.size,
                    test_results: all_tests,
                    script_logs: all_logs,
                    error: None,
                    extracted_variables: extracted_vars,
                    iteration: None,
                }
            }
            Err(e) => {
                let mut all_logs = pre_script_results.logs.clone();
                let mut all_errors = pre_script_results.errors.clone();
                all_errors.push(e.clone());
                if !all_errors.is_empty() {
                    all_logs.push(ScriptLog {
                        level: "error".to_string(),
                        message: all_errors.join("\n"),
                    });
                }
                failed += 1;
                RunRequestResult {
                    request_name: request.name.clone(),
                    request_method: format!("{:?}", request.method),
                    request_url: request.url.clone(),
                    status_code: 0,
                    status_text: String::new(),
                    time_ms: request_start.elapsed().as_millis() as u64,
                    size: 0,
                    test_results: pre_script_results.tests.clone(),
                    script_logs: all_logs,
                    error: Some(e),
                    extracted_variables: vec![],
                    iteration: None,
                }
            }
        };

        results.push(req_result);

        if stop_on_failure && failed > 0 {
            break;
        }

        if delay_ms > 0 && idx < total - 1 {
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        }
    }

    let total_time_ms = start_instant.elapsed().as_millis() as u64;
    let completed_at = chrono::Utc::now().to_rfc3339();
    let all_extracted: Vec<(String, String)> = run_vars.into_iter().collect();

    let collection_name = match mode {
        RunMode::Smoke if !config.tags.is_empty() => {
            format!("{} (Smoke: {})", collection.name, config.tags.join(", "))
        }
        RunMode::Smoke => format!("{} (Smoke)", collection.name),
        RunMode::Regression => format!("{} (Regression)", collection.name),
        RunMode::Load => format!("{} (Load)", collection.name),
        RunMode::Functional => collection.name.clone(),
    };

    let result = CollectionRunResult {
        id: uuid::Uuid::new_v4().to_string(),
        collection_id,
        collection_name,
        environment_id,
        started_at,
        completed_at,
        delay_ms,
        stop_on_failure,
        results,
        total: (passed + failed),
        passed,
        failed,
        total_time_ms,
        extracted_variables: all_extracted,
        mode,
        tags_filter: config.tags.clone(),
        baseline_id: config.baseline_id.clone(),
    };

    let _ = save_run_result(&db, &result);
    Ok(result)
}

// ─── Tree manipulation commands ────────────────────────────────────────

#[tauri::command]
pub fn create_collection_folder(
    collection_id: String,
    parent_folder_id: Option<String>,
    name: String,
    db: State<'_, Db>,
) -> Result<Collection, String> {
    add_collection_folder(&db, &collection_id, parent_folder_id.as_deref(), &name)
}

#[tauri::command]
pub fn add_request_to_collection(
    collection_id: String,
    parent_folder_id: Option<String>,
    request: HttpRequest,
    position: Option<usize>,
    db: State<'_, Db>,
) -> Result<Collection, String> {
    add_collection_request(&db, &collection_id, parent_folder_id.as_deref(), request, position)
}

#[tauri::command]
pub fn delete_collection_item(
    collection_id: String,
    item_id: String,
    db: State<'_, Db>,
) -> Result<Collection, String> {
    delete_collection_item_by_id(&db, &collection_id, &item_id)
}

#[tauri::command]
pub fn move_collection_item(
    collection_id: String,
    item_id: String,
    target_folder_id: Option<String>,
    target_index: usize,
    db: State<'_, Db>,
) -> Result<Collection, String> {
    move_collection_item_in_tree(&db, &collection_id, &item_id, target_folder_id.as_deref(), target_index)
}

// ─── Template commands ──────────────────────────────────────────────────

#[tauri::command]
pub fn get_templates(db: State<'_, Db>) -> Result<Vec<RequestTemplate>, String> {
    get_all_templates(&db)
}

#[tauri::command]
pub fn create_template(
    name: String,
    description: String,
    request: HttpRequest,
    scope: String,
    db: State<'_, Db>,
) -> Result<RequestTemplate, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let template = RequestTemplate {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        description,
        request,
        scope,
        created_at: now.clone(),
        updated_at: now,
    };
    create_new_template(&db, &template)?;
    Ok(template)
}

#[tauri::command]
pub fn delete_template(id: String, db: State<'_, Db>) -> Result<(), String> {
    delete_existing_template(&db, &id)
}

// ─── gRPC commands ──────────────────────────────────────────────────────

#[tauri::command]
pub fn grpc_parse_proto(
    content: String,
    state: State<'_, GrpcState>,
) -> Result<GrpcDescriptorSet, String> {
    grpc::parse_proto(&content, &state)
}

/// Resolve `{{$dynamic}}` and `{{variable}}` patterns in a gRPC input string.
fn resolve_grpc_input(input: &str, db: &State<'_, Db>, environment_id: &Option<String>) -> Result<String, String> {
    // First resolve dynamic variables ({{$timestamp}}, {{$uuid}}, etc.)
    let mut resolved = crate::variables::resolve_dynamic_vars(input);

    // Load global variables
    let global_vars = crate::storage::get_global_variables(db)?;

    // Load environment variables if specified
    let env_vars: HashMap<String, String> = match environment_id {
        Some(ref env_id) => {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let env = crate::storage::get_environment_by_id(&conn, env_id)?;
            drop(conn);
            env.map(|e| e.variables.into_iter()
                .filter(|v| v.enabled && !v.key.is_empty())
                .map(|v| (v.key, v.value))
                .collect()
            ).unwrap_or_default()
        }
        None => HashMap::new()
    };

    // Build variable map (global → env)
    let map = crate::variables::build_variable_map(&global_vars.variables, &[], &env_vars, &[]);

    // Substitute {{key}} patterns
    for (key, value) in &map {
        let pattern = format!("{{{{{}}}}}", key);
        resolved = resolved.replace(&pattern, value);
    }

    Ok(resolved)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn grpc_call_unary(
    address: String,
    tls: bool,
    proto_id: String,
    service_name: String,
    method_name: String,
    input_json: String,
    environment_id: Option<String>,
    state: State<'_, GrpcState>,
    db: State<'_, Db>,
) -> Result<GrpcResponse, String> {
    let resolved_input = resolve_grpc_input(&input_json, &db, &environment_id)?;
    let pool = grpc::get_pool(&state, &proto_id)?;
    let result = grpc::call_unary(&address, tls, &pool, &service_name, &method_name, &resolved_input).await;
    // Save to history
    let entry = GrpcHistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        address: address.clone(),
        tls,
        service_name: service_name.clone(),
        method_name: method_name.clone(),
        method_kind: "Unary".to_string(),
        proto_content: None,
        input_json: Some(input_json.clone()),
        input_jsons: vec![],
        responses: match &result {
            Ok(r) => vec![r.clone()],
            Err(_) => vec![],
        },
        error: match &result {
            Ok(_) => None,
            Err(e) => Some(e.clone()),
        },
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = save_grpc_history_entry(&db, &entry);
    result
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn grpc_call_client_streaming(
    address: String,
    tls: bool,
    proto_id: String,
    service_name: String,
    method_name: String,
    input_jsons: Vec<String>,
    environment_id: Option<String>,
    state: State<'_, GrpcState>,
    db: State<'_, Db>,
) -> Result<GrpcResponse, String> {
    let pool = grpc::get_pool(&state, &proto_id)?;
    // Save original inputs before resolution (for history)
    let original_inputs = input_jsons.clone();
    let resolved_inputs: Result<Vec<String>, String> = input_jsons.iter().map(|j| resolve_grpc_input(j, &db, &environment_id)).collect();
    let resolved_inputs = resolved_inputs?;
    let result = grpc::call_client_streaming(&address, tls, &pool, &service_name, &method_name, resolved_inputs).await;
    // Save to history (store original unresolved inputs)
    let entry = GrpcHistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        address: address.clone(),
        tls,
        service_name: service_name.clone(),
        method_name: method_name.clone(),
        method_kind: "ClientStreaming".to_string(),
        proto_content: None,
        input_json: None,
        input_jsons: original_inputs,
        responses: match &result {
            Ok(r) => vec![r.clone()],
            Err(_) => vec![],
        },
        error: match &result {
            Ok(_) => None,
            Err(e) => Some(e.clone()),
        },
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = save_grpc_history_entry(&db, &entry);
    result
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn grpc_call_bidi_streaming(
    address: String,
    tls: bool,
    proto_id: String,
    service_name: String,
    method_name: String,
    input_jsons: Vec<String>,
    max_messages: usize,
    environment_id: Option<String>,
    state: State<'_, GrpcState>,
    db: State<'_, Db>,
) -> Result<Vec<GrpcResponse>, String> {
    let pool = grpc::get_pool(&state, &proto_id)?;
    // Save original inputs before resolution (for history)
    let original_inputs = input_jsons.clone();
    let resolved_inputs: Result<Vec<String>, String> = input_jsons.iter().map(|j| resolve_grpc_input(j, &db, &environment_id)).collect();
    let resolved_inputs = resolved_inputs?;
    let result = grpc::call_bidi_streaming(&address, tls, &pool, &service_name, &method_name, resolved_inputs, max_messages).await;
    // Save to history (store original unresolved inputs)
    let entry = GrpcHistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        address: address.clone(),
        tls,
        service_name: service_name.clone(),
        method_name: method_name.clone(),
        method_kind: "BidiStreaming".to_string(),
        proto_content: None,
        input_json: None,
        input_jsons: original_inputs,
        responses: match &result {
            Ok(responses) => responses.clone(),
            Err(_) => vec![],
        },
        error: match &result {
            Ok(_) => None,
            Err(e) => Some(e.clone()),
        },
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = save_grpc_history_entry(&db, &entry);
    result
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn grpc_call_server_streaming(
    address: String,
    tls: bool,
    proto_id: String,
    service_name: String,
    method_name: String,
    input_json: String,
    max_messages: usize,
    environment_id: Option<String>,
    state: State<'_, GrpcState>,
    db: State<'_, Db>,
) -> Result<Vec<GrpcResponse>, String> {
    let resolved_input = resolve_grpc_input(&input_json, &db, &environment_id)?;
    let pool = grpc::get_pool(&state, &proto_id)?;
    let result = grpc::call_server_streaming(&address, tls, &pool, &service_name, &method_name, &resolved_input, max_messages).await;
    // Save to history
    let entry = GrpcHistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        address: address.clone(),
        tls,
        service_name: service_name.clone(),
        method_name: method_name.clone(),
        method_kind: "ServerStreaming".to_string(),
        proto_content: None,
        input_json: Some(input_json.clone()),
        input_jsons: vec![],
        responses: match &result {
            Ok(responses) => responses.clone(),
            Err(_) => vec![],
        },
        error: match &result {
            Ok(_) => None,
            Err(e) => Some(e.clone()),
        },
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = save_grpc_history_entry(&db, &entry);
    result
}

// ─── gRPC History commands ──────────────────────────────────────────────────

#[tauri::command]
pub fn get_grpc_history(
    limit: i64,
    offset: i64,
    db: State<'_, Db>,
) -> Result<Vec<GrpcHistoryEntry>, String> {
    get_grpc_history_list(&db, limit, offset)
}

#[tauri::command]
pub fn delete_grpc_history(
    id: String,
    db: State<'_, Db>,
) -> Result<(), String> {
    delete_grpc_history_entry(&db, &id)
}

#[tauri::command]
pub fn clear_grpc_history(db: State<'_, Db>) -> Result<(), String> {
    clear_all_grpc_history(&db)
}

// ─── gRPC Reflection commands ─────────────────────────────────────────────

#[tauri::command]
pub async fn grpc_reflect_list_services(
    address: String,
    tls: bool,
) -> Result<Vec<String>, String> {
    grpc::reflect_list_services(&address, tls).await
}

#[tauri::command]
pub async fn grpc_reflect_get_proto(
    address: String,
    tls: bool,
    symbol: String,
    state: State<'_, GrpcState>,
) -> Result<GrpcDescriptorSet, String> {
    grpc::reflect_get_proto(&address, tls, &symbol, &state).await
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

pub mod mock_server;
pub use mock_server::*;

