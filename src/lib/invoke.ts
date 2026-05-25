import { invoke } from "@tauri-apps/api/core";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "TRACE";
export type BodyType = "none" | "json" | "xml" | "text" | "form" | "form_urlencoded";
export type AuthType = "none" | "basic" | "bearer" | "api_key";

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
  is_secret?: boolean;
}

export interface FormField {
  key: string;
  value: string;
  file_path?: string | null;
  file_name?: string | null;
  file_data?: string | null;
  content_type?: string | null;
  field_type: "text" | "file";
  enabled: boolean;
}

export interface ProxyConfig {
  enabled: boolean;
  url: string;
  username: string;
  password: string;
}

export interface RequestSettings {
  timeout: number;
  follow_redirects: boolean;
  ssl_verify: boolean;
  proxy: ProxyConfig | null;
}

export interface AuthConfig {
  type: AuthType;
  username: string;
  password: string;
  token: string;
  api_key: string;
  api_key_name: string;
  api_key_in: "header" | "query";
}

export interface ScriptLog {
  level: string;
  message: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
}

export interface HttpRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  query_params: KeyValue[];
  body_type: BodyType;
  body: string;
  form_fields: FormField[];
  auth: AuthConfig;
  settings: RequestSettings;
  pre_script: string;
  post_script: string;
  json_schema: string;
}

export interface HttpResponse {
  status: number;
  status_text: string;
  headers: [string, string][];
  cookies: [string, string][];
  body: string;
  body_base64?: string | null;
  size: number;
  time_ms: number;
  script_logs?: ScriptLog[];
  test_results?: TestResult[];
  modified_variables?: KeyValue[];
}

export interface HistoryEntry {
  id: string;
  request: HttpRequest;
  response: HttpResponse;
  created_at: string;
}

export interface Collection {
  id: string;
  name: string;
  requests: HttpRequest[];
  created_at: string;
  updated_at: string;
  variables?: KeyValue[];
}

export interface StoredCookie {
  id: string;
  domain: string;
  path: string;
  name: string;
  value: string;
  secure: boolean;
  http_only: boolean;
  expires: string | null;
  created_at: string;
}

export interface BenchmarkResult {
  iterations: number;
  times_ms: number[];
  min_ms: number;
  max_ms: number;
  avg_ms: number;
  median_ms: number;
  p95_ms: number;
  p99_ms: number;
  success_count: number;
  failure_count: number;
  statuses: number[];
  errors: string[];
  total_bytes: number;
}

export interface RunRequestResult {
  request_name: string;
  request_method: string;
  request_url: string;
  status_code: number;
  status_text: string;
  time_ms: number;
  size: number;
  test_results: TestResult[];
  script_logs: ScriptLog[];
  error: string | null;
}

export interface CollectionRunResult {
  id: string;
  collection_id: string;
  collection_name: string;
  environment_id: string | null;
  started_at: string;
  completed_at: string;
  delay_ms: number;
  stop_on_failure: boolean;
  results: RunRequestResult[];
  total: number;
  passed: number;
  failed: number;
  total_time_ms: number;
}

export interface BenchmarkHistoryEntry {
  id: string;
  request: HttpRequest;
  result: BenchmarkResult;
  created_at: string;
}

// ─── API Intelligence types ──────────────────────────────────────────────────

export interface DailyCount {
  date: string;
  count: number;
}

export interface ApiIntelligenceOverview {
  total_endpoints: number;
  total_requests: number;
  total_schema_changes: number;
  endpoints_with_regression: number;
  avg_response_time_ms: number;
  last_analyzed: string;
  status_200_pct: number;
  status_400_pct: number;
  status_500_pct: number;
  daily_request_counts: DailyCount[];
}

export interface EndpointInsight {
  endpoint_key: string;
  method: string;
  request_count: number;
  avg_time_ms: number;
  p95_time_ms: number;
  min_time_ms: number;
  max_time_ms: number;
  last_seen: string;
  first_seen: string;
  status_200_count: number;
  status_400_count: number;
  status_500_count: number;
  status_other_count: number;
  schema_version_count: number;
  has_recent_regression: boolean;
  avg_size_bytes: number;
}

export interface PerformancePoint {
  date: string;
  avg_ms: number;
  p95_ms: number;
  min_ms: number;
  max_ms: number;
  count: number;
}

export interface SchemaVersionInfo {
  fingerprint: string;
  seen_at: string;
  field_count: number;
  fields: string[];
}

export interface RecentRequest {
  id: string;
  created_at: string;
  status: number;
  time_ms: number;
  size: number;
  schema_fingerprint: string;
}

export interface EndpointDetail {
  endpoint_key: string;
  method: string;
  request_count: number;
  avg_time_ms: number;
  p95_time_ms: number;
  min_time_ms: number;
  max_time_ms: number;
  last_seen: string;
  first_seen: string;
  status_200_count: number;
  status_400_count: number;
  status_500_count: number;
  status_other_count: number;
  avg_size_bytes: number;
  performance_history: PerformancePoint[];
  schema_evolution: SchemaVersionInfo[];
  recent_requests: RecentRequest[];
}

export interface PerformanceRegression {
  endpoint_key: string;
  method: string;
  current_avg_ms: number;
  baseline_avg_ms: number;
  increase_pct: number;
}

export interface GlobalVariables {
  id: string;
  variables: KeyValue[];
  created_at: string;
  updated_at: string;
}

export interface Environment {
  id: string;
  name: string;
  variables: KeyValue[];
  created_at: string;
  updated_at: string;
}

