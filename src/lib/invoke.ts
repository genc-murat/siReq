import { invoke as tauriInvoke } from "@tauri-apps/api/core";

/// Safe invoke wrapper — handles browser-only (non-Tauri) environments gracefully.
/// In browser-only Vite dev mode, `tauriInvoke` is undefined, so we catch and
/// return a clear error instead of crashing the app.
async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof tauriInvoke !== "function") {
    throw new Error(`Tauri backend not available: command '${cmd}' cannot be executed. Run 'cargo tauri dev' to start the full app.`);
  }
  return tauriInvoke(cmd, args ?? {}) as Promise<T>;
}

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
  json_schema?: string;
  examples?: RequestExample[];
}

// ─── Collection Tree Types ──────────────────────────────────────────────────

export type CollectionItem = CollectionFolder | CollectionRequest;

export interface CollectionFolder {
  type: "folder";
  id: string;
  name: string;
  description: string;
  items: CollectionItem[];
  auth?: AuthConfig | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionRequest {
  type: "request";
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
  json_schema?: string;
  examples?: RequestExample[];
}

export interface RequestExample {
  id: string;
  name: string;
  request: HttpRequest;
  response?: HttpResponse | null;
  created_at: string;
}

export interface RequestTemplate {
  id: string;
  name: string;
  description: string;
  request: HttpRequest;
  scope: string;
  created_at: string;
  updated_at: string;
}

/** Flatten collection items to count total requests (recursive). */
export function countCollectionRequests(items: CollectionItem[]): number {
  let count = 0;
  for (const item of items) {
    if (item.type === "request") {
      count++;
    } else {
      count += countCollectionRequests(item.items);
    }
  }
  return count;
}

/** Get item by ID from a collection tree (recursive). */
export function findCollectionItem(items: CollectionItem[], id: string): CollectionItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.type === "folder") {
      const found = findCollectionItem(item.items, id);
      if (found) return found;
    }
  }
  return null;
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
  requests: CollectionItem[];
  created_at: string;
  updated_at: string;
  variables?: KeyValue[];
  auth?: AuthConfig | null;
  description?: string;
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
  return safeInvoke("send_request", { request, timeout: timeout ?? 30, environmentId: environmentId ?? null });
}

export async function cancelRequest(requestId: string): Promise<void> {
  return safeInvoke("cancel_request", { requestId });
}

export async function benchmarkRequest(request: HttpRequest, count: number): Promise<BenchmarkResult> {
  return safeInvoke("benchmark_request", { request, count });
}

