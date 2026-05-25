use reqwest::Client;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use crate::models::*;

pub struct RequestHandles(pub Mutex<HashMap<String, tokio::task::JoinHandle<()>>>);

fn substitute_vars(input: &str, vars: &HashMap<String, String>) -> String {
    let mut result = input.to_string();
    for (key, value) in vars {
        let pattern = format!("{{{{{}}}}}", key);
        result = result.replace(&pattern, value);
    }
    result
}

pub fn apply_env(request: &HttpRequest, vars: &HashMap<String, String>) -> HttpRequest {
    let mut req = request.clone();
    req.url = substitute_vars(&req.url, vars);
    req.body = substitute_vars(&req.body, vars);
    req.headers = req.headers.into_iter().map(|mut h| {
        h.key = substitute_vars(&h.key, vars);
        h.value = substitute_vars(&h.value, vars);
        h
    }).collect();
    req.query_params = req.query_params.into_iter().map(|mut p| {
        p.key = substitute_vars(&p.key, vars);
        p.value = substitute_vars(&p.value, vars);
        p
    }).collect();
    req
}

pub async fn execute_request(client: &Client, request: &HttpRequest, timeout_secs: u64) -> Result<HttpResponse, String> {
    let method = match request.method {
        HttpMethod::GET => reqwest::Method::GET,
        HttpMethod::POST => reqwest::Method::POST,
        HttpMethod::PUT => reqwest::Method::PUT,
        HttpMethod::PATCH => reqwest::Method::PATCH,
        HttpMethod::DELETE => reqwest::Method::DELETE,
        HttpMethod::HEAD => reqwest::Method::HEAD,
        HttpMethod::OPTIONS => reqwest::Method::OPTIONS,
        HttpMethod::TRACE => reqwest::Method::TRACE,
    };

    let mut req_builder = client
        .request(method, &request.url)
        .timeout(Duration::from_secs(timeout_secs));

    for kv in &request.headers {
        if kv.enabled && !kv.key.is_empty() {
            req_builder = req_builder.header(&kv.key, &kv.value);
        }
    }

    for kv in &request.query_params {
        if kv.enabled && !kv.key.is_empty() {
            req_builder = req_builder.query(&[(&kv.key, &kv.value)]);
        }
    }

    match &request.auth.auth_type {
        AuthType::basic => {
            if !request.auth.username.is_empty() {
                req_builder = req_builder.basic_auth(&request.auth.username, Some(&request.auth.password));
            }
        }
        AuthType::bearer => {
            if !request.auth.token.is_empty() {
                req_builder = req_builder.bearer_auth(&request.auth.token);
            }
        }
        AuthType::api_key => {
            if !request.auth.api_key.is_empty() && !request.auth.api_key_name.is_empty() {
                if request.auth.api_key_in == "query" {
                    req_builder = req_builder.query(&[(&request.auth.api_key_name, &request.auth.api_key)]);
                } else {
                    req_builder = req_builder.header(&request.auth.api_key_name, &request.auth.api_key);
                }
            }
        }
        AuthType::none => {}
    }

    match request.body_type {
        BodyType::json => {
            if !request.body.is_empty() {
                req_builder = req_builder.header("content-type", "application/json").body(request.body.clone());
            }
        }
        BodyType::xml => {
            if !request.body.is_empty() {
                req_builder = req_builder.header("content-type", "application/xml").body(request.body.clone());
            }
        }
        BodyType::text => {
            if !request.body.is_empty() {
                req_builder = req_builder.header("content-type", "text/plain").body(request.body.clone());
            }
        }
        BodyType::form_urlencoded => {
            let mut pairs: Vec<(String, String)> = vec![];
            if let Ok(map) = serde_json::from_str::<serde_json::Value>(&request.body) {
                if let Some(obj) = map.as_object() {
                    for (k, v) in obj {
                        pairs.push((k.clone(), v.as_str().unwrap_or("").to_string()));
                    }
                }
            }
            req_builder = req_builder.form(&pairs);
        }
        BodyType::form => {
            let mut form = reqwest::multipart::Form::new();
            if let Ok(map) = serde_json::from_str::<serde_json::Value>(&request.body) {
                if let Some(obj) = map.as_object() {
                    for (k, v) in obj {
                        form = form.text(k.clone(), v.as_str().unwrap_or("").to_string());
                    }
                }
            }
            req_builder = req_builder.multipart(form);
        }
        BodyType::none => {}
    }

    let start = Instant::now();
    let response = req_builder.send().await.map_err(|e| e.to_string())?;
    let elapsed = start.elapsed().as_millis() as u64;

    let status = response.status().as_u16();
    let status_text = response.status().canonical_reason().unwrap_or("").to_string();

    let headers: Vec<(String, String)> = response.headers().iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let body = response.text().await.map_err(|e| e.to_string())?;
    let size = body.len() as u64;

    Ok(HttpResponse {
        status,
        status_text,
        headers,
        cookies: vec![],
        body,
        size,
        time_ms: elapsed,
    })
}

pub fn cancel_request(handles: &RequestHandles, request_id: &str) -> Result<(), String> {
    let mut map = handles.0.lock().map_err(|e| e.to_string())?;
    if let Some(handle) = map.remove(request_id) {
        handle.abort();
    }
    Ok(())
}
