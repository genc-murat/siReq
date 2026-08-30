import { create } from "zustand";
import type { HttpMethod, BodyType, KeyValue, AuthConfig, HttpRequest, HttpResponse, FormField, RequestSettings } from "@/lib/invoke";
import { sendRequest, cancelRequest, benchmarkRequest, getBenchmarkHistory, deleteBenchmarkHistory } from "@/lib/invoke";
import type { BenchmarkResult, BenchmarkHistoryEntry } from "@/lib/invoke";
import { useToastStore } from "./toastStore";
import { parseQueryParamsFromUrl, buildUrlWithQueryParams } from "@/lib/urlUtils";

function generateId(): string {
  return crypto.randomUUID();
}

const defaultSettings: RequestSettings = {
  timeout: 30,
  follow_redirects: true,
  ssl_verify: true,
  proxy: null,
};

const defaultAuth: AuthConfig = {
  type: "none",
  username: "",
  password: "",
  token: "",
  api_key: "",
  api_key_name: "",
  api_key_in: "header",
};

interface RequestState {
  request: HttpRequest;
  response: HttpResponse | null;
  lastResponse: HttpResponse | null;
  benchmarkResult: BenchmarkResult | null;
  benchmarkLoading: boolean;
  benchmarkHistory: BenchmarkHistoryEntry[];
  benchmarkHistoryLoading: boolean;
  loading: boolean;
  error: string | null;
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setHeaders: (headers: KeyValue[]) => void;
  setQueryParams: (params: KeyValue[]) => void;
  setBodyType: (bodyType: BodyType) => void;
  setBody: (body: string) => void;
  setFormFields: (formFields: FormField[]) => void;
  setName: (name: string) => void;
  setAuth: (auth: AuthConfig) => void;
  setSettings: (settings: RequestSettings) => void;
  setRequest: (request: HttpRequest) => void;
  setPreScript: (script: string) => void;
  setPostScript: (script: string) => void;
  setJsonSchema: (schema: string) => void;
  send: (environmentId?: string | null) => Promise<void>;
  cancel: () => Promise<void>;
  runBenchmark: (count: number, environmentId?: string | null) => Promise<void>;
  loadBenchmarkHistory: (limit?: number, offset?: number) => Promise<void>;
  deleteBenchmarkHistoryItem: (id: string) => Promise<void>;
  loadHistoricBenchmark: (entry: BenchmarkHistoryEntry) => void;
  reset: () => void;
}

const createDefaultRequest = (): HttpRequest => ({
  id: generateId(),
  name: "",
  method: "GET",
  url: "",
  headers: [],
  query_params: [],
  body_type: "none",
  body: "",
  form_fields: [],
  auth: { ...defaultAuth },
  settings: { ...defaultSettings },
  pre_script: "",
  post_script: "",
  json_schema: "",
});

export const useRequestStore = create<RequestState>((set, get) => ({
  request: createDefaultRequest(),
  response: null,
  lastResponse: null,
  benchmarkResult: null,
  benchmarkLoading: false,
  benchmarkHistory: [],
  benchmarkHistoryLoading: false,
  loading: false,
  error: null,

  setMethod: (method) => set((s) => ({ request: { ...s.request, method } })),
  setUrl: (url) =>
    set((s) => {
      const parsedParams = parseQueryParamsFromUrl(url);
      return {
        request: {
          ...s.request,
          url,
          query_params: parsedParams,
        },
      };
    }),
  setHeaders: (headers) => set((s) => ({ request: { ...s.request, headers } })),
  setQueryParams: (params) =>
    set((s) => {
      const updatedUrl = buildUrlWithQueryParams(s.request.url, params);
      return {
        request: {
          ...s.request,
          query_params: params,
          url: updatedUrl,
        },
      };
    }),
  setBodyType: (bodyType) => set((s) => ({ request: { ...s.request, body_type: bodyType } })),
  setBody: (body) => set((s) => ({ request: { ...s.request, body } })),
  setFormFields: (formFields) => set((s) => ({ request: { ...s.request, form_fields: formFields } })),
  setAuth: (auth) => set((s) => ({ request: { ...s.request, auth } })),
  setName: (name) => set((s) => ({ request: { ...s.request, name } })),
  setSettings: (settings) => set((s) => ({ request: { ...s.request, settings } })),
  setPreScript: (script) => set((s) => ({ request: { ...s.request, pre_script: script } })),
  setPostScript: (script) => set((s) => ({ request: { ...s.request, post_script: script } })),
  setJsonSchema: (json_schema) => set((s) => ({ request: { ...s.request, json_schema } })),
  setRequest: (request) => {
    let synced = { ...request };
    if (synced.query_params && synced.query_params.length > 0) {
      synced.url = buildUrlWithQueryParams(synced.url || "", synced.query_params);
    } else if (synced.url) {
      synced.query_params = parseQueryParamsFromUrl(synced.url);
    }
    set({ request: synced, response: null, error: null });
  },

  send: async (environmentId?: string | null) => {
    const { request, response: currentResponse } = get();
    set({ loading: true, error: null, response: null, benchmarkResult: null });
    try {
      const response = await sendRequest(
        { ...request, id: generateId() },
        environmentId
      );
      // Save previous response as lastResponse before overwriting
      set({ lastResponse: currentResponse, response, loading: false });

      // Toast notification when variables are extracted
      const vars = response.modified_variables;
      if (vars && vars.length > 0) {
        const names = vars.map((v) => v.key);
        const display =
          names.length <= 3
            ? names.join(", ")
            : names.slice(0, 3).join(", ") + ` +${names.length - 3} more`;
        useToastStore.getState().addToast(
          `${vars.length} variable${vars.length > 1 ? "s" : ""} extracted: ${display}`,
          "success"
        );
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : e?.toString() ?? "Request failed";
      set({ error: errMsg, loading: false });
    }
  },

  cancel: async () => {
    const { request } = get();
    try {
      await cancelRequest(request.id);
      set({ loading: false });
    } catch {
      set({ loading: false });
    }
  },

  runBenchmark: async (count: number, environmentId?: string | null) => {
    const { request } = get();
    set({ benchmarkLoading: true, error: null, benchmarkResult: null });
    try {
      const result = await benchmarkRequest(
        { ...request, id: generateId() },
        count,
        environmentId
      );
      set({ benchmarkResult: result, benchmarkLoading: false });
      // Refresh history list
      get().loadBenchmarkHistory();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : e?.toString() ?? "Benchmark failed";
      set({ error: errMsg, benchmarkLoading: false });
    }
  },

  loadBenchmarkHistory: async (limit?: number, offset?: number) => {
    set({ benchmarkHistoryLoading: true });
    try {
      const entries = await getBenchmarkHistory(limit, offset);
      set({ benchmarkHistory: entries, benchmarkHistoryLoading: false });
    } catch {
      set({ benchmarkHistoryLoading: false });
    }
  },

  deleteBenchmarkHistoryItem: async (id: string) => {
    await deleteBenchmarkHistory(id);
    set((s) => ({ benchmarkHistory: s.benchmarkHistory.filter((e) => e.id !== id) }));
  },

  loadHistoricBenchmark: (entry: BenchmarkHistoryEntry) => {
    set({ benchmarkResult: entry.result, error: null });
  },

  reset: () => set({
    request: createDefaultRequest(),
    response: null,
    lastResponse: null,
    benchmarkResult: null,
    benchmarkLoading: false,
    benchmarkHistory: [],
    error: null,
    loading: false,
  }),
}));
