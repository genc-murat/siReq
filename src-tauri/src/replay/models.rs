use serde::{Deserialize, Serialize};
use crate::models::{HttpRequest, HttpResponse};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemapRule {
    pub id: String,
    pub pattern: String,
    pub replacement: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssertionType {
    StatusCode,
    ResponseTime,
    BodyContains,
    JsonPath,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayAssertion {
    pub id: String,
    #[serde(rename = "type")]
    pub assertion_type: AssertionType,
    pub expression: String,
    pub expected: String,
    pub passed: Option<bool>,
    pub actual: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaosConfig {
    pub enabled: bool,
    pub timeout_probability: f64,
    pub timeout_min_ms: u64,
    pub timeout_max_ms: u64,
    pub delay_probability: f64,
    pub delay_min_ms: u64,
    pub delay_max_ms: u64,
    pub error_probability: f64,
    pub error_status_codes: Vec<u16>,
}

impl Default for ChaosConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            timeout_probability: 0.1,
            timeout_min_ms: 1000,
            timeout_max_ms: 5000,
            delay_probability: 0.2,
            delay_min_ms: 100,
            delay_max_ms: 500,
            error_probability: 0.1,
            error_status_codes: vec![500, 502, 503],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplaySession {
    pub id: String,
    pub name: String,
    pub description: String,
    pub remap_rules: Vec<RemapRule>,
    pub assertions: Vec<ReplayAssertion>,
    pub chaos_config: ChaosConfig,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayEntry {
    pub id: String,
    pub session_id: String,
    pub position: i32,
    pub original_request: HttpRequest,
    pub original_response: HttpResponse,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReplayRunStatus {
    Completed,
    Partial,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EntryResultStatus {
    Completed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodyDiff {
    #[serde(rename = "type")]
    pub diff_type: String,
    pub added_keys: Vec<String>,
    pub removed_keys: Vec<String>,
    pub modified_keys: Vec<ModifiedKey>,
    pub text_diff: Option<Vec<TextDiffLine>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModifiedKey {
    pub key: String,
    pub original: String,
    pub replayed: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextDiffLine {
    #[serde(rename = "type")]
    pub line_type: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeadersDiff {
    pub added: Vec<(String, String)>,
    pub removed: Vec<(String, String)>,
    pub modified: Vec<ModifiedHeader>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModifiedHeader {
    pub name: String,
    pub original: String,
    pub replayed: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayDiff {
    pub body_diff: BodyDiff,
    pub headers_diff: HeadersDiff,
    pub timing_diff_ms: i64,
    pub schema_drift: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssertionResult {
    pub id: String,
    #[serde(rename = "type")]
    pub assertion_type: AssertionType,
    pub expression: String,
    pub expected: String,
    pub passed: bool,
    pub actual: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayEntryResult {
    pub id: String,
    pub run_id: String,
    pub entry_id: String,
    pub status: EntryResultStatus,
    pub replayed_request: Option<HttpRequest>,
    pub replayed_response: Option<HttpResponse>,
    pub diff: Option<ReplayDiff>,
    pub assertion_results: Vec<AssertionResult>,
    pub error: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayRun {
    pub id: String,
    pub session_id: String,
    pub status: ReplayRunStatus,
    pub duration_ms: i64,
    pub environment_id: Option<String>,
    pub chaos_config: ChaosConfig,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayRunDetail {
    pub run: ReplayRun,
    pub entry_results: Vec<ReplayEntryResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarEntry {
    pub request: HttpRequest,
    pub response: HttpResponse,
}