export async function getBenchmarkHistory(limit?: number, offset?: number): Promise<BenchmarkHistoryEntry[]> {
  return safeInvoke("get_benchmark_history", { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function deleteBenchmarkHistory(id: string): Promise<void> {
  return safeInvoke("delete_benchmark_history", { id });
}

export async function clearBenchmarkHistory(): Promise<void> {
  return safeInvoke("clear_benchmark_history");
}

export async function importCurl(curlCommand: string): Promise<HttpRequest> {
  return safeInvoke("import_curl", { curlCommand });
}

export async function runCollection(
  collectionId: string,
  environmentId?: string | null,
  delayMs?: number,
  stopOnFailure?: boolean
): Promise<CollectionRunResult> {
  return safeInvoke("run_collection", {
    collectionId,
    environmentId: environmentId ?? null,
    delayMs: delayMs ?? 0,
    stopOnFailure: stopOnFailure ?? false,
  });
}

export async function getRunHistory(limit?: number, offset?: number): Promise<CollectionRunResult[]> {
  return safeInvoke("get_run_history", { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function deleteRunHistory(id: string): Promise<void> {
  return safeInvoke("delete_run_history", { id });
}

export async function clearRunHistory(): Promise<void> {
  return safeInvoke("clear_run_history");
}

export async function importOpenApi(specContent: string, collectionName: string): Promise<Collection> {
  return safeInvoke("import_openapi", { specContent, collectionName });
}

export async function importPostmanCollection(specContent: string, collectionName?: string): Promise<Collection> {
  return safeInvoke("import_postman_collection", { specContent, collectionName: collectionName ?? null });
}

export async function exportPostmanCollection(collectionId: string): Promise<string> {
  return safeInvoke("export_postman_collection", { collectionId });
}

export async function getHistory(limit?: number, offset?: number): Promise<HistoryEntry[]> {
  return safeInvoke("get_history", { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function deleteHistory(id: string): Promise<void> {
  return safeInvoke("delete_history", { id });
}

export async function clearHistory(): Promise<void> {
  return safeInvoke("clear_history");
}

export async function getCollections(): Promise<Collection[]> {
  return safeInvoke("get_collections");
}

export async function createCollection(name: string): Promise<Collection> {
  return safeInvoke("create_collection", { name });
}

export async function updateCollection(collection: Collection): Promise<void> {
  return safeInvoke("update_collection", { collection });
}

export async function deleteCollection(id: string): Promise<void> {
  return safeInvoke("delete_collection", { id });
}

export async function getEnvironments(): Promise<Environment[]> {
  return safeInvoke("get_environments");
}

export async function createEnvironment(name: string): Promise<Environment> {
  return safeInvoke("create_environment", { name });
}

export async function updateEnvironment(environment: Environment): Promise<void> {
  return safeInvoke("update_environment", { environment });
}

export async function deleteEnvironment(id: string): Promise<void> {
  return safeInvoke("delete_environment", { id });
}

export async function getCookies(): Promise<StoredCookie[]> {
  return safeInvoke("get_cookies");
}

export async function deleteCookie(id: string): Promise<void> {
  return safeInvoke("delete_cookie", { id });
}

export async function clearCookies(): Promise<void> {
  return safeInvoke("clear_cookies");
}

// --- Global variables & secrets ---

export async function getGlobalVariables(): Promise<GlobalVariables> {
  return safeInvoke("get_global_variables_cmd");
}

export async function saveGlobalVariables(global: GlobalVariables): Promise<void> {
  return safeInvoke("save_global_variables_cmd", { global });
}

export async function encryptSecretValue(plaintext: string): Promise<string> {
  return safeInvoke("encrypt_secret_value", { plaintext });
}

export async function decryptSecretValue(ciphertext: string): Promise<string> {
  return safeInvoke("decrypt_secret_value", { ciphertext });
}

// --- WebSocket commands ---

export async function wsConnect(url: string): Promise<string> {
  return safeInvoke("ws_connect", { url });
}

export async function wsSend(connectionId: string, message: string): Promise<void> {
  return safeInvoke("ws_send", { connectionId, message });
}

export async function wsDisconnect(connectionId: string): Promise<void> {
  return safeInvoke("ws_disconnect", { connectionId });
}

export interface WsMessageEvent {
  connection_id: string;
  direction: "sent" | "received" | "system";
  data: string;
  is_binary: boolean;
}

// ─── Collection Tree Operations ──────────────────────────────────────────────

export async function createCollectionFolder(
  collectionId: string,
  name: string,
  parentFolderId?: string | null
): Promise<Collection> {
  return safeInvoke("create_collection_folder", {
    collectionId,
    name,
    parentFolderId: parentFolderId ?? null,
  });
}

export async function addRequestToCollection(
  collectionId: string,
  request: HttpRequest,
  parentFolderId?: string | null,
  position?: number | null
): Promise<Collection> {
  return safeInvoke("add_request_to_collection", {
    collectionId,
    request,
    parentFolderId: parentFolderId ?? null,
    position: position ?? null,
  });
}

export async function deleteCollectionItem(
  collectionId: string,
  itemId: string
): Promise<Collection> {
  return safeInvoke("delete_collection_item", { collectionId, itemId });
}

export async function moveCollectionItem(
  collectionId: string,
  itemId: string,
  targetFolderId?: string | null,
  targetIndex?: number
): Promise<Collection> {
  return safeInvoke("move_collection_item", {
    collectionId,
    itemId,
    targetFolderId: targetFolderId ?? null,
    targetIndex: targetIndex ?? 0,
  });
}

// ─── Template commands ───────────────────────────────────────────────────────

export async function getTemplates(): Promise<RequestTemplate[]> {
  return safeInvoke("get_templates");
}

export async function createTemplate(
  name: string,
  description: string,
  request: HttpRequest,
  scope?: string
): Promise<RequestTemplate> {
  return safeInvoke("create_template", {
    name,
    description,
    request,
    scope: scope ?? "global",
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  return safeInvoke("delete_template", { id });
}

// ─── API Intelligence commands ───────────────────────────────────────────────

export async function analyzeApiBehavior(): Promise<ApiIntelligenceOverview> {
  return safeInvoke("analyze_api_behavior_cmd");
}

export async function getApiIntelligenceOverview(): Promise<ApiIntelligenceOverview> {
  return safeInvoke("get_api_intelligence_overview");
}

export async function getAllEndpointInsights(): Promise<EndpointInsight[]> {
  return safeInvoke("get_all_endpoint_insights");
}

export async function getEndpointDetail(endpointKey: string): Promise<EndpointDetail> {
  return safeInvoke("get_endpoint_detail_cmd", { endpointKey });
}

export async function getPerformanceTimeline(endpointKey: string): Promise<PerformancePoint[]> {
  return safeInvoke("get_performance_timeline_cmd", { endpointKey });
}

export async function getSchemaEvolution(endpointKey: string): Promise<SchemaVersionInfo[]> {
  return safeInvoke("get_schema_evolution_cmd", { endpointKey });
}

export async function getPerformanceRegressions(): Promise<PerformanceRegression[]> {
  return safeInvoke("get_performance_regressions");
}
