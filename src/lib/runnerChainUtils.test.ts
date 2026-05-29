import { describe, it, expect } from "vitest";
import {
  buildExtractionGroups,
  buildChainFlow,
  buildRunnerChainData,
  type ExtractionGroup,
} from "./runnerChainUtils";
import type { RunRequestResult, CollectionRunResult } from "./invoke";

// ─── Factories ───────────────────────────────────────────────────────────

function makeResult(overrides: Partial<RunRequestResult> & { extracted_variables?: [string, string][] }): RunRequestResult {
  return {
    request_name: overrides.request_name ?? "GET /test",
    request_method: overrides.request_method ?? "GET",
    request_url: overrides.request_url ?? "https://api.example.com/test",
    status_code: overrides.status_code ?? 200,
    status_text: overrides.status_text ?? "OK",
    time_ms: overrides.time_ms ?? 100,
    size: overrides.size ?? 256,
    test_results: overrides.test_results ?? [],
    script_logs: overrides.script_logs ?? [],
    error: overrides.error ?? null,
    extracted_variables: overrides.extracted_variables ?? [],
    iteration: overrides.iteration ?? null,
  };
}

function makeRunResult(overrides?: Partial<CollectionRunResult>): CollectionRunResult {
  return {
    id: overrides?.id ?? "run-1",
    collection_id: overrides?.collection_id ?? "col-1",
    collection_name: overrides?.collection_name ?? "Test Collection",
    environment_id: overrides?.environment_id ?? null,
    started_at: overrides?.started_at ?? "2025-01-01T00:00:00Z",
    completed_at: overrides?.completed_at ?? "2025-01-01T00:01:00Z",
    delay_ms: overrides?.delay_ms ?? 0,
    stop_on_failure: overrides?.stop_on_failure ?? false,
    results: overrides?.results ?? [],
    total: overrides?.total ?? 0,
    passed: overrides?.passed ?? 0,
    failed: overrides?.failed ?? 0,
    total_time_ms: overrides?.total_time_ms ?? 0,
    extracted_variables: overrides?.extracted_variables ?? [],
  };
}

// ─── buildExtractionGroups ───────────────────────────────────────────────

describe("buildExtractionGroups", () => {
  it("returns empty array for no results", () => {
    expect(buildExtractionGroups([])).toEqual([]);
  });

  it("filters out results without extracted variables", () => {
    const results = [
      makeResult({ extracted_variables: [] }),
      makeResult({ extracted_variables: [["token", "abc"]] }),
      makeResult({ extracted_variables: [] }),
    ];
    const groups = buildExtractionGroups(results);
    expect(groups).toHaveLength(1);
    expect(groups[0].index).toBe(1);
    expect(groups[0].variables).toEqual([["token", "abc"]]);
  });

  it("preserves all results when all have extractions", () => {
    const results = [
      makeResult({ request_name: "Login", request_method: "POST", status_code: 200, extracted_variables: [["token", "abc"]] }),
      makeResult({ request_name: "Profile", request_method: "GET", status_code: 200, extracted_variables: [["userId", "42"]] }),
    ];
    const groups = buildExtractionGroups(results);
    expect(groups).toHaveLength(2);
    expect(groups[0].requestName).toBe("Login");
    expect(groups[0].requestMethod).toBe("POST");
    expect(groups[0].statusCode).toBe(200);
    expect(groups[0].hasError).toBe(false);
    expect(groups[1].requestName).toBe("Profile");
  });

  it("marks hasError when error is present", () => {
    const results = [
      makeResult({ error: "Connection timeout", extracted_variables: [["retry", "true"]] }),
    ];
    const groups = buildExtractionGroups(results);
    expect(groups[0].hasError).toBe(true);
  });

  it("handles variables as empty array when extracted_variables is undefined", () => {
    // Simulate what happens if backend returns undefined
    const result = makeResult({} as Partial<RunRequestResult> & { extracted_variables?: [string, string][] });
    // Safe assignment
    (result as { extracted_variables?: [string, string][] }).extracted_variables = undefined as unknown as [string, string][];
    const groups = buildExtractionGroups([result]);
    expect(groups).toHaveLength(0);
  });

  it("preserves original array indices in the index field", () => {
    const results = [
      makeResult({ extracted_variables: [] }),                                            // index 0 — filtered out
      makeResult({ extracted_variables: [] }),                                            // index 1 — filtered out
      makeResult({ request_name: "Login", extracted_variables: [["token", "abc"]] }),     // index 2 — kept
      makeResult({ extracted_variables: [] }),                                            // index 3 — filtered out
      makeResult({ request_name: "Logout", extracted_variables: [["msg", "done"]] }),     // index 4 — kept
    ];
    const groups = buildExtractionGroups(results);
    expect(groups).toHaveLength(2);
    expect(groups[0].index).toBe(2);
    expect(groups[0].requestName).toBe("Login");
    expect(groups[1].index).toBe(4);
    expect(groups[1].requestName).toBe("Logout");
  });
});

