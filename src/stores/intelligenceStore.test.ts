import { describe, it, expect, beforeEach, vi } from "vitest";
import { useIntelligenceStore } from "./intelligenceStore";
import type {
  ApiIntelligenceOverview,
  EndpointInsight,
  EndpointDetail,
  PerformanceRegression,
} from "@/lib/invoke";

// ── Hoisted mutable mock state ─────────────────────────────────────────────

const { mockIntelligence } = vi.hoisted(() => {
  const analyzeApiBehavior = vi.fn();
  const getApiIntelligenceOverview = vi.fn();
  const getAllEndpointInsights = vi.fn();
  const getEndpointDetail = vi.fn();
  const getPerformanceRegressions = vi.fn();

  return {
    mockIntelligence: {
      analyzeApiBehavior,
      getApiIntelligenceOverview,
      getAllEndpointInsights,
      getEndpointDetail,
      getPerformanceRegressions,
    },
  };
});

vi.mock("@/lib/invoke", () => mockIntelligence);

// ── Helpers ────────────────────────────────────────────────────────────────

function createOverview(overrides?: Partial<ApiIntelligenceOverview>): ApiIntelligenceOverview {
  return {
    total_endpoints: 5,
    total_requests: 100,
    total_schema_changes: 2,
    endpoints_with_regression: 1,
    avg_response_time_ms: 250,
    last_analyzed: "2025-01-01T00:00:00Z",
    status_200_pct: 85,
    status_400_pct: 10,
    status_500_pct: 5,
    daily_request_counts: [{ date: "2025-01-01", count: 100 }],
    ...overrides,
  };
}

function createEndpointInsight(key: string, overrides?: Partial<EndpointInsight>): EndpointInsight {
  return {
    endpoint_key: key,
    method: "GET",
    request_count: 50,
    avg_time_ms: 200,
    p95_time_ms: 500,
    min_time_ms: 50,
    max_time_ms: 1000,
    last_seen: "2025-01-01",
    first_seen: "2024-01-01",
    status_200_count: 45,
    status_400_count: 5,
    status_500_count: 0,
    status_other_count: 0,
    schema_version_count: 1,
    has_recent_regression: false,
    avg_size_bytes: 1024,
    ...overrides,
  };
}

function createEndpointDetail(key: string, overrides?: Partial<EndpointDetail>): EndpointDetail {
  return {
    endpoint_key: key,
    method: "GET",
    request_count: 100,
    avg_time_ms: 250,
    p95_time_ms: 600,
    min_time_ms: 50,
    max_time_ms: 1500,
    last_seen: "2025-01-01",
    first_seen: "2024-06-01",
    status_200_count: 90,
    status_400_count: 8,
    status_500_count: 2,
    status_other_count: 0,
    avg_size_bytes: 2048,
    performance_history: [{ date: "2025-01-01", avg_ms: 250, p95_ms: 600, min_ms: 50, max_ms: 1500, count: 100 }],
    schema_evolution: [{ fingerprint: "abc", seen_at: "2025-01-01", field_count: 10, fields: ["id", "name"] }],
    recent_requests: [{ id: "r1", created_at: "2025-01-01", status: 200, time_ms: 100, size: 500, schema_fingerprint: "abc" }],
    ...overrides,
  };
}

function resetStore() {
  useIntelligenceStore.setState({
    overview: null,
    endpoints: [],
    selectedEndpoint: null,
    regressions: [],
    loading: false,
    analyzing: false,
    error: null,
  });
}

