import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSafeInvoke = vi.fn();
vi.mock("./safe-invoke", () => ({
  safeInvoke: mockSafeInvoke,
}));

const { sendRequest, cancelRequest, benchmarkRequest, getBenchmarkHistory, deleteBenchmarkHistory, clearBenchmarkHistory, importCurl } = await import("./http-api");
const { createMockRequest } = await import("./test-utils");

describe("sendRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should call safeInvoke with send_request command", async () => {
    const req = createMockRequest();
    mockSafeInvoke.mockResolvedValueOnce({ status: 200 });

    await sendRequest(req, "env-1");

    expect(mockSafeInvoke).toHaveBeenCalledWith("send_request", {
      request: req,
      environmentId: "env-1",
    });
  });

  it("should pass null environmentId when not provided", async () => {
    const req = createMockRequest();
    mockSafeInvoke.mockResolvedValueOnce({ status: 200 });

    await sendRequest(req);

    expect(mockSafeInvoke).toHaveBeenCalledWith("send_request", {
      request: req,
      environmentId: null,
    });
  });
});

describe("cancelRequest", () => {
  it("should call safeInvoke with cancel_request command", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);

    await cancelRequest("req-1");

    expect(mockSafeInvoke).toHaveBeenCalledWith("cancel_request", { requestId: "req-1" });
  });
});

describe("benchmarkRequest", () => {
  it("should call safeInvoke with benchmark_request command", async () => {
    const req = createMockRequest();
    mockSafeInvoke.mockResolvedValueOnce({ iterations: 5 });

    await benchmarkRequest(req, 5, "env-1");

    expect(mockSafeInvoke).toHaveBeenCalledWith("benchmark_request", {
      request: req,
      count: 5,
      environmentId: "env-1",
    });
  });

  it("should pass null environmentId when not provided", async () => {
    const req = createMockRequest();
    mockSafeInvoke.mockResolvedValueOnce({ iterations: 5 });

    await benchmarkRequest(req, 5);

    expect(mockSafeInvoke).toHaveBeenCalledWith("benchmark_request", {
      request: req,
      count: 5,
      environmentId: null,
    });
  });
});

describe("getBenchmarkHistory", () => {
  it("should call safeInvoke with default limit/offset", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);

    await getBenchmarkHistory();

    expect(mockSafeInvoke).toHaveBeenCalledWith("get_benchmark_history", { limit: 50, offset: 0 });
  });

  it("should pass custom limit/offset", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);

    await getBenchmarkHistory(10, 20);

    expect(mockSafeInvoke).toHaveBeenCalledWith("get_benchmark_history", { limit: 10, offset: 20 });
  });
});

describe("deleteBenchmarkHistory", () => {
  it("should call safeInvoke with delete_benchmark_history command", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);

    await deleteBenchmarkHistory("bench-1");

    expect(mockSafeInvoke).toHaveBeenCalledWith("delete_benchmark_history", { id: "bench-1" });
  });
});

describe("clearBenchmarkHistory", () => {
  it("should call safeInvoke with clear_benchmark_history command", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);

    await clearBenchmarkHistory();

    expect(mockSafeInvoke).toHaveBeenCalledWith("clear_benchmark_history");
  });
});

describe("importCurl", () => {
  it("should call safeInvoke with import_curl command", async () => {
    const mockReq = createMockRequest();
    mockSafeInvoke.mockResolvedValueOnce(mockReq);

    const result = await importCurl("curl http://example.com");

    expect(mockSafeInvoke).toHaveBeenCalledWith("import_curl", { curlCommand: "curl http://example.com" });
    expect(result).toBe(mockReq);
  });
});