// ─── buildChainFlow ──────────────────────────────────────────────────────

describe("buildChainFlow", () => {
  it("returns empty array for empty groups", () => {
    expect(buildChainFlow([])).toEqual([]);
  });

  it("returns empty array when no variable is reused across requests", () => {
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "Login", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["token", "abc"]] },
      { index: 1, requestName: "Profile", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["userId", "42"]] },
    ];
    expect(buildChainFlow(groups)).toEqual([]);
  });

  it("detects a simple chain: token extracted in req 0 flows into req 1", () => {
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "Login", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["token", "abc"]] },
      { index: 1, requestName: "Profile", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["token", "def"]] },
    ];
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(1);
    expect(flow[0]).toEqual({ fromIndex: 0, toIndex: 1, varName: "token", varValue: "def" });
  });

  it("detects multiple variables chaining across requests", () => {
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "Auth", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["token", "xyz"], ["refresh", "rt1"]] },
      { index: 1, requestName: "Dashboard", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["token", "xyz2"]] },
      { index: 2, requestName: "Settings", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["refresh", "rt2"]] },
    ];
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(2);
    expect(flow[0]).toEqual({ fromIndex: 0, toIndex: 1, varName: "token", varValue: "xyz2" });
    expect(flow[1]).toEqual({ fromIndex: 0, toIndex: 2, varName: "refresh", varValue: "rt2" });
  });

  it("chains across non-consecutive requests when intermediate request has no extraction", () => {
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "Login", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["token", "abc"]] },
      // index 1 has no extractions — not in groups
      { index: 2, requestName: "Profile", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["token", "new_abc"]] },
    ];
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(1);
    expect(flow[0]).toEqual({ fromIndex: 0, toIndex: 2, varName: "token", varValue: "new_abc" });
  });

  it("handles multiple chains for the same variable name across several requests", () => {
    // token flows: req 0 → req 2, req 2 → req 3 (but only tracks first occurrence)
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "Login", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["token", "abc"]] },
      { index: 1, requestName: "Other", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["session", "s1"]] },
      { index: 2, requestName: "Profile", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["token", "def"]] },
      { index: 3, requestName: "Settings", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["token", "ghi"]] },
    ];
    const flow = buildChainFlow(groups);
    // token first seen at index 0, then appears at index 2 → chain 0→2
    // token first seen at index 0 (not updated to 2), so at index 3 → fromIndex is still 0 → chain 0→3
    expect(flow).toHaveLength(2);
    expect(flow[0]).toEqual({ fromIndex: 0, toIndex: 2, varName: "token", varValue: "def" });
    expect(flow[1]).toEqual({ fromIndex: 0, toIndex: 3, varName: "token", varValue: "ghi" });
  });

  it("uses varValue from the later request (the value that was sent onward)", () => {
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "Auth", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["token", "original"]] },
      { index: 2, requestName: "Refresh", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["token", "refreshed"]] },
    ];
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(1);
    expect(flow[0].varValue).toBe("refreshed");
  });

  it("does NOT create a chain when the same variable appears in the FIRST extraction group only once", () => {
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "Login", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["token", "abc"]] },
    ];
    expect(buildChainFlow(groups)).toEqual([]);
  });

  it("does NOT create a chain when same variable appears only in the same request (multiple vars with same name)", () => {
    // Edge case: same variable name extracted twice in the same request
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "Login", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["token", "abc"], ["token", "def"]] },
    ];
    // All same index — no chain (fromIdx 0 is not < toIndex 0)
    expect(buildChainFlow(groups)).toEqual([]);
  });
});

