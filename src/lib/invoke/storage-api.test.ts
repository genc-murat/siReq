import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSafeInvoke = vi.fn();
vi.mock("./safe-invoke", () => ({
  safeInvoke: mockSafeInvoke,
}));

const { getHistory, deleteHistory, clearHistory } = await import("./storage-api");

describe("storage API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getHistory should use default limit/offset", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getHistory();
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_history", { limit: 50, offset: 0 });
  });

  it("getHistory should pass custom limit/offset", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getHistory(10, 5);
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_history", { limit: 10, offset: 5 });
  });

  it("deleteHistory should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await deleteHistory("hist-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("delete_history", { id: "hist-1" });
  });

  it("clearHistory should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await clearHistory();
    expect(mockSafeInvoke).toHaveBeenCalledWith("clear_history");
  });
});
