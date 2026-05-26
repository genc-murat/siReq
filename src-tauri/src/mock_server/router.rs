use axum::{
    body::Body,
    extract::{Request, State},
    http::{HeaderName, HeaderValue, Method, StatusCode},
    response::Response,
    routing::any,
    Router,
};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tokio::sync::RwLock;
use tauri::{AppHandle, Emitter, Manager};
use regex::Regex;
use chrono::Utc;
use uuid::Uuid;

use crate::storage;
use crate::mock_server::models::{
    MockServerConfig, MockLogEntry, MockStats, MockEndpoint, ResponseScenario, RequestMatcher
};
use crate::mock_server::latency::simulate_latency;
use crate::mock_server::faker::{self, RequestContext};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<RwLock<MockServerConfig>>,
    pub log: Arc<Mutex<VecDeque<MockLogEntry>>>,
    pub stats: Arc<Mutex<MockStats>>,
    pub app_handle: AppHandle,
}

pub fn build_router(
    config: Arc<RwLock<MockServerConfig>>,
    log: Arc<Mutex<VecDeque<MockLogEntry>>>,
    stats: Arc<Mutex<MockStats>>,
    app_handle: AppHandle,
) -> Router {
    let state = AppState {
        config,
        log,
        stats,
        app_handle,
    };
    
    Router::new()
        .route("/", any(catch_all_handler))
        .route("/*path", any(catch_all_handler))
        .with_state(state)
}

