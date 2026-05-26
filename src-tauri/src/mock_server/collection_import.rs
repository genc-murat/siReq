use crate::models::{Collection, flatten_collection_items};
use crate::mock_server::models::{MockServerConfig, CorsConfig, MockEndpoint, ResponseScenario, RequestMatcher};
use std::collections::HashMap;
use uuid::Uuid;

pub fn collection_to_mock_config(collection: &Collection, name: &str, port: u16) -> MockServerConfig {
    let mut endpoints = Vec::new();
    let flattened_reqs = flatten_collection_items(&collection.items);

    for req in flattened_reqs {
        let path = extract_path(&req.url);
        let method = method_to_str(&req.method);
        
        let mut scenarios = Vec::new();
        
        // 1. Process examples/saved variants of the request
        for example in &req.examples {
            let mut status_code = 200;
            let mut response_headers = HashMap::new();
            let mut response_body = String::new();
            
            if let Some(resp) = &example.response {
                status_code = resp.status;
                response_headers = map_resp_headers(&resp.headers);
                response_body = resp.body.clone();
            }
            
            // Build simple rules based on example request properties if possible
            let mut rules = Vec::new();
            
            // Example: Match if query params in example match
            for q in &example.request.query_params {
                if q.enabled && !q.key.is_empty() {
                    rules.push(RequestMatcher {
                        source: "query".to_string(),
                        key: q.key.clone(),
                        operator: "equals".to_string(),
                        value: q.value.clone(),
                    });
                }
            }
            
            // Example: Match if header in example matches
            for h in &example.request.headers {
                if h.enabled && !h.key.is_empty() && h.key.to_lowercase() != "user-agent" {
                    rules.push(RequestMatcher {
                        source: "header".to_string(),
                        key: h.key.clone(),
                        operator: "equals".to_string(),
                        value: h.value.clone(),
                    });
                }
            }

            scenarios.push(ResponseScenario {
                id: example.id.clone(),
                name: example.name.clone(),
                is_default: false,
                status_code,
                headers: response_headers,
                body: response_body,
                latency: None,
                rules,
            });
        }
        
        // 2. Create the default response scenario based on the main request
        let mut default_headers = HashMap::new();
        default_headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        scenarios.insert(0, ResponseScenario {
            id: Uuid::new_v4().to_string(),
            name: "Default Response".to_string(),
            is_default: true,
            status_code: 200,
            headers: default_headers,
            body: "{\"status\": \"ok\"}".to_string(),
            latency: None,
            rules: Vec::new(),
        });

        // Set is_default correctly: first is default, others are false
        for (i, scenario) in scenarios.iter_mut().enumerate() {
            scenario.is_default = i == 0;
        }

        endpoints.push(MockEndpoint {
            id: Uuid::new_v4().to_string(),
            path,
            method,
            scenarios,
        });
    }

    MockServerConfig {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        port,
        endpoints,
        cors_enabled: false, // Default is disabled
        cors_config: CorsConfig::default(),
        headers: HashMap::new(),
    }
}

fn extract_path(url: &str) -> String {
    let mut cleaned = url.trim().to_string();
    
    // Remove protocol if present
    if cleaned.starts_with("http://") {
        cleaned = cleaned[7..].to_string();
    } else if cleaned.starts_with("https://") {
        cleaned = cleaned[8..].to_string();
    }
    
    // Remove domain/host. If starts with a variable like {{baseUrl}}, strip it.
    if cleaned.starts_with("{{") {
        if let Some(close_idx) = cleaned.find("}}") {
            cleaned = cleaned[close_idx + 2..].to_string();
        }
    } else if let Some(slash_idx) = cleaned.find('/') {
        cleaned = cleaned[slash_idx..].to_string();
    }
    
    // Remove query parameters
    if let Some(q_idx) = cleaned.find('?') {
        cleaned = cleaned[..q_idx].to_string();
    }
    
    // Ensure leading slash
    if !cleaned.starts_with('/') {
        cleaned = format!("/{}", cleaned);
    }
    
    cleaned
}

fn method_to_str(m: &crate::models::HttpMethod) -> String {
    match m {
        crate::models::HttpMethod::GET => "GET",
        crate::models::HttpMethod::POST => "POST",
        crate::models::HttpMethod::PUT => "PUT",
        crate::models::HttpMethod::PATCH => "PATCH",
        crate::models::HttpMethod::DELETE => "DELETE",
        crate::models::HttpMethod::HEAD => "HEAD",
        crate::models::HttpMethod::OPTIONS => "OPTIONS",
        crate::models::HttpMethod::TRACE => "TRACE",
    }.to_string()
}

fn map_resp_headers(headers: &[(String, String)]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for (k, v) in headers {
        if !k.is_empty() {
            map.insert(k.clone(), v.clone());
        }
    }
    map
}
