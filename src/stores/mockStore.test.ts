import { describe, it, expect, beforeEach, vi } from "vitest";
import { useMockStore } from "./mockStore";
import type { MockServerConfig, MockLogEntry } from "@/lib/invoke";

// ── Hoisted mutable mock state ─────────────────────────────────────────────
// Follow the exact pattern from requestStore.test.ts: vi.hoisted + vi.mock with explicit properties.

const { mockFns } = vi.hoisted(() => ({
  mockFns: {
    getMockConfigs: vi.fn(),
    createMockConfig: vi.fn(),
    updateMockConfig: vi.fn(),
    deleteMockConfig: vi.fn(),
    startMockServer: vi.fn(),
    stopMockServer: vi.fn(),
    getMockServerStatus: vi.fn(),
    getMockServerLogs: vi.fn(),
    getMockServerStats: vi.fn(),
    importOpenApiMock: vi.fn(),
    importCollectionMock: vi.fn(),
  },
}));

vi.mock("@/lib/invoke", () => ({
  getMockConfigs: mockFns.getMockConfigs,
  createMockConfig: mockFns.createMockConfig,
  updateMockConfig: mockFns.updateMockConfig,
  deleteMockConfig: mockFns.deleteMockConfig,
  startMockServer: mockFns.startMockServer,
  stopMockServer: mockFns.stopMockServer,
  getMockServerStatus: mockFns.getMockServerStatus,
  getMockServerLogs: mockFns.getMockServerLogs,
  getMockServerStats: mockFns.getMockServerStats,
  importOpenApiMock: mockFns.importOpenApiMock,
  importCollectionMock: mockFns.importCollectionMock,
}));

const { mockListen } = vi.hoisted(() => ({
  mockListen: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
}));

// ── Test Data Helpers ──────────────────────────────────────────────────────

function createMockConfig(id: string, overrides?: Partial<MockServerConfig>): MockServerConfig {
  return {
    id,
    name: `Mock ${id}`,
    port: 8080,
    endpoints: [],
    cors_enabled: false,
    cors_config: {
      allow_origin: "*",
      allow_methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allow_headers: ["Content-Type", "Authorization"],
      allow_credentials: false,
    },
    headers: {},
    ...overrides,
  };
}

function makeLogEntry(overrides?: Partial<MockLogEntry>): MockLogEntry {
  return {
    id: "l1",
    timestamp: "t",
    method: "GET",
    path: "/",
    request_headers: {},
    request_body: "",
    response_status: 200,
    response_headers: {},
    response_body: "",
    latency_ms: 10,
    warnings: [],
    ...overrides,
  };
}

function resetStore() {
  useMockStore.setState({
    configs: [],
    selectedConfigId: null,
    serverStatuses: {},
    serverErrors: {},
    serverLogs: {},
    serverStats: {},
    loading: false,
  });
}

