import { describe, it, expect } from "vitest";
import {
  buildGraphQLRequestBody,
  buildGraphQLHeaders,
  detectOperationType,
  isValidVariablesJson,
  parseVariablesSafe,
} from "@/lib/graphqlRequest";
import type { AuthConfig, KeyValue } from "@/lib/invoke";
import fc from "fast-check";

function defaultAuth(): AuthConfig {
  return {
    type: "none",
    username: "",
    password: "",
    token: "",
    api_key: "",
    api_key_name: "",
    api_key_in: "header",
  };
}

describe("graphqlRequest", () => {
  // ─── Unit: buildGraphQLRequestBody ──────────────────────────────────────────

  it("buildGraphQLRequestBody produces valid JSON with query, variables, operationName fields", () => {
    const body = buildGraphQLRequestBody("query { users { id } }", { id: "1" }, "GetUsers");
    const parsed = JSON.parse(body);
    expect(parsed.query).toBe("query { users { id } }");
    expect(parsed.variables).toEqual({ id: "1" });
    expect(parsed.operationName).toBe("GetUsers");
  });

  it("buildGraphQLRequestBody handles empty operationName", () => {
    const body = buildGraphQLRequestBody("{ users { id } }", {}, "");
    const parsed = JSON.parse(body);
    expect(parsed.operationName).toBe("");
  });

  it("buildGraphQLRequestBody handles null/undefined variables gracefully", () => {
    const body = buildGraphQLRequestBody("query { ping }", null, "");
    expect(() => JSON.parse(body)).not.toThrow();
  });

  // ─── Unit: buildGraphQLHeaders ──────────────────────────────────────────────

  it("buildGraphQLHeaders always includes Content-Type: application/json", () => {
    const headers = buildGraphQLHeaders([], defaultAuth());
    const ct = headers.find((h) => h.key.toLowerCase() === "content-type");
    expect(ct).toBeDefined();
    expect(ct!.value).toBe("application/json");
    expect(ct!.enabled).toBe(true);
  });

  it("buildGraphQLHeaders adds Authorization header for bearer auth", () => {
    const auth: AuthConfig = { ...defaultAuth(), type: "bearer", token: "mytoken123" };
    const headers = buildGraphQLHeaders([], auth);
    const authHeader = headers.find((h) => h.key === "Authorization");
    expect(authHeader).toBeDefined();
    expect(authHeader!.value).toBe("Bearer mytoken123");
  });

  it("buildGraphQLHeaders adds Authorization header for basic auth", () => {
    const auth: AuthConfig = { ...defaultAuth(), type: "basic", username: "user", password: "pass" };
    const headers = buildGraphQLHeaders([], auth);
    const authHeader = headers.find((h) => h.key === "Authorization");
    expect(authHeader).toBeDefined();
    expect(authHeader!.value).toContain("Basic ");
  });

  it("buildGraphQLHeaders merges user headers without duplicating Content-Type", () => {
    const userHeaders: KeyValue[] = [
      { key: "X-Custom", value: "foo", enabled: true },
      { key: "Content-Type", value: "text/plain", enabled: true }, // should be ignored
    ];
    const headers = buildGraphQLHeaders(userHeaders, defaultAuth());
    const cts = headers.filter((h) => h.key.toLowerCase() === "content-type");
    expect(cts.length).toBe(1); // only one Content-Type
    expect(cts[0].value).toBe("application/json"); // our value wins
    expect(headers.find((h) => h.key === "X-Custom")).toBeDefined();
  });

  it("buildGraphQLHeaders skips disabled user headers", () => {
    const userHeaders: KeyValue[] = [
      { key: "X-Disabled", value: "foo", enabled: false },
    ];
    const headers = buildGraphQLHeaders(userHeaders, defaultAuth());
    expect(headers.find((h) => h.key === "X-Disabled")).toBeUndefined();
  });

  // ─── Unit: detectOperationType ──────────────────────────────────────────────

  it("detectOperationType detects query", () => {
    expect(detectOperationType("query GetUser { user { id } }")).toBe("query");
    expect(detectOperationType("{ users { id } }")).toBe("query");
  });

  it("detectOperationType detects mutation", () => {
    expect(detectOperationType("mutation CreateUser($name: String!) { createUser(name: $name) { id } }")).toBe("mutation");
  });

  it("detectOperationType detects subscription", () => {
    expect(detectOperationType("subscription OnUserAdded { userAdded { id } }")).toBe("subscription");
    expect(detectOperationType("  SUBSCRIPTION { userAdded { id } }")).toBe("subscription");
  });

  it("buildGraphQLHeaders adds X-API-Key header for api_key auth in header", () => {
    const auth: AuthConfig = { ...defaultAuth(), type: "api_key", api_key: "my-api-key-123", api_key_name: "X-API-Key", api_key_in: "header" };
    const headers = buildGraphQLHeaders([], auth);
    const apiKeyHeader = headers.find((h) => h.key === "X-API-Key");
    expect(apiKeyHeader).toBeDefined();
    expect(apiKeyHeader!.value).toBe("my-api-key-123");
  });

  it("buildGraphQLHeaders uses default X-API-Key name when api_key_name is empty", () => {
    const auth: AuthConfig = { ...defaultAuth(), type: "api_key", api_key: "key-value", api_key_name: "", api_key_in: "header" };
    const headers = buildGraphQLHeaders([], auth);
    const apiKeyHeader = headers.find((h) => h.key === "X-API-Key");
    expect(apiKeyHeader).toBeDefined();
    expect(apiKeyHeader!.value).toBe("key-value");
  });

  it("buildGraphQLHeaders does NOT add auth header for api_key in query (not header)", () => {
    const auth: AuthConfig = { ...defaultAuth(), type: "api_key", api_key: "key", api_key_name: "", api_key_in: "query" };
    const headers = buildGraphQLHeaders([], auth);
    const apiKeyHeader = headers.find((h) => h.key === "X-API-Key");
    expect(apiKeyHeader).toBeUndefined();
  });

  // ─── Unit: isValidVariablesJson ─────────────────────────────────────────────

  it("isValidVariablesJson returns true for valid JSON objects", () => {
    expect(isValidVariablesJson("{}")).toBe(true);
    expect(isValidVariablesJson('{"id": "1"}')).toBe(true);
    expect(isValidVariablesJson("")).toBe(true);
  });

  it("isValidVariablesJson returns false for invalid JSON", () => {
    expect(isValidVariablesJson("{invalid")).toBe(false);
    expect(isValidVariablesJson("not json")).toBe(false);
  });

  // ─── Unit: parseVariablesSafe ──────────────────────────────────────────────

  it("parseVariablesSafe returns parsed object for valid JSON", () => {
    const result = parseVariablesSafe('{"id": "1", "name": "test"}');
    expect(result).toEqual({ id: "1", name: "test" });
  });

  it("parseVariablesSafe returns empty object for empty object", () => {
    expect(parseVariablesSafe("{}")).toEqual({});
  });

  it("parseVariablesSafe returns empty object for invalid JSON (branch: catch)", () => {
    expect(parseVariablesSafe("{invalid")).toEqual({});
  });

  it("parseVariablesSafe returns empty object for JSON array (not an object)", () => {
    expect(parseVariablesSafe("[1, 2, 3]")).toEqual({});
  });

  it("parseVariablesSafe returns empty object for null", () => {
    expect(parseVariablesSafe("null")).toEqual({});
  });

  it("parseVariablesSafe returns empty object for primitive values", () => {
    expect(parseVariablesSafe('"string"')).toEqual({});
    expect(parseVariablesSafe("42")).toEqual({});
    expect(parseVariablesSafe("true")).toEqual({});
  });

  // ─── Property 7: HTTP POST Body Formatı ─────────────────────────────────────

  it("Property 7: buildGraphQLRequestBody produces valid JSON for any query/variables/operationName", () => {
    // Feature: graphql-support, Property 7: HTTP POST Body Formatı
    fc.assert(
      fc.property(
        fc.string(),
        fc.object(),
        fc.string(),
        (query, variables, operationName) => {
          const body = buildGraphQLRequestBody(query, variables, operationName);
          const parsed = JSON.parse(body);
          expect(parsed).toHaveProperty("query", query);
          expect(parsed).toHaveProperty("variables");
          expect(parsed).toHaveProperty("operationName", operationName);
        }
      ),
      { numRuns: 100 }
    );
  });

  // ─── Property 8: Content-Type Başlığı Invariantı ───────────────────────────

  it("Property 8: buildGraphQLHeaders always includes Content-Type: application/json", () => {
    // Feature: graphql-support, Property 8: Content-Type Başlığı Invariantı
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            key: fc.string(),
            value: fc.string(),
            enabled: fc.boolean(),
          })
        ),
        (userHeaders) => {
          const headers = buildGraphQLHeaders(
            userHeaders as KeyValue[],
            defaultAuth()
          );
          const ct = headers.find(
            (h) => h.key.toLowerCase() === "content-type" && h.enabled
          );
          expect(ct).toBeDefined();
          expect(ct!.value).toBe("application/json");
        }
      ),
      { numRuns: 100 }
    );
  });
});
