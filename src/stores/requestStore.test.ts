import { describe, it, expect, beforeEach, vi } from "vitest";
import { useRequestStore } from "./requestStore";
import type { HttpRequest, HttpResponse, BenchmarkResult, BenchmarkHistoryEntry } from "@/lib/invoke";

// ── Hoisted mutable mock state ─────────────────────────────────────────────

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: {
    sendRequest: vi.fn(),
    cancelRequest: vi.fn(),
    benchmarkRequest: vi.fn(),
    getBenchmarkHistory: vi.fn().mockResolvedValue([]),
    deleteBenchmarkHistory: vi.fn(),
  },
}));

vi.mock("@/lib/invoke", () => ({
  sendRequest: mockInvoke.sendRequest,
  cancelRequest: mockInvoke.cancelRequest,
  benchmarkRequest: mockInvoke.benchmarkRequest,
  getBenchmarkHistory: mockInvoke.getBenchmarkHistory,
  deleteBenchmarkHistory: mockInvoke.deleteBenchmarkHistory,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const sampleResponse: HttpResponse = {
  status: 200,
  status_text: "OK",
  headers: [["content-type", "application/json"]],
  cookies: [],
  body: '{"ok":true}',
  size: 100,
  time_ms: 45,
};

const sampleBenchmarkResult: BenchmarkResult = {
  iterations: 10,
  times_ms: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  min_ms: 10,
  max_ms: 100,
  avg_ms: 55,
  median_ms: 55,
  p95_ms: 95,
  p99_ms: 99,
  success_count: 10,
  failure_count: 0,
  statuses: [200],
  errors: [],
  total_bytes: 1000,
};

function resetStore() {
  useRequestStore.setState({
    request: {
      id: "default-id",
      name: "",
      method: "GET",
      url: "",
      headers: [],
      query_params: [],
      body_type: "none",
      body: "",
      form_fields: [],
      auth: { type: "none", username: "", password: "", token: "", api_key: "", api_key_name: "", api_key_in: "header" },
      settings: { timeout: 30, follow_redirects: true, ssl_verify: true, proxy: null },
      pre_script: "",
      post_script: "",
      json_schema: "",
    },
    response: null,
    lastResponse: null,
    benchmarkResult: null,
    benchmarkLoading: false,
    benchmarkHistory: [],
    benchmarkHistoryLoading: false,
    loading: false,
    error: null,
  });
}

function resetMocks() {
  for (const fn of Object.values(mockInvoke)) {
    fn.mockReset();
  }
  mockInvoke.getBenchmarkHistory.mockResolvedValue([]);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("requestStore", () => {
  beforeEach(() => {
    resetStore();
    resetMocks();
  });

  // ── Initial state ────────────────────────────────────────────────────

  describe("initial state", () => {
    it("has correct default request values", () => {
      const s = useRequestStore.getState();
      expect(s.request.method).toBe("GET");
      expect(s.request.url).toBe("");
      expect(s.request.headers).toEqual([]);
      expect(s.request.settings.timeout).toBe(30);
      expect(s.request.auth.type).toBe("none");
      expect(s.response).toBeNull();
      expect(s.lastResponse).toBeNull();
      expect(s.loading).toBe(false);
      expect(s.error).toBeNull();
      expect(s.benchmarkResult).toBeNull();
      expect(s.benchmarkLoading).toBe(false);
    });
  });

  // ── Setters ──────────────────────────────────────────────────────────

  describe("setters", () => {
    it("setMethod updates the HTTP method", () => {
      useRequestStore.getState().setMethod("POST");
      expect(useRequestStore.getState().request.method).toBe("POST");
    });

    it("setUrl updates the URL", () => {
      useRequestStore.getState().setUrl("https://api.example.com/users");
      expect(useRequestStore.getState().request.url).toBe("https://api.example.com/users");
    });

    it("setHeaders replaces the headers array", () => {
      const headers = [{ key: "Content-Type", value: "application/json", enabled: true }];
      useRequestStore.getState().setHeaders(headers);
      expect(useRequestStore.getState().request.headers).toEqual(headers);
    });

    it("setQueryParams replaces query params", () => {
      const params = [{ key: "page", value: "1", enabled: true }];
      useRequestStore.getState().setQueryParams(params);
      expect(useRequestStore.getState().request.query_params).toEqual(params);
    });

    it("setBodyType updates body type", () => {
      useRequestStore.getState().setBodyType("json");
      expect(useRequestStore.getState().request.body_type).toBe("json");
    });

    it("setBody updates the body string", () => {
      useRequestStore.getState().setBody('{"hello":"world"}');
      expect(useRequestStore.getState().request.body).toBe('{"hello":"world"}');
    });

    it("setFormFields replaces form fields", () => {
      const fields = [{ key: "file", value: "", field_type: "file" as const, enabled: true, file_path: null, file_name: null, file_data: null, content_type: null }];
      useRequestStore.getState().setFormFields(fields);
      expect(useRequestStore.getState().request.form_fields).toEqual(fields);
    });

    it("setName updates the request name", () => {
      useRequestStore.getState().setName("Get Users");
      expect(useRequestStore.getState().request.name).toBe("Get Users");
    });

    it("setAuth replaces the auth config", () => {
      const auth = { type: "bearer" as const, username: "", password: "", token: "mytoken", api_key: "", api_key_name: "", api_key_in: "header" as const };
      useRequestStore.getState().setAuth(auth);
      expect(useRequestStore.getState().request.auth).toEqual(auth);
    });

    it("setSettings replaces settings", () => {
      const settings = { timeout: 60, follow_redirects: false, ssl_verify: false, proxy: null };
      useRequestStore.getState().setSettings(settings);
      expect(useRequestStore.getState().request.settings).toEqual(settings);
    });

    it("setPreScript updates pre-request script", () => {
      useRequestStore.getState().setPreScript("console.log('pre');");
      expect(useRequestStore.getState().request.pre_script).toBe("console.log('pre');");
    });

    it("setPostScript updates post-request script", () => {
      useRequestStore.getState().setPostScript("console.log('post');");
      expect(useRequestStore.getState().request.post_script).toBe("console.log('post');");
    });

    it("setJsonSchema updates json_schema", () => {
      useRequestStore.getState().setJsonSchema('{"type":"object"}');
      expect(useRequestStore.getState().request.json_schema).toBe('{"type":"object"}');
    });

    it("setRequest replaces the full request and clears response/error", () => {
      // Set something first
      useRequestStore.getState().setMethod("PUT");
      const newReq = {
        ...useRequestStore.getState().request,
        method: "DELETE" as const,
        url: "https://api.example.com/delete",
      };
      useRequestStore.getState().setRequest(newReq);
      const s = useRequestStore.getState();
      expect(s.request.method).toBe("DELETE");
      expect(s.request.url).toBe("https://api.example.com/delete");
      expect(s.response).toBeNull();
      expect(s.error).toBeNull();
    });
  });

  // ── send ────────────────────────────────────────────────────────────

  describe("send", () => {
    it("calls sendRequest with request, timeout, and environmentId", async () => {
      useRequestStore.getState().setUrl("https://example.com/api");
      useRequestStore.getState().setMethod("POST");
      mockInvoke.sendRequest.mockResolvedValue(sampleResponse);

      await useRequestStore.getState().send("env-1");

      expect(mockInvoke.sendRequest).toHaveBeenCalledTimes(1);
      const [requestArg, timeoutArg, envArg] = mockInvoke.sendRequest.mock.calls[0];
      expect(requestArg.url).toBe("https://example.com/api");
      expect(requestArg.method).toBe("POST");
      expect(requestArg.id).toBeTruthy();
      expect(requestArg.id).not.toBe("default-id"); // new id generated
      expect(timeoutArg).toBe(30);
      expect(envArg).toBe("env-1");
    });

    it("sets loading and clears error/response/benchmark before sending", async () => {
      // Simulate having previous state
      useRequestStore.setState({ loading: false, error: "old error", response: sampleResponse, benchmarkResult: sampleBenchmarkResult });
      mockInvoke.sendRequest.mockImplementation(async () => {
        const s = useRequestStore.getState();
        expect(s.loading).toBe(true);
        expect(s.error).toBeNull();
        expect(s.response).toBeNull();
        expect(s.benchmarkResult).toBeNull();
        return sampleResponse;
      });

      const promise = useRequestStore.getState().send();
      // Before any await — store should already be set optimistically
      expect(useRequestStore.getState().loading).toBe(true);
      await promise;
    });

    it("stores the response and saves previous as lastResponse on success", async () => {
      const firstResponse: HttpResponse = { ...sampleResponse, body: "first" };
      const secondResponse: HttpResponse = { ...sampleResponse, body: "second" };

      mockInvoke.sendRequest.mockResolvedValueOnce(firstResponse);
      await useRequestStore.getState().send();
      expect(useRequestStore.getState().response?.body).toBe("first");
      expect(useRequestStore.getState().lastResponse).toBeNull();

      mockInvoke.sendRequest.mockResolvedValueOnce(secondResponse);
      await useRequestStore.getState().send();
      expect(useRequestStore.getState().response?.body).toBe("second");
      expect(useRequestStore.getState().lastResponse?.body).toBe("first");
    });

    it("sets loading to false after success", async () => {
      mockInvoke.sendRequest.mockResolvedValue(sampleResponse);
      await useRequestStore.getState().send();
      expect(useRequestStore.getState().loading).toBe(false);
      expect(useRequestStore.getState().error).toBeNull();
    });

    it("handles Error thrown by sendRequest", async () => {
      mockInvoke.sendRequest.mockRejectedValue(new Error("Connection timeout"));

      await useRequestStore.getState().send();

      const s = useRequestStore.getState();
      expect(s.loading).toBe(false);
      expect(s.error).toBe("Connection timeout");
      expect(s.response).toBeNull();
    });

    it("handles non-Error thrown value (string)", async () => {
      mockInvoke.sendRequest.mockRejectedValue("string error");

      await useRequestStore.getState().send();

      expect(useRequestStore.getState().error).toBe("string error");
    });

    it("handles null thrown value (falls back to default)", async () => {
      mockInvoke.sendRequest.mockRejectedValue(null);

      await useRequestStore.getState().send();

      expect(useRequestStore.getState().error).toBe("Request failed");
    });

    it("handles undefined thrown value (falls back to default)", async () => {
      mockInvoke.sendRequest.mockRejectedValue(undefined);

      await useRequestStore.getState().send();

      expect(useRequestStore.getState().error).toBe("Request failed");
    });

    it("calls sendRequest without environmentId when not provided", async () => {
      mockInvoke.sendRequest.mockResolvedValue(sampleResponse);

      await useRequestStore.getState().send();

      expect(mockInvoke.sendRequest).toHaveBeenCalledWith(
        expect.objectContaining({ method: "GET" }),
        30,
        undefined
      );
    });
  });

  // ── cancel ──────────────────────────────────────────────────────────

  describe("cancel", () => {
    it("calls cancelRequest with the current request id", async () => {
      mockInvoke.cancelRequest.mockResolvedValue(undefined);

      await useRequestStore.getState().cancel();

      expect(mockInvoke.cancelRequest).toHaveBeenCalledWith("default-id");
    });

    it("sets loading to false after cancellation", async () => {
      useRequestStore.setState({ loading: true });
      mockInvoke.cancelRequest.mockResolvedValue(undefined);

      await useRequestStore.getState().cancel();

      expect(useRequestStore.getState().loading).toBe(false);
    });

    it("handles cancelRequest error gracefully", async () => {
      useRequestStore.setState({ loading: true });
      mockInvoke.cancelRequest.mockRejectedValue(new Error("Already cancelled"));

      await useRequestStore.getState().cancel();

      expect(useRequestStore.getState().loading).toBe(false);
    });
  });

  // ── runBenchmark ─────────────────────────────────────────────────────

  describe("runBenchmark", () => {
    it("calls benchmarkRequest with request and count", async () => {
      useRequestStore.getState().setUrl("https://example.com/bench");
      mockInvoke.benchmarkRequest.mockResolvedValue(sampleBenchmarkResult);

      await useRequestStore.getState().runBenchmark(5);

      expect(mockInvoke.benchmarkRequest).toHaveBeenCalledTimes(1);
      const [requestArg, countArg] = mockInvoke.benchmarkRequest.mock.calls[0];
      expect(requestArg.url).toBe("https://example.com/bench");
      expect(countArg).toBe(5);
      expect(requestArg.id).not.toBe("default-id"); // new id
    });

    it("sets benchmarkLoading and clears error/result before running", async () => {
      mockInvoke.benchmarkRequest.mockImplementation(async () => {
        const s = useRequestStore.getState();
        expect(s.benchmarkLoading).toBe(true);
        expect(s.error).toBeNull();
        expect(s.benchmarkResult).toBeNull();
        return sampleBenchmarkResult;
      });

      const promise = useRequestStore.getState().runBenchmark(10);
      expect(useRequestStore.getState().benchmarkLoading).toBe(true);
      await promise;
    });

    it("stores benchmark result and sets loading false on success", async () => {
      mockInvoke.benchmarkRequest.mockResolvedValue(sampleBenchmarkResult);

      await useRequestStore.getState().runBenchmark(10);

      const s = useRequestStore.getState();
      expect(s.benchmarkLoading).toBe(false);
      expect(s.benchmarkResult).toEqual(sampleBenchmarkResult);
      expect(s.error).toBeNull();
    });

    it("calls loadBenchmarkHistory after successful benchmark", async () => {
      mockInvoke.benchmarkRequest.mockResolvedValue(sampleBenchmarkResult);

      await useRequestStore.getState().runBenchmark(10);

      expect(mockInvoke.getBenchmarkHistory).toHaveBeenCalledTimes(1);
    });

    it("handles Error thrown by benchmarkRequest", async () => {
      mockInvoke.benchmarkRequest.mockRejectedValue(new Error("Benchmark failed"));

      await useRequestStore.getState().runBenchmark(10);

      const s = useRequestStore.getState();
      expect(s.benchmarkLoading).toBe(false);
      expect(s.error).toBe("Benchmark failed");
      expect(s.benchmarkResult).toBeNull();
    });

    it("handles string thrown by benchmarkRequest", async () => {
      mockInvoke.benchmarkRequest.mockRejectedValue("oops");

      await useRequestStore.getState().runBenchmark(10);

      expect(useRequestStore.getState().error).toBe("oops");
    });

    it("handles null thrown (default message)", async () => {
      mockInvoke.benchmarkRequest.mockRejectedValue(null);

      await useRequestStore.getState().runBenchmark(10);

      expect(useRequestStore.getState().error).toBe("Benchmark failed");
    });
  });

  // ── loadBenchmarkHistory ─────────────────────────────────────────────

  describe("loadBenchmarkHistory", () => {
    it("calls getBenchmarkHistory and stores results", async () => {
      const entries: BenchmarkHistoryEntry[] = [
        { id: "b1", request: {} as HttpRequest, result: sampleBenchmarkResult, created_at: "2025-01-01" },
      ];
      mockInvoke.getBenchmarkHistory.mockResolvedValue(entries);

      await useRequestStore.getState().loadBenchmarkHistory();

      const s = useRequestStore.getState();
      expect(s.benchmarkHistory).toHaveLength(1);
      expect(s.benchmarkHistory[0].id).toBe("b1");
      expect(s.benchmarkHistoryLoading).toBe(false);
    });

    it("passes limit and offset to getBenchmarkHistory", async () => {
      mockInvoke.getBenchmarkHistory.mockResolvedValue([]);

      await useRequestStore.getState().loadBenchmarkHistory(20, 5);

      expect(mockInvoke.getBenchmarkHistory).toHaveBeenCalledWith(20, 5);
    });

    it("handles errors gracefully", async () => {
      mockInvoke.getBenchmarkHistory.mockRejectedValue(new Error("DB error"));

      await useRequestStore.getState().loadBenchmarkHistory();

      expect(useRequestStore.getState().benchmarkHistoryLoading).toBe(false);
      // benchmarkHistory should remain unchanged
    });

    it("sets loading state before and after", async () => {
      mockInvoke.getBenchmarkHistory.mockImplementation(async () => {
        expect(useRequestStore.getState().benchmarkHistoryLoading).toBe(true);
        return [];
      });

      const promise = useRequestStore.getState().loadBenchmarkHistory();
      expect(useRequestStore.getState().benchmarkHistoryLoading).toBe(true);
      await promise;
      expect(useRequestStore.getState().benchmarkHistoryLoading).toBe(false);
    });
  });

  // ── deleteBenchmarkHistoryItem ────────────────────────────────────────

  describe("deleteBenchmarkHistoryItem", () => {
    it("calls deleteBenchmarkHistory and removes item from local state", async () => {
      const entries: BenchmarkHistoryEntry[] = [
        { id: "b1", request: {} as HttpRequest, result: sampleBenchmarkResult, created_at: "2025-01-01" },
        { id: "b2", request: {} as HttpRequest, result: sampleBenchmarkResult, created_at: "2025-01-02" },
      ];
      useRequestStore.setState({ benchmarkHistory: entries });
      mockInvoke.deleteBenchmarkHistory.mockResolvedValue(undefined);

      await useRequestStore.getState().deleteBenchmarkHistoryItem("b1");

      expect(mockInvoke.deleteBenchmarkHistory).toHaveBeenCalledWith("b1");
      expect(useRequestStore.getState().benchmarkHistory).toHaveLength(1);
      expect(useRequestStore.getState().benchmarkHistory[0].id).toBe("b2");
    });
  });

  // ── loadHistoricBenchmark ─────────────────────────────────────────────

  describe("loadHistoricBenchmark", () => {
    it("sets benchmarkResult and clears error from entry", () => {
      const entry: BenchmarkHistoryEntry = {
        id: "b1",
        request: {} as HttpRequest,
        result: sampleBenchmarkResult,
        created_at: "2025-01-01",
      };

      useRequestStore.getState().loadHistoricBenchmark(entry);

      const s = useRequestStore.getState();
      expect(s.benchmarkResult).toEqual(sampleBenchmarkResult);
      expect(s.error).toBeNull();
    });
  });

  // ── reset ───────────────────────────────────────────────────────────

  describe("reset", () => {
    it("restores all state to defaults", () => {
      // Mutate state first
      useRequestStore.getState().setMethod("DELETE");
      useRequestStore.setState({ loading: true, error: "err", response: sampleResponse, benchmarkResult: sampleBenchmarkResult });

      useRequestStore.getState().reset();

      const s = useRequestStore.getState();
      expect(s.request.method).toBe("GET");
      expect(s.request.url).toBe("");
      expect(s.response).toBeNull();
      expect(s.lastResponse).toBeNull();
      expect(s.loading).toBe(false);
      expect(s.error).toBeNull();
      expect(s.benchmarkResult).toBeNull();
      expect(s.benchmarkLoading).toBe(false);
      expect(s.benchmarkHistory).toEqual([]);
    });
  });
});