function resetMocks() {
  for (const fn of Object.values(mockFns)) {
    fn.mockReset();
  }
  mockListen.mockReset();
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("mockStore", () => {
  beforeEach(() => {
    resetStore();
    resetMocks();
  });

  // ── Initial state & simple setters ────────────────────────────────────

  describe("initial state", () => {
    it("has empty configs and no selection", () => {
      const s = useMockStore.getState();
      expect(s.configs).toEqual([]);
      expect(s.selectedConfigId).toBeNull();
      expect(s.serverStatuses).toEqual({});
      expect(s.loading).toBe(false);
    });
  });

  describe("setSelectedConfigId", () => {
    it("updates selectedConfigId", () => {
      useMockStore.getState().setSelectedConfigId("mock-1");
      expect(useMockStore.getState().selectedConfigId).toBe("mock-1");
    });

    it("clears selection when passed null", () => {
      useMockStore.getState().setSelectedConfigId("mock-1");
      useMockStore.getState().setSelectedConfigId(null);
      expect(useMockStore.getState().selectedConfigId).toBeNull();
    });
  });

  // ── Config CRUD ──────────────────────────────────────────────────────

  describe("loadConfigs", () => {
    it("loads configs and sets loading state", async () => {
      const configs = [createMockConfig("m1")];
      mockFns.getMockConfigs.mockResolvedValue(configs);
      mockFns.getMockServerStatus.mockResolvedValue("stopped");

      const promise = useMockStore.getState().loadConfigs();
      expect(useMockStore.getState().loading).toBe(true);

      await promise;

      const s = useMockStore.getState();
      expect(s.loading).toBe(false);
      expect(s.configs).toHaveLength(1);
      expect(s.serverStatuses["m1"]).toBe("stopped");
    });

    it("fetches running status for running servers", async () => {
      mockFns.getMockConfigs.mockResolvedValue([createMockConfig("m1")]);
      mockFns.getMockServerStatus.mockResolvedValue("running");
      mockFns.getMockServerStats.mockResolvedValue({ request_count: 5, error_count: 0, average_latency_ms: 100 });
      mockFns.getMockServerLogs.mockResolvedValue([]);

      await useMockStore.getState().loadConfigs();

      expect(useMockStore.getState().serverStatuses["m1"]).toBe("running");
      expect(useMockStore.getState().serverStats["m1"]).toBeDefined();
      expect(useMockStore.getState().serverLogs["m1"]).toBeDefined();
    });

    it("handles status fetch failure gracefully", async () => {
      mockFns.getMockConfigs.mockResolvedValue([createMockConfig("m1")]);
      mockFns.getMockServerStatus.mockRejectedValue(new Error("Not found"));

      await useMockStore.getState().loadConfigs();
      expect(useMockStore.getState().serverStatuses["m1"]).toBe("stopped");
    });

    it("selects first config when none selected", async () => {
      mockFns.getMockConfigs.mockResolvedValue([createMockConfig("m1")]);
      mockFns.getMockServerStatus.mockResolvedValue("stopped");

      await useMockStore.getState().loadConfigs();
      expect(useMockStore.getState().selectedConfigId).toBe("m1");
    });

    it("does not override existing selection", async () => {
      useMockStore.setState({ selectedConfigId: "m2" });
      mockFns.getMockConfigs.mockResolvedValue([createMockConfig("m1"), createMockConfig("m2")]);
      mockFns.getMockServerStatus.mockResolvedValue("stopped");

      await useMockStore.getState().loadConfigs();
      expect(useMockStore.getState().selectedConfigId).toBe("m2");
    });

    it("sets loading false on error", async () => {
      mockFns.getMockConfigs.mockRejectedValue(new Error("DB error"));
      await useMockStore.getState().loadConfigs();
      expect(useMockStore.getState().loading).toBe(false);
    });

    it("handles empty configs without crashing (no auto-select)", async () => {
      mockFns.getMockConfigs.mockResolvedValue([]);

      await useMockStore.getState().loadConfigs();

      const s = useMockStore.getState();
      expect(s.configs).toEqual([]);
      expect(s.loading).toBe(false);
      expect(s.selectedConfigId).toBeNull();
    });

    it("handles stats/logs fetch failure when server is running (inner catch)", async () => {
      mockFns.getMockConfigs.mockResolvedValue([createMockConfig("m1")]);
      mockFns.getMockServerStatus.mockResolvedValue("running");
      mockFns.getMockServerStats.mockRejectedValue(new Error("Stats error"));
      mockFns.getMockServerLogs.mockRejectedValue(new Error("Logs error"));

      await useMockStore.getState().loadConfigs();

      const s = useMockStore.getState();
      expect(s.serverStatuses["m1"]).toBe("running");
      // Stats and logs should remain undefined because the inner catch was triggered
      expect(s.serverStats["m1"]).toBeUndefined();
      expect(s.serverLogs["m1"]).toBeUndefined();
    });
  });

  describe("createConfig", () => {
    it("creates config and reloads list", async () => {
      mockFns.createMockConfig.mockResolvedValue(undefined);
      mockFns.getMockConfigs.mockResolvedValue([createMockConfig("new-id")]);
      mockFns.getMockServerStatus.mockResolvedValue("stopped");

      await useMockStore.getState().createConfig("New Server", 9090);

      expect(mockFns.createMockConfig).toHaveBeenCalledTimes(1);
      const created = mockFns.createMockConfig.mock.calls[0][0];
      expect(created.name).toBe("New Server");
      expect(created.port).toBe(9090);
    });
  });

  describe("updateConfig", () => {
    it("updates config in local state after backend call", async () => {
      const config = createMockConfig("m1");
      useMockStore.setState({ configs: [config] });
      mockFns.updateMockConfig.mockResolvedValue(undefined);

      const updated = { ...config, name: "Updated" };
      await useMockStore.getState().updateConfig(updated);

      expect(mockFns.updateMockConfig).toHaveBeenCalledWith(updated);
      expect(useMockStore.getState().configs[0].name).toBe("Updated");
    });
  });

  describe("deleteConfig", () => {
    it("removes config and cleans up associated state", async () => {
      useMockStore.setState({
        configs: [createMockConfig("m1"), createMockConfig("m2")],
        selectedConfigId: "m1",
        serverStatuses: { m1: "running", m2: "stopped" },
      });
      mockFns.deleteMockConfig.mockResolvedValue(undefined);

      await useMockStore.getState().deleteConfig("m1");

      const s = useMockStore.getState();
      expect(s.configs).toHaveLength(1);
      expect(s.configs[0].id).toBe("m2");
      expect(s.selectedConfigId).toBe("m2");
    });

    it("sets selectedConfigId to null when deleting last config", async () => {
      useMockStore.setState({ configs: [createMockConfig("m1")], selectedConfigId: "m1" });
      mockFns.deleteMockConfig.mockResolvedValue(undefined);

      await useMockStore.getState().deleteConfig("m1");

      expect(useMockStore.getState().selectedConfigId).toBeNull();
    });

    it("preserves selectedConfigId when deleting a different config", async () => {
      useMockStore.setState({
        configs: [createMockConfig("m1"), createMockConfig("m2")],
        selectedConfigId: "m1",
      });
      mockFns.deleteMockConfig.mockResolvedValue(undefined);

      await useMockStore.getState().deleteConfig("m2");

      const s = useMockStore.getState();
      expect(s.configs).toHaveLength(1);
      expect(s.configs[0].id).toBe("m1");
      expect(s.selectedConfigId).toBe("m1");
    });
  });

  // ── Server Lifecycle ─────────────────────────────────────────────────

  describe("startServer", () => {
    it("optimistically sets status to running before backend call", async () => {
      mockFns.startMockServer.mockResolvedValue(undefined);
      const config = createMockConfig("m1");

      await useMockStore.getState().startServer(config);

      // Optimistic update should keep it as running
      expect(useMockStore.getState().serverStatuses["m1"]).toBe("running");
    });

    it("sets status to error on failure", async () => {
      mockFns.startMockServer.mockRejectedValue(new Error("Port in use"));
      const config = createMockConfig("m1");

      await expect(useMockStore.getState().startServer(config)).rejects.toThrow("Port in use");

      const s = useMockStore.getState();
      expect(s.serverStatuses["m1"]).toBe("error");
      expect(s.serverErrors["m1"]).toContain("Port in use");
    });
  });

  describe("stopServer", () => {
    it("stops server and sets status to stopped", async () => {
      useMockStore.setState({ serverStatuses: { m1: "running" } });
      mockFns.stopMockServer.mockResolvedValue(undefined);

      await useMockStore.getState().stopServer("m1");

      expect(mockFns.stopMockServer).toHaveBeenCalledWith("m1");
      expect(useMockStore.getState().serverStatuses["m1"]).toBe("stopped");
    });

    it("re-throws error on failure", async () => {
      mockFns.stopMockServer.mockRejectedValue(new Error("Server not found"));

      await expect(useMockStore.getState().stopServer("m1")).rejects.toThrow("Server not found");
    });
  });

  // ── Imports ─────────────────────────────────────────────────────────────

  describe("imports", () => {
    it("importOpenApi creates config from spec and reloads", async () => {
      const config = createMockConfig("api-1");
      mockFns.importOpenApiMock.mockResolvedValue(config);
      mockFns.getMockConfigs.mockResolvedValue([config]);
      mockFns.getMockServerStatus.mockResolvedValue("stopped");

      const result = await useMockStore.getState().importOpenApi("spec", "My API", 8080);

      expect(mockFns.importOpenApiMock).toHaveBeenCalledWith("spec", "My API", 8080);
      expect(result).toBe(config);
      expect(useMockStore.getState().selectedConfigId).toBe("api-1");
    });

    it("importCollection creates config from collection", async () => {
      const config = createMockConfig("col-1");
      mockFns.importCollectionMock.mockResolvedValue(config);
      mockFns.getMockConfigs.mockResolvedValue([config]);
      mockFns.getMockServerStatus.mockResolvedValue("stopped");

      const result = await useMockStore.getState().importCollection("col-id", "My Mock", 9090);

      expect(mockFns.importCollectionMock).toHaveBeenCalledWith("col-id", "My Mock", 9090);
      expect(result).toBe(config);
    });
  });

  // ── Logs & Events ─────────────────────────────────────────────────────

  describe("clearLogs", () => {
    it("clears logs for a specific server", () => {
      useMockStore.setState({ serverLogs: { m1: [makeLogEntry()] } });

      useMockStore.getState().clearLogs("m1");

      expect(useMockStore.getState().serverLogs["m1"]).toEqual([]);
    });
  });

  describe("subscribeToEvents", () => {
    it("subscribes to all three mock events", async () => {
      mockListen
        .mockResolvedValueOnce(vi.fn())
        .mockResolvedValueOnce(vi.fn())
        .mockResolvedValueOnce(vi.fn());

      const cleanup = await useMockStore.getState().subscribeToEvents();

      expect(mockListen).toHaveBeenCalledTimes(3);
      expect(mockListen).toHaveBeenCalledWith("mock-status", expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith("mock-log", expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith("mock-stats", expect.any(Function));
      expect(cleanup).toBeInstanceOf(Function);
    });

    it("updates status on mock-status event", async () => {
      const handlers = new Map<string, (...args: unknown[]) => void>();
      mockListen.mockImplementation(async (eventName: string, handler: (...args: unknown[]) => void) => {
        handlers.set(eventName, handler);
        return vi.fn();
      });

      await useMockStore.getState().subscribeToEvents();

      const statusHandler = handlers.get("mock-status")!;
      statusHandler({ payload: { id: "m1", name: "", port: 8080, status: "running", error_message: null } });

      expect(useMockStore.getState().serverStatuses["m1"]).toBe("running");
    });

    it("appends log on mock-log event", async () => {
      const handlers = new Map<string, (...args: unknown[]) => void>();
      mockListen.mockImplementation(async (eventName: string, handler: (...args: unknown[]) => void) => {
        handlers.set(eventName, handler);
        return vi.fn();
      });

      await useMockStore.getState().subscribeToEvents();

      const logHandler = handlers.get("mock-log")!;
      logHandler({ payload: { serverId: "m1", log: makeLogEntry({ id: "entry-1", method: "POST" }) } });

      expect(useMockStore.getState().serverLogs["m1"]).toHaveLength(1);
      expect(useMockStore.getState().serverLogs["m1"][0].method).toBe("POST");
    });

    it("updates stats on mock-stats event", async () => {
      const handlers = new Map<string, (...args: unknown[]) => void>();
      mockListen.mockImplementation(async (eventName: string, handler: (...args: unknown[]) => void) => {
        handlers.set(eventName, handler);
        return vi.fn();
      });

      await useMockStore.getState().subscribeToEvents();

      const statsHandler = handlers.get("mock-stats")!;
      statsHandler({ payload: { serverId: "m1", stats: { request_count: 42, error_count: 3, average_latency_ms: 200 } } });

      expect(useMockStore.getState().serverStats["m1"]).toEqual({ request_count: 42, error_count: 3, average_latency_ms: 200 });
    });

    it("handles listen errors gracefully", async () => {
      mockListen.mockRejectedValue(new Error("Listen failed"));

      const cleanup = await useMockStore.getState().subscribeToEvents();
      expect(cleanup).toBeInstanceOf(Function);
      cleanup();
    });
  });
});
