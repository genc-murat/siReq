use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::State;
use crate::models::*;
use crate::storage::*;
use crate::http::*;
use crate::scripts::*;
use crate::variables::*;
use crate::secrets::*;
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

    // Build a merged env for the post script (including script-modified vars)
    let post_script_env: HashMap<String, String> = env_vars.clone();

    // Step 3: Execute post-response script
    let post_script_results = execute_post_response(
        &request.post_script,
        &modified_request,
        &response,
        &post_script_env,
    )?;

    // Step 4: Collect all modified variables from pre and post scripts
    let mut all_modified_vars = pre_script_results.modified_variables.clone();
    all_modified_vars.extend(post_script_results.modified_variables.clone());

    // Step 5: Persist modified variables back to the environment in DB
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

    // Step 6: Attach script results to response
    let mut response_with_scripts = response.clone();
    let mut all_logs = pre_script_results.logs.clone();
    all_logs.extend(post_script_results.logs.clone());
    let mut all_tests = pre_script_results.tests.clone();
    all_tests.extend(post_script_results.tests.clone());
    let mut all_errors = pre_script_results.errors.clone();
    all_errors.extend(post_script_results.errors.clone());

    response_with_scripts.script_logs = all_logs;
    response_with_scripts.test_results = all_tests;
    response_with_scripts.modified_variables = all_modified_vars;

    if !all_errors.is_empty() {
        response_with_scripts.script_logs.push(ScriptLog {
            level: "error".to_string(),
            message: all_errors.join("\n"),
        });
    }

    let entry = HistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        request,
        response: response_with_scripts.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let _ = save_history_with_conn(&db, &entry);
    Ok(response_with_scripts)
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

#[tauri::command]
pub async fn benchmark_request(
    request: HttpRequest,
    count: u64,
    client: State<'_, Client>,
    db: State<'_, Db>,
) -> Result<BenchmarkResult, String> {
    use std::time::Instant;

    if count == 0 || count > 1000 {
        return Err("Count must be between 1 and 1000".to_string());
    }

    let owned_client = (*client).clone();
    let stored_cookies: Vec<StoredCookie> = vec![];

    let mut times_ms: Vec<u64> = Vec::with_capacity(count as usize);
    let mut statuses: Vec<u16> = Vec::with_capacity(count as usize);
    let mut errors: Vec<String> = Vec::new();
    let mut total_bytes: u64 = 0;

    for _ in 0..count {
        let start = Instant::now();
        match execute_request(&owned_client, &request, &stored_cookies).await {
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

    let flat_requests = flatten_collection_items(&collection.items);
    let total = flat_requests.len();

    for (idx, request) in flat_requests.iter().enumerate() {
        // Step 1: Execute pre-request script
        let (modified_request, pre_script_results) = execute_pre_request(
            &request.pre_script,
            request,
            &env_vars,
        )?;

        // Script variables
        let script_vars = pre_script_results.modified_variables.clone();

        // Step 2: Apply full variable resolution (dynamic -> global -> collection -> env -> script)
        let resolved = apply_variables(
            &modified_request,
            &global_vars.variables,
            &collection_vars,
            &env_vars,
            &script_vars,
        );

        let stored_cookies: Vec<StoredCookie> = vec![];

        let request_start = Instant::now();

        // Step 3: Execute the request using a dedicated client
        let client = Client::builder()
            .timeout(Duration::from_secs(if resolved.settings.timeout > 0 { resolved.settings.timeout } else { 30 }))
            .build()
            .map_err(|e| e.to_string())?;

        let req_result = match execute_request(&client, &resolved, &stored_cookies).await {
            Ok((response, _new_cookies)) => {
                let elapsed = response.time_ms;

                // Step 4: Execute post-response script
                let post_script_results = execute_post_response(
                    &request.post_script,
                    &modified_request,
                    &response,
                    &env_vars,
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