export async function sendRequest(request: HttpRequest, timeout?: number, environmentId?: string | null): Promise<HttpResponse> {
  return invoke("send_request", { request, timeout: timeout ?? 30, environmentId: environmentId ?? null });
}

export async function cancelRequest(requestId: string): Promise<void> {
  return invoke("cancel_request", { requestId });
}

export async function benchmarkRequest(request: HttpRequest, count: number): Promise<BenchmarkResult> {
  return invoke("benchmark_request", { request, count });
}

export async function getBenchmarkHistory(limit?: number, offset?: number): Promise<BenchmarkHistoryEntry[]> {
  return invoke("get_benchmark_history", { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function deleteBenchmarkHistory(id: string): Promise<void> {
  return invoke("delete_benchmark_history", { id });
}

export async function clearBenchmarkHistory(): Promise<void> {
  return invoke("clear_benchmark_history");
}

export async function importCurl(curlCommand: string): Promise<HttpRequest> {
  return invoke("import_curl", { curlCommand });
}

export async function runCollection(
  collectionId: string,
  environmentId?: string | null,
  delayMs?: number,
  stopOnFailure?: boolean
): Promise<CollectionRunResult> {
  return invoke("run_collection", {
    collectionId,
    environmentId: environmentId ?? null,
    delayMs: delayMs ?? 0,
    stopOnFailure: stopOnFailure ?? false,
  });
}

export async function getRunHistory(limit?: number, offset?: number): Promise<CollectionRunResult[]> {
  return invoke("get_run_history", { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function deleteRunHistory(id: string): Promise<void> {
  return invoke("delete_run_history", { id });
}

export async function clearRunHistory(): Promise<void> {
  return invoke("clear_run_history");
}

export async function importOpenApi(specContent: string, collectionName: string): Promise<Collection> {
  return invoke("import_openapi", { specContent, collectionName });
}

export async function importPostmanCollection(specContent: string, collectionName?: string): Promise<Collection> {
  return invoke("import_postman_collection", { specContent, collectionName: collectionName ?? null });
}

export async function exportPostmanCollection(collectionId: string): Promise<string> {
  return invoke("export_postman_collection", { collectionId });
}

export async function getHistory(limit?: number, offset?: number): Promise<HistoryEntry[]> {
  return invoke("get_history", { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function deleteHistory(id: string): Promise<void> {
  return invoke("delete_history", { id });
}

export async function clearHistory(): Promise<void> {
  return invoke("clear_history");
}

export async function getCollections(): Promise<Collection[]> {
  return invoke("get_collections");
}

export async function createCollection(name: string): Promise<Collection> {
  return invoke("create_collection", { name });
}

export async function updateCollection(collection: Collection): Promise<void> {
  return invoke("update_collection", { collection });
}

export async function deleteCollection(id: string): Promise<void> {
  return invoke("delete_collection", { id });
}

export async function getEnvironments(): Promise<Environment[]> {
  return invoke("get_environments");
}

export async function createEnvironment(name: string): Promise<Environment> {
  return invoke("create_environment", { name });
}

export async function updateEnvironment(environment: Environment): Promise<void> {
  return invoke("update_environment", { environment });
}

export async function deleteEnvironment(id: string): Promise<void> {
  return invoke("delete_environment", { id });
}

export async function getCookies(): Promise<StoredCookie[]> {
  return invoke("get_cookies");
}

export async function deleteCookie(id: string): Promise<void> {
  return invoke("delete_cookie", { id });
}

export async function clearCookies(): Promise<void> {
  return invoke("clear_cookies");
}

// --- Global variables & secrets ---

export async function getGlobalVariables(): Promise<GlobalVariables> {
  return invoke("get_global_variables_cmd");
}

export async function saveGlobalVariables(global: GlobalVariables): Promise<void> {
  return invoke("save_global_variables_cmd", { global });
}

export async function encryptSecretValue(plaintext: string): Promise<string> {
  return invoke("encrypt_secret_value", { plaintext });
}

export async function decryptSecretValue(ciphertext: string): Promise<string> {
  return invoke("decrypt_secret_value", { ciphertext });
}

// --- WebSocket commands ---

export async function wsConnect(url: string): Promise<string> {
  return invoke("ws_connect", { url });
}

export async function wsSend(connectionId: string, message: string): Promise<void> {
  return invoke("ws_send", { connectionId, message });
}

export async function wsDisconnect(connectionId: string): Promise<void> {
  return invoke("ws_disconnect", { connectionId });
}

export interface WsMessageEvent {
  connection_id: string;
  direction: "sent" | "received" | "system";
  data: string;
  is_binary: boolean;
}

// ─── API Intelligence commands ───────────────────────────────────────────────

export async function analyzeApiBehavior(): Promise<ApiIntelligenceOverview> {
  return invoke("analyze_api_behavior_cmd");
}

export async function getApiIntelligenceOverview(): Promise<ApiIntelligenceOverview> {
  return invoke("get_api_intelligence_overview");
}

export async function getAllEndpointInsights(): Promise<EndpointInsight[]> {
  return invoke("get_all_endpoint_insights");
}

export async function getEndpointDetail(endpointKey: string): Promise<EndpointDetail> {
  return invoke("get_endpoint_detail_cmd", { endpointKey });
}

export async function getPerformanceTimeline(endpointKey: string): Promise<PerformancePoint[]> {
  return invoke("get_performance_timeline_cmd", { endpointKey });
}

export async function getSchemaEvolution(endpointKey: string): Promise<SchemaVersionInfo[]> {
  return invoke("get_schema_evolution_cmd", { endpointKey });
}

export async function getPerformanceRegressions(): Promise<PerformanceRegression[]> {
  return invoke("get_performance_regressions");
}