async fn catch_all_handler(
    State(state): State<AppState>,
    req: Request,
) -> Response {
    let start_time = Instant::now();
    let timestamp = Utc::now().to_rfc3339();
    let log_id = Uuid::new_v4().to_string();

    let method = req.method().clone();
    let path = req.uri().path().to_string();
    
    // Extract headers
    let mut request_headers = HashMap::new();
    for (k, v) in req.headers() {
        if let Ok(val_str) = v.to_str() {
            request_headers.insert(k.to_string(), val_str.to_string());
        }
    }

    // Extract query parameters
    let query_str = req.uri().query().unwrap_or("");
    let mut query_params = HashMap::new();
    for (k, v) in url::form_urlencoded::parse(query_str.as_bytes()) {
        query_params.insert(k.into_owned(), v.into_owned());
    }

    // Extract body
    let body_bytes = match axum::body::to_bytes(req.into_body(), 10 * 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => axum::body::Bytes::new(),
    };
    let request_body = String::from_utf8_lossy(&body_bytes).into_owned();

    // Load configuration once for matching
    let config = state.config.read().await;

    // Handle CORS preflight OPTIONS request
    if config.cors_enabled && method == Method::OPTIONS {
        let mut response = Response::builder()
            .status(StatusCode::NO_CONTENT);
            
        let cors = &config.cors_config;
        response = response
            .header("Access-Control-Allow-Origin", &cors.allow_origin)
            .header("Access-Control-Allow-Methods", cors.allow_methods.join(", "))
            .header("Access-Control-Allow-Headers", cors.allow_headers.join(", "));
            
        if cors.allow_credentials && cors.allow_origin != "*" {
            response = response.header("Access-Control-Allow-Credentials", "true");
        }
        
        return response.body(Body::empty()).unwrap();
    }

    // Load active environment / global variables from storage DB if available
    let mut variables = HashMap::new();
    if let Some(db_state) = state.app_handle.try_state::<storage::Db>() {
        if let Ok(global_vars) = storage::get_global_variables(&db_state) {
            for kv in global_vars.variables {
                if kv.enabled {
                    variables.insert(kv.key, kv.value);
                }
            }
        }
    }

    let req_ctx = RequestContext {
        path: path.clone(),
        headers: request_headers.clone(),
        query_params: query_params.clone(),
        body: request_body.clone(),
        variables,
    };

    let mut matched_endpoint: Option<MockEndpoint> = None;
    let mut matched_scenario: Option<ResponseScenario> = None;

    // Find matching endpoint
    for ep in &config.endpoints {
        if ep.method.to_uppercase() == method.as_str().to_uppercase() && match_path(&ep.path, &path) {
            matched_endpoint = Some(ep.clone());
            break;
        }
    }

    let mut response_status = 200;
    let mut response_body = String::new();
    let mut response_headers = HashMap::new();
    let mut matched_scenario_name = None;
    let mut warnings = Vec::new();

    if let Some(ep) = matched_endpoint {
        // Find matching scenario by evaluating rules sequentially
        for sc in &ep.scenarios {
            if sc.is_default {
                continue; // Evaluate rules-based ones first
            }
            let mut all_match = true;
            for rule in &sc.rules {
                if !evaluate_rule(rule, &req_ctx) {
                    all_match = false;
                    break;
                }
            }
            if all_match && !sc.rules.is_empty() {
                matched_scenario = Some(sc.clone());
                break;
            }
        }

        // Fall back to default scenario
        if matched_scenario.is_none() {
            matched_scenario = ep.scenarios.iter().find(|s| s.is_default).cloned();
        }

        // Fall back to first scenario if still none
        if matched_scenario.is_none() {
            matched_scenario = ep.scenarios.first().cloned();
        }

        if let Some(sc) = matched_scenario {
            matched_scenario_name = Some(sc.name.clone());
            response_status = sc.status_code;

            // 1. Simulate Latency
            simulate_latency(&sc.latency).await;

            // 2. Render response body via FakerEngine
            let (rendered_body, body_warns) = faker::render(&sc.body, &req_ctx);
            response_body = rendered_body;
            warnings.extend(body_warns);

            // 3. Render response headers via FakerEngine
            for (hk, hv) in &sc.headers {
                let (rendered_val, header_warns) = faker::render(hv, &req_ctx);
                response_headers.insert(hk.clone(), rendered_val);
                warnings.extend(header_warns);
            }
        }
    } else {
        // 404 No matching endpoint
        response_status = 404;
        response_body = serde_json::json!({
            "error": "No matching mock endpoint found",
            "method": method.to_string(),
            "path": path
        }).to_string();
        response_headers.insert("Content-Type".to_string(), "application/json".to_string());
    }

    // Build the final HTTP response
    let status = StatusCode::from_u16(response_status).unwrap_or(StatusCode::OK);
    let mut response_builder = Response::builder().status(status);

    // Apply global mock headers from MockServerConfig
    for (k, v) in &config.headers {
        let (rendered_val, _) = faker::render(v, &req_ctx);
        response_headers.insert(k.clone(), rendered_val);
    }

    // Insert headers into response
    let headers_mut = response_builder.headers_mut().unwrap();
    
    // Add default mock server header
    headers_mut.insert(
        HeaderName::from_static("x-mock-server"),
        HeaderValue::from_static("siReq")
    );

    for (k, v) in &response_headers {
        if let Ok(h_name) = HeaderName::try_from(k.as_str()) {
            if let Ok(h_val) = HeaderValue::try_from(v.as_str()) {
                headers_mut.insert(h_name, h_val);
            }
        }
    }

    // Ensure content type is set
    if !headers_mut.contains_key("content-type") && !response_body.is_empty() {
        headers_mut.insert(
            HeaderName::from_static("content-type"),
            HeaderValue::from_static("application/json")
        );
    }

    // Inject CORS headers if CORS is enabled
    if config.cors_enabled {
        let cors = &config.cors_config;
        if let Ok(origin) = HeaderValue::try_from(cors.allow_origin.as_str()) {
            headers_mut.insert(HeaderName::from_static("access-control-allow-origin"), origin);
        }
        if let Ok(methods) = HeaderValue::try_from(cors.allow_methods.join(", ").as_str()) {
            headers_mut.insert(HeaderName::from_static("access-control-allow-methods"), methods);
        }
        if let Ok(headers) = HeaderValue::try_from(cors.allow_headers.join(", ").as_str()) {
            headers_mut.insert(HeaderName::from_static("access-control-allow-headers"), headers);
        }
        if cors.allow_credentials && cors.allow_origin != "*" {
            headers_mut.insert(
                HeaderName::from_static("access-control-allow-credentials"),
                HeaderValue::from_static("true")
            );
        }
    }

    let elapsed = start_time.elapsed().as_millis() as u64;

    // Log the transaction
    let log_entry = MockLogEntry {
        id: log_id,
        timestamp,
        method: method.to_string(),
        path: path.clone(),
        request_headers,
        request_body,
        response_status,
        response_headers,
        response_body: response_body.clone(),
        latency_ms: elapsed,
        matched_scenario: matched_scenario_name,
        warnings,
    };

    // Update in-memory log list (FIFO max 500)
    {
        let mut logs = state.log.lock().unwrap();
        logs.push_back(log_entry.clone());
        if logs.len() > 500 {
            logs.pop_front();
        }
    }

    // Update in-memory statistics
    {
        let mut stats = state.stats.lock().unwrap();
        stats.request_count += 1;
        if response_status >= 400 {
            stats.error_count += 1;
        }
        let count = stats.request_count as f64;
        stats.average_latency_ms = (stats.average_latency_ms * (count - 1.0) + elapsed as f64) / count;
        
        // Emit stats update
        let _ = state.app_handle.emit("mock-stats", serde_json::json!({
            "serverId": config.id,
            "stats": *stats
        }));
    }

    // Emit live mock-log event to Tauri front-end
    let _ = state.app_handle.emit("mock-log", serde_json::json!({
        "serverId": config.id,
        "log": log_entry
    }));

    response_builder.body(Body::from(response_body)).unwrap()
}

