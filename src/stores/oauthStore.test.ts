import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useOauthStore,
  generateCodeChallenge,
  generateCodeVerifier,
} from "./oauthStore";

// ── Hoisted mutable mock state ─────────────────────────────────────────────

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: {
    sendRequest: vi.fn(),
  },
}));

vi.mock("@/lib/invoke", () => ({
  sendRequest: mockInvoke.sendRequest,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function resetStore() {
  useOauthStore.setState({
    configs: {},
    oauthEnabledRequests: {},
  });
}

function resetMocks() {
  mockInvoke.sendRequest.mockReset();
}

function makeTokenResponse(overrides?: Record<string, unknown>) {
  return {
    status: 200,
    status_text: "OK",
    headers: [["content-type", "application/json"]] as [string, string][],
    cookies: [],
    body: JSON.stringify({
      access_token: "test_access_token",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: "test_refresh_token",
      ...overrides,
    }),
    size: 100,
    time_ms: 50,
  };
}

const defaultReqState = {
  request: {
    id: "req-1",
    name: "",
    method: "GET" as const,
    url: "",
    headers: [] as Array<{ key: string; value: string; enabled: boolean }>,
    query_params: [],
    body_type: "none" as const,
    body: "",
    form_fields: [],
    auth: {
      type: "none" as const,
      username: "",
      password: "",
      token: "",
      api_key: "",
      api_key_name: "",
      api_key_in: "header" as const,
    },
    settings: {
      timeout: 30,
      follow_redirects: true,
      ssl_verify: true,
      proxy: null,
    },
    pre_script: "",
    post_script: "",
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("oauthStore", () => {
  beforeEach(() => {
    resetStore();
    resetMocks();
  });

  // ── Initial state ────────────────────────────────────────────────────

  describe("initial state", () => {
    it("has empty configs and no enabled requests", () => {
      const s = useOauthStore.getState();
      expect(s.configs).toEqual({});
      expect(s.oauthEnabledRequests).toEqual({});
    });
  });

  // ── saveConfig / getConfig ───────────────────────────────────────────

  describe("saveConfig and getConfig", () => {
    it("saves partial config merged with defaults", () => {
      useOauthStore.getState().saveConfig("req-1", {
        tokenUrl: "https://auth.example.com/token",
        clientId: "my-client",
      });

      const config = useOauthStore.getState().getConfig("req-1");
      expect(config.tokenUrl).toBe("https://auth.example.com/token");
      expect(config.clientId).toBe("my-client");
      expect(config.grantType).toBe("client_credentials"); // default
      expect(config.redirectUri).toBe("http://localhost:3456/callback"); // default
      expect(config.tokenData).toBeNull();
    });

    it("returns default config for unknown requestId", () => {
      const config = useOauthStore.getState().getConfig("unknown-req");
      expect(config.grantType).toBe("client_credentials");
      expect(config.tokenUrl).toBe("");
    });

    it("merges new config over existing", () => {
      useOauthStore.getState().saveConfig("req-1", { clientId: "first" });
      useOauthStore.getState().saveConfig("req-1", { scope: "openid" });

      const config = useOauthStore.getState().getConfig("req-1");
      expect(config.clientId).toBe("first");
      expect(config.scope).toBe("openid");
    });

    it("preserves tokenData when saving other fields", () => {
      useOauthStore.getState().saveConfig("req-1", {
        tokenData: { accessToken: "tok", tokenType: "Bearer", fetchedAt: Date.now() },
      });
      useOauthStore.getState().saveConfig("req-1", { scope: "email" });

      const config = useOauthStore.getState().getConfig("req-1");
      expect(config.tokenData?.accessToken).toBe("tok");
      expect(config.scope).toBe("email");
    });
  });

  // ── setOauthEnabled ──────────────────────────────────────────────────

  describe("setOauthEnabled", () => {
    it("enables oauth for a request", () => {
      useOauthStore.getState().setOauthEnabled("req-1", true);
      expect(useOauthStore.getState().oauthEnabledRequests["req-1"]).toBe(true);
    });

    it("disables oauth for a request", () => {
      useOauthStore.getState().setOauthEnabled("req-1", true);
      useOauthStore.getState().setOauthEnabled("req-1", false);
      expect(useOauthStore.getState().oauthEnabledRequests["req-1"]).toBe(false);
    });
  });

  // ── clearToken ───────────────────────────────────────────────────────

  describe("clearToken", () => {
    it("sets tokenData to null for a request", () => {
      useOauthStore.getState().saveConfig("req-1", {
        tokenData: { accessToken: "tok", tokenType: "Bearer", fetchedAt: Date.now() },
      });
      useOauthStore.getState().clearToken("req-1");

      const config = useOauthStore.getState().getConfig("req-1");
      expect(config.tokenData).toBeNull();
    });

    it("works even if no config exists for requestId", () => {
      useOauthStore.getState().clearToken("nonexistent");
      const config = useOauthStore.getState().getConfig("nonexistent");
      expect(config.tokenData).toBeNull();
    });
  });

  // ── fetchTokenClientCredentials ──────────────────────────────────────

  describe("fetchTokenClientCredentials", () => {
    it("fetches token and stores tokenData", async () => {
      useOauthStore.getState().saveConfig("req-1", {
        tokenUrl: "https://auth.example.com/token",
        clientId: "my-client",
        clientSecret: "my-secret",
      });
      mockInvoke.sendRequest.mockResolvedValue(makeTokenResponse());

      await useOauthStore.getState().fetchTokenClientCredentials("req-1");

      const config = useOauthStore.getState().getConfig("req-1");
      expect(config.tokenData?.accessToken).toBe("test_access_token");
      expect(config.tokenData?.tokenType).toBe("Bearer");
      expect(config.tokenData?.refreshToken).toBe("test_refresh_token");
      expect(config.tokenData?.expiresIn).toBe(3600);
    });

    it("sends request with form_urlencoded body", async () => {
      useOauthStore.getState().saveConfig("req-1", {
        tokenUrl: "https://auth.example.com/token",
        clientId: "my-client",
        clientSecret: "my-secret",
        scope: "openid profile",
      });
      mockInvoke.sendRequest.mockResolvedValue(makeTokenResponse());

      await useOauthStore.getState().fetchTokenClientCredentials("req-1");

      expect(mockInvoke.sendRequest).toHaveBeenCalledTimes(1);
      const [req] = mockInvoke.sendRequest.mock.calls[0];
      expect(req.method).toBe("POST");
      expect(req.url).toBe("https://auth.example.com/token");
      expect(req.body_type).toBe("form_urlencoded");
      expect(req.body).toContain("grant_type=client_credentials");
      expect(req.body).toContain("client_id=my-client");
      expect(req.body).toContain("client_secret=my-secret");
      expect(req.body).toContain("scope=openid%20profile");
    });

    it("sets bearer token in requestStore", async () => {
      useOauthStore.getState().saveConfig("req-1", {
        tokenUrl: "https://auth.example.com/token",
        clientId: "my-client",
      });
      mockInvoke.sendRequest.mockResolvedValue(makeTokenResponse());

      // Initialize requestStore state for the store subscription
      const { useRequestStore } = await import("./requestStore");
      useRequestStore.setState(defaultReqState);

      await useOauthStore.getState().fetchTokenClientCredentials("req-1");

      const rs = useRequestStore.getState();
      expect(rs.request.auth.type).toBe("bearer");
      expect(rs.request.auth.token).toBe("test_access_token");
    });

    it("throws when tokenUrl is missing", async () => {
      useOauthStore.getState().saveConfig("req-1", { clientId: "my-client" });

      await expect(
        useOauthStore.getState().fetchTokenClientCredentials("req-1")
      ).rejects.toThrow("Missing Token URL or Client ID");
    });

    it("throws when token endpoint returns non-200", async () => {
      useOauthStore.getState().saveConfig("req-1", {
        tokenUrl: "https://auth.example.com/token",
        clientId: "my-client",
      });
      mockInvoke.sendRequest.mockResolvedValue({
        status: 400,
        status_text: "Bad Request",
        headers: [],
        cookies: [],
        body: '{"error":"invalid_grant"}',
        size: 50,
        time_ms: 10,
      });

      await expect(
        useOauthStore.getState().fetchTokenClientCredentials("req-1")
      ).rejects.toThrow("Token endpoint returned status 400");
    });
  });

  // ── generateCodeVerifier ─────────────────────────────────────────────

  describe("generateCodeVerifier", () => {
    it("returns a non-empty string", () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toBeTruthy();
      expect(typeof verifier).toBe("string");
    });

    it("returns URL-safe base64 (no +, /, or =)", () => {
      const verifier = generateCodeVerifier();
      expect(verifier).not.toContain("+");
      expect(verifier).not.toContain("/");
      expect(verifier).not.toContain("=");
    });

    it("returns unique values on successive calls", () => {
      const v1 = generateCodeVerifier();
      const v2 = generateCodeVerifier();
      expect(v1).not.toBe(v2);
    });

    it("has reasonable length (up to 128 chars)", () => {
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });
  });

  // ── generateCodeChallenge ────────────────────────────────────────────

  describe("generateCodeChallenge", () => {
    it("produces a URL-safe base64 SHA-256 hash", async () => {
      const challenge = await generateCodeChallenge("test-verifier");
      expect(challenge).toBeTruthy();
      expect(typeof challenge).toBe("string");
      expect(challenge).not.toContain("+");
      expect(challenge).not.toContain("/");
      expect(challenge).not.toContain("=");
    });

    it("produces deterministic output for same input", async () => {
      const c1 = await generateCodeChallenge("same-input");
      const c2 = await generateCodeChallenge("same-input");
      expect(c1).toBe(c2);
    });

    it("produces different output for different inputs", async () => {
      const c1 = await generateCodeChallenge("input-a");
      const c2 = await generateCodeChallenge("input-b");
      expect(c1).not.toBe(c2);
    });
  });

  // ── generateAuthUrl ──────────────────────────────────────────────────

  describe("generateAuthUrl", () => {
    it("generates authorization code URL with required params", async () => {
      useOauthStore.getState().saveConfig("req-1", {
        grantType: "authorization_code",
        authUrl: "https://auth.example.com/authorize",
        clientId: "my-client",
        redirectUri: "http://localhost:3456/callback",
      });

      const url = await useOauthStore.getState().generateAuthUrl("req-1");

      const parsed = new URL(url);
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("client_id")).toBe("my-client");
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:3456/callback");
      expect(parsed.searchParams.get("state")).toBeTruthy();
    });

    it("includes PKCE params for authorization_code_pkce", async () => {
      useOauthStore.getState().saveConfig("req-1", {
        grantType: "authorization_code_pkce",
        authUrl: "https://auth.example.com/authorize",
        clientId: "my-client",
      });

      const url = await useOauthStore.getState().generateAuthUrl("req-1");

      const parsed = new URL(url);
      expect(parsed.searchParams.get("code_challenge")).toBeTruthy();
      expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    });

    it("includes scope when configured", async () => {
      useOauthStore.getState().saveConfig("req-1", {
        authUrl: "https://auth.example.com/authorize",
        clientId: "my-client",
        scope: "openid profile",
      });

      const url = await useOauthStore.getState().generateAuthUrl("req-1");

      const parsed = new URL(url);
      expect(parsed.searchParams.get("scope")).toBe("openid profile");
    });

    it("saves codeVerifier and state", async () => {
      useOauthStore.getState().saveConfig("req-1", {
        grantType: "authorization_code_pkce",
        authUrl: "https://auth.example.com/authorize",
        clientId: "my-client",
      });

      await useOauthStore.getState().generateAuthUrl("req-1");

      const config = useOauthStore.getState().getConfig("req-1");
      expect(config.codeVerifier).toBeTruthy();
      expect(config.state).toBeTruthy();
    });

    it("throws when authUrl is missing", async () => {
      useOauthStore.getState().saveConfig("req-1", { clientId: "my-client" });

      await expect(
        useOauthStore.getState().generateAuthUrl("req-1")
      ).rejects.toThrow("Missing Authorization URL or Client ID");
    });
  });

  // ── exchangeCodeForToken ─────────────────────────────────────────────

  describe("exchangeCodeForToken", () => {
    it("exchanges authorization code for token", async () => {
      useOauthStore.getState().saveConfig("req-1", {
        tokenUrl: "https://auth.example.com/token",
        clientId: "my-client",
        clientSecret: "my-secret",
        redirectUri: "http://localhost:3456/callback",
      });
      mockInvoke.sendRequest.mockResolvedValue(makeTokenResponse());

      await useOauthStore.getState().exchangeCodeForToken("req-1", "auth-code-123");

      const config = useOauthStore.getState().getConfig("req-1");
      expect(config.tokenData?.accessToken).toBe("test_access_token");
    });

    it("sends authorization_code grant with code", async () => {
      useOauthStore.getState().saveConfig("req-1", {
        tokenUrl: "https://auth.example.com/token",
        clientId: "my-client",
        redirectUri: "http://localhost:3456/callback",
      });
      mockInvoke.sendRequest.mockResolvedValue(makeTokenResponse());

      await useOauthStore.getState().exchangeCodeForToken("req-1", "my-code");

      const [req] = mockInvoke.sendRequest.mock.calls[0];
      expect(req.body).toContain("grant_type=authorization_code");
      expect(req.body).toContain("code=my-code");
      expect(req.body).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A3456%2Fcallback");
    });

    it("includes code_verifier for PKCE flow", async () => {
      useOauthStore.getState().saveConfig("req-1", {
        grantType: "authorization_code_pkce",
        tokenUrl: "https://auth.example.com/token",
        clientId: "my-client",
        codeVerifier: "my-verifier",
        redirectUri: "http://localhost:3456/callback",
      });
      mockInvoke.sendRequest.mockResolvedValue(makeTokenResponse());

      await useOauthStore.getState().exchangeCodeForToken("req-1", "my-code");

      const [req] = mockInvoke.sendRequest.mock.calls[0];
      expect(req.body).toContain("code_verifier=my-verifier");
    });

    it("includes client_secret when not PKCE", async () => {
      useOauthStore.getState().saveConfig("req-1", {
        grantType: "authorization_code",
        tokenUrl: "https://auth.example.com/token",
        clientId: "my-client",
        clientSecret: "my-secret",
        redirectUri: "http://localhost:3456/callback",
      });
      mockInvoke.sendRequest.mockResolvedValue(makeTokenResponse());

      await useOauthStore.getState().exchangeCodeForToken("req-1", "my-code");

      const [req] = mockInvoke.sendRequest.mock.calls[0];
      expect(req.body).toContain("client_secret=my-secret");
    });

    it("throws when tokenUrl is missing", async () => {
      useOauthStore.getState().saveConfig("req-1", { clientId: "my-client" });

      await expect(
        useOauthStore.getState().exchangeCodeForToken("req-1", "code")
      ).rejects.toThrow("Missing Token URL or Client ID");
    });

    it("sets bearer token in requestStore on success", async () => {
      const { useRequestStore } = await import("./requestStore");
      useRequestStore.setState(defaultReqState);

      useOauthStore.getState().saveConfig("req-1", {
        tokenUrl: "https://auth.example.com/token",
        clientId: "my-client",
        clientSecret: "my-secret",
        redirectUri: "http://localhost:3456/callback",
      });
      mockInvoke.sendRequest.mockResolvedValue(makeTokenResponse());

      await useOauthStore.getState().exchangeCodeForToken("req-1", "code");

      const rs = useRequestStore.getState();
      expect(rs.request.auth.type).toBe("bearer");
      expect(rs.request.auth.token).toBe("test_access_token");
    });
  });
});
