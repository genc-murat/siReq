import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useRequestStore } from "./requestStore";
import { sendRequest } from "@/lib/invoke";
import type { HttpRequest, HttpResponse } from "@/lib/invoke";

export type OauthGrantType = "client_credentials" | "authorization_code" | "authorization_code_pkce";

export interface OauthTokenData {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn?: number;
  fetchedAt: number;
}

export interface OauthConfig {
  grantType: OauthGrantType;
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  state?: string;
  codeVerifier?: string;
  tokenData?: OauthTokenData | null;
}

interface OauthStoreState {
  configs: Record<string, OauthConfig>;
  oauthEnabledRequests: Record<string, boolean>;
  saveConfig: (requestId: string, config: Partial<OauthConfig>) => void;
  getConfig: (requestId: string) => OauthConfig;
  setOauthEnabled: (requestId: string, enabled: boolean) => void;
  fetchTokenClientCredentials: (requestId: string) => Promise<void>;
  generateAuthUrl: (requestId: string) => Promise<string>;
  exchangeCodeForToken: (requestId: string, code: string) => Promise<void>;
  clearToken: (requestId: string) => void;
}

// PKCE Cryptographic Helpers using WebCrypto API
export function generateCodeVerifier(): string {
  const array = new Uint8Array(43); // Minimum entropy length for PKCE is 43 chars
  window.crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .substring(0, 128); // Cap at 128 chars max
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Bypasses CORS by routing token HTTP POST request through the Tauri reqwest backend
async function sendTokenRequest(url: string, params: Record<string, string>): Promise<OauthTokenData> {
  const bodyString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const oauthRequest: HttpRequest = {
    id: `oauth-token-${crypto.randomUUID()}`,
    name: "OAuth Token Exchange",
    method: "POST",
    url,
    headers: [
      { key: "Content-Type", value: "application/x-www-form-urlencoded", enabled: true },
    ],
    query_params: [],
    body_type: "form_urlencoded",
    body: bodyString,
    form_fields: [],
    auth: {
      type: "none",
      username: "",
      password: "",
      token: "",
      api_key: "",
      api_key_name: "",
      api_key_in: "header",
    },
    settings: {
      timeout: 30,
      follow_redirects: true,
      ssl_verify: true,
      proxy: null,
    },
    pre_script: "",
    post_script: "",
  };

  const response: HttpResponse = await sendRequest(oauthRequest);

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Token endpoint returned status ${response.status}: ${response.body || response.status_text}`);
  }

  const data = JSON.parse(response.body);
  if (!data.access_token) {
    throw new Error(`Invalid token response payload: missing access_token. Response: ${response.body}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type ?? "Bearer",
    expiresIn: data.expires_in,
    fetchedAt: Date.now(),
  };
}

const DEFAULT_CONFIG: OauthConfig = {
  grantType: "client_credentials",
  authUrl: "",
  tokenUrl: "",
  clientId: "",
  clientSecret: "",
  redirectUri: "http://localhost:3456/callback",
  scope: "",
  tokenData: null,
};

export const useOauthStore = create<OauthStoreState>()(
  persist(
    (set, get) => ({
      configs: {},
      oauthEnabledRequests: {},

      saveConfig: (requestId, config) => {
        set((s) => {
          const current = s.configs[requestId] ?? DEFAULT_CONFIG;
          return {
            configs: {
              ...s.configs,
              [requestId]: { ...current, ...config },
            },
          };
        });
      },

      getConfig: (requestId) => {
        return get().configs[requestId] ?? DEFAULT_CONFIG;
      },

      setOauthEnabled: (requestId, enabled) => {
        set((s) => ({
          oauthEnabledRequests: {
            ...s.oauthEnabledRequests,
            [requestId]: enabled,
          },
        }));
      },

      clearToken: (requestId) => {
        set((s) => {
          const current = s.configs[requestId] ?? DEFAULT_CONFIG;
          return {
            configs: {
              ...s.configs,
              [requestId]: { ...current, tokenData: null },
            },
          };
        });
      },

      fetchTokenClientCredentials: async (requestId) => {
        const config = get().getConfig(requestId);
        if (!config.tokenUrl || !config.clientId) {
          throw new Error("Missing Token URL or Client ID");
        }

        const params: Record<string, string> = {
          grant_type: "client_credentials",
          client_id: config.clientId,
          client_secret: config.clientSecret,
        };
        if (config.scope) {
          params.scope = config.scope;
        }

        const tokenData = await sendTokenRequest(config.tokenUrl, params);

        // Update oauthStore
        set((s) => ({
          configs: {
            ...s.configs,
            [requestId]: { ...config, tokenData },
          },
        }));

        // Write directly to requestStore's Bearer token
        useRequestStore.setState((s) => ({
          request: {
            ...s.request,
            auth: {
              ...s.request.auth,
              type: "bearer",
              token: tokenData.accessToken,
            },
          },
        }));
      },

      generateAuthUrl: async (requestId) => {
        const config = get().getConfig(requestId);
        if (!config.authUrl || !config.clientId) {
          throw new Error("Missing Authorization URL or Client ID");
        }

        const state = crypto.randomUUID().substring(0, 8);
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // Save PKCE verifier state
        get().saveConfig(requestId, { state, codeVerifier });

        const url = new URL(config.authUrl);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", config.clientId);
        url.searchParams.set("redirect_uri", config.redirectUri);
        url.searchParams.set("state", state);
        if (config.scope) {
          url.searchParams.set("scope", config.scope);
        }

        if (config.grantType === "authorization_code_pkce") {
          url.searchParams.set("code_challenge", codeChallenge);
          url.searchParams.set("code_challenge_method", "S256");
        }

        return url.toString();
      },

      exchangeCodeForToken: async (requestId, code) => {
        const config = get().getConfig(requestId);
        if (!config.tokenUrl || !config.clientId) {
          throw new Error("Missing Token URL or Client ID");
        }

        const params: Record<string, string> = {
          grant_type: "authorization_code",
          code,
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
        };

        if (config.grantType === "authorization_code_pkce" && config.codeVerifier) {
          params.code_verifier = config.codeVerifier;
        } else if (config.clientSecret) {
          params.client_secret = config.clientSecret;
        }

        const tokenData = await sendTokenRequest(config.tokenUrl, params);

        // Update oauthStore
        set((s) => ({
          configs: {
            ...s.configs,
            [requestId]: { ...config, tokenData },
          },
        }));

        // Write directly to requestStore's Bearer token
        useRequestStore.setState((s) => ({
          request: {
            ...s.request,
            auth: {
              ...s.request.auth,
              type: "bearer",
              token: tokenData.accessToken,
            },
          },
        }));
      },
    }),
    {
      name: "sireq-oauth",
    }
  )
);