// ─── buildRunnerChainData ────────────────────────────────────────────────

describe("buildRunnerChainData", () => {
  it("returns empty data for null runResult", () => {
    const data = buildRunnerChainData(null);
    expect(data.extractionGroups).toEqual([]);
    expect(data.chainFlow).toEqual([]);
    expect(data.totalExtractions).toBe(0);
  });

  it("returns empty data for undefined runResult", () => {
    const data = buildRunnerChainData(undefined as unknown as CollectionRunResult | null);
    expect(data.extractionGroups).toEqual([]);
    expect(data.chainFlow).toEqual([]);
    expect(data.totalExtractions).toBe(0);
  });

  it("returns empty data for runResult with no results", () => {
    const data = buildRunnerChainData(makeRunResult({ results: [] }));
    expect(data.extractionGroups).toEqual([]);
    expect(data.chainFlow).toEqual([]);
    expect(data.totalExtractions).toBe(0);
  });

  it("computes totalExtractions correctly", () => {
    const runResult = makeRunResult({
      results: [
        makeResult({ extracted_variables: [["a", "1"], ["b", "2"]] }),
        makeResult({ extracted_variables: [] }),
        makeResult({ extracted_variables: [["c", "3"]] }),
      ],
    });
    const data = buildRunnerChainData(runResult);
    expect(data.totalExtractions).toBe(3); // 2 + 0 + 1
    expect(data.extractionGroups).toHaveLength(2);
  });

  it("builds chain flow from runResult data", () => {
    const runResult = makeRunResult({
      results: [
        makeResult({ request_name: "Login", extracted_variables: [["token", "abc"]] }),
        makeResult({ request_name: "Profile", extracted_variables: [] }),
        makeResult({ request_name: "Dashboard", extracted_variables: [["token", "def"]] }),
      ],
    });
    const data = buildRunnerChainData(runResult);
    expect(data.chainFlow).toHaveLength(1);
    expect(data.chainFlow[0]).toEqual({ fromIndex: 0, toIndex: 2, varName: "token", varValue: "def" });
    expect(data.extractionGroups).toHaveLength(2);
    expect(data.extractionGroups[0].requestName).toBe("Login");
    expect(data.extractionGroups[1].requestName).toBe("Dashboard");
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles large number of variables without performance regression", () => {
    // Build 20 requests each with 50 variables
    const results: RunRequestResult[] = [];
    for (let i = 0; i < 20; i++) {
      const vars: [string, string][] = [];
      for (let v = 0; v < 50; v++) {
        vars.push([`var_${v}`, `value_${v}_${i}`]);
      }
      results.push(makeResult({ request_name: `Req ${i}`, extracted_variables: vars }));
    }
    const groups = buildExtractionGroups(results);
    expect(groups).toHaveLength(20);
    // Each variable appears in every request, so chain flow tracks each var 19 times
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(50 * 19); // 950 chains
    expect(flow[0].varName).toBe("var_0");
    expect(flow[0].fromIndex).toBe(0);
    expect(flow[0].toIndex).toBe(1);
  });

  it("handles variables with empty string keys and values", () => {
    const results = [
      makeResult({ extracted_variables: [["", "val"]] }),
      makeResult({ extracted_variables: [["", "val2"]] }),
    ];
    const groups = buildExtractionGroups(results);
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(1);
    expect(flow[0].varName).toBe("");
    expect(flow[0].varValue).toBe("val2");
  });

  it("handles special characters in variable names", () => {
    const results = [
      makeResult({ extracted_variables: [["user.name", "alice"], ["$special_key!", "value1"]] }),
      makeResult({ extracted_variables: [["user.name", "bob"]] }),
    ];
    const groups = buildExtractionGroups(results);
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(1);
    expect(flow[0].varName).toBe("user.name");
  });

  // Integration-style: real CollectionRunResult shape
  it("works with the exact CollectionRunResult shape from the backend", () => {
    const runResult: CollectionRunResult = {
      id: "integ-test-1",
      collection_id: "col-1",
      collection_name: "Integration Test",
      environment_id: null,
      started_at: "2025-06-01T10:00:00Z",
      completed_at: "2025-06-01T10:01:00Z",
      delay_ms: 0,
      stop_on_failure: false,
      results: [
        {
          request_name: "POST /auth/login",
          request_method: "POST",
          request_url: "https://api.example.com/auth/login",
          status_code: 200,
          status_text: "OK",
          time_ms: 120,
          size: 512,
          test_results: [{ name: "Status 200", passed: true }],
          script_logs: [],
          error: null,
          extracted_variables: [["access_token", "eyJhbGci..."], ["refresh_token", "abc123"]],
          iteration: null,
        },
        {
          request_name: "GET /users/me",
          request_method: "GET",
          request_url: "https://api.example.com/users/me",
          status_code: 200,
          status_text: "OK",
          time_ms: 80,
          size: 256,
          test_results: [{ name: "Has user data", passed: true }],
          script_logs: [],
          error: null,
          extracted_variables: [["user_id", "42"], ["access_token", "eyJhbGci...new"]],
          iteration: null,
        },
        {
          request_name: "GET /users/42/posts",
          request_method: "GET",
          request_url: "https://api.example.com/users/42/posts",
          status_code: 200,
          status_text: "OK",
          time_ms: 200,
          size: 1024,
          test_results: [],
          script_logs: [],
          error: null,
          extracted_variables: [],
          iteration: null,
        },
      ],
      total: 3,
      passed: 3,
      failed: 0,
      total_time_ms: 400,
      extracted_variables: [["access_token", "eyJhbGci..."], ["refresh_token", "abc123"], ["user_id", "42"]],
    };

    const { extractionGroups, chainFlow, totalExtractions } = buildRunnerChainData(runResult);

    expect(totalExtractions).toBe(4); // 2 from req 0, 2 from req 1
    expect(extractionGroups).toHaveLength(2);
    expect(extractionGroups[0].requestName).toBe("POST /auth/login");
    expect(extractionGroups[0].variables).toEqual([["access_token", "eyJhbGci..."], ["refresh_token", "abc123"]]);
    expect(extractionGroups[1].requestName).toBe("GET /users/me");
    expect(extractionGroups[1].variables).toEqual([["user_id", "42"], ["access_token", "eyJhbGci...new"]]);

    // Chain: access_token from req 0 → req 1
    expect(chainFlow).toHaveLength(1);
    expect(chainFlow[0]).toEqual({
      fromIndex: 0,
      toIndex: 1,
      varName: "access_token",
      varValue: "eyJhbGci...new",
    });
    // refresh_token: only in req 0, no chain
    // user_id: only in req 1, no chain
  });

  // ── Edge cases: circular / repeated chains ───────────────────────────

  it("variable appearing in 3+ requests always chains back to the FIRST occurrence only", () => {
    // "token" appears in requests 0, 2, 4 → all chain back to request 0 (first occurrence)
    const results = [
      makeResult({ request_name: "Login", extracted_variables: [["token", "abc"]] }),
      makeResult({ request_name: "Update", extracted_variables: [["session", "s1"]] }), // no token
      makeResult({ request_name: "Refresh", extracted_variables: [["token", "def"]] }),
      makeResult({ request_name: "Report", extracted_variables: [["audit", "log"]] }),   // no token
      makeResult({ request_name: "ReAuth", extracted_variables: [["token", "ghi"]] }),
    ];
    const groups = buildExtractionGroups(results);
    const flow = buildChainFlow(groups);
    // token first seen at index 0 → appears again at index 2 → chain 0→2
    // token first seen at index 0 (not updated) → appears at index 4 → chain 0→4
    expect(flow).toHaveLength(2);
    expect(flow[0]).toEqual({ fromIndex: 0, toIndex: 2, varName: "token", varValue: "def" });
    expect(flow[1]).toEqual({ fromIndex: 0, toIndex: 4, varName: "token", varValue: "ghi" });
  });

  it("does NOT create circular chains — always tracks the genesis request", () => {
    // Even if a variable "cycles" (appears at 0, 1, 2, 3...), every chain points to the FIRST request
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "A", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["x", "1"]] },
      { index: 1, requestName: "B", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["x", "2"]] },
      { index: 2, requestName: "C", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["x", "3"]] },
      { index: 3, requestName: "D", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["x", "4"]] },
      { index: 4, requestName: "E", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["x", "5"]] },
    ];
    const flow = buildChainFlow(groups);
    // All chains point to index 0 — no 1→2, 2→3, 3→4 chains
    expect(flow).toHaveLength(4);
    for (const item of flow) {
      expect(item.fromIndex).toBe(0);
      expect(item.varName).toBe("x");
    }
    expect(flow[0].toIndex).toBe(1);
    expect(flow[1].toIndex).toBe(2);
    expect(flow[2].toIndex).toBe(3);
    expect(flow[3].toIndex).toBe(4);
  });

  it("chains back to earliest request when variable first appears mid-sequence (not at index 0)", () => {
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "Auth", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["session", "s0"]] },
      // "userId" first appears at index 1
      { index: 1, requestName: "Create", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["userId", "u1"]] },
      { index: 2, requestName: "Update", requestMethod: "PUT", statusCode: 200, hasError: false, variables: [["userId", "u2"]] },
      { index: 3, requestName: "Delete", requestMethod: "DELETE", statusCode: 200, hasError: false, variables: [["userId", "u3"]] },
    ];
    const flow = buildChainFlow(groups);
    // userId first seen at 1 → chains to 2 and 3 from index 1
    expect(flow).toHaveLength(2);
    expect(flow[0]).toEqual({ fromIndex: 1, toIndex: 2, varName: "userId", varValue: "u2" });
    expect(flow[1]).toEqual({ fromIndex: 1, toIndex: 3, varName: "userId", varValue: "u3" });
  });

  it("chains across a gap where the variable is absent in intermediate extraction groups", () => {
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "Login", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["token", "abc"]] },
      { index: 1, requestName: "Dashboard", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["other", "val"]] }, // no token
      { index: 2, requestName: "Report", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["log", "data"]] },    // no token
      { index: 3, requestName: "Refresh", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["token", "xyz"]] },
    ];
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(1);
    expect(flow[0]).toEqual({ fromIndex: 0, toIndex: 3, varName: "token", varValue: "xyz" });
  });

  it("does not chain a variable that appears only in the last request (no later request to chain to)", () => {
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "Login", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["token", "abc"]] },
      { index: 1, requestName: "Profile", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["userId", "42"]] },
    ];
    const flow = buildChainFlow(groups);
    // token only in req 0 — no chain
    // userId only in req 1 — no chain (no later request to chain to)
    expect(flow).toEqual([]);
  });

  it("chains multiple different variables from the same source request", () => {
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "Auth", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["token", "abc"], ["refresh", "rt1"], ["session", "sid1"]] },
      { index: 1, requestName: "Profile", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["token", "abc2"]] },
      { index: 2, requestName: "Settings", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["refresh", "rt2"]] },
      { index: 3, requestName: "Logout", requestMethod: "POST", statusCode: 200, hasError: false, variables: [["session", "sid2"], ["token", "abc3"]] },
    ];
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(4);
    // All from index 0
    expect(flow.filter(f => f.fromIndex === 0)).toHaveLength(4);
    expect(flow[0]).toEqual({ fromIndex: 0, toIndex: 1, varName: "token", varValue: "abc2" });
    expect(flow[1]).toEqual({ fromIndex: 0, toIndex: 2, varName: "refresh", varValue: "rt2" });
    expect(flow[2]).toEqual({ fromIndex: 0, toIndex: 3, varName: "session", varValue: "sid2" });
    expect(flow[3]).toEqual({ fromIndex: 0, toIndex: 3, varName: "token", varValue: "abc3" });
  });

  // ── Edge cases: empty variable names and values ──────────────────────

  it("chains variables with empty string values", () => {
    const results = [
      makeResult({ extracted_variables: [["token", "abc"]] }),
      makeResult({ extracted_variables: [["token", ""]] }), // empty value
    ];
    const groups = buildExtractionGroups(results);
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(1);
    expect(flow[0].varName).toBe("token");
    expect(flow[0].varValue).toBe("");
  });

  it("chains variables with both key and value being empty strings", () => {
    const results = [
      makeResult({ extracted_variables: [["", ""]] }),
      makeResult({ extracted_variables: [["", ""]] }),
    ];
    const groups = buildExtractionGroups(results);
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(1);
    expect(flow[0].varName).toBe("");
    expect(flow[0].varValue).toBe("");
  });

  it("treats whitespace-only variable names as distinct keys", () => {
    const results = [
      makeResult({ extracted_variables: [["   ", "abc"]] }),
      makeResult({ extracted_variables: [["   ", "def"]] }),
    ];
    const groups = buildExtractionGroups(results);
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(1);
    expect(flow[0].varName).toBe("   ");
  });

  it("does NOT treat whitespace-only name and empty name as the same key", () => {
    const results = [
      makeResult({ extracted_variables: [["", "abc"]] }),            // empty string key
      makeResult({ extracted_variables: [["   ", "def"]] }),          // whitespace key
      makeResult({ extracted_variables: [["", "ghi"], ["   ", "jkl"]] }), // both appear again
    ];
    const groups = buildExtractionGroups(results);
    const flow = buildChainFlow(groups);
    // "" chains from 0→2, "   " chains from 1→2
    expect(flow).toHaveLength(2);
    expect(flow[0]).toEqual({ fromIndex: 0, toIndex: 2, varName: "", varValue: "ghi" });
    expect(flow[1]).toEqual({ fromIndex: 1, toIndex: 2, varName: "   ", varValue: "jkl" });
  });

  it("chains variables with special unicode characters in names", () => {
    const results = [
      makeResult({ extracted_variables: [["café", "yes"], ["über", "token"]] }),
      makeResult({ extracted_variables: [["café", "no"]] }),
    ];
    const groups = buildExtractionGroups(results);
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(1);
    expect(flow[0].varName).toBe("café");
    expect(flow[0].varValue).toBe("no");
  });

  it("chains variables with very long names (over 1000 chars)", () => {
    const longName1 = "a".repeat(1000);
    const longName2 = "b".repeat(1000);
    const results = [
      makeResult({ extracted_variables: [[longName1, "v1"], [longName2, "v1"]] }),
      makeResult({ extracted_variables: [[longName1, "v2"]] }),
    ];
    const groups = buildExtractionGroups(results);
    const flow = buildChainFlow(groups);
    expect(flow).toHaveLength(1);
    expect(flow[0].varName).toBe(longName1);
    expect(flow[0].varValue).toBe("v2");
  });

  it("chains variable from a request that had an error (hasError = true)", () => {
    const groups: ExtractionGroup[] = [
      { index: 0, requestName: "Login", requestMethod: "POST", statusCode: 500, hasError: true, variables: [["token", "abc"]] },
      { index: 1, requestName: "Profile", requestMethod: "GET", statusCode: 200, hasError: false, variables: [["token", "def"]] },
    ];
    const flow = buildChainFlow(groups);
    // Chain still detected even though the source request had an error
    expect(flow).toHaveLength(1);
    expect(flow[0]).toEqual({ fromIndex: 0, toIndex: 1, varName: "token", varValue: "def" });
    // Verify the extraction group has hasError = true
    expect(groups[0].hasError).toBe(true);
  });
});
