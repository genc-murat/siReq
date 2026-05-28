import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useRunnerStore } from "./runnerStore";
import type { RunDataset } from "@/lib/invoke";

// ── Hoisted mutable mock state ─────────────────────────────────────────────
// vi.hoisted runs before vi.mock factories, so the mock factory can capture
// these references by closure. We mutate mockFlowState in beforeEach/test.

const { mockFlowState, mockFns, mockInvoke } = vi.hoisted(() => {
  const runFlow = vi.fn();
  const clearVariables = vi.fn();
  const clearLogs = vi.fn();
  const resetExecution = vi.fn();
  const updateVariable = vi.fn();
  const runCollection = vi.fn();
  const runCollectionDataDriven = vi.fn();
  const getRunHistory = vi.fn().mockResolvedValue([]);

  return {
    mockFlowState: {
      runFlow,
      clearVariables,
      clearLogs,
      resetExecution,
      updateVariable,
      nodes: [] as Array<{ id: string; type: string; name: string; status: string; error?: string | null }>,
      logs: [] as Array<{ id: string; timestamp: string; level: string; message: string }>,
      variables: {} as Record<string, string>,
    },
    mockFns: { runFlow, clearVariables, clearLogs, resetExecution, updateVariable },
    mockInvoke: { runCollection, runCollectionDataDriven, getRunHistory },
  };
});

vi.mock("./flowStore", () => ({
  useFlowStore: { getState: vi.fn(() => mockFlowState) },
}));

