import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSafeInvoke = vi.fn();
vi.mock("./safe-invoke", () => ({
  safeInvoke: mockSafeInvoke,
}));

const { wsConnect, wsSend, wsDisconnect } = await import("./ws-api");

describe("wsConnect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should call safeInvoke with ws_connect command", async () => {
    mockSafeInvoke.mockResolvedValueOnce("conn-1");
    const result = await wsConnect("ws://example.com", "env-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("ws_connect", {
      url: "ws://example.com",
      environmentId: "env-1",
    });
    expect(result).toBe("conn-1");
  });

  it("should pass null environmentId when not provided", async () => {
    mockSafeInvoke.mockResolvedValueOnce("conn-1");
    await wsConnect("ws://example.com");
    expect(mockSafeInvoke).toHaveBeenCalledWith("ws_connect", {
      url: "ws://example.com",
      environmentId: null,
    });
  });
});

describe("wsSend", () => {
  it("should call safeInvoke with ws_send command", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await wsSend("conn-1", "hello", "env-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("ws_send", {
      connectionId: "conn-1",
      message: "hello",
      environmentId: "env-1",
    });
  });

  it("should pass null environmentId when not provided", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await wsSend("conn-1", "hello");
    expect(mockSafeInvoke).toHaveBeenCalledWith("ws_send", {
      connectionId: "conn-1",
      message: "hello",
      environmentId: null,
    });
  });
});

describe("wsDisconnect", () => {
  it("should call safeInvoke with ws_disconnect command", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await wsDisconnect("conn-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("ws_disconnect", { connectionId: "conn-1" });
  });
});
