use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub enabled: bool,
    pub url: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestSettings {
    pub timeout: u64,
    pub follow_redirects: bool,
    pub ssl_verify: bool,
    pub proxy: Option<ProxyConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(clippy::upper_case_acronyms)]
pub enum HttpMethod {
    GET,
    POST,
    PUT,
    PATCH,
    DELETE,
    HEAD,
    OPTIONS,
    TRACE,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[allow(non_camel_case_types)]
pub enum BodyType {
    none,
    json,
    xml,
    text,
    form,
    form_urlencoded,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[allow(non_camel_case_types)]
pub enum AuthType {
    none,
    basic,
    bearer,
    api_key,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyValue {
    pub key: String,
    pub value: String,
    pub enabled: bool,
    #[serde(default)]
    pub is_secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormField {
    pub key: String,
    pub value: String,
    pub file_path: Option<String>,
    pub file_name: Option<String>,
    pub file_data: Option<String>,
    pub content_type: Option<String>,
    pub field_type: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    #[serde(rename = "type")]
    pub auth_type: AuthType,
    pub username: String,
    pub password: String,
    pub token: String,
    pub api_key: String,
    pub api_key_name: String,
    pub api_key_in: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptLog {
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResult {
    pub name: String,
    pub passed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptResults {
    pub logs: Vec<ScriptLog>,
    pub tests: Vec<TestResult>,
    pub errors: Vec<String>,
    pub modified_variables: Vec<KeyValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpRequest {
    pub id: String,
    pub name: String,
    pub method: HttpMethod,
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub query_params: Vec<KeyValue>,
    pub body_type: BodyType,
    pub body: String,
    pub form_fields: Vec<FormField>,
    pub auth: AuthConfig,
    pub settings: RequestSettings,
    #[serde(default)]
    pub pre_script: String,
    #[serde(default)]
    pub post_script: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub cookies: Vec<(String, String)>,
    pub body: String,
    pub body_base64: Option<String>,
    pub size: u64,
    pub time_ms: u64,
    #[serde(default)]
    pub script_logs: Vec<ScriptLog>,
    #[serde(default)]
    pub test_results: Vec<TestResult>,
    #[serde(default)]
    pub modified_variables: Vec<KeyValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub request: HttpRequest,
    pub response: HttpResponse,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub requests: Vec<HttpRequest>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub variables: Vec<KeyValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalVariables {
    pub id: String,
    pub variables: Vec<KeyValue>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredCookie {
    pub id: String,
    pub domain: String,
    pub path: String,
    pub name: String,
    pub value: String,
    pub secure: bool,
    pub http_only: bool,
    pub expires: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub variables: Vec<KeyValue>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub iterations: u64,
    pub times_ms: Vec<u64>,
    pub min_ms: u64,
    pub max_ms: u64,
    pub avg_ms: f64,
    pub median_ms: f64,
    pub p95_ms: f64,
    pub p99_ms: f64,
    pub success_count: u64,
    pub failure_count: u64,
    pub statuses: Vec<u16>,
    pub errors: Vec<String>,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunRequestResult {
    pub request_name: String,
    pub request_method: String,
    pub request_url: String,
    pub status_code: u16,
    pub status_text: String,
    pub time_ms: u64,
    pub size: u64,
    pub test_results: Vec<TestResult>,
    pub script_logs: Vec<ScriptLog>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionRunResult {
    pub id: String,
    pub collection_id: String,
    pub collection_name: String,
    pub environment_id: Option<String>,
    pub started_at: String,
    pub completed_at: String,
    pub delay_ms: u64,
    pub stop_on_failure: bool,
    pub results: Vec<RunRequestResult>,
    pub total: u32,
    pub passed: u32,
    pub failed: u32,
    pub total_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkHistoryEntry {
    pub id: String,
    pub request: HttpRequest,
    pub result: BenchmarkResult,
    pub created_at: String,
}
