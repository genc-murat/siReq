// ─── Core HTTP Types ─────────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "TRACE";
export type BodyType = "none" | "json" | "xml" | "text" | "form" | "form_urlencoded" | "graphql";
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

export interface VariableExtraction {
  id: string;
  name: string;
  expression: string;
  target_variable: string;
  enabled: boolean;
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
  extractions?: VariableExtraction[];
  tags?: string[];
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

// ─── Variable Extraction / Data-Driven Types ────────────────────────────────

export interface DatasetRow {
  values: Record<string, string>;
}

export interface RunDataset {
  name?: string;
  columns?: unknown[];
  rows: DatasetRow[];
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
  extractions?: VariableExtraction[];
  tags?: string[];
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

export interface HistoryEntry {
  id: string;
  request: HttpRequest;
  response: HttpResponse;
  created_at: string;
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

// ─── Benchmark Types ────────────────────────────────────────────────────────

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

export interface BenchmarkHistoryEntry {
  id: string;
  request: HttpRequest;
  result: BenchmarkResult;
  created_at: string;
}

// ─── Runner Types ───────────────────────────────────────────────────────────

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
  extracted_variables: [string, string][];
  iteration: number | null;
}

export type RunMode = "functional" | "smoke" | "regression" | "load";

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
  extracted_variables?: [string, string][];
  mode?: RunMode;
  tags_filter?: string[];
  baseline_id?: string | null;
}

export interface TestSuiteConfig {
  tags: string[];
  delay_ms: number;
  stop_on_failure: boolean;
  baseline_id?: string | null;
}

// ─── Environment Types ──────────────────────────────────────────────────────

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

// ─── WebSocket Types ────────────────────────────────────────────────────────

export interface WsMessageEvent {
  connection_id: string;
  direction: "sent" | "received" | "system";
  data: string;
  is_binary: boolean;
}

// ─── gRPC Types ──────────────────────────────────────────────────────────────

export interface GrpcFieldInfo {
  name: string;
  field_type: string;
  label: string;
  is_map: boolean;
  /** Nested sub-fields for message types */
  sub_fields: GrpcFieldInfo[];
  /** Enum value names for enum types */
  enum_values: string[];
}

export interface GrpcMethodInfo {
  name: string;
  full_name: string;
  input_type: string;
  output_type: string;
  client_streaming: boolean;
  server_streaming: boolean;
  input_fields: GrpcFieldInfo[];
  output_fields: GrpcFieldInfo[];
}

export interface GrpcServiceInfo {
  name: string;
  full_name: string;
  methods: GrpcMethodInfo[];
}

export interface GrpcDescriptorSet {
  proto_id: string;
  services: GrpcServiceInfo[];
  from_cache: boolean;
}

export interface GrpcResponse {
  status_code: string;
  status_message: string;
  headers: [string, string][];
  body: string;
  size: number;
  time_ms: number;
  error: string | null;
}

export interface GrpcHistoryEntry {
  id: string;
  address: string;
  tls: boolean;
  service_name: string;
  method_name: string;
  method_kind: string;
  proto_content: string | null;
  input_json: string | null;
  input_jsons: string[];
  responses: GrpcResponse[];
  error: string | null;
  created_at: string;
}

// ─── API Intelligence Types ──────────────────────────────────────────────────

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

// ─── Smart Mock Server Types ───────────────────────────────────────────────

export interface CorsConfig {
  allow_origin: string;
  allow_methods: string[];
  allow_headers: string[];
  allow_credentials: boolean;
}

export interface LatencyProfile {
  mode: "fixed" | "random_range" | "normal_distribution";
  fixed_ms?: number | null;
  min_ms?: number | null;
  max_ms?: number | null;
  mean_ms?: number | null;
  std_dev_ms?: number | null;
}

export interface RequestMatcher {
  source: "query" | "header" | "body" | "jsonpath";
  key: string;
  operator: "equals" | "contains" | "regex" | "exists";
  value: string;
}

export interface ResponseScenario {
  id: string;
  name: string;
  is_default: boolean;
  status_code: number;
  headers: Record<string, string>;
  body: string;
  latency?: LatencyProfile | null;
  rules: RequestMatcher[];
}

export interface MockEndpoint {
  id: string;
  path: string;
  method: string;
  scenarios: ResponseScenario[];
}

export interface MockServerConfig {
  id: string;
  name: string;
  port: number;
  endpoints: MockEndpoint[];
  cors_enabled: boolean;
  cors_config: CorsConfig;
  headers: Record<string, string>;
}

export interface MockLogEntry {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  request_headers: Record<string, string>;
  request_body: string;
  response_status: number;
  response_headers: Record<string, string>;
  response_body: string;
  latency_ms: number;
  matched_scenario?: string | null;
  warnings: string[];
}

export interface MockServerStatus {
  id: string;
  name: string;
  port: number;
  status: "running" | "stopped" | "error";
  error_message?: string | null;
}

export interface MockStats {
  request_count: number;
  error_count: number;
  average_latency_ms: number;
}

// ─── ReplayLab Types ───────────────────────────────────────────────────────────

export interface RemapRule {
  id: string;
  pattern: string;
  replacement: string;
  enabled: boolean;
}

export interface ReplayAssertion {
  id: string;
  type: "status_code" | "response_time" | "body_contains" | "json_path";
  expression: string;
  expected: string;
  passed?: boolean | null;
  actual?: string | null;
  enabled: boolean;
}

export interface ChaosConfig {
  enabled: boolean;
  timeout_probability: number;
  timeout_min_ms: number;
  timeout_max_ms: number;
  delay_probability: number;
  delay_min_ms: number;
  delay_max_ms: number;
  error_probability: number;
  error_status_codes: number[];
}

export interface ReplaySession {
  id: string;
  name: string;
  description: string;
  remap_rules: RemapRule[];
  assertions: ReplayAssertion[];
  chaos_config: ChaosConfig;
  created_at: string;
  updated_at: string;
}

export interface ReplayEntry {
  id: string;
  session_id: string;
  position: number;
  original_request: HttpRequest;
  original_response: HttpResponse;
  created_at: string;
}

export interface ReplayRun {
  id: string;
  session_id: string;
  status: "completed" | "partial" | "failed";
  duration_ms: number;
  environment_id: string | null;
  chaos_config: ChaosConfig;
  created_at: string;
}

export interface ModifiedKey {
  key: string;
  original: string;
  replayed: string;
}

export interface TextDiffLine {
  type: "added" | "removed" | "unchanged" | "modified";
  value: string;
}

export interface BodyDiff {
  type: "json" | "text";
  added_keys: string[];
  removed_keys: string[];
  modified_keys: ModifiedKey[];
  text_diff?: TextDiffLine[] | null;
}

export interface ModifiedHeader {
  name: string;
  original: string;
  replayed: string;
}

export interface HeadersDiff {
  added: [string, string][];
  removed: [string, string][];
  modified: ModifiedHeader[];
}

export interface ReplayDiff {
  body_diff: BodyDiff;
  headers_diff: HeadersDiff;
  timing_diff_ms: number;
  schema_drift: string[];
}

export interface AssertionResult {
  id: string;
  type: "status_code" | "response_time" | "body_contains" | "json_path";
  expression: string;
  expected: string;
  passed: boolean;
  actual?: string | null;
  enabled: boolean;
}

export interface ReplayEntryResult {
  id: string;
  run_id: string;
  entry_id: string;
  status: "completed" | "failed" | "skipped";
  replayed_request: HttpRequest | null;
  replayed_response: HttpResponse | null;
  diff: ReplayDiff | null;
  assertion_results: AssertionResult[];
  error: string | null;
  created_at: string;
}

export interface ReplayRunDetail {
  run: ReplayRun;
  entry_results: ReplayEntryResult[];
}

export interface RunEntryComparison {
  entry_id: string;
  status_diff: boolean;
  timing_diff_ms: number | null;
  status_code_diff: [number, number] | null;
  assertions_passed_a: number;
  assertions_passed_b: number;
  result_a: ReplayEntryResult;
  result_b: ReplayEntryResult;
}

export interface ReplayRunComparison {
  run_a: ReplayRun;
  run_b: ReplayRun;
  comparisons: RunEntryComparison[];
}

export interface HarEntry {
  request: HttpRequest;
  response: HttpResponse;
}
