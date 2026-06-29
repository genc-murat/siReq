import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSafeInvoke = vi.fn();
vi.mock("./safe-invoke", () => ({
  safeInvoke: mockSafeInvoke,
}));

const {
  analyzeApiBehavior,
  getApiIntelligenceOverview,
  getAllEndpointInsights,
  getEndpointDetail,
  getPerformanceTimeline,
  getSchemaEvolution,
  getPerformanceRegressions,
} = await import("./intelligence-api");

describe("intelligence API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("analyzeApiBehavior should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ total_endpoints: 0 });
    await analyzeApiBehavior();
    expect(mockSafeInvoke).toHaveBeenCalledWith("analyze_api_behavior_cmd");
  });

  it("getApiIntelligenceOverview should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ total_endpoints: 0 });
    await getApiIntelligenceOverview();
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_api_intelligence_overview");
  });

  it("getAllEndpointInsights should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getAllEndpointInsights();
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_all_endpoint_insights");
  });

  it("getEndpointDetail should call safeInvoke with endpointKey", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ endpoint_key: "test" });
    const result = await getEndpointDetail("test");
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_endpoint_detail_cmd", { endpointKey: "test" });
    expect(result.endpoint_key).toBe("test");
  });

  it("getPerformanceTimeline should call safeInvoke with endpointKey", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getPerformanceTimeline("test");
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_performance_timeline_cmd", { endpointKey: "test" });
  });

  it("getSchemaEvolution should call safeInvoke with endpointKey", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getSchemaEvolution("test");
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_schema_evolution_cmd", { endpointKey: "test" });
  });

  it("getPerformanceRegressions should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getPerformanceRegressions();
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_performance_regressions");
  });
});
