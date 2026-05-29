use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockServerConfig {
    pub id: String,
    pub name: String,
    pub port: u16,
    pub endpoints: Vec<MockEndpoint>,
    pub cors_enabled: bool,
    pub cors_config: CorsConfig,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorsConfig {
    pub allow_origin: String,
    pub allow_methods: Vec<String>,
    pub allow_headers: Vec<String>,
    pub allow_credentials: bool,
}

impl Default for CorsConfig {
    fn default() -> Self {
        Self {
            allow_origin: "*".to_string(),
            allow_methods: vec![
                "GET".to_string(),
                "POST".to_string(),
                "PUT".to_string(),
                "DELETE".to_string(),
                "PATCH".to_string(),
                "OPTIONS".to_string(),
            ],
            allow_headers: vec!["Content-Type".to_string(), "Authorization".to_string()],
            allow_credentials: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockEndpoint {
    pub id: String,
    pub path: String,
    pub method: String,
    pub scenarios: Vec<ResponseScenario>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseScenario {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub status_code: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub latency: Option<LatencyProfile>,
    pub rules: Vec<RequestMatcher>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestMatcher {
    pub source: String, // "query", "header", "body", "jsonpath"
    pub key: String,
    pub operator: String, // "equals", "contains", "regex", "exists"
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatencyProfile {
    pub mode: String, // "fixed", "random_range", "normal_distribution"
    pub fixed_ms: Option<u64>,
    pub min_ms: Option<u64>,
    pub max_ms: Option<u64>,
    pub mean_ms: Option<f64>,
    pub std_dev_ms: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockLogEntry {
    pub id: String,
    pub timestamp: String,
    pub method: String,
    pub path: String,
    pub request_headers: HashMap<String, String>,
    pub request_body: String,
    pub response_status: u16,
    pub response_headers: HashMap<String, String>,
    pub response_body: String,
    pub latency_ms: u64,
    pub matched_scenario: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockServerStatus {
    pub id: String,
    pub name: String,
    pub port: u16,
    pub status: String, // "running", "stopped", "error"
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MockStats {
    pub request_count: u64,
    pub error_count: u64,
    pub average_latency_ms: f64,
}


