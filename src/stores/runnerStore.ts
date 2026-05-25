import { create } from "zustand";
import type { CollectionRunResult, RunRequestResult } from "@/lib/invoke";
import { runCollection, getRunHistory, deleteRunHistory, clearRunHistory } from "@/lib/invoke";

interface RunnerState {
  isRunning: boolean;
  currentIndex: number;
  totalRequests: number;
  results: RunRequestResult[];
  collectionName: string;
  collectionId: string | null;
  completed: boolean;
  runResult: CollectionRunResult | null;
  runHistory: CollectionRunResult[];
  runHistoryLoading: boolean;
  delayMs: number;
  stopOnFailure: boolean;

  setDelayMs: (ms: number) => void;
  setStopOnFailure: (stop: boolean) => void;
  startRun: (collectionId: string, collectionName: string, environmentId?: string | null) => Promise<void>;
  loadRunHistory: () => Promise<void>;
  deleteRunHistoryItem: (id: string) => Promise<void>;
  clearAllRunHistory: () => Promise<void>;
  reset: () => void;
  resetRunState: () => void;
}

export const useRunnerStore = create<RunnerState>((set, get) => ({
  isRunning: false,
  currentIndex: 0,
  totalRequests: 0,
  results: [],
  collectionName: "",
  collectionId: null,
  completed: false,
  runResult: null,
  runHistory: [],
  runHistoryLoading: false,
  delayMs: 0,
  stopOnFailure: false,

  setDelayMs: (delayMs) => set({ delayMs }),
  setStopOnFailure: (stopOnFailure) => set({ stopOnFailure }),

  startRun: async (collectionId, collectionName, environmentId) => {
    const { delayMs, stopOnFailure } = get();
    set({
      isRunning: true,
      currentIndex: 0,
      totalRequests: 0,
      results: [],
      collectionName,
      collectionId,
      completed: false,
      runResult: null,
    });

    try {
      const result = await runCollection(collectionId, environmentId, delayMs, stopOnFailure);
      set({
        isRunning: false,
        completed: true,
        runResult: result,
        results: result.results,
        totalRequests: result.total,
        currentIndex: result.total,
      });
      // Refresh history list
      get().loadRunHistory();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : e?.toString() ?? "Run failed";
      set({
        isRunning: false,
        completed: true,
        runResult: {
          id: "error",
          collection_id: collectionId,
          collection_name: collectionName,
          environment_id: environmentId ?? null,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          delay_ms: delayMs,
          stop_on_failure: stopOnFailure,
          results: [{
            request_name: "Error",
            request_method: "",
            request_url: "",
            status_code: 0,
            status_text: "",
            time_ms: 0,
            size: 0,
            test_results: [],
            script_logs: [{ level: "error", message: errMsg }],
            error: errMsg,
          }],
          total: 1,
          passed: 0,
          failed: 1,
          total_time_ms: 0,
        },
        results: [],
        totalRequests: 1,
        currentIndex: 1,
      });
    }
  },

  loadRunHistory: async () => {
    set({ runHistoryLoading: true });
    try {
      const entries = await getRunHistory();
      set({ runHistory: entries, runHistoryLoading: false });
    } catch {
      set({ runHistoryLoading: false });
    }
  },

  deleteRunHistoryItem: async (id: string) => {
    await deleteRunHistory(id);
    set((s) => ({ runHistory: s.runHistory.filter((e) => e.id !== id) }));
  },

  clearAllRunHistory: async () => {
    await clearRunHistory();
    set({ runHistory: [] });
  },

  reset: () => set({
    isRunning: false,
    currentIndex: 0,
    totalRequests: 0,
    results: [],
    collectionName: "",
    collectionId: null,
    completed: false,
    runResult: null,
    runHistory: [],
    runHistoryLoading: false,
  }),

  resetRunState: () => set({
    isRunning: false,
    currentIndex: 0,
    totalRequests: 0,
    results: [],
    collectionName: "",
    collectionId: null,
    completed: false,
    runResult: null,
  }),
}));