function resetMocks() {
  for (const fn of Object.values(mockIntelligence)) {
    fn.mockReset();
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("intelligenceStore", () => {
  beforeEach(() => {
    resetStore();
    resetMocks();
  });

  // ── Initial state ────────────────────────────────────────────────────

  describe("initial state", () => {
    it("has null overview, empty endpoints, no selection", () => {
      const s = useIntelligenceStore.getState();
      expect(s.overview).toBeNull();
      expect(s.endpoints).toEqual([]);
      expect(s.selectedEndpoint).toBeNull();
      expect(s.regressions).toEqual([]);
      expect(s.loading).toBe(false);
      expect(s.analyzing).toBe(false);
      expect(s.error).toBeNull();
    });
  });

  // ── analyze ──────────────────────────────────────────────────────────

  describe("analyze", () => {
    it("calls analyzeApiBehavior and stores overview", async () => {
      const overview = createOverview();
      mockIntelligence.analyzeApiBehavior.mockResolvedValue(overview);
      mockIntelligence.getAllEndpointInsights.mockResolvedValue([]);
      mockIntelligence.getPerformanceRegressions.mockResolvedValue([]);

      await useIntelligenceStore.getState().analyze();

      const s = useIntelligenceStore.getState();
      expect(s.overview).toEqual(overview);
      expect(s.analyzing).toBe(false);
      expect(s.error).toBeNull();
    });

    it("sets analyzing state during execution", async () => {
      mockIntelligence.analyzeApiBehavior.mockImplementation(async () => {
        expect(useIntelligenceStore.getState().analyzing).toBe(true);
        return createOverview();
      });
      mockIntelligence.getAllEndpointInsights.mockResolvedValue([]);
      mockIntelligence.getPerformanceRegressions.mockResolvedValue([]);

      await useIntelligenceStore.getState().analyze();
    });

    it("loads endpoints after successful analysis", async () => {
      const overview = createOverview();
      const endpoints = [createEndpointInsight("GET /api/users")];
      const regressions: PerformanceRegression[] = [];

      mockIntelligence.analyzeApiBehavior.mockResolvedValue(overview);
      mockIntelligence.getAllEndpointInsights.mockResolvedValue(endpoints);
      mockIntelligence.getPerformanceRegressions.mockResolvedValue(regressions);

      await useIntelligenceStore.getState().analyze();

      // loadEndpoints is called fire-and-forget inside analyze(), so we need to wait
      await vi.waitFor(() => {
        expect(useIntelligenceStore.getState().endpoints).toHaveLength(1);
      });
      expect(useIntelligenceStore.getState().regressions).toEqual([]);
    });

    it("sets error on failure", async () => {
      mockIntelligence.analyzeApiBehavior.mockRejectedValue(new Error("Analysis failed"));

      await useIntelligenceStore.getState().analyze();

      const s = useIntelligenceStore.getState();
      expect(s.error).toBe("Analysis failed");
      expect(s.analyzing).toBe(false);
    });

    it("handles non-Error thrown values", async () => {
      mockIntelligence.analyzeApiBehavior.mockRejectedValue("string error");

      await useIntelligenceStore.getState().analyze();

      expect(useIntelligenceStore.getState().error).toBe("string error");
    });

    it("handles null thrown value (falls back to default)", async () => {
      mockIntelligence.analyzeApiBehavior.mockRejectedValue(null);

      await useIntelligenceStore.getState().analyze();

      expect(useIntelligenceStore.getState().error).toBe("Analysis failed");
    });
  });

  // ── loadOverview ─────────────────────────────────────────────────────

  describe("loadOverview", () => {
    it("loads overview from backend", async () => {
      const overview = createOverview({ total_endpoints: 10 });
      mockIntelligence.getApiIntelligenceOverview.mockResolvedValue(overview);

      await useIntelligenceStore.getState().loadOverview();

      expect(useIntelligenceStore.getState().overview?.total_endpoints).toBe(10);
      expect(useIntelligenceStore.getState().loading).toBe(false);
    });

    it("sets loading state", async () => {
      mockIntelligence.getApiIntelligenceOverview.mockImplementation(async () => {
        expect(useIntelligenceStore.getState().loading).toBe(true);
        return createOverview();
      });

      await useIntelligenceStore.getState().loadOverview();
    });

    it("sets error on failure", async () => {
      mockIntelligence.getApiIntelligenceOverview.mockRejectedValue(new Error("Failed"));

      await useIntelligenceStore.getState().loadOverview();

      expect(useIntelligenceStore.getState().error).toBe("Failed");
      expect(useIntelligenceStore.getState().loading).toBe(false);
    });
  });

  // ── loadEndpoints ────────────────────────────────────────────────────

  describe("loadEndpoints", () => {
    it("loads endpoints and regressions in parallel", async () => {
      const endpoints = [createEndpointInsight("GET /api/users")];
      const regressions: PerformanceRegression[] = [{
        endpoint_key: "GET /api/users",
        method: "GET",
        current_avg_ms: 500,
        baseline_avg_ms: 200,
        increase_pct: 150,
      }];

      mockIntelligence.getAllEndpointInsights.mockResolvedValue(endpoints);
      mockIntelligence.getPerformanceRegressions.mockResolvedValue(regressions);

      await useIntelligenceStore.getState().loadEndpoints();

      const s = useIntelligenceStore.getState();
      expect(s.endpoints).toHaveLength(1);
      expect(s.regressions).toHaveLength(1);
      expect(s.regressions[0].increase_pct).toBe(150);
    });

    it("sets error on failure", async () => {
      mockIntelligence.getAllEndpointInsights.mockRejectedValue(new Error("Endpoint error"));

      await useIntelligenceStore.getState().loadEndpoints();

      expect(useIntelligenceStore.getState().error).toBe("Endpoint error");
    });
  });

  // ── selectEndpoint / clearSelection ──────────────────────────────────

  describe("selectEndpoint", () => {
    it("loads endpoint detail from backend", async () => {
      const detail = createEndpointDetail("GET /api/users");
      mockIntelligence.getEndpointDetail.mockResolvedValue(detail);

      await useIntelligenceStore.getState().selectEndpoint("GET /api/users");

      expect(useIntelligenceStore.getState().selectedEndpoint?.endpoint_key).toBe("GET /api/users");
      expect(useIntelligenceStore.getState().loading).toBe(false);
    });

    it("sets loading before fetching", async () => {
      mockIntelligence.getEndpointDetail.mockImplementation(async () => {
        expect(useIntelligenceStore.getState().loading).toBe(true);
        return createEndpointDetail("GET /test");
      });

      await useIntelligenceStore.getState().selectEndpoint("GET /test");
    });

    it("sets error on failure", async () => {
      mockIntelligence.getEndpointDetail.mockRejectedValue(new Error("Detail error"));

      await useIntelligenceStore.getState().selectEndpoint("GET /fail");

      expect(useIntelligenceStore.getState().error).toBe("Detail error");
      expect(useIntelligenceStore.getState().loading).toBe(false);
    });
  });

  describe("clearSelection", () => {
    it("clears the selected endpoint", () => {
      useIntelligenceStore.setState({
        selectedEndpoint: createEndpointDetail("GET /api/users"),
      });

      useIntelligenceStore.getState().clearSelection();

      expect(useIntelligenceStore.getState().selectedEndpoint).toBeNull();
    });
  });
});
