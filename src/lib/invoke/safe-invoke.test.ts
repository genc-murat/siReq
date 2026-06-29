import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTauriInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockTauriInvoke,
}));

// Re-import after mock is set up
const { safeInvoke } = await import("./safe-invoke");

describe("safeInvoke (Tauri mode)", () => {
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

describe("safeInvoke (browser-only mode — no Tauri)", () => {
  it("throws descriptive error when Tauri invoke is not available", async () => {
    vi.resetModules();
    // Mock with invoke as undefined (browser mode — no Tauri backend)
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: undefined,
    }));
    const { safeInvoke: safeInvokeBrowser } = await import("./safe-invoke");

    await expect(
      safeInvokeBrowser("missing_cmd")
    ).rejects.toThrow(
      "Tauri backend not available: command 'missing_cmd' cannot be executed. Run 'cargo tauri dev' to start the full app."
    );
  });
});
