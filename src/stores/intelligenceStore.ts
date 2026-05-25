import { create } from "zustand";
import type {
  ApiIntelligenceOverview,
  EndpointInsight,
  EndpointDetail,
  PerformanceRegression,
} from "@/lib/invoke";
import {
  analyzeApiBehavior,
  getApiIntelligenceOverview,
  getAllEndpointInsights,
  getEndpointDetail,
  getPerformanceRegressions,
} from "@/lib/invoke";

interface IntelligenceState {
  overview: ApiIntelligenceOverview | null;
  endpoints: EndpointInsight[];
  selectedEndpoint: EndpointDetail | null;
  regressions: PerformanceRegression[];
  loading: boolean;
  analyzing: boolean;
  error: string | null;

  // Actions
  analyze: () => Promise<void>;
  loadOverview: () => Promise<void>;
  loadEndpoints: () => Promise<void>;
  selectEndpoint: (key: string) => Promise<void>;
  clearSelection: () => void;
}

export const useIntelligenceStore = create<IntelligenceState>((set, get) => ({
  overview: null,
  endpoints: [],
  selectedEndpoint: null,
  regressions: [],
  loading: false,
  analyzing: false,
  error: null,

  analyze: async () => {
    set({ analyzing: true, error: null });
    try {
      const overview = await analyzeApiBehavior();
      set({ overview, analyzing: false });
      // Also load endpoints and regressions in background
      get().loadEndpoints();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : e?.toString() ?? "Analysis failed";
      set({ error: errMsg, analyzing: false });
    }
  },

  loadOverview: async () => {
    set({ loading: true, error: null });
    try {
      const overview = await getApiIntelligenceOverview();
      set({ overview, loading: false });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : e?.toString() ?? "Failed to load overview";
      set({ error: errMsg, loading: false });
    }
  },

  loadEndpoints: async () => {
    try {
      const [endpoints, regressions] = await Promise.all([
        getAllEndpointInsights(),
        getPerformanceRegressions(),
      ]);
      set({ endpoints, regressions });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : e?.toString() ?? "Failed to load endpoints";
      set({ error: errMsg });
    }
  },

  selectEndpoint: async (key: string) => {
    set({ loading: true });
    try {
      const detail = await getEndpointDetail(key);
      set({ selectedEndpoint: detail, loading: false });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : e?.toString() ?? "Failed to load endpoint detail";
      set({ error: errMsg, loading: false });
    }
  },

  clearSelection: () => set({ selectedEndpoint: null }),
}));
