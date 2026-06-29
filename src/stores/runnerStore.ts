import { create } from "zustand";
import type { CollectionRunResult, RunRequestResult, RunDataset, RunMode } from "@/lib/invoke";
import { runCollection, runCollectionDataDriven, runTestSuite, getRunHistory, deleteRunHistory, clearRunHistory } from "@/lib/invoke";
import { useFlowStore } from "./flowStore";

interface RunnerState {
  mode: "collection" | "flow";
  isRunning: boolean;
  currentIndex: number;
  totalRequests: number;
  results: RunRequestResult[];
  collectionName: string;
  collectionId: string | null;
  flowName: string;
  completed: boolean;
  runResult: CollectionRunResult | null;
  runHistory: CollectionRunResult[];
  runHistoryLoading: boolean;
  delayMs: number;
  stopOnFailure: boolean;

  // Data-driven state
  dataDrivenMode: boolean;
  dataset: RunDataset | null;
  datasetFileName: string;

  // Test suite state
  runMode: RunMode;
  selectedTags: string[];

  setDelayMs: (ms: number) => void;
  setStopOnFailure: (stop: boolean) => void;
  setDataDrivenMode: (enabled: boolean) => void;
  setDataset: (dataset: RunDataset | null, fileName: string) => void;
  setRunMode: (mode: RunMode) => void;
  setSelectedTags: (tags: string[]) => void;
  startRun: (collectionId: string, collectionName: string, environmentId?: string | null) => Promise<void>;
  startTestSuite: (collectionId: string, collectionName: string, environmentId?: string | null) => Promise<void>;
  runFlow: (flowName: string, environmentId?: string | null) => Promise<void>;
  setMode: (mode: "collection" | "flow", flowName?: string) => void;
  loadRunHistory: () => Promise<void>;
  deleteRunHistoryItem: (id: string) => Promise<void>;
  clearAllRunHistory: () => Promise<void>;
  reset: () => void;
  resetRunState: () => void;
}

