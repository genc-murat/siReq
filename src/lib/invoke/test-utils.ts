import type { HttpRequest, Collection, MockServerConfig } from "./types";

export function createMockRequest(overrides?: Partial<HttpRequest>): HttpRequest {
  return {
    id: "req-1",
    name: "Test Request",
    method: "GET",
    url: "https://example.com",
    headers: [],
    query_params: [],
    body_type: "none",
    body: "",
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
    ...overrides,
  };
}

export function createMockCollection(name: string, overrides?: Partial<Collection>): Collection {
  return {
    id: "col-1",
    name,
    requests: [],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

export function createMockMockConfig(name: string, overrides?: Partial<MockServerConfig>): MockServerConfig {
  return {
    id: "mock-1",
    name,
    port: 8080,
    endpoints: [],
    cors_enabled: false,
    cors_config: {
      allow_origin: "*",
      allow_methods: ["GET"],
      allow_headers: ["Content-Type"],
      allow_credentials: false,
    },
    headers: {},
    ...overrides,
  };
}