fn match_path(mock_path: &str, req_path: &str) -> bool {
    let mock_path = mock_path.trim_matches('/');
    let req_path = req_path.trim_matches('/');
    
    let mock_segments: Vec<&str> = mock_path.split('/').collect();
    let req_segments: Vec<&str> = req_path.split('/').collect();
    
    if mock_segments.len() != req_segments.len() {
        return false;
    }
    
    for (m, r) in mock_segments.iter().zip(req_segments.iter()) {
        if m.starts_with(':') || (m.starts_with('{') && m.ends_with('}')) {
            continue; // Matches path param
        }
        if m != r {
            return false;
        }
    }
    true
}

fn evaluate_rule(rule: &RequestMatcher, ctx: &RequestContext) -> bool {
    let val_opt = match rule.source.as_str() {
        "query" => ctx.query_params.get(&rule.key).cloned(),
        "header" => {
            let lower_key = rule.key.to_lowercase();
            let mut found = None;
            for (k, v) in &ctx.headers {
                if k.to_lowercase() == lower_key {
                    found = Some(v.clone());
                    break;
                }
            }
            found
        }
        "body" => Some(ctx.body.clone()),
        "jsonpath" => evaluate_jsonpath(&ctx.body, &rule.key),
        _ => None,
    };

    match rule.operator.as_str() {
        "exists" => val_opt.is_some(),
        "equals" => val_opt.map_or(false, |v| v == rule.value),
        "contains" => val_opt.map_or(false, |v| v.contains(&rule.value)),
        "regex" => val_opt.map_or(false, |v| {
            if let Ok(re) = Regex::new(&rule.value) {
                re.is_match(&v)
            } else {
                false
            }
        }),
        _ => false,
    }
}

fn evaluate_jsonpath(body: &str, expression: &str) -> Option<String> {
    let finder = jsonpath_rust::JsonPathFinder::from_str(body, expression).ok()?;
    let val = finder.find();
    if val.is_null() {
        return None;
    }
    if let serde_json::Value::Array(ref arr) = val {
        if arr.is_empty() {
            return None;
        }
        if arr.len() == 1 {
            let item = &arr[0];
            return Some(match item {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            });
        }
    }
    Some(match val {
        serde_json::Value::String(s) => s,
        other => other.to_string(),
    })
}
