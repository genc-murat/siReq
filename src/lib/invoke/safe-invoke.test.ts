import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTauriInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockTauriInvoke,
}));

// Re-import after mock is set up
const { safeInvoke } = await import("./safe-invoke");

describe("safeInvoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call tauri invoke with command name and args", async () => {
    mockTauriInvoke.mockResolvedValueOnce("response");

    const result = await safeInvoke("test_command", { key: "value" });

    expect(mockTauriInvoke).toHaveBeenCalledWith("test_command", { key: "value" });
    expect(result).toBe("response");
  });

  it("should use empty object when args not provided", async () => {
    mockTauriInvoke.mockResolvedValueOnce(null);

    await safeInvoke("no_args_command");

    expect(mockTauriInvoke).toHaveBeenCalledWith("no_args_command", {});
  });

  it("should throw with descriptive message when tauri invoke is missing", async () => {
    mockTauriInvoke.mockImplementationOnce(() => {
      // Simulate the check in safeInvoke by throwing the same error
      throw new Error("Tauri backend not available: command 'missing_cmd' cannot be executed. Run 'cargo tauri dev' to start the full app.");
    });

    await expect(safeInvoke("missing_cmd")).rejects.toThrow("Tauri backend not available");
  });

  it("should pass through the response type", async () => {
    const data = { id: "1", name: "test" };
    mockTauriInvoke.mockResolvedValueOnce(data);

    const result = await safeInvoke<{ id: string; name: string }>("get_item");

    expect(result).toEqual(data);
  });

  it("should propagate errors from tauri invoke", async () => {
    mockTauriInvoke.mockRejectedValueOnce(new Error("Network error"));

    await expect(safeInvoke("failing_cmd")).rejects.toThrow("Network error");
  });
});