vi.mock("@/lib/invoke", () => ({
  runCollection: mockInvoke.runCollection,
  runCollectionDataDriven: mockInvoke.runCollectionDataDriven,
  getRunHistory: mockInvoke.getRunHistory,
  deleteRunHistory: vi.fn(),
  clearRunHistory: vi.fn(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function resetRunnerStore() {
  useRunnerStore.setState({
    mode: "collection" as const,
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
  });
}

function resetMockState() {
  // Reset all mock functions
  for (const fn of Object.values(mockFns)) {
    fn.mockReset();
  }
  for (const fn of Object.values(mockInvoke)) {
    fn.mockReset();
  }

  // Restore default implementations
  mockFns.runFlow.mockResolvedValue(undefined);
  mockFns.clearVariables.mockReturnValue(undefined);
  mockFns.clearLogs.mockReturnValue(undefined);
  mockFns.resetExecution.mockReturnValue(undefined);
  mockFns.updateVariable.mockReturnValue(undefined);
  mockInvoke.getRunHistory.mockResolvedValue([]);

  // Reset tracked state
  mockFlowState.nodes = [];
  mockFlowState.logs = [];
  mockFlowState.variables = {};
}

/** Configure mock so that flowStore.runFlow sets nodes/logs/vars on completion. */
function mockFlowRunWith(opts: {
  nodes?: Array<{ id: string; type: string; name: string; status: string; error?: string | null }>;
  logs?: Array<{ id: string; timestamp: string; level: string; message: string }>;
  variables?: Record<string, string>;
}) {
  mockFns.runFlow.mockImplementation(async () => {
    mockFlowState.nodes = opts.nodes ?? [];
    mockFlowState.logs = opts.logs ?? [];
    mockFlowState.variables = opts.variables ?? {};
  });
}

/** A successful single-iteration flow with 2 nodes. */
function successFlowResult() {
  mockFlowRunWith({
    nodes: [
      { id: "n1", type: "start", name: "Start", status: "success" },
      { id: "n2", type: "logger", name: "Logger", status: "success" },
    ],
    logs: [{ id: "l1", timestamp: "10:00:00", level: "info", message: "Flow completed" }],
    variables: { output: "hello" },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("runnerStore — runFlow", () => {
  beforeEach(() => {
    resetRunnerStore();
    resetMockState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Single run (no dataset) ────────────────────────────────────────────

  describe("single flow run", () => {
    it("runs a single flow and captures results", async () => {
      successFlowResult();

      await useRunnerStore.getState().runFlow("My Flow");

      const s = useRunnerStore.getState();
      expect(s.isRunning).toBe(false);
      expect(s.completed).toBe(true);
      expect(s.results).toHaveLength(1);
      expect(mockFns.runFlow).toHaveBeenCalledTimes(1);

      const r = s.results[0];
      expect(r.request_name).toBe("My Flow");
      expect(r.request_method).toBe("FLOW");
      expect(r.request_url).toBe("Iteration 1/1");
      expect(r.status_code).toBe(200);
      expect(r.status_text).toBe("OK");
      expect(r.script_logs).toHaveLength(1);
      expect(r.extracted_variables).toEqual([["output", "hello"]]);
      expect(r.iteration).toBeNull(); // single iteration — no iteration number
      expect(r.error).toBeNull();
    });

    it("passes environmentId to flowStore.runFlow", async () => {
      successFlowResult();

      await useRunnerStore.getState().runFlow("Env Flow", "env-prod-1");

      expect(mockFns.runFlow).toHaveBeenCalledWith("env-prod-1");
    });

    it("captures passed/failed counts in runResult", async () => {
      successFlowResult();

      await useRunnerStore.getState().runFlow("Pass Flow");

      const rr = useRunnerStore.getState().runResult;
      expect(rr).not.toBeNull();
      expect(rr!.total).toBe(1);
      expect(rr!.passed).toBe(1);
      expect(rr!.failed).toBe(0);
      expect(rr!.collection_id).toBe("flow-runner");
      expect(rr!.collection_name).toBe("Pass Flow");
      expect(rr!.id).toBeTruthy();
    });

    it("reports 500 when node(s) fail", async () => {
      mockFlowRunWith({
        nodes: [
          { id: "n1", type: "start", name: "Start", status: "success" },
          { id: "n2", type: "assertion", name: "Assert", status: "failure", error: "Expected 200" },
        ],
        logs: [{ id: "l1", timestamp: "10:00", level: "error", message: "Assertion failed" }],
        variables: {},
      });

      await useRunnerStore.getState().runFlow("Fail Flow");

      const s = useRunnerStore.getState();
      expect(s.results).toHaveLength(1);
      expect(s.results[0].status_code).toBe(500);
      expect(s.results[0].status_text).toBe("FAILED");
      expect(s.results[0].error).toBe("1 node(s) failed");
      expect(s.runResult?.passed).toBe(0);
      expect(s.runResult?.failed).toBe(1);
    });

    it("counts multiple failed nodes in error message", async () => {
      mockFlowRunWith({
        nodes: [
          { id: "n1", type: "start", name: "Start", status: "success" },
          { id: "n2", type: "assertion", name: "A1", status: "failure", error: "Failed" },
          { id: "n3", type: "condition", name: "C1", status: "failure", error: "Error" },
        ],
        logs: [],
        variables: {},
      });

      await useRunnerStore.getState().runFlow("Multi Fail");

      expect(useRunnerStore.getState().results[0].error).toBe("2 node(s) failed");
    });
  });

  // ── Data-driven execution ──────────────────────────────────────────────

  describe("data-driven flow execution", () => {
    const dataset: RunDataset = {
      columns: [
        { name: "user", type: "string" },
        { name: "score", type: "string" },
      ],
      rows: [
        { values: { user: "alice", score: "100" } },
        { values: { user: "bob", score: "200" } },
        { values: { user: "charlie", score: "300" } },
      ],
    };

    it("runs one iteration per dataset row", async () => {
      useRunnerStore.setState({ dataDrivenMode: true, dataset });
      successFlowResult();

      await useRunnerStore.getState().runFlow("Data Flow");

      expect(mockFns.runFlow).toHaveBeenCalledTimes(3);
      const s = useRunnerStore.getState();
      expect(s.results).toHaveLength(3);
      expect(s.runResult?.total).toBe(3);
      expect(s.runResult?.passed).toBe(3);
    });

    it("assigns iteration numbers in results", async () => {
      useRunnerStore.setState({ dataDrivenMode: true, dataset });
      successFlowResult();

      await useRunnerStore.getState().runFlow("Iter Flow");

      const results = useRunnerStore.getState().results;
      expect(results[0].iteration).toBe(0);
      expect(results[1].iteration).toBe(1);
      expect(results[2].iteration).toBe(2);
      expect(results[0].request_url).toBe("Iteration 1/3");
      expect(results[2].request_url).toBe("Iteration 3/3");
    });

    it("updates progress (currentIndex) during each iteration", async () => {
      useRunnerStore.setState({ dataDrivenMode: true, dataset });
      successFlowResult();

      // Track intermediate state by spying on runFlow calls
      const progressSnapshots: number[] = [];
      mockFns.runFlow.mockImplementation(async () => {
        progressSnapshots.push(useRunnerStore.getState().currentIndex);
        mockFlowState.nodes = [
          { id: "n1", type: "start", name: "Start", status: "success" },
          { id: "n2", type: "logger", name: "Logger", status: "success" },
        ];
        mockFlowState.logs = [];
        mockFlowState.variables = {};
      });

      await useRunnerStore.getState().runFlow("Progress");

      // After each iteration, currentIndex should reflect progress
      // Before any iteration: currentIndex = 0 (set at start)
      // After iteration 0: currentIndex = 1
      // After iteration 1: currentIndex = 2
      // After iteration 2: currentIndex = 3
      expect(progressSnapshots).toEqual([0, 1, 2]);
      expect(useRunnerStore.getState().currentIndex).toBe(3);
      expect(useRunnerStore.getState().totalRequests).toBe(3);
    });
  });

  // ── Dataset row variable binding ────────────────────────────────────────

  describe("dataset row variable binding", () => {
    it("clears variables and logs, then binds each row before execution", async () => {
      useRunnerStore.setState({
        dataDrivenMode: true,
        dataset: {
          columns: [
            { name: "key1", type: "string" },
            { name: "key2", type: "string" },
          ],
          rows: [
            { values: { key1: "a", key2: "b" } },
            { values: { key1: "c", key2: "d" } },
          ],
        },
      });
      successFlowResult();

      await useRunnerStore.getState().runFlow("Bind Flow");

      // clearVariables + clearLogs called per iteration
      expect(mockFns.clearVariables).toHaveBeenCalledTimes(2);
      expect(mockFns.clearLogs).toHaveBeenCalledTimes(2);

      // updateVariable: 2 rows × 2 keys = 4 calls
      expect(mockFns.updateVariable).toHaveBeenCalledTimes(4);
      expect(mockFns.updateVariable).toHaveBeenNthCalledWith(1, "key1", "a");
      expect(mockFns.updateVariable).toHaveBeenNthCalledWith(2, "key2", "b");
      expect(mockFns.updateVariable).toHaveBeenNthCalledWith(3, "key1", "c");
      expect(mockFns.updateVariable).toHaveBeenNthCalledWith(4, "key2", "d");
    });

    it("calls resetExecution before each flow run", async () => {
      useRunnerStore.setState({
        dataDrivenMode: true,
        dataset: {
          columns: [{ name: "x", type: "string" }],
          rows: [{ values: { x: "1" } }, { values: { x: "2" } }],
        },
      });
      successFlowResult();

      await useRunnerStore.getState().runFlow("Reset Flow");

      expect(mockFns.resetExecution).toHaveBeenCalledTimes(2);
    });

    it("works with single-row dataset", async () => {
      useRunnerStore.setState({
        dataDrivenMode: true,
        dataset: {
          columns: [{ name: "id", type: "string" }],
          rows: [{ values: { id: "42" } }],
        },
      });
      successFlowResult();

      await useRunnerStore.getState().runFlow("Single Row");

      expect(mockFns.runFlow).toHaveBeenCalledTimes(1);
      expect(mockFns.updateVariable).toHaveBeenCalledWith("id", "42");
      // Single iteration — iteration is null (same as non-data-driven single run)
      expect(useRunnerStore.getState().results[0].iteration).toBeNull();
    });
  });

  // ── Stop on failure ────────────────────────────────────────────────────

  describe("stop on failure", () => {
    beforeEach(() => {
      useRunnerStore.setState({
        dataDrivenMode: true,
        stopOnFailure: true,
        dataset: {
          columns: [{ name: "x", type: "string" }],
          rows: [{ values: { x: "1" } }, { values: { x: "2" } }, { values: { x: "3" } }],
        },
      });
    });

    it("stops after first failing iteration", async () => {
      let iteration = 0;
      mockFns.runFlow.mockImplementation(async () => {
        iteration++;
        if (iteration === 2) {
          // Second iteration fails
          mockFlowState.nodes = [
            { id: "n1", type: "start", name: "Start", status: "success" },
            { id: "n2", type: "assertion", name: "Assert", status: "failure", error: "Failed" },
          ];
        } else {
          mockFlowState.nodes = [
            { id: "n1", type: "start", name: "Start", status: "success" },
          ];
        }
        mockFlowState.logs = [];
        mockFlowState.variables = {};
      });

      await useRunnerStore.getState().runFlow("Stop Flow");

      expect(mockFns.runFlow).toHaveBeenCalledTimes(2);
      const s = useRunnerStore.getState();
      expect(s.results).toHaveLength(2);
      expect(s.runResult?.passed).toBe(1);
      expect(s.runResult?.failed).toBe(1);
    });

    it("does NOT stop when stopOnFailure is false even with failures", async () => {
      useRunnerStore.setState({ stopOnFailure: false });

      let iteration = 0;
      mockFns.runFlow.mockImplementation(async () => {
        iteration++;
        // Second iteration fails, but stopOnFailure is false
        if (iteration === 2) {
          mockFlowState.nodes = [
            { id: "n1", type: "start", name: "Start", status: "success" },
            { id: "n2", type: "assertion", name: "Assert", status: "failure", error: "Failed" },
          ];
        } else {
          mockFlowState.nodes = [
            { id: "n1", type: "start", name: "Start", status: "success" },
          ];
        }
        mockFlowState.logs = [];
        mockFlowState.variables = {};
      });

      await useRunnerStore.getState().runFlow("Continue Flow");

      // All 3 iterations should still run
      expect(mockFns.runFlow).toHaveBeenCalledTimes(3);
      expect(useRunnerStore.getState().results).toHaveLength(3);
    });

    it("runs all iterations when none fail (stopOnFailure = true)", async () => {
      mockFns.runFlow.mockImplementation(async () => {
        mockFlowState.nodes = [
          { id: "n1", type: "start", name: "Start", status: "success" },
        ];
        mockFlowState.logs = [];
        mockFlowState.variables = {};
      });

      await useRunnerStore.getState().runFlow("All Pass");

      expect(mockFns.runFlow).toHaveBeenCalledTimes(3);
      expect(useRunnerStore.getState().runResult?.passed).toBe(3);
    });
  });

  // ── Iteration delay ────────────────────────────────────────────────────

  describe("iteration delay", () => {
    it("waits for delayMs between iterations when delayMs > 0", async () => {
      vi.useFakeTimers();

      useRunnerStore.setState({
        dataDrivenMode: true,
        delayMs: 500,
        dataset: {
          columns: [{ name: "x", type: "string" }],
          rows: [{ values: { x: "1" } }, { values: { x: "2" } }],
        },
      });

      mockFns.runFlow.mockImplementation(async () => {
        mockFlowState.nodes = [
          { id: "n1", type: "start", name: "Start", status: "success" },
        ];
        mockFlowState.logs = [];
        mockFlowState.variables = {};
      });

      const promise = useRunnerStore.getState().runFlow("Delay Flow");

      // First iteration completes immediately (runFlow resolves instantly)
      await vi.advanceTimersByTimeAsync(10);
      expect(mockFns.runFlow).toHaveBeenCalledTimes(1);

      // Now runner is in the delay between iterations
      // Ensure no second call yet
      expect(mockFns.runFlow).toHaveBeenCalledTimes(1);

      // Advance past the delay — second iteration should fire
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(10);

      expect(mockFns.runFlow).toHaveBeenCalledTimes(2);

      await promise;

      const s = useRunnerStore.getState();
      expect(s.results).toHaveLength(2);
      expect(s.completed).toBe(true);

      vi.useRealTimers();
    });

    it("does NOT delay when delayMs is 0", async () => {
      useRunnerStore.setState({
        dataDrivenMode: true,
        delayMs: 0,
        dataset: {
          columns: [{ name: "x", type: "string" }],
          rows: [{ values: { x: "1" } }, { values: { x: "2" } }, { values: { x: "3" } }],
        },
      });

      const callOrder: number[] = [];
      mockFns.runFlow.mockImplementation(async () => {
        callOrder.push(Date.now());
        mockFlowState.nodes = [
          { id: "n1", type: "start", name: "Start", status: "success" },
        ];
        mockFlowState.logs = [];
        mockFlowState.variables = {};
      });

      await useRunnerStore.getState().runFlow("No Delay");
      expect(mockFns.runFlow).toHaveBeenCalledTimes(3);
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────

  describe("error handling", () => {
    it("catches Error thrown by flowStore.runFlow and sets error result", async () => {
      mockFns.runFlow.mockRejectedValue(new Error("Network timeout"));

      await useRunnerStore.getState().runFlow("Error Flow");

      const s = useRunnerStore.getState();
      expect(s.isRunning).toBe(false);
      expect(s.completed).toBe(true);
      expect(s.results).toHaveLength(0);
      expect(s.runResult?.passed).toBe(0);
      expect(s.runResult?.failed).toBe(1);
      expect(s.runResult?.results[0].error).toBe("Network timeout");
      expect(s.runResult?.results[0].script_logs[0].message).toBe("Network timeout");
    });

    it("handles non-Error thrown values (string)", async () => {
      mockFns.runFlow.mockRejectedValue("string error message");

      await useRunnerStore.getState().runFlow("String Error");

      const rr = useRunnerStore.getState().runResult;
      expect(rr?.results[0].error).toBe("string error message");
      expect(rr?.passed).toBe(0);
      expect(rr?.failed).toBe(1);
      expect(rr?.results).toHaveLength(1);
    });

    it("handles null thrown value (falls back to default)", async () => {
      mockFns.runFlow.mockRejectedValue(null);

      await useRunnerStore.getState().runFlow("Null Error");

      // null -> null?.toString() -> undefined -> "Flow run failed"
      expect(useRunnerStore.getState().runResult?.results[0].error).toBe("Flow run failed");
    });

    it("handles undefined thrown value (falls back to default)", async () => {
      mockFns.runFlow.mockRejectedValue(undefined);

      await useRunnerStore.getState().runFlow("Undefined Error");

      expect(useRunnerStore.getState().runResult?.results[0].error).toBe("Flow run failed");
    });

    it("preserves delayMs and stopOnFailure in error result metadata", async () => {
      useRunnerStore.setState({ delayMs: 200, stopOnFailure: true });
      mockFns.runFlow.mockRejectedValue(new Error("Fail"));

      await useRunnerStore.getState().runFlow("Meta Error");

      const rr = useRunnerStore.getState().runResult;
      expect(rr?.delay_ms).toBe(200);
      expect(rr?.stop_on_failure).toBe(true);
    });
  });

  // ── Stop during execution (isRunning check) ─────────────────────────────

  describe("stop during execution", () => {
    it("breaks the iteration loop when isRunning becomes false", async () => {
      useRunnerStore.setState({
        dataDrivenMode: true,
        dataset: {
          columns: [{ name: "x", type: "string" }],
          rows: [{ values: { x: "1" } }, { values: { x: "2" } }, { values: { x: "3" } }],
        },
      });

      mockFns.runFlow.mockImplementation(async () => {
        // After the first iteration, set isRunning false
        if (useRunnerStore.getState().currentIndex === 0) {
          useRunnerStore.setState({ isRunning: false });
        }
        mockFlowState.nodes = [
          { id: "n1", type: "start", name: "Start", status: "success" },
        ];
        mockFlowState.logs = [];
        mockFlowState.variables = {};
      });

      await useRunnerStore.getState().runFlow("Stop Mid");

      // Only 1 iteration because isRunning was set to false after it completed
      expect(mockFns.runFlow).toHaveBeenCalledTimes(1);
      expect(useRunnerStore.getState().results).toHaveLength(1);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("falls back to single iteration when dataset exists but has zero rows", async () => {
      useRunnerStore.setState({
        dataDrivenMode: true,
        dataset: { columns: [], rows: [] },
      });
      successFlowResult();

      await useRunnerStore.getState().runFlow("Empty");

      expect(mockFns.runFlow).toHaveBeenCalledTimes(1);
      expect(useRunnerStore.getState().results).toHaveLength(1);
    });

    it("uses single iteration when dataDrivenMode is true but dataset is null", async () => {
      useRunnerStore.setState({ dataDrivenMode: true, dataset: null });
      successFlowResult();

      await useRunnerStore.getState().runFlow("Null Dataset");

      expect(mockFns.runFlow).toHaveBeenCalledTimes(1);
      expect(useRunnerStore.getState().results).toHaveLength(1);
    });

    it("extracts variables from all iterations into runResult", async () => {
      useRunnerStore.setState({
        dataDrivenMode: true,
        dataset: {
          columns: [{ name: "x", type: "string" }],
          rows: [{ values: { x: "1" } }, { values: { x: "2" } }],
        },
      });

      let iteration = 0;
      mockFns.runFlow.mockImplementation(async () => {
        iteration++;
        mockFlowState.nodes = [
          { id: "n1", type: "start", name: "Start", status: "success" },
        ];
        mockFlowState.logs = [];
        mockFlowState.variables = { result: `iter_${iteration}` };
      });

      await useRunnerStore.getState().runFlow("Extract Flow");

      const rr = useRunnerStore.getState().runResult;
      expect(rr?.extracted_variables).toEqual([
        ["result", "iter_1"],
        ["result", "iter_2"],
      ]);
    });

    it("sets isRunning to true at start and false on completion", async () => {
      successFlowResult();

      const startPromise = useRunnerStore.getState().runFlow("Toggle Flow");

      expect(useRunnerStore.getState().isRunning).toBe(true);

      await startPromise;

      expect(useRunnerStore.getState().isRunning).toBe(false);
    });

    it("calls resetExecution before single run", async () => {
      successFlowResult();

      await useRunnerStore.getState().runFlow("Reset Check");

      expect(mockFns.resetExecution).toHaveBeenCalledTimes(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// startRun — Collection runs
// ─────────────────────────────────────────────────────────────────────────────

describe("runnerStore — startRun", () => {
  const mockCollectionResult = {
    id: "run-1",
    collection_id: "col-1",
    collection_name: "My Collection",
    environment_id: null,
    started_at: "2025-01-01T00:00:00Z",
    completed_at: "2025-01-01T00:01:00Z",
    delay_ms: 0,
    stop_on_failure: false,
    results: [
      {
        request_name: "GET /users",
        request_method: "GET",
        request_url: "https://api.example.com/users",
        status_code: 200,
        status_text: "OK",
        time_ms: 150,
        size: 1024,
        test_results: [{ name: "Status is 200", passed: true }],
        script_logs: [],
        error: null,
        extracted_variables: [["userId", "42"]],
        iteration: null,
      },
    ],
    total: 1,
    passed: 1,
    failed: 0,
    total_time_ms: 150,
    extracted_variables: [["userId", "42"]],
  };

  beforeEach(() => {
    resetRunnerStore();
    resetMockState();
  });

  // ── Basic collection run ───────────────────────────────────────────────

  describe("basic collection run", () => {
    it("calls runCollection with collectionId and sets results", async () => {
      mockInvoke.runCollection.mockResolvedValue(mockCollectionResult);

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      expect(mockInvoke.runCollection).toHaveBeenCalledWith("col-1", null, 0, false);

      const s = useRunnerStore.getState();
      expect(s.isRunning).toBe(false);
      expect(s.completed).toBe(true);
      expect(s.collectionId).toBe("col-1");
      expect(s.collectionName).toBe("My Collection");
      expect(s.results).toHaveLength(1);
      expect(s.results[0].request_name).toBe("GET /users");
      expect(s.results[0].status_code).toBe(200);
      expect(s.totalRequests).toBe(1);
      expect(s.currentIndex).toBe(1);
    });

    it("passes environmentId to runCollection", async () => {
      mockInvoke.runCollection.mockResolvedValue(mockCollectionResult);

      await useRunnerStore.getState().startRun("col-1", "My Collection", "env-prod");

      expect(mockInvoke.runCollection).toHaveBeenCalledWith("col-1", "env-prod", 0, false);
    });

    it("passes delayMs and stopOnFailure to runCollection", async () => {
      useRunnerStore.setState({ delayMs: 200, stopOnFailure: true });
      mockInvoke.runCollection.mockResolvedValue(mockCollectionResult);

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      expect(mockInvoke.runCollection).toHaveBeenCalledWith("col-1", null, 200, true);
    });

    it("stores the full runResult from the backend", async () => {
      mockInvoke.runCollection.mockResolvedValue(mockCollectionResult);

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      const rr = useRunnerStore.getState().runResult;
      expect(rr).toEqual(mockCollectionResult);
    });

    it("sets isRunning to true at start and false on completion", async () => {
      mockInvoke.runCollection.mockImplementation(async () => {
        expect(useRunnerStore.getState().isRunning).toBe(true);
        return mockCollectionResult;
      });

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      expect(useRunnerStore.getState().isRunning).toBe(false);
    });
  });

  // ── Data-driven collection run ────────────────────────────────────────

  describe("data-driven collection run", () => {
    const dataset = {
      columns: [{ name: "user", type: "string" as const }],
      rows: [{ values: { user: "alice" } }, { values: { user: "bob" } }],
    };

    it("calls runCollectionDataDriven when dataset is set", async () => {
      useRunnerStore.setState({ dataDrivenMode: true, dataset, datasetFileName: "test.csv" });
      mockInvoke.runCollectionDataDriven.mockResolvedValue(mockCollectionResult);

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      expect(mockInvoke.runCollectionDataDriven).toHaveBeenCalledWith(
        "col-1", null, 0, false, dataset
      );
      expect(mockInvoke.runCollection).not.toHaveBeenCalled();
    });

    it("passes environmentId, delayMs, stopOnFailure to runCollectionDataDriven", async () => {
      useRunnerStore.setState({
        dataDrivenMode: true,
        dataset,
        delayMs: 300,
        stopOnFailure: true,
      });
      mockInvoke.runCollectionDataDriven.mockResolvedValue(mockCollectionResult);

      await useRunnerStore.getState().startRun("col-1", "My Collection", "env-staging");

      expect(mockInvoke.runCollectionDataDriven).toHaveBeenCalledWith(
        "col-1", "env-staging", 300, true, dataset
      );
    });

    it("falls back to runCollection when dataset exists but has zero rows", async () => {
      useRunnerStore.setState({
        dataDrivenMode: true,
        dataset: { columns: [], rows: [] },
      });
      mockInvoke.runCollection.mockResolvedValue(mockCollectionResult);

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      expect(mockInvoke.runCollection).toHaveBeenCalledTimes(1);
      expect(mockInvoke.runCollectionDataDriven).not.toHaveBeenCalled();
    });

    it("falls back to runCollection when dataDrivenMode is true but dataset is null", async () => {
      useRunnerStore.setState({ dataDrivenMode: true, dataset: null });
      mockInvoke.runCollection.mockResolvedValue(mockCollectionResult);

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      expect(mockInvoke.runCollection).toHaveBeenCalledTimes(1);
    });
  });

  // ── Error handling ────────────────────────────────────────────────────

  describe("error handling", () => {
    it("catches Error thrown by runCollection and creates error result", async () => {
      mockInvoke.runCollection.mockRejectedValue(new Error("Connection refused"));

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      const s = useRunnerStore.getState();
      expect(s.isRunning).toBe(false);
      expect(s.completed).toBe(true);
      expect(s.runResult).not.toBeNull();
      expect(s.runResult!.id).toBe("error");
      expect(s.runResult!.collection_id).toBe("col-1");
      expect(s.runResult!.collection_name).toBe("My Collection");
      expect(s.runResult!.results[0].error).toBe("Connection refused");
      expect(s.runResult!.results[0].script_logs[0].message).toBe("Connection refused");
      expect(s.runResult!.passed).toBe(0);
      expect(s.runResult!.failed).toBe(1);
    });

    it("handles non-Error thrown values (string)", async () => {
      mockInvoke.runCollection.mockRejectedValue("string error");

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      expect(useRunnerStore.getState().runResult!.results[0].error).toBe("string error");
    });

    it("handles null thrown value (falls back to default message)", async () => {
      mockInvoke.runCollection.mockRejectedValue(null);

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      expect(useRunnerStore.getState().runResult!.results[0].error).toBe("Run failed");
    });

    it("preserves delayMs and stopOnFailure in error result", async () => {
      useRunnerStore.setState({ delayMs: 500, stopOnFailure: true });
      mockInvoke.runCollection.mockRejectedValue(new Error("Timeout"));

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      const rr = useRunnerStore.getState().runResult;
      expect(rr!.delay_ms).toBe(500);
      expect(rr!.stop_on_failure).toBe(true);
    });

    it("sets currentIndex to 1 in error state", async () => {
      mockInvoke.runCollection.mockRejectedValue(new Error("Fail"));

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      const s = useRunnerStore.getState();
      expect(s.currentIndex).toBe(1);
      expect(s.totalRequests).toBe(1);
    });
  });

  // ── loadRunHistory ─────────────────────────────────────────────────────

  describe("loadRunHistory", () => {
    it("calls loadRunHistory after successful collection run", async () => {
      mockInvoke.runCollection.mockResolvedValue(mockCollectionResult);

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      expect(mockInvoke.getRunHistory).toHaveBeenCalledTimes(1);
    });

    it("calls loadRunHistory even after error", async () => {
      mockInvoke.runCollection.mockRejectedValue(new Error("Fail"));

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      // loadRunHistory is called inside the catch block
      expect(mockInvoke.getRunHistory).toHaveBeenCalledTimes(1);
    });

    it("updates runHistory from loadRunHistory", async () => {
      const historyEntry = { ...mockCollectionResult, id: "history-1" };
      mockInvoke.runCollection.mockResolvedValue(mockCollectionResult);
      mockInvoke.getRunHistory.mockResolvedValue([historyEntry]);

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      // Wait for loadRunHistory to complete
      await vi.waitFor(() => {
        expect(useRunnerStore.getState().runHistory).toHaveLength(1);
      });
      expect(useRunnerStore.getState().runHistory[0].id).toBe("history-1");
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("resets previous results before a new run", async () => {
      // Simulate having previous results
      useRunnerStore.setState({
        results: [{ request_name: "Old", request_method: "", request_url: "", status_code: 0, status_text: "", time_ms: 0, size: 0, test_results: [], script_logs: [], error: null, extracted_variables: [], iteration: null }],
        runResult: { id: "old", collection_id: "", collection_name: "", environment_id: null, started_at: "", completed_at: "", delay_ms: 0, stop_on_failure: false, results: [], total: 0, passed: 0, failed: 0, total_time_ms: 0 },
      });
      mockInvoke.runCollection.mockResolvedValue(mockCollectionResult);

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      const s = useRunnerStore.getState();
      expect(s.runResult).toEqual(mockCollectionResult);
      // Previous result was replaced, not merged
      expect(s.runResult!.id).toBe("run-1");
    });

    it("handles empty results array from backend", async () => {
      const emptyResult = { ...mockCollectionResult, results: [], total: 0, passed: 0, failed: 0 };
      mockInvoke.runCollection.mockResolvedValue(emptyResult);

      await useRunnerStore.getState().startRun("col-1", "My Collection");

      const s = useRunnerStore.getState();
      expect(s.results).toHaveLength(0);
      expect(s.totalRequests).toBe(0);
      expect(s.currentIndex).toBe(0);
    });
  });
});
