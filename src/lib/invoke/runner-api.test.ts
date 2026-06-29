import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSafeInvoke = vi.fn();
vi.mock("./safe-invoke", () => ({
  safeInvoke: mockSafeInvoke,
}));

const {
  runCollection,
  runTestSuite,
  runCollectionDataDriven,
  getRunHistory,
  deleteRunHistory,
  clearRunHistory,
} = await import("./runner-api");

describe("runCollection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should use default delayMs and stopOnFailure when not provided", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ total: 0, passed: 0, failed: 0 });
    await runCollection("col-1", "env-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("run_collection", {
      collectionId: "col-1",
      environmentId: "env-1",
      delayMs: 0,
      stopOnFailure: false,
    });
  });

  it("should pass custom delay and stopOnFailure", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ total: 0, passed: 0, failed: 0 });
    await runCollection("col-1", "env-1", 500, true);
    expect(mockSafeInvoke).toHaveBeenCalledWith("run_collection", {
      collectionId: "col-1",
      environmentId: "env-1",
      delayMs: 500,
      stopOnFailure: true,
    });
  });

  it("should pass null environmentId when not provided", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ total: 0, passed: 0, failed: 0 });
    await runCollection("col-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("run_collection", {
      collectionId: "col-1",
      environmentId: null,
      delayMs: 0,
      stopOnFailure: false,
    });
  });
});

describe("runTestSuite", () => {
  it("should call safeInvoke with run_test_suite command", async () => {
    const config = { tags: ["smoke"], delay_ms: 200, stop_on_failure: true };
    mockSafeInvoke.mockResolvedValueOnce({ total: 0 });
    await runTestSuite("col-1", "smoke", "env-1", config);
    expect(mockSafeInvoke).toHaveBeenCalledWith("run_test_suite", {
      collectionId: "col-1",
      mode: "smoke",
      environmentId: "env-1",
      config,
    });
  });
});

describe("runCollectionDataDriven", () => {
  it("should call safeInvoke with run_collection_data_driven command", async () => {
    const dataset = { rows: [{ values: { key: "val" } }] };
    mockSafeInvoke.mockResolvedValueOnce({ total: 1 });
    await runCollectionDataDriven("col-1", "env-1", 100, true, dataset);
    expect(mockSafeInvoke).toHaveBeenCalledWith("run_collection_data_driven", {
      collectionId: "col-1",
      environmentId: "env-1",
      delayMs: 100,
      stopOnFailure: true,
      dataset,
    });
  });
});

describe("run history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getRunHistory should use default limit/offset", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getRunHistory();
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_run_history", { limit: 50, offset: 0 });
  });

  it("deleteRunHistory should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await deleteRunHistory("run-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("delete_run_history", { id: "run-1" });
  });

  it("clearRunHistory should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await clearRunHistory();
    expect(mockSafeInvoke).toHaveBeenCalledWith("clear_run_history");
  });
});
