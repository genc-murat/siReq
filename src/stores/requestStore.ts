import { create } from "zustand";
import type { HttpMethod, BodyType, KeyValue, AuthConfig, HttpRequest, HttpResponse } from "@/lib/invoke";
import { sendRequest, cancelRequest } from "@/lib/invoke";

function generateId(): string {
  return crypto.randomUUID();
}

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
  loading: boolean;
  error: string | null;
  setMethod: (method: HttpMethod) => void;
  setUrl: (url: string) => void;
  setHeaders: (headers: KeyValue[]) => void;
  setQueryParams: (params: KeyValue[]) => void;
  setBodyType: (bodyType: BodyType) => void;
  setBody: (body: string) => void;
  setAuth: (auth: AuthConfig) => void;
  setRequest: (request: HttpRequest) => void;
  send: (timeout?: number, environmentId?: string | null) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
}

const createDefaultRequest = (): HttpRequest => ({
  id: generateId(),
  method: "GET",
  url: "",
  headers: [],
  query_params: [],
  body_type: "none",
  body: "",
  auth: { ...defaultAuth },
});

export const useRequestStore = create<RequestState>((set, get) => ({
  request: createDefaultRequest(),
  response: null,
  loading: false,
  error: null,

  setMethod: (method) => set((s) => ({ request: { ...s.request, method } })),
  setUrl: (url) => set((s) => ({ request: { ...s.request, url } })),
  setHeaders: (headers) => set((s) => ({ request: { ...s.request, headers } })),
  setQueryParams: (params) => set((s) => ({ request: { ...s.request, query_params: params } })),
  setBodyType: (bodyType) => set((s) => ({ request: { ...s.request, body_type: bodyType } })),
  setBody: (body) => set((s) => ({ request: { ...s.request, body } })),
  setAuth: (auth) => set((s) => ({ request: { ...s.request, auth } })),
  setRequest: (request) => set({ request, response: null, error: null }),

  send: async (timeout?: number, environmentId?: string | null) => {
    const { request } = get();
    set({ loading: true, error: null, response: null });
    try {
      const response = await sendRequest({ ...request, id: generateId() }, timeout, environmentId);
      set({ response, loading: false });
    } catch (e: any) {
      set({ error: e?.toString() ?? "Request failed", loading: false });
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

  reset: () => set({ request: createDefaultRequest(), response: null, error: null, loading: false }),
}));
