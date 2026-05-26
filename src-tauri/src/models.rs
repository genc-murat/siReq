use serde::{Deserialize, Serialize, Deserializer};
use serde_json::Value;
use std::collections::HashMap;

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
    /// Request examples (variants of this request with different params/responses)
    #[serde(default)]
    pub examples: Vec<RequestExample>,
    /// Variable extractions (extract values from response using JSONPath)
    #[serde(default)]
    pub extractions: Vec<VariableExtraction>,
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

// ─── Collection Tree Types ──────────────────────────────────────────

/// A node in the collection tree — either a folder or a request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
#[allow(clippy::large_enum_variant)]
pub enum CollectionItem {
    #[serde(rename = "folder")]
    Folder(CollectionFolder),
    #[serde(rename = "request")]
    Request(HttpRequest),
}

#[allow(dead_code)]
impl CollectionItem {
    pub fn id(&self) -> &str {
        match self {
            CollectionItem::Folder(f) => &f.id,
            CollectionItem::Request(r) => &r.id,
        }
    }

    pub fn name(&self) -> &str {
        match self {
            CollectionItem::Folder(f) => &f.name,
            CollectionItem::Request(r) => &r.name,
        }
    }

    pub fn name_mut(&mut self) -> &mut String {
        match self {
            CollectionItem::Folder(f) => &mut f.name,
            CollectionItem::Request(r) => &mut r.name,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionFolder {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub items: Vec<CollectionItem>,
    #[serde(default)]
    pub auth: Option<AuthConfig>,
    pub created_at: String,
    pub updated_at: String,
}

/// A saved snapshot/variant of a request (similar to Postman examples).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestExample {
    pub id: String,
    pub name: String,
    pub request: HttpRequest,
    #[serde(default)]
    pub response: Option<HttpResponse>,
    pub created_at: String,
}

/// A variable extraction definition — extracts a value from the response
/// using a JSONPath expression and stores it as a variable.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableExtraction {
    pub id: String,
    /// Display name for this extraction
    pub name: String,
    /// JSONPath expression to extract the value
    pub expression: String,
    /// Target variable name to store the extracted value
    pub target_variable: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool { true }

/// A reusable request template (global or collection-scoped).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestTemplate {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub request: HttpRequest,
    /// "global" or "collection:<collection_id>"
    pub scope: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Custom deserializer for Collection items — supports both the new
/// Vec<CollectionItem> format (tagged) and the legacy Vec<HttpRequest> format.
pub fn deserialize_collection_items<'de, D>(d: D) -> Result<Vec<CollectionItem>, D::Error>
where
    D: Deserializer<'de>,
{
    let v = Value::deserialize(d)?;

    // Try new tagged format first
    if let Ok(items) = serde_json::from_value::<Vec<CollectionItem>>(v.clone()) {
        return Ok(items);
    }

    // Fall back to legacy flat Vec<HttpRequest>
    if let Ok(requests) = serde_json::from_value::<Vec<HttpRequest>>(v) {
        return Ok(requests.into_iter().map(CollectionItem::Request).collect());
    }

    Ok(Vec::new())
}

// ─── Updated Collection ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
    /// Tree of folders and requests. Serialized as "requests" for DB backward compat.
    #[serde(rename = "requests", default, deserialize_with = "deserialize_collection_items")]
    pub items: Vec<CollectionItem>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub variables: Vec<KeyValue>,
    #[serde(default)]
    pub auth: Option<AuthConfig>,
    #[serde(default)]
    pub description: String,
}

/// Flatten a collection's tree into a flat list of HttpRequest references.
pub fn flatten_collection_items(items: &[CollectionItem]) -> Vec<&HttpRequest> {
    let mut result = Vec::new();
    for item in items {
        match item {
            CollectionItem::Request(req) => result.push(req),
            CollectionItem::Folder(f) => result.extend(flatten_collection_items(&f.items)),
        }
    }
    result
}

/// Find an item by ID in the tree (recursive).
#[allow(dead_code)]
pub fn find_item_by_id<'a>(items: &'a [CollectionItem], id: &str) -> Option<&'a CollectionItem> {
    for item in items {
        if item.id() == id {
            return Some(item);
        }
        if let CollectionItem::Folder(f) = item {
            if let found @ Some(_) = find_item_by_id(&f.items, id) {
                return found;
            }
        }
    }
    None
}