export const useRunnerStore = create<RunnerState>((set, get) => ({
  mode: "collection",
  isRunning: false,
  currentIndex: 0,
  totalRequests: 0,
  results: [],
  collectionName: "",
  collectionId: null,
  flowName: "",
  completed: false,
  runResult: null,
  runHistory: [],
  runHistoryLoading: false,
  delayMs: 0,
  stopOnFailure: false,
  dataDrivenMode: false,
  dataset: null,
  datasetFileName: "",
  runMode: "functional",
  selectedTags: [],

  setDelayMs: (delayMs) => set({ delayMs }),
  setStopOnFailure: (stopOnFailure) => set({ stopOnFailure }),
  setDataDrivenMode: (dataDrivenMode) => set({ dataDrivenMode }),
  setDataset: (dataset, fileName) => set({ dataset, datasetFileName: fileName }),
  setRunMode: (runMode) => set({ runMode, selectedTags: runMode === "functional" ? [] : get().selectedTags }),
  setSelectedTags: (selectedTags) => set({ selectedTags }),

  setMode: (mode, flowName) => set({ mode, flowName: flowName ?? "" }),

  startRun: async (collectionId, collectionName, environmentId) => {
    const { delayMs, stopOnFailure, dataDrivenMode, dataset } = get();
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
      let result: CollectionRunResult;
      if (dataDrivenMode && dataset && dataset.rows.length > 0) {
        result = await runCollectionDataDriven(
          collectionId,
          environmentId ?? null,
          delayMs,
          stopOnFailure,
          dataset
        );
      } else {
        result = await runCollection(collectionId, environmentId ?? null, delayMs, stopOnFailure);
      }
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
            extracted_variables: [],
            iteration: null,
          }],
          total: 1,
          passed: 0,
          failed: 1,
          total_time_ms: 0,
          extracted_variables: [],
        },
        results: [],
        totalRequests: 1,
        currentIndex: 1,
      });
      get().loadRunHistory();
    }
  },

  startTestSuite: async (collectionId, collectionName, environmentId) => {
    const { runMode, delayMs, stopOnFailure, selectedTags } = get();
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
      const result = await runTestSuite(collectionId, runMode, environmentId ?? null, {
        tags: selectedTags,
        delay_ms: delayMs,
        stop_on_failure: stopOnFailure,
      });
      set({
        isRunning: false,
        completed: true,
        runResult: result,
        results: result.results,
        totalRequests: result.total,
        currentIndex: result.total,
      });
      get().loadRunHistory();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : e?.toString() ?? "Test suite run failed";
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
            extracted_variables: [],
            iteration: null,
          }],
          total: 1,
          passed: 0,
          failed: 1,
          total_time_ms: 0,
          extracted_variables: [],
        },
        results: [],
        totalRequests: 1,
        currentIndex: 1,
      });
      get().loadRunHistory();
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
    flowName: "",
    mode: "collection",
    completed: false,
    runResult: null,
    runHistory: [],
    runHistoryLoading: false,
    runMode: "functional",
    selectedTags: [],
  }),

  runFlow: async (flowName, environmentId) => {
    const { delayMs, stopOnFailure, dataDrivenMode, dataset } = get();
    const flowState = useFlowStore.getState();

    set({
      isRunning: true,
      currentIndex: 0,
      totalRequests: 0,
      results: [],
      completed: false,
      runResult: null,
    });

    try {
      const iterations = dataDrivenMode && dataset && dataset.rows.length > 0 ? dataset.rows.length : 1;
      const allResults: RunRequestResult[] = [];
      let totalPassed = 0;
      let totalFailed = 0;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        if (!get().isRunning) break;

        // For each iteration, set dataset row values as flow variables
        if (dataDrivenMode && dataset && dataset.rows[i]) {
          flowState.clearVariables();
          flowState.clearLogs();
          const row = dataset.rows[i];
          for (const [key, val] of Object.entries(row.values)) {
            flowState.updateVariable(key, val);
          }
        }

        flowState.resetExecution();

        // Run the flow and wait for completion
        const iterationStart = Date.now();
        await flowState.runFlow(environmentId);
        const duration = Date.now() - iterationStart;

        // Capture results from flowStore
        const snapshot = useFlowStore.getState();
        const failedNodes = snapshot.nodes.filter((n) => n.status === "failure").length;
        const errorNodes = snapshot.nodes.filter((n) => n.error);

        allResults.push({
          request_name: flowName,
          request_method: "FLOW",
          request_url: `Iteration ${i + 1}/${iterations}`,
          status_code: failedNodes === 0 ? 200 : 500,
          status_text: failedNodes === 0 ? "OK" : "FAILED",
          time_ms: duration,
          size: 0,
          test_results: [],
          script_logs: snapshot.logs.map((l) => ({ level: l.level, message: l.message })),
          error: errorNodes.length > 0 ? `${errorNodes.length} node(s) failed` : null,
          extracted_variables: Object.entries(snapshot.variables).map(([k, v]) => [k, v]),
          iteration: iterations > 1 ? i : null,
        });

        if (failedNodes > 0 || errorNodes.length > 0) totalFailed++;
        else totalPassed++;
        totalTime += duration;

        // Update progress
        set({
          currentIndex: i + 1,
          totalRequests: iterations,
          results: allResults,
        });

        // Delay between iterations
        if (i < iterations - 1 && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        // Stop on failure
        if (stopOnFailure && (failedNodes > 0 || errorNodes.length > 0)) break;
      }

      const result: CollectionRunResult = {
        id: crypto.randomUUID(),
        collection_id: "flow-runner",
        collection_name: flowName,
        environment_id: environmentId ?? null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        delay_ms: delayMs,
        stop_on_failure: stopOnFailure,
        results: allResults,
        total: allResults.length,
        passed: totalPassed,
        failed: totalFailed,
        total_time_ms: totalTime,
        extracted_variables: allResults.flatMap((r) => r.extracted_variables ?? []),
      };

      set({
        isRunning: false,
        completed: true,
        runResult: result,
      });

      get().loadRunHistory();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : e?.toString() ?? "Flow run failed";
      set({
        isRunning: false,
        completed: true,
        runResult: {
          id: "error",
          collection_id: "flow-runner",
          collection_name: flowName,
          environment_id: environmentId ?? null,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          delay_ms: delayMs,
          stop_on_failure: stopOnFailure,
          results: [{
            request_name: "Flow Error",
            request_method: "FLOW",
            request_url: "",
            status_code: 0,
            status_text: "",
            time_ms: 0,
            size: 0,
            test_results: [],
            script_logs: [{ level: "error", message: errMsg }],
            error: errMsg,
            extracted_variables: [],
            iteration: null,
          }],
          total: 1,
          passed: 0,
          failed: 1,
          total_time_ms: 0,
          extracted_variables: [],
        },
        results: [],
        totalRequests: 1,
        currentIndex: 1,
      });
    }
  },

  resetRunState: () => set({
    isRunning: false,
    currentIndex: 0,
    totalRequests: 0,
    results: [],
    collectionName: "",
    collectionId: null,
    flowName: "",
    mode: "collection",
    completed: false,
    runResult: null,
    runMode: "functional",
    selectedTags: [],
  }),
}));
