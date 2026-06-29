import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSafeInvoke = vi.fn();
vi.mock("./safe-invoke", () => ({
  safeInvoke: mockSafeInvoke,
}));

const {
  getEnvironments,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  getGlobalVariables,
  saveGlobalVariables,
  encryptSecretValue,
  decryptSecretValue,
  getCookies,
  deleteCookie,
  clearCookies,
} = await import("./env-api");

describe("environments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getEnvironments should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getEnvironments();
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_environments");
  });

  it("createEnvironment should call safeInvoke with name", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ id: "env-1", name: "test" });
    await createEnvironment("test");
    expect(mockSafeInvoke).toHaveBeenCalledWith("create_environment", { name: "test" });
  });

  it("updateEnvironment should call safeInvoke with environment", async () => {
    const env = { id: "env-1", name: "test", variables: [], created_at: "", updated_at: "" };
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await updateEnvironment(env);
    expect(mockSafeInvoke).toHaveBeenCalledWith("update_environment", { environment: env });
  });

  it("deleteEnvironment should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await deleteEnvironment("env-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("delete_environment", { id: "env-1" });
  });
});

describe("global variables and secrets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getGlobalVariables should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ id: "gv-1", variables: [] });
    await getGlobalVariables();
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_global_variables_cmd");
  });

  it("saveGlobalVariables should call safeInvoke with global", async () => {
    const gv = { id: "gv-1", variables: [], created_at: "", updated_at: "" };
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await saveGlobalVariables(gv);
    expect(mockSafeInvoke).toHaveBeenCalledWith("save_global_variables_cmd", { global: gv });
  });

  it("encryptSecretValue should call safeInvoke with plaintext", async () => {
    mockSafeInvoke.mockResolvedValueOnce("encrypted");
    const result = await encryptSecretValue("plain");
    expect(mockSafeInvoke).toHaveBeenCalledWith("encrypt_secret_value", { plaintext: "plain" });
    expect(result).toBe("encrypted");
  });

  it("decryptSecretValue should call safeInvoke with ciphertext", async () => {
    mockSafeInvoke.mockResolvedValueOnce("plain");
    const result = await decryptSecretValue("encrypted");
    expect(mockSafeInvoke).toHaveBeenCalledWith("decrypt_secret_value", { ciphertext: "encrypted" });
    expect(result).toBe("plain");
  });
});

describe("cookies", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getCookies should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getCookies();
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_cookies");
  });

  it("deleteCookie should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await deleteCookie("cookie-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("delete_cookie", { id: "cookie-1" });
  });

  it("clearCookies should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await clearCookies();
    expect(mockSafeInvoke).toHaveBeenCalledWith("clear_cookies");
  });
});