/// Find an item by ID in the tree (mutable, recursive).
pub fn find_item_by_id_mut<'a>(items: &'a mut [CollectionItem], id: &str) -> Option<&'a mut CollectionItem> {
    for item in items.iter_mut() {
        if item.id() == id {
            return Some(item);
        }
        if let CollectionItem::Folder(f) = item {
            if let found @ Some(_) = find_item_by_id_mut(&mut f.items, id) {
                return found;
            }
        }
    }
    None
}

/// Remove an item by ID from the tree, returning it if found.
pub fn remove_item_by_id(items: &mut Vec<CollectionItem>, id: &str) -> Option<CollectionItem> {
    if let Some(pos) = items.iter().position(|item| item.id() == id) {
        return Some(items.remove(pos));
    }
    for item in items.iter_mut() {
        if let CollectionItem::Folder(f) = item {
            if let found @ Some(_) = remove_item_by_id(&mut f.items, id) {
                return found;
            }
        }
    }
    None
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub request: HttpRequest,
    pub response: HttpResponse,
    pub created_at: String,
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
    /// Variables extracted from this response
    #[serde(default)]
    pub extracted_variables: Vec<(String, String)>,
    /// Dataset iteration index (for data-driven runs)
    #[serde(default)]
    pub iteration: Option<usize>,
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
    /// Extracted variables during this run
    #[serde(default)]
    pub extracted_variables: Vec<(String, String)>,
}

/// A single row in a data-driven dataset
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetRow {
    pub values: HashMap<String, String>,
}

/// A dataset for data-driven runs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunDataset {
    pub name: String,
    pub rows: Vec<DatasetRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkHistoryEntry {
    pub id: String,
    pub request: HttpRequest,
    pub result: BenchmarkResult,
    pub created_at: String,
}

// ─── gRPC Types ────────────────────────────────────────────────────────

/// Result of parsing a .proto file — contains service definitions and a reference to the descriptor pool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcDescriptorSet {
    pub proto_id: String,
    pub services: Vec<GrpcServiceInfo>,
    #[serde(default)]
    pub from_cache: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcServiceInfo {
    pub name: String,
    pub full_name: String,
    pub methods: Vec<GrpcMethodInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcMethodInfo {
    pub name: String,
    pub full_name: String,
    pub input_type: String,
    pub output_type: String,
    pub client_streaming: bool,
    pub server_streaming: bool,
    pub input_fields: Vec<GrpcFieldInfo>,
    pub output_fields: Vec<GrpcFieldInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcFieldInfo {
    pub name: String,
    pub field_type: String,
    pub label: String,
    pub is_map: bool,
    /// Nested sub-fields for message types (empty for scalars)
    #[serde(default)]
    pub sub_fields: Vec<GrpcFieldInfo>,
    /// Enum value names for enum types (empty for non-enums)
    #[serde(default)]
    pub enum_values: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcResponse {
    pub status_code: String,
    pub status_message: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub size: u64,
    pub time_ms: u64,
    #[serde(default)]
    pub error: Option<String>,
}

/// A saved entry in gRPC request history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrpcHistoryEntry {
    pub id: String,
    pub address: String,
    pub tls: bool,
    pub service_name: String,
    pub method_name: String,
    pub method_kind: String, // "Unary", "ServerStreaming", "ClientStreaming", "BidiStreaming"
    pub proto_content: Option<String>,
    pub input_json: Option<String>,       // single input (unary, server-streaming)
    pub input_jsons: Vec<String>,          // multiple inputs (client-streaming, bidi)
    pub responses: Vec<GrpcResponse>,
    pub error: Option<String>,
    pub created_at: String,
}

