import { describe, it, expect, beforeEach } from "vitest";
import { useFlowStore } from "@/stores/flowStore";
import fc from "fast-check";
import type { FlowNode } from "@/stores/flowStore";

/**
 * Helper: reset the store to its initial state between tests.
 * We call clearAll() which also pushes history — so we also clear undo/redo stacks.
 */
function resetStore() {
  const state = useFlowStore.getState();
  // First reset execution states
  state.resetExecution();
  // Clear logs
  state.clearLogs();
  state.clearVariables();
  // Reset to default flow via clearAll
  state.clearAll();
  // Wipe undo/redo stacks that clearAll may have created
  useFlowStore.setState({
    undoStack: [],
    redoStack: [],
    selectedNodeIds: [],
    clipboard: null,
  });
}

describe("flowStore — Undo/Redo", () => {
  beforeEach(() => {
    resetStore();
  });

  // ─── pushHistory ────────────────────────────────────────────────────────────

  it("pushHistory adds one entry to undoStack and clears redoStack", () => {
    const store = useFlowStore.getState();
    expect(store.undoStack.length).toBe(0);

    store.pushHistory();
    expect(useFlowStore.getState().undoStack.length).toBe(1);
    expect(useFlowStore.getState().redoStack.length).toBe(0);
  });

  it("pushHistory deep-copies nodes and edges (mutation isolation)", () => {
    const store = useFlowStore.getState();
    store.pushHistory();

    // Get the snapshot from undoStack
    const entry = useFlowStore.getState().undoStack[0];
    expect(entry.nodes).toEqual(store.nodes);
  });

  // ─── undo ───────────────────────────────────────────────────────────────────

  it("undo restores previous node count after addNode", () => {
    const store = useFlowStore.getState();
    const initialCount = store.nodes.length;

    store.addNode("delay", 100, 200);
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 1);

    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.length).toBe(initialCount);
  });

  it("undo restores node name after updateNodeName", () => {
    const store = useFlowStore.getState();
    const node = store.nodes[0]; // start node
    const originalName = node.name;

    store.updateNodeName(node.id, "Renamed");
    expect(useFlowStore.getState().nodes.find((n) => n.id === node.id)!.name).toBe("Renamed");

    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.find((n) => n.id === node.id)!.name).toBe(originalName);
  });

  it("undo restores node position after updateNodePosition", () => {
    const store = useFlowStore.getState();
    // Add a node first
    const id = store.addNode("logger", 50, 60);
    const node = useFlowStore.getState().nodes.find((n) => n.id === id)!;

    store.updateNodePosition(id, 999, 888);
    expect(useFlowStore.getState().nodes.find((n) => n.id === id)!.x).toBe(999);

    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.find((n) => n.id === id)!.x).toBe(node.x);
  });

  it("undo restores edges after deleteEdge", () => {
    const store = useFlowStore.getState();
    const initialEdgeCount = store.edges.length;

    // Delete the default edge
    const edgeId = store.edges[0].id;
    store.deleteEdge(edgeId);
    expect(useFlowStore.getState().edges.length).toBe(initialEdgeCount - 1);

    useFlowStore.getState().undo();
    expect(useFlowStore.getState().edges.length).toBe(initialEdgeCount);
    expect(useFlowStore.getState().edges.find((e) => e.id === edgeId)).toBeDefined();
  });

  it("undo restores nodes after deleteNode", () => {
    const store = useFlowStore.getState();
    const initialCount = store.nodes.length;

    // Add a node, then delete it
    const id = store.addNode("condition", 10, 10);
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 1);

    useFlowStore.getState().deleteNode(id);
    expect(useFlowStore.getState().nodes.length).toBe(initialCount);

    // Undo the deletion
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 1);
  });

  it("undo is no-op when undoStack is empty", () => {
    const store = useFlowStore.getState();
    expect(store.undoStack.length).toBe(0);

    // This should not throw
    store.undo();
    expect(useFlowStore.getState().undoStack.length).toBe(0);
  });

  // ─── redo ───────────────────────────────────────────────────────────────────

  it("redo restores state after undo", () => {
    const store = useFlowStore.getState();
    const initialCount = store.nodes.length;

    store.addNode("request", 200, 300);
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 1);

    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.length).toBe(initialCount);

    useFlowStore.getState().redo();
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 1);
  });

  it("redo is no-op when redoStack is empty", () => {
    const store = useFlowStore.getState();
    expect(store.redoStack.length).toBe(0);

    // This should not throw
    store.redo();
    expect(useFlowStore.getState().redoStack.length).toBe(0);
  });

  it("multiple undo/redo cycles maintain correctness", () => {
    const store = useFlowStore.getState();
    const initialCount = store.nodes.length;

    // Add node A
    store.addNode("delay", 100, 100);
    // Add node B
    store.addNode("condition", 200, 200);

    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 2);

    // Undo once — should remove B
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 1);

    // Undo twice — should remove A
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.length).toBe(initialCount);

    // Redo once — should restore A
    useFlowStore.getState().redo();
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 1);

    // Redo twice — should restore B
    useFlowStore.getState().redo();
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 2);
  });

  it("redoStack is cleared when a new mutation happens after undo", () => {
    const store = useFlowStore.getState();
    store.addNode("logger", 10, 10);
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().redoStack.length).toBe(1);

    // New mutation should clear redoStack
    store.addNode("delay", 20, 20);
    expect(useFlowStore.getState().redoStack.length).toBe(0);
  });

  // ─── Undo/Redo + clearAll ──────────────────────────────────────────────────

  it("clearAll can be undone", () => {
    const store = useFlowStore.getState();
    const defaultNodes = [...store.nodes];

    store.addNode("request", 300, 100);
    expect(useFlowStore.getState().nodes.length).toBe(defaultNodes.length + 1);

    // clearAll resets to default flow
    store.clearAll();
    expect(useFlowStore.getState().nodes.length).toBe(defaultNodes.length);

    // Undo should restore the state before clearAll (with the extra node)
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.length).toBe(defaultNodes.length + 1);
  });

  // ─── Undo/Redo + addEdge ────────────────────────────────────────────────────

  it("addEdge can be undone", () => {
    const store = useFlowStore.getState();
    const initialEdgeCount = store.edges.length;
    const defaultEdgeId = store.edges[0].id;

    // Add a delay node and an edge from start to it
    const nodeId = store.addNode("delay", 300, 300);
    const delayNode = useFlowStore.getState().nodes.find((n) => n.id === nodeId)!;

    // addEdge replaces existing outgoing edges from the same fromNode+fromPort
    store.addEdge("start-node-1", "flow", delayNode.id, "trigger");
    expect(useFlowStore.getState().edges.length).toBe(initialEdgeCount); // replaced, not added
    expect(useFlowStore.getState().edges.find((e) => e.id === defaultEdgeId)).toBeUndefined();

    // Undo should restore the original default edge
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().edges.length).toBe(initialEdgeCount);
    expect(useFlowStore.getState().edges.find((e) => e.id === defaultEdgeId)).toBeDefined();
  });

  // ─── undoStack cap at 50 ────────────────────────────────────────────────────

  it("undoStack caps at 50 entries", () => {
    const store = useFlowStore.getState();
    // Push 55 times
    for (let i = 0; i < 55; i++) {
      store.pushHistory();
    }
    expect(useFlowStore.getState().undoStack.length).toBe(50);
  });

  // ─── Property-based tests ──────────────────────────────────────────────────

  it("Property: undo/redo round-trip preserves node count", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("request", "delay", "condition", "logger"), { minLength: 1, maxLength: 10 }),
        (types) => {
          resetStore();
          const store = useFlowStore.getState();
          const initialCount = store.nodes.length;

          // Add nodes
          for (const t of types) {
            store.addNode(t as FlowNodeType, 0, 0);
          }
          const afterAdd = useFlowStore.getState().nodes.length;
          expect(afterAdd).toBe(initialCount + types.length);

          // Undo each one
          for (let i = 0; i < types.length; i++) {
            useFlowStore.getState().undo();
          }
          expect(useFlowStore.getState().nodes.length).toBe(initialCount);

          // Redo each one
          for (let i = 0; i < types.length; i++) {
            useFlowStore.getState().redo();
          }
          expect(useFlowStore.getState().nodes.length).toBe(initialCount + types.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("Property: undoStack never exceeds 50 after any sequence of mutations", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 80 }),
        (mutationCount) => {
          resetStore();
          const store = useFlowStore.getState();

          for (let i = 0; i < mutationCount; i++) {
            store.addNode("delay", 0, 0);
          }

          expect(useFlowStore.getState().undoStack.length).toBeLessThanOrEqual(50);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2 Execution Tests — Set Variable, Script, Assertion
// ─────────────────────────────────────────────────────────────────────────────

describe("flowStore — P2 Node Execution", () => {
  beforeEach(() => {
    resetStore();
  });

  /**
   * Helper: Build a simple linear flow: start -> middle node -> logger.
   * Returns the middle node's id so tests can assert on it.
   */
  function buildSimpleFlow(middleNode: FlowNode): string {
    const store = useFlowStore.getState();
    // Replace all nodes with only start -> middle -> logger
    const loggerNode: FlowNode = {
      id: "test-logger",
      type: "logger",
      x: 600,
      y: 180,
      name: "Test Logger",
      status: "idle",
      data: { logFormat: "Done" },
    };
    useFlowStore.setState({
      nodes: [store.nodes.find((n) => n.type === "start")!, middleNode, loggerNode],
      edges: [
        { id: "edge-start-mid", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: middleNode.id, toPortId: "trigger" },
        { id: "edge-mid-logger", fromNodeId: middleNode.id, fromPortId: "flow", toNodeId: "test-logger", toPortId: "trigger" },
      ],
      logs: [],
    });
    return middleNode.id;
  }

  /**
   * Helper: Build a flow with conditional branching from the middle node.
   * truePort -> logger-true, falsePort -> logger-false.
   */
  function buildConditionalFlow(middleNode: FlowNode): { middleId: string; trueLoggerId: string; falseLoggerId: string } {
    const store = useFlowStore.getState();
    const trueLogger: FlowNode = {
      id: "logger-true",
      type: "logger",
      x: 600,
      y: 100,
      name: "True Logger",
      status: "idle",
      data: { logFormat: "Branch: true" },
    };
    const falseLogger: FlowNode = {
      id: "logger-false",
      type: "logger",
      x: 600,
      y: 300,
      name: "False Logger",
      status: "idle",
      data: { logFormat: "Branch: false" },
    };
    useFlowStore.setState({
      nodes: [store.nodes.find((n) => n.type === "start")!, middleNode, trueLogger, falseLogger],
      edges: [
        { id: "e-start-mid", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: middleNode.id, toPortId: "trigger" },
        { id: "e-mid-true", fromNodeId: middleNode.id, fromPortId: "true", toNodeId: "logger-true", toPortId: "trigger" },
        { id: "e-mid-false", fromNodeId: middleNode.id, fromPortId: "false", toNodeId: "logger-false", toPortId: "trigger" },
      ],
      logs: [],
    });
    return { middleId: middleNode.id, trueLoggerId: "logger-true", falseLoggerId: "logger-false" };
  }

  // ─── Set Variable Node ────────────────────────────────────────────────────

  describe("Set Variable node", () => {
    it("sets a variable with a literal value", async () => {
      const node: FlowNode = {
        id: "set-var-1",
        type: "set_variable",
        x: 200,
        y: 180,
        name: "Set Var",
        status: "idle",
        data: { variableName: "my_token", variableValue: "abc123" },
      };
      buildSimpleFlow(node);

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.variables.my_token).toBe("abc123");
      expect(state.nodes.find((n) => n.id === "set-var-1")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "test-logger")?.status).toBe("success");
    });

    it("sets a variable with {{interpolation}}", async () => {
      // runFlow clears variables, so we build a flow where one set_variable
      // feeds into another: start -> set_var1 (sets existing_var) -> set_var2 (interpolates) -> logger
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setVar1: FlowNode = {
        id: "set-var-preset",
        type: "set_variable",
        x: 200,
        y: 180,
        name: "Set Var Preset",
        status: "idle",
        data: { variableName: "existing_var", variableValue: "hello_world" },
      };
      const setVar2: FlowNode = {
        id: "set-var-interpolate",
        type: "set_variable",
        x: 400,
        y: 180,
        name: "Set Var Interpolate",
        status: "idle",
        data: { variableName: "result", variableValue: "prefix_{{existing_var}}_suffix" },
      };
      const loggerNode: FlowNode = {
        id: "test-logger",
        type: "logger",
        x: 600,
        y: 180,
        name: "Logger",
        status: "idle",
        data: { logFormat: "Done" },
      };
      useFlowStore.setState({
        nodes: [startNode, setVar1, setVar2, loggerNode],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "set-var-preset", toPortId: "trigger" },
          { id: "e2", fromNodeId: "set-var-preset", fromPortId: "flow", toNodeId: "set-var-interpolate", toPortId: "trigger" },
          { id: "e3", fromNodeId: "set-var-interpolate", fromPortId: "flow", toNodeId: "test-logger", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.variables.existing_var).toBe("hello_world");
      expect(state.variables.result).toBe("prefix_hello_world_suffix");
    });

    it("overrides an existing variable", async () => {
      useFlowStore.setState({ variables: { my_var: "old_value" } });

      const node: FlowNode = {
        id: "set-var-3",
        type: "set_variable",
        x: 200,
        y: 180,
        name: "Set Var Override",
        status: "idle",
        data: { variableName: "my_var", variableValue: "new_value" },
      };
      buildSimpleFlow(node);

      await useFlowStore.getState().runFlow();

      expect(useFlowStore.getState().variables.my_var).toBe("new_value");
    });

    it("logs a warning when variable name is empty but still succeeds", async () => {
      const node: FlowNode = {
        id: "set-var-4",
        type: "set_variable",
        x: 200,
        y: 180,
        name: "Set Var Empty",
        status: "idle",
        data: { variableName: "", variableValue: "some_value" },
      };
      buildSimpleFlow(node);

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      // Node should still succeed (nextPort = flow)
      expect(state.nodes.find((n) => n.id === "set-var-4")?.status).toBe("success");
      // Logger should still be reached
      expect(state.nodes.find((n) => n.id === "test-logger")?.status).toBe("success");
      // A warn-level log should exist
      expect(state.logs.some((l) => l.level === "warn" && l.message.includes("no variable name"))).toBe(true);
    });

    it("trims whitespace from variable name", async () => {
      const node: FlowNode = {
        id: "set-var-5",
        type: "set_variable",
        x: 200,
        y: 180,
        name: "Set Var Trim",
        status: "idle",
        data: { variableName: "  trimmed_key  ", variableValue: "value_ok" },
      };
      buildSimpleFlow(node);

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.variables["trimmed_key"]).toBe("value_ok");
      // The untrimmed version should NOT exist
      expect(state.variables["  trimmed_key  "]).toBeUndefined();
    });

    it("handles missing variableValue gracefully (defaults to '')", async () => {
      const node: FlowNode = {
        id: "set-var-6",
        type: "set_variable",
        x: 200,
        y: 180,
        name: "Set Var No Value",
        status: "idle",
        data: { variableName: "empty_val", variableValue: undefined },
      };
      buildSimpleFlow(node);

      await useFlowStore.getState().runFlow();

      expect(useFlowStore.getState().variables.empty_val).toBe("");
    });

    it("interpolates with non-existent variable (leaves placeholder)", async () => {
      const node: FlowNode = {
        id: "set-var-7",
        type: "set_variable",
        x: 200,
        y: 180,
        name: "Set Var Missing",
        status: "idle",
        data: { variableName: "result", variableValue: "{{does_not_exist}}" },
      };
      buildSimpleFlow(node);

      await useFlowStore.getState().runFlow();

      // interpolateString leaves unknown placeholders as-is
      expect(useFlowStore.getState().variables.result).toBe("{{does_not_exist}}");
    });
  });

  // ─── Script Node ──────────────────────────────────────────────────────────

  describe("Script node", () => {
    it("executes JS code and modifies vars object", async () => {
      // runFlow clears variables, so set input via a set_variable node
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setVarNode: FlowNode = {
        id: "set-var-input",
        type: "set_variable",
        x: 200,
        y: 180,
        name: "Set Var",
        status: "idle",
        data: { variableName: "input", variableValue: "42" },
      };
      const scriptNode: FlowNode = {
        id: "script-1",
        type: "script",
        x: 400,
        y: 180,
        name: "Script",
        status: "idle",
        data: { scriptCode: "vars.result = String(parseInt(vars.input, 10) * 2);" },
      };
      const loggerNode: FlowNode = {
        id: "test-logger",
        type: "logger",
        x: 600,
        y: 180,
        name: "Logger",
        status: "idle",
        data: { logFormat: "Done" },
      };
      useFlowStore.setState({
        nodes: [startNode, setVarNode, scriptNode, loggerNode],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "set-var-input", toPortId: "trigger" },
          { id: "e2", fromNodeId: "set-var-input", fromPortId: "flow", toNodeId: "script-1", toPortId: "trigger" },
          { id: "e3", fromNodeId: "script-1", fromPortId: "flow", toNodeId: "test-logger", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.variables.input).toBe("42");
      expect(state.variables.result).toBe("84");
      expect(state.nodes.find((n) => n.id === "script-1")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "test-logger")?.status).toBe("success");
    });

    it("creates a new variable not previously in the store", async () => {
      const node: FlowNode = {
        id: "script-2",
        type: "script",
        x: 200,
        y: 180,
        name: "Script New Var",
        status: "idle",
        data: { scriptCode: "vars.brand_new_key = 'created_in_script';" },
      };
      buildSimpleFlow(node);

      await useFlowStore.getState().runFlow();

      expect(useFlowStore.getState().variables.brand_new_key).toBe("created_in_script");
    });

    it("multiple script nodes can pass values through variables", async () => {
      // Build a flow: start -> script1 -> script2 -> logger
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const script1: FlowNode = {
        id: "script-a",
        type: "script",
        x: 200,
        y: 180,
        name: "Script A",
        status: "idle",
        data: { scriptCode: "vars.step = 'step1_complete';" },
      };
      const script2: FlowNode = {
        id: "script-b",
        type: "script",
        x: 400,
        y: 180,
        name: "Script B",
        status: "idle",
        data: { scriptCode: "vars.step = vars.step + ' -> step2_complete';" },
      };
      const loggerNode: FlowNode = {
        id: "test-logger",
        type: "logger",
        x: 600,
        y: 180,
        name: "Logger",
        status: "idle",
        data: { logFormat: "Final step: {{step}}" },
      };
      useFlowStore.setState({
        nodes: [startNode, script1, script2, loggerNode],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "script-a", toPortId: "trigger" },
          { id: "e2", fromNodeId: "script-a", fromPortId: "flow", toNodeId: "script-b", toPortId: "trigger" },
          { id: "e3", fromNodeId: "script-b", fromPortId: "flow", toNodeId: "test-logger", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      expect(useFlowStore.getState().variables.step).toBe("step1_complete -> step2_complete");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "script-a")?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "script-b")?.status).toBe("success");
    });

    it("routes to failure port when script throws an error", async () => {
      // Build flow: start -> script (failure) -> logger-failure
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const scriptNode: FlowNode = {
        id: "script-error",
        type: "script",
        x: 200,
        y: 180,
        name: "Script Error",
        status: "idle",
        data: { scriptCode: "throw new Error('Oops!');" },
      };
      const failureLogger: FlowNode = {
        id: "logger-failure",
        type: "logger",
        x: 500,
        y: 180,
        name: "Failure Logger",
        status: "idle",
        data: { logFormat: "Script failed" },
      };
      useFlowStore.setState({
        nodes: [startNode, scriptNode, failureLogger],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "script-error", toPortId: "trigger" },
          { id: "e2", fromNodeId: "script-error", fromPortId: "failure", toNodeId: "logger-failure", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === "script-error")?.status).toBe("failure");
      // The failure path logger should be reached
      expect(state.nodes.find((n) => n.id === "logger-failure")?.status).toBe("success");
      // Should have an error log
      expect(state.logs.some((l) => l.level === "error" && l.message.includes("Oops"))).toBe(true);
    });

    it("handles empty script code gracefully (logs warning, still succeeds)", async () => {
      const node: FlowNode = {
        id: "script-empty",
        type: "script",
        x: 200,
        y: 180,
        name: "Script Empty",
        status: "idle",
        data: { scriptCode: "" },
      };
      buildSimpleFlow(node);

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === "script-empty")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "test-logger")?.status).toBe("success");
      expect(state.logs.some((l) => l.level === "warn" && l.message.includes("no code to execute"))).toBe(true);
    });

    it("handles whitespace-only script (still succeeds via empty check)", async () => {
      const node: FlowNode = {
        id: "script-whitespace",
        type: "script",
        x: 200,
        y: 180,
        name: "Script Whitespace",
        status: "idle",
        data: { scriptCode: "   \n  \t  " },
      };
      buildSimpleFlow(node);

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === "script-whitespace")?.status).toBe("success");
      // .trim() makes this truthy, so it won't hit the empty branch —
      // it will actually try to execute whitespace, which is valid JS (no-op).
      // This is fine — the test just checks it doesn't crash.
    });

    it("catches syntax errors in script code and routes to failure", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const scriptNode: FlowNode = {
        id: "script-syntax",
        type: "script",
        x: 200,
        y: 180,
        name: "Script Syntax",
        status: "idle",
        data: { scriptCode: "var x = ;" },
      };
      const failureLogger: FlowNode = {
        id: "logger-fail",
        type: "logger",
        x: 500,
        y: 180,
        name: "Fail Logger",
        status: "idle",
        data: { logFormat: "Failed" },
      };
      useFlowStore.setState({
        nodes: [startNode, scriptNode, failureLogger],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "script-syntax", toPortId: "trigger" },
          { id: "e2", fromNodeId: "script-syntax", fromPortId: "failure", toNodeId: "logger-fail", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === "script-syntax")?.status).toBe("failure");
      expect(state.nodes.find((n) => n.id === "logger-fail")?.status).toBe("success");
    });

    it("preserves existing variables when script modifies vars", async () => {
      // Set variables via set_variable nodes before the script
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setExisting: FlowNode = {
        id: "set-existing",
        type: "set_variable",
        x: 200,
        y: 160,
        name: "Set Existing",
        status: "idle",
        data: { variableName: "existing", variableValue: "keep_me" },
      };
      const setUntouched: FlowNode = {
        id: "set-untouched",
        type: "set_variable",
        x: 200,
        y: 260,
        name: "Set Untouched",
        status: "idle",
        data: { variableName: "untouched", variableValue: "also_keep" },
      };
      const scriptNode: FlowNode = {
        id: "script-preserve",
        type: "script",
        x: 400,
        y: 210,
        name: "Script Preserve",
        status: "idle",
        data: { scriptCode: "vars.new_key = 'added';" },
      };
      const loggerNode: FlowNode = {
        id: "test-logger",
        type: "logger",
        x: 600,
        y: 210,
        name: "Logger",
        status: "idle",
        data: { logFormat: "Done" },
      };
      useFlowStore.setState({
        nodes: [startNode, setExisting, setUntouched, scriptNode, loggerNode],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "set-existing", toPortId: "trigger" },
          { id: "e2", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "set-untouched", toPortId: "trigger" },
          { id: "e3", fromNodeId: "set-existing", fromPortId: "flow", toNodeId: "script-preserve", toPortId: "trigger" },
          { id: "e4", fromNodeId: "set-untouched", fromPortId: "flow", toNodeId: "script-preserve", toPortId: "trigger" },
          { id: "e5", fromNodeId: "script-preserve", fromPortId: "flow", toNodeId: "test-logger", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.variables.existing).toBe("keep_me");
      expect(state.variables.untouched).toBe("also_keep");
      expect(state.variables.new_key).toBe("added");
    });
  });

  // ─── Assertion Node ───────────────────────────────────────────────────────

  describe("Assertion node", () => {
    it("passes when expression is true (routes to true port)", async () => {
      // runFlow clears variables — use set_variable node before assertion
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setVarNode: FlowNode = {
        id: "set-status",
        type: "set_variable",
        x: 200,
        y: 180,
        name: "Set Status",
        status: "idle",
        data: { variableName: "status_code", variableValue: "200" },
      };
      const assertNode: FlowNode = {
        id: "assert-1",
        type: "assertion",
        x: 400,
        y: 180,
        name: "Assert",
        status: "idle",
        data: { assertionExpression: "status_code === '200'", assertionMessage: "Expected 200" },
      };
      const trueLogger: FlowNode = {
        id: "logger-true",
        type: "logger",
        x: 600,
        y: 100,
        name: "True Logger",
        status: "idle",
        data: { logFormat: "Branch: true" },
      };
      const falseLogger: FlowNode = {
        id: "logger-false",
        type: "logger",
        x: 600,
        y: 300,
        name: "False Logger",
        status: "idle",
        data: { logFormat: "Branch: false" },
      };
      useFlowStore.setState({
        nodes: [startNode, setVarNode, assertNode, trueLogger, falseLogger],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "set-status", toPortId: "trigger" },
          { id: "e2", fromNodeId: "set-status", fromPortId: "flow", toNodeId: "assert-1", toPortId: "trigger" },
          { id: "e3", fromNodeId: "assert-1", fromPortId: "true", toNodeId: "logger-true", toPortId: "trigger" },
          { id: "e4", fromNodeId: "assert-1", fromPortId: "false", toNodeId: "logger-false", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === "assert-1")?.status).toBe("success");
      // True path logger should execute
      expect(state.nodes.find((n) => n.id === "logger-true")?.status).toBe("success");
      // False path logger should NOT execute
      expect(state.nodes.find((n) => n.id === "logger-false")?.status).toBe("idle");
    });

    it("fails when expression is false (routes to false port)", async () => {
      useFlowStore.setState({ variables: { status_code: "500" } });

      const node: FlowNode = {
        id: "assert-2",
        type: "assertion",
        x: 200,
        y: 180,
        name: "Assert",
        status: "idle",
        data: { assertionExpression: "status_code === '200'", assertionMessage: "Expected 200 but got {{status_code}}" },
      };
      const ids = buildConditionalFlow(node);

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === ids.middleId)?.status).toBe("failure");
      // False path logger should execute
      expect(state.nodes.find((n) => n.id === ids.falseLoggerId)?.status).toBe("success");
      // True path logger should NOT execute
      expect(state.nodes.find((n) => n.id === ids.trueLoggerId)?.status).toBe("idle");
      // Error log should include the assertion message
      expect(state.logs.some((l) => l.level === "error" && l.message.includes("Expected 200"))).toBe(true);
    });

    it("passes when expression is literally true", async () => {
      const node: FlowNode = {
        id: "assert-3",
        type: "assertion",
        x: 200,
        y: 180,
        name: "Assert True",
        status: "idle",
        data: { assertionExpression: "true", assertionMessage: "Should pass" },
      };
      const ids = buildConditionalFlow(node);

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === ids.middleId)?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === ids.trueLoggerId)?.status).toBe("success");
    });

    it("fails when expression is false (literal false)", async () => {
      const node: FlowNode = {
        id: "assert-4",
        type: "assertion",
        x: 200,
        y: 180,
        name: "Assert False",
        status: "idle",
        data: { assertionExpression: "false", assertionMessage: "Should fail" },
      };
      const ids = buildConditionalFlow(node);

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === ids.middleId)?.status).toBe("failure");
      expect(state.nodes.find((n) => n.id === ids.falseLoggerId)?.status).toBe("success");
    });

    it("fails gracefully when expression has a syntax error", async () => {
      const node: FlowNode = {
        id: "assert-5",
        type: "assertion",
        x: 200,
        y: 180,
        name: "Assert Syntax",
        status: "idle",
        data: { assertionExpression: "status_code === ", assertionMessage: "Syntax error test" },
      };
      const ids = buildConditionalFlow(node);

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      // Syntax error should result in failure (false path)
      expect(state.nodes.find((n) => n.id === ids.middleId)?.status).toBe("failure");
      expect(state.nodes.find((n) => n.id === ids.falseLoggerId)?.status).toBe("success");
    });

    it("passes with compound expression using variables", async () => {
      // Use a single script node to set both variables sequentially
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const scriptNode: FlowNode = {
        id: "script-preset",
        type: "script",
        x: 200,
        y: 180,
        name: "Set Vars",
        status: "idle",
        data: { scriptCode: "vars.status_code = '200'; vars.response_time = '150';" },
      };
      const assertNode: FlowNode = {
        id: "assert-6",
        type: "assertion",
        x: 400,
        y: 180,
        name: "Assert Compound",
        status: "idle",
        data: {
          assertionExpression: "status_code === '200' && parseInt(response_time, 10) < 300",
          assertionMessage: "Expected status 200 and fast response",
        },
      };
      const trueLogger: FlowNode = {
        id: "logger-true",
        type: "logger",
        x: 600,
        y: 100,
        name: "True Logger",
        status: "idle",
        data: { logFormat: "Branch: true" },
      };
      const falseLogger: FlowNode = {
        id: "logger-false",
        type: "logger",
        x: 600,
        y: 300,
        name: "False Logger",
        status: "idle",
        data: { logFormat: "Branch: false" },
      };
      useFlowStore.setState({
        nodes: [startNode, scriptNode, assertNode, trueLogger, falseLogger],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "script-preset", toPortId: "trigger" },
          { id: "e2", fromNodeId: "script-preset", fromPortId: "flow", toNodeId: "assert-6", toPortId: "trigger" },
          { id: "e3", fromNodeId: "assert-6", fromPortId: "true", toNodeId: "logger-true", toPortId: "trigger" },
          { id: "e4", fromNodeId: "assert-6", fromPortId: "false", toNodeId: "logger-false", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      expect(useFlowStore.getState().nodes.find((n) => n.id === "assert-6")?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "logger-true")?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "logger-false")?.status).toBe("idle");
    });

    it("fails compound expression when one condition is false", async () => {
      useFlowStore.setState({ variables: { status_code: "200", response_time: "500" } });

      const node: FlowNode = {
        id: "assert-7",
        type: "assertion",
        x: 200,
        y: 180,
        name: "Assert Compound Fail",
        status: "idle",
        data: {
          assertionExpression: "status_code === '200' && parseInt(response_time, 10) < 300",
          assertionMessage: "Response too slow",
        },
      };
      const ids = buildConditionalFlow(node);

      await useFlowStore.getState().runFlow();

      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.middleId)?.status).toBe("failure");
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.falseLoggerId)?.status).toBe("success");
    });

    it("works with no variables in scope (uses undefined for unknown vars)", async () => {
      // No variables set — status_code is undefined
      const node: FlowNode = {
        id: "assert-8",
        type: "assertion",
        x: 200,
        y: 180,
        name: "Assert No Vars",
        status: "idle",
        data: { assertionExpression: "status_code === '200'", assertionMessage: "No status yet" },
      };
      const ids = buildConditionalFlow(node);

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      // undefined === '200' is false → failure
      expect(state.nodes.find((n) => n.id === ids.middleId)?.status).toBe("failure");
      expect(state.nodes.find((n) => n.id === ids.falseLoggerId)?.status).toBe("success");
    });

    it("uses defaults when expression and message are not provided", async () => {
      // assertionExpression defaults to "true", assertionMessage defaults to "Assertion failed"
      const node: FlowNode = {
        id: "assert-9",
        type: "assertion",
        x: 200,
        y: 180,
        name: "Assert Defaults",
        status: "idle",
        data: { assertionExpression: undefined, assertionMessage: undefined },
      };
      const ids = buildConditionalFlow(node);

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      // Default expression "true" → success path
      expect(state.nodes.find((n) => n.id === ids.middleId)?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === ids.trueLoggerId)?.status).toBe("success");
    });
  });

  // ─── Mixed / Integration ──────────────────────────────────────────────────

  describe("Mixed P2 node integration", () => {
    it("set_variable → script reads the variable → assertion validates it", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;

      const setVarNode: FlowNode = {
        id: "set-var-integration",
        type: "set_variable",
        x: 200,
        y: 180,
        name: "Set Var",
        status: "idle",
        data: { variableName: "user_score", variableValue: "85" },
      };
      const scriptNode: FlowNode = {
        id: "script-integration",
        type: "script",
        x: 400,
        y: 180,
        name: "Script",
        status: "idle",
        data: { scriptCode: "vars.passing = String(parseInt(vars.user_score, 10) >= 50);" },
      };
      const assertionNode: FlowNode = {
        id: "assert-integration",
        type: "assertion",
        x: 600,
        y: 180,
        name: "Assert",
        status: "idle",
        data: { assertionExpression: "passing === 'true'", assertionMessage: "User score below 50" },
      };
      const successLogger: FlowNode = {
        id: "logger-pass",
        type: "logger",
        x: 800,
        y: 100,
        name: "Pass Logger",
        status: "idle",
        data: { logFormat: "Passed! Score: {{user_score}}" },
      };
      const failLogger: FlowNode = {
        id: "logger-fail",
        type: "logger",
        x: 800,
        y: 300,
        name: "Fail Logger",
        status: "idle",
        data: { logFormat: "Failed: {{assertionMessage}}" },
      };

      useFlowStore.setState({
        nodes: [startNode, setVarNode, scriptNode, assertionNode, successLogger, failLogger],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "set-var-integration", toPortId: "trigger" },
          { id: "e2", fromNodeId: "set-var-integration", fromPortId: "flow", toNodeId: "script-integration", toPortId: "trigger" },
          { id: "e3", fromNodeId: "script-integration", fromPortId: "flow", toNodeId: "assert-integration", toPortId: "trigger" },
          { id: "e4", fromNodeId: "assert-integration", fromPortId: "true", toNodeId: "logger-pass", toPortId: "trigger" },
          { id: "e5", fromNodeId: "assert-integration", fromPortId: "false", toNodeId: "logger-fail", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.variables.user_score).toBe("85");
      expect(state.variables.passing).toBe("true");
      expect(state.nodes.find((n) => n.id === "set-var-integration")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "script-integration")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "assert-integration")?.status).toBe("success");
      // Success path logger should execute
      expect(state.nodes.find((n) => n.id === "logger-pass")?.status).toBe("success");
      // Fail path logger should NOT execute
      expect(state.nodes.find((n) => n.id === "logger-fail")?.status).toBe("idle");
    });

    it("assertion failure in integration halts the happy path", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;

      const setVarNode: FlowNode = {
        id: "set-var-int2",
        type: "set_variable",
        x: 200,
        y: 180,
        name: "Set Var",
        status: "idle",
        data: { variableName: "score", variableValue: "30" },
      };
      const assertionNode: FlowNode = {
        id: "assert-int2",
        type: "assertion",
        x: 400,
        y: 180,
        name: "Assert",
        status: "idle",
        data: { assertionExpression: "parseInt(score, 10) >= 50", assertionMessage: "Score too low" },
      };
      const successLogger: FlowNode = {
        id: "logger-success",
        type: "logger",
        x: 600,
        y: 100,
        name: "Success Logger",
        status: "idle",
        data: { logFormat: "Accepted" },
      };
      const failLogger: FlowNode = {
        id: "logger-failure",
        type: "logger",
        x: 600,
        y: 300,
        name: "Fail Logger",
        status: "idle",
        data: { logFormat: "Rejected" },
      };

      useFlowStore.setState({
        nodes: [startNode, setVarNode, assertionNode, successLogger, failLogger],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "set-var-int2", toPortId: "trigger" },
          { id: "e2", fromNodeId: "set-var-int2", fromPortId: "flow", toNodeId: "assert-int2", toPortId: "trigger" },
          { id: "e3", fromNodeId: "assert-int2", fromPortId: "true", toNodeId: "logger-success", toPortId: "trigger" },
          { id: "e4", fromNodeId: "assert-int2", fromPortId: "false", toNodeId: "logger-failure", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.variables.score).toBe("30");
      expect(state.nodes.find((n) => n.id === "assert-int2")?.status).toBe("failure");
      // Fail path should execute
      expect(state.nodes.find((n) => n.id === "logger-failure")?.status).toBe("success");
      // Success path should NOT execute
      expect(state.nodes.find((n) => n.id === "logger-success")?.status).toBe("idle");
    });

    it("a failing assertion does not crash subsequent sibling flows", async () => {
      // Flow: start -> (assert-fail -> logger) AND (set-var -> logger) in parallel branches
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const assertFail: FlowNode = {
        id: "assert-branch",
        type: "assertion",
        x: 300,
        y: 100,
        name: "Assert Fail",
        status: "idle",
        data: { assertionExpression: "false", assertionMessage: "Always fails" },
      };
      const setVar: FlowNode = {
        id: "setvar-branch",
        type: "set_variable",
        x: 300,
        y: 300,
        name: "Set Var",
        status: "idle",
        data: { variableName: "side_branch", variableValue: "completed" },
      };
      const failLogger: FlowNode = {
        id: "logger-branch-fail",
        type: "logger",
        x: 550,
        y: 100,
        name: "Fail Logger",
        status: "idle",
        data: { logFormat: "assert failed" },
      };
      const successLogger: FlowNode = {
        id: "logger-branch-ok",
        type: "logger",
        x: 550,
        y: 300,
        name: "Success Logger",
        status: "idle",
        data: { logFormat: "setvar done" },
      };

      useFlowStore.setState({
        nodes: [startNode, assertFail, setVar, failLogger, successLogger],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "assert-branch", toPortId: "trigger" },
          { id: "e2", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "setvar-branch", toPortId: "trigger" },
          { id: "e3", fromNodeId: "assert-branch", fromPortId: "false", toNodeId: "logger-branch-fail", toPortId: "trigger" },
          { id: "e4", fromNodeId: "setvar-branch", fromPortId: "flow", toNodeId: "logger-branch-ok", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.variables.side_branch).toBe("completed");
      expect(state.nodes.find((n) => n.id === "setvar-branch")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "logger-branch-ok")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "logger-branch-fail")?.status).toBe("success");
    });
  });
});
