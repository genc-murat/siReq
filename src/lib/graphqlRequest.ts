import type { AuthConfig, KeyValue } from "@/lib/invoke";

/**
 * Build the JSON body string for a GraphQL HTTP POST request.
 * Format: { "query": "...", "variables": {...}, "operationName": "..." }
 *
 * Property 7: HTTP POST Body Formatı
 */
export function buildGraphQLRequestBody(
  query: string,
  variables: unknown,
  operationName: string
): string {
  return JSON.stringify({ query, variables, operationName });
}

/**
 * Build the request headers for a GraphQL HTTP POST request.
 * Always includes Content-Type: application/json.
 * Merges user-supplied headers, applying auth headers automatically.
 *
 * Property 8: Content-Type Başlığı Invariantı
 */
export function buildGraphQLHeaders(
  userHeaders: KeyValue[],
  auth: AuthConfig
): KeyValue[] {
  const headers: KeyValue[] = [
    // Content-Type is always present
    { key: "Content-Type", value: "application/json", enabled: true },
  ];

  // Add auth header based on auth type
  if (auth.type === "bearer" && auth.token) {
    headers.push({
      key: "Authorization",
      value: `Bearer ${auth.token}`,
      enabled: true,
    });
  } else if (auth.type === "basic" && (auth.username || auth.password)) {
    const encoded = btoa(`${auth.username}:${auth.password}`);
    headers.push({
      key: "Authorization",
      value: `Basic ${encoded}`,
      enabled: true,
    });
  } else if (auth.type === "api_key" && auth.api_key && auth.api_key_in === "header") {
    headers.push({
      key: auth.api_key_name || "X-API-Key",
      value: auth.api_key,
      enabled: true,
    });
  }

  // Merge user-supplied headers (they override defaults except Content-Type if disabled)
  for (const h of userHeaders) {
    if (!h.enabled) continue;
    // Don't duplicate Content-Type if user also set it
    if (h.key.toLowerCase() === "content-type") continue;
    headers.push(h);
  }

  return headers;
}

/**
 * Detect GraphQL operation type from the query string.
 * Returns "query", "mutation", or "subscription".
 */
export function detectOperationType(
  query: string
): "query" | "mutation" | "subscription" {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.startsWith("mutation")) return "mutation";
  if (trimmed.startsWith("subscription")) return "subscription";
  return "query";
}

/**
 * Parse variables string (JSON) safely. Returns parsed object or {} on failure.
 */
export function parseVariablesSafe(variablesJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(variablesJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Check if a variables JSON string is valid.
 */
export function isValidVariablesJson(value: string): boolean {
  if (!value.trim() || value.trim() === "{}") return true;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}
