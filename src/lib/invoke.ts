import { invoke } from "@tauri-apps/api/core";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "TRACE";
export type BodyType = "none" | "json" | "xml" | "text" | "form" | "form_urlencoded";
export type AuthType = "none" | "basic" | "bearer" | "api_key";

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
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

export async function importCurl(curlCommand: string): Promise<HttpRequest> {
  return invoke("import_curl", { curlCommand });
}

export async function importOpenApi(specContent: string, collectionName: string): Promise<Collection> {
  return invoke("import_openapi", { specContent, collectionName });
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
