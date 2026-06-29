import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSafeInvoke = vi.fn();
vi.mock("./safe-invoke", () => ({
  safeInvoke: mockSafeInvoke,
}));

const {
  getMockConfigs,
  createMockConfig,
  updateMockConfig,
  deleteMockConfig,
  startMockServer,
  stopMockServer,
  getMockServerStatus,
  getMockServerLogs,
  getMockServerStats,
  importOpenApiMock,
  importCollectionMock,
} = await import("./mock-api");
const { createMockMockConfig } = await import("./test-utils");

describe("mock server API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getMockConfigs should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getMockConfigs();
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_mock_configs");
  });

  it("createMockConfig should call safeInvoke with config", async () => {
    const config = createMockMockConfig("test");
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await createMockConfig(config);
    expect(mockSafeInvoke).toHaveBeenCalledWith("create_mock_config", { config });
  });

  it("updateMockConfig should call safeInvoke with config", async () => {
    const config = createMockMockConfig("test");
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await updateMockConfig(config);
    expect(mockSafeInvoke).toHaveBeenCalledWith("update_mock_config_cmd", { config });
  });

  it("deleteMockConfig should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await deleteMockConfig("mock-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("delete_mock_config_cmd", { id: "mock-1" });
  });

  it("startMockServer should call safeInvoke with config", async () => {
    const config = createMockMockConfig("test");
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await startMockServer(config);
    expect(mockSafeInvoke).toHaveBeenCalledWith("start_mock_server_cmd", { config });
  });

  it("stopMockServer should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await stopMockServer("mock-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("stop_mock_server_cmd", { id: "mock-1" });
  });

  it("getMockServerStatus should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce("running");
    const result = await getMockServerStatus("mock-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_mock_server_status", { id: "mock-1" });
    expect(result).toBe("running");
  });

  it("getMockServerLogs should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getMockServerLogs("mock-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_mock_server_logs", { id: "mock-1" });
  });

  it("getMockServerStats should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ request_count: 0, error_count: 0, average_latency_ms: 0 });
    await getMockServerStats("mock-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_mock_server_stats", { id: "mock-1" });
  });

  it("importOpenApiMock should call safeInvoke with spec/name/port", async () => {
    const config = createMockMockConfig("api");
    mockSafeInvoke.mockResolvedValueOnce(config);
    const result = await importOpenApiMock("spec", "My API", 8080);
    expect(mockSafeInvoke).toHaveBeenCalledWith("import_openapi_mock", {
      spec: "spec", name: "My API", port: 8080,
    });
    expect(result).toBe(config);
  });

  it("importCollectionMock should call safeInvoke with collectionId/name/port", async () => {
    const config = createMockMockConfig("col");
    mockSafeInvoke.mockResolvedValueOnce(config);
    const result = await importCollectionMock("col-1", "My Mock", 9090);
    expect(mockSafeInvoke).toHaveBeenCalledWith("import_collection_mock", {
      collectionId: "col-1", name: "My Mock", port: 9090,
    });
    expect(result).toBe(config);
  });
});
