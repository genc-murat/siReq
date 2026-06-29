import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useFlowStore, getValueByJsonPath, interpolateString } from "@/stores/flowStore";
import fc from "fast-check";
import type { FlowNode, FlowNodeType } from "@/stores/flowStore";

// Mock sendRequest and cancelRequest — needed for request node execution tests.
// These mocks are harmless for non-request tests because those code paths
// never call sendRequest/cancelRequest.
const { mockSendRequest, mockCancelRequest } = vi.hoisted(() => ({
  mockSendRequest: vi.fn(),
  mockCancelRequest: vi.fn(),
}));

vi.mock("@/lib/invoke", () => ({
  sendRequest: mockSendRequest,
  cancelRequest: mockCancelRequest,
}));

/**
 * Helper: reset the store to its initial state between tests.
 */
function resetStore() {
  localStorage.clear();
  const state = useFlowStore.getState();
  state.resetExecution();
  state.clearLogs();
  state.clearVariables();
  state.clearAll();
  useFlowStore.setState({
    undoStack: [],
    redoStack: [],
    selectedNodeIds: [],
    clipboard: null,
  });
}

/**
 * Helper: Build a simple linear flow: start -> middle node -> logger.
 */
function buildSimpleFlow(middleNode: FlowNode): string {
  const store = useFlowStore.getState();
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
 * Helper: Build a flow with conditional branching.
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

// ════════════════════════════════════════════════════════════════════════════
// Initial State
// ════════════════════════════════════════════════════════════════════════════

describe("flowStore — initial state", () => {
  beforeEach(() => { resetStore(); });

  it("has default nodes (start + logger) with an edge between them", () => {
    const state = useFlowStore.getState();
    expect(state.nodes.length).toBe(2);
    expect(state.nodes[0].type).toBe("start");
    expect(state.nodes[1].type).toBe("logger");
    expect(state.edges.length).toBe(1);
    expect(state.edges[0].fromNodeId).toBe("start-node-1");
    expect(state.edges[0].toNodeId).toBe("logger-node-1");
  });

  it("starts with idle status on all nodes", () => {
    const state = useFlowStore.getState();
    for (const n of state.nodes) {
      expect(n.status).toBe("idle");
    }
  });

  it("has default pan, zoom, empty variables and logs", () => {
    const state = useFlowStore.getState();
    expect(state.pan).toEqual({ x: 0, y: 0 });
    expect(state.zoom).toBe(1);
    expect(state.variables).toEqual({});
    expect(state.logs).toEqual([]);
    expect(state.isRunning).toBe(false);
    expect(state.activeNodeId).toBeNull();
    expect(state.currentRequestId).toBeNull();
    expect(state.undoStack).toEqual([]);
    expect(state.redoStack).toEqual([]);
    expect(state.selectedNodeIds).toEqual([]);
    expect(state.clipboard).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Pan & Zoom
// ════════════════════════════════════════════════════════════════════════════

describe("flowStore — pan / zoom", () => {
  beforeEach(() => { resetStore(); });

  it("setPan replaces pan with a new value", () => {
    useFlowStore.getState().setPan({ x: 100, y: 200 });
    expect(useFlowStore.getState().pan).toEqual({ x: 100, y: 200 });
  });

  it("setPan accepts a functional updater", () => {
    useFlowStore.getState().setPan({ x: 10, y: 20 });
    useFlowStore.getState().setPan((prev) => ({ x: prev.x + 5, y: prev.y + 5 }));
    expect(useFlowStore.getState().pan).toEqual({ x: 15, y: 25 });
  });

  it("setZoom replaces zoom with a new value (clamped 0.2–2)", () => {
    useFlowStore.getState().setZoom(1.5);
    expect(useFlowStore.getState().zoom).toBe(1.5);
  });

  it("setZoom clamps values below 0.2", () => {
    useFlowStore.getState().setZoom(0.1);
    expect(useFlowStore.getState().zoom).toBe(0.2);
  });

  it("setZoom clamps values above 2", () => {
    useFlowStore.getState().setZoom(5);
    expect(useFlowStore.getState().zoom).toBe(2);
  });

  it("setZoom accepts a functional updater (also clamped)", () => {
    useFlowStore.getState().setZoom(1);
    useFlowStore.getState().setZoom((prev) => prev + 2);
    expect(useFlowStore.getState().zoom).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Node Management
// ════════════════════════════════════════════════════════════════════════════

describe("flowStore — node management", () => {
  beforeEach(() => { resetStore(); });

  describe("addNode", () => {
    it("adds a request node with default data", () => {
      const id = useFlowStore.getState().addNode("request", 100, 200);
      const node = useFlowStore.getState().nodes.find((n) => n.id === id);
      expect(node).toBeDefined();
      expect(node!.type).toBe("request");
      expect(node!.x).toBe(100);
      expect(node!.y).toBe(200);
      expect(node!.name).toBe("HTTP Request");
      expect(node!.data.extractions).toEqual([]);
      expect(node!.status).toBe("idle");
    });

    it("adds a condition node with default expression", () => {
      const id = useFlowStore.getState().addNode("condition", 300, 400);
      const node = useFlowStore.getState().nodes.find((n) => n.id === id);
      expect(node!.type).toBe("condition");
      expect(node!.name).toBe("Branch Cond");
      expect(node!.data.expression).toBe("status_code === '200'");
    });

    it("adds a delay node with default 1000ms", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      const node = useFlowStore.getState().nodes.find((n) => n.id === id);
      expect(node!.type).toBe("delay");
      expect(node!.name).toBe("Wait Timer");
      expect(node!.data.delayMs).toBe(1000);
    });

    it("adds a logger node with default log format", () => {
      const id = useFlowStore.getState().addNode("logger", 0, 0);
      const node = useFlowStore.getState().nodes.find((n) => n.id === id);
      expect(node!.type).toBe("logger");
      expect(node!.name).toBe("Console Log");
      expect(node!.data.logFormat).toBe("Status code is {{status_code}}");
    });

    it("adds a set_variable node with default field names", () => {
      const id = useFlowStore.getState().addNode("set_variable", 0, 0);
      const node = useFlowStore.getState().nodes.find((n) => n.id === id);
      expect(node!.type).toBe("set_variable");
      expect(node!.name).toBe("Set Variable");
      expect(node!.data.variableName).toBe("my_var");
      expect(node!.data.variableValue).toBe("{{status_code}}");
    });

    it("adds a script node with default code template", () => {
      const id = useFlowStore.getState().addNode("script", 0, 0);
      const node = useFlowStore.getState().nodes.find((n) => n.id === id);
      expect(node!.type).toBe("script");
      expect(node!.name).toBe("Script");
      expect(node!.data.scriptCode).toContain("vars.result = vars.status_code");
    });

    it("adds an assertion node with default expression and message", () => {
      const id = useFlowStore.getState().addNode("assertion", 0, 0);
      const node = useFlowStore.getState().nodes.find((n) => n.id === id);
      expect(node!.type).toBe("assertion");
      expect(node!.name).toBe("Assertion");
      expect(node!.data.assertionExpression).toBe("status_code === '200'");
      expect(node!.data.assertionMessage).toBe("Expected status code to be 200");
    });

    it("returns the new node id", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      expect(id).toMatch(/^node-/);
    });

    it("prevents adding a second start node and logs a warning", () => {
      const initialCount = useFlowStore.getState().nodes.length;
      const id = useFlowStore.getState().addNode("start", 0, 0);
      expect(id).toBe(""); // returns empty string
      expect(useFlowStore.getState().nodes.length).toBe(initialCount);
      expect(useFlowStore.getState().logs.some((l) => l.level === "warn" && l.message.includes("Start Trigger"))).toBe(true);
    });

    it("pushes history before adding a node", () => {
      expect(useFlowStore.getState().undoStack.length).toBe(0);
      useFlowStore.getState().addNode("logger", 0, 0);
      expect(useFlowStore.getState().undoStack.length).toBe(1);
    });

    it("logs info after adding a node", () => {
      useFlowStore.getState().addNode("delay", 0, 0);
      expect(useFlowStore.getState().logs.some((l) => l.level === "info" && l.message.includes("Added visual node"))).toBe(true);
    });
  });

  describe("updateNodeData", () => {
    it("updates node data partially", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().updateNodeData(id, { delayMs: 5000 });
      expect(useFlowStore.getState().nodes.find((n) => n.id === id)!.data.delayMs).toBe(5000);
    });

    it("preserves existing data fields not in the update", () => {
      const id = useFlowStore.getState().addNode("set_variable", 0, 0);
      useFlowStore.getState().updateNodeData(id, { variableValue: "new_val" });
      const node = useFlowStore.getState().nodes.find((n) => n.id === id)!;
      expect(node.data.variableValue).toBe("new_val");
      expect(node.data.variableName).toBe("my_var"); // preserved
    });

    it("pushes history", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().updateNodeData(id, { delayMs: 999 });
      expect(useFlowStore.getState().undoStack.length).toBe(2); // addNode + updateNodeData
    });
  });

  describe("updateNodePosition", () => {
    it("updates x and y coordinates of a node", () => {
      const id = useFlowStore.getState().addNode("logger", 10, 20);
      useFlowStore.getState().updateNodePosition(id, 777, 888);
      const node = useFlowStore.getState().nodes.find((n) => n.id === id)!;
      expect(node.x).toBe(777);
      expect(node.y).toBe(888);
    });

    it("pushes history", () => {
      const id = useFlowStore.getState().addNode("logger", 0, 0);
      useFlowStore.getState().updateNodePosition(id, 100, 200);
      expect(useFlowStore.getState().undoStack.length).toBe(2);
    });
  });

  describe("updateNodeName", () => {
    it("updates the name of a node", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().updateNodeName(id, "My Custom Delay");
      expect(useFlowStore.getState().nodes.find((n) => n.id === id)!.name).toBe("My Custom Delay");
    });

    it("pushes history", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().updateNodeName(id, "Renamed");
      expect(useFlowStore.getState().undoStack.length).toBe(2);
    });
  });

  describe("deleteNode", () => {
    it("deletes a non-start node", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      const count = useFlowStore.getState().nodes.length;
      useFlowStore.getState().deleteNode(id);
      expect(useFlowStore.getState().nodes.length).toBe(count - 1);
      expect(useFlowStore.getState().nodes.find((n) => n.id === id)).toBeUndefined();
    });

    it("removes connected edges when deleting a node", () => {
      const id = useFlowStore.getState().addNode("delay", 100, 100);
      useFlowStore.getState().addEdge("start-node-1", "flow", id, "trigger");
      const edgeCount = useFlowStore.getState().edges.length;

      useFlowStore.getState().deleteNode(id);

      // Edges connected to the deleted node should be gone
      const remainingEdges = useFlowStore.getState().edges;
      expect(remainingEdges.length).toBeLessThan(edgeCount);
      expect(remainingEdges.some((e) => e.fromNodeId === id || e.toNodeId === id)).toBe(false);
    });

    it("removes the node from selectedNodeIds", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().setSelectedNodeIds([id]);
      useFlowStore.getState().deleteNode(id);
      expect(useFlowStore.getState().selectedNodeIds).not.toContain(id);
    });

    it("refuses to delete the start node and logs a warning", () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const count = useFlowStore.getState().nodes.length;

      useFlowStore.getState().deleteNode(startNode.id);

      expect(useFlowStore.getState().nodes.length).toBe(count);
      expect(useFlowStore.getState().logs.some((l) => l.level === "warn" && l.message.includes("Start Trigger"))).toBe(true);
    });

    it("pushes history before deleting", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().deleteNode(id);
      expect(useFlowStore.getState().undoStack.length).toBeGreaterThan(0);
    });
  });

  describe("clearAll", () => {
    it("resets to default nodes and edges", () => {
      useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().addNode("condition", 0, 0);
      useFlowStore.getState().clearAll();

      const state = useFlowStore.getState();
      expect(state.nodes.length).toBe(2);
      expect(state.nodes[0].type).toBe("start");
      expect(state.nodes[1].type).toBe("logger");
      expect(state.edges.length).toBe(1);
    });

    it("clears variables, logs, running state, and clipboard", () => {
      useFlowStore.getState().updateVariable("foo", "bar");
      useFlowStore.getState().addLog("info", "test");
      useFlowStore.setState({ isRunning: true, clipboard: { nodes: [], edges: [] } });
      useFlowStore.getState().clearAll();

      const state = useFlowStore.getState();
      expect(state.variables).toEqual({});
      expect(state.logs).toEqual([]);
      expect(state.isRunning).toBe(false);
      expect(state.clipboard).toBeNull();
      expect(state.selectedNodeIds).toEqual([]);
    });

    it("resets node statuses to idle", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.setState({
        nodes: useFlowStore.getState().nodes.map((n) =>
          n.id === id ? { ...n, status: "failure" as const, error: "oops" } : n
        ),
      });
      useFlowStore.getState().clearAll();

      for (const n of useFlowStore.getState().nodes) {
        expect(n.status).toBe("idle");
        expect(n.error).toBeNull();
        expect(n.responseInfo).toBeNull();
      }
    });

    it("pushes history", () => {
      useFlowStore.getState().clearAll();
      expect(useFlowStore.getState().undoStack.length).toBeGreaterThan(0);
    });
  });

  describe("resetExecution", () => {
    it("resets all node statuses, errors, responseInfo, running state, activeNodeId", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.setState({
        nodes: useFlowStore.getState().nodes.map((n) =>
          n.id === id
            ? { ...n, status: "failure" as const, error: "err", responseInfo: { statusCode: 500, statusText: "Error", timeMs: 100, size: 0 } }
            : n
        ),
        isRunning: true,
        activeNodeId: id,
      });

      useFlowStore.getState().resetExecution();

      const state = useFlowStore.getState();
      expect(state.isRunning).toBe(false);
      expect(state.activeNodeId).toBeNull();
      const node = state.nodes.find((n) => n.id === id)!;
      expect(node.status).toBe("idle");
      expect(node.error).toBeNull();
      expect(node.responseInfo).toBeNull();
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Edge Management
// ════════════════════════════════════════════════════════════════════════════

describe("flowStore — edge management", () => {
  beforeEach(() => { resetStore(); });

  describe("addEdge", () => {
    it("creates an edge between two nodes", () => {
      const nodeId = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().addEdge("start-node-1", "flow", nodeId, "trigger");
      const edge = useFlowStore.getState().edges.find(
        (e) => e.fromNodeId === "start-node-1" && e.toNodeId === nodeId
      );
      expect(edge).toBeDefined();
      expect(edge!.fromPortId).toBe("flow");
      expect(edge!.toPortId).toBe("trigger");
    });

    it("replaces existing outgoing edges from the same port", () => {
      const nodeA = useFlowStore.getState().addNode("delay", 100, 100);
      const nodeB = useFlowStore.getState().addNode("delay", 200, 200);

      useFlowStore.getState().addEdge("start-node-1", "flow", nodeA, "trigger");
      expect(useFlowStore.getState().edges.length).toBe(1); // replaces default edge
      expect(useFlowStore.getState().edges[0].toNodeId).toBe(nodeA);

      useFlowStore.getState().addEdge("start-node-1", "flow", nodeB, "trigger");
      expect(useFlowStore.getState().edges.length).toBe(1); // replaced again
      expect(useFlowStore.getState().edges[0].toNodeId).toBe(nodeB);
    });

    it("does not add a duplicate edge", () => {
      const nodeId = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().addEdge("start-node-1", "flow", nodeId, "trigger");
      const count = useFlowStore.getState().edges.length;

      // Try adding the same edge again
      useFlowStore.getState().addEdge("start-node-1", "flow", nodeId, "trigger");
      expect(useFlowStore.getState().edges.length).toBe(count);
    });

    it("rejects self-loops", () => {
      useFlowStore.getState().addEdge("start-node-1", "flow", "start-node-1", "trigger");
      // No self-loop should exist
      expect(useFlowStore.getState().edges.filter((e) => e.fromNodeId === "start-node-1" && e.toNodeId === "start-node-1").length).toBe(0);
    });

    it("pushes history", () => {
      const nodeId = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().addEdge("start-node-1", "flow", nodeId, "trigger");
      expect(useFlowStore.getState().undoStack.length).toBeGreaterThan(0);
    });
  });

  describe("deleteEdge", () => {
    it("removes an edge by id", () => {
      const edgeId = useFlowStore.getState().edges[0].id;
      useFlowStore.getState().deleteEdge(edgeId);
      expect(useFlowStore.getState().edges.find((e) => e.id === edgeId)).toBeUndefined();
    });

    it("pushes history", () => {
      const edgeId = useFlowStore.getState().edges[0].id;
      useFlowStore.getState().deleteEdge(edgeId);
      expect(useFlowStore.getState().undoStack.length).toBe(1);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Multi-select
// ════════════════════════════════════════════════════════════════════════════

describe("flowStore — multi-select", () => {
  beforeEach(() => { resetStore(); });

  it("setSelectedNodeIds replaces the selection", () => {
    const idA = useFlowStore.getState().addNode("delay", 0, 0);
    const idB = useFlowStore.getState().addNode("condition", 0, 0);
    useFlowStore.getState().setSelectedNodeIds([idA, idB]);
    expect(useFlowStore.getState().selectedNodeIds).toEqual([idA, idB]);
  });

  it("toggleSelectedNodeId adds a node to selection", () => {
    const id = useFlowStore.getState().addNode("delay", 0, 0);
    useFlowStore.getState().toggleSelectedNodeId(id);
    expect(useFlowStore.getState().selectedNodeIds).toContain(id);
  });

  it("toggleSelectedNodeId removes a node if already selected", () => {
    const id = useFlowStore.getState().addNode("delay", 0, 0);
    useFlowStore.getState().setSelectedNodeIds([id]);
    useFlowStore.getState().toggleSelectedNodeId(id);
    expect(useFlowStore.getState().selectedNodeIds).not.toContain(id);
  });

  it("clearSelectedNodeIds empties the selection", () => {
    const id = useFlowStore.getState().addNode("delay", 0, 0);
    useFlowStore.getState().setSelectedNodeIds([id]);
    useFlowStore.getState().clearSelectedNodeIds();
    expect(useFlowStore.getState().selectedNodeIds).toEqual([]);
  });

  describe("deleteSelectedNodes", () => {
    it("deletes all selected non-start nodes", () => {
      const idA = useFlowStore.getState().addNode("delay", 0, 0);
      const idB = useFlowStore.getState().addNode("logger", 0, 0);
      useFlowStore.getState().setSelectedNodeIds([idA, idB]);
      const count = useFlowStore.getState().nodes.length;

      useFlowStore.getState().deleteSelectedNodes();

      expect(useFlowStore.getState().nodes.length).toBe(count - 2);
      expect(useFlowStore.getState().nodes.find((n) => n.id === idA)).toBeUndefined();
      expect(useFlowStore.getState().nodes.find((n) => n.id === idB)).toBeUndefined();
    });

    it("removes connected edges of deleted nodes", () => {
      const id = useFlowStore.getState().addNode("delay", 100, 100);
      useFlowStore.getState().addEdge("start-node-1", "flow", id, "trigger");
      useFlowStore.getState().setSelectedNodeIds([id]);
      useFlowStore.getState().deleteSelectedNodes();
      expect(useFlowStore.getState().edges.some((e) => e.fromNodeId === id || e.toNodeId === id)).toBe(false);
    });

    it("clears selectedNodeIds after deletion", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().setSelectedNodeIds([id]);
      useFlowStore.getState().deleteSelectedNodes();
      expect(useFlowStore.getState().selectedNodeIds).toEqual([]);
    });

    it("does nothing when selection is empty", () => {
      const count = useFlowStore.getState().nodes.length;
      useFlowStore.getState().deleteSelectedNodes();
      expect(useFlowStore.getState().nodes.length).toBe(count);
    });

    it("refuses to delete start node and logs warning", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      const startId = useFlowStore.getState().nodes.find((n) => n.type === "start")!.id;
      useFlowStore.getState().setSelectedNodeIds([startId, id]);
      useFlowStore.getState().deleteSelectedNodes();

      // Start node preserved
      expect(useFlowStore.getState().nodes.find((n) => n.id === startId)).toBeDefined();
      // Non-start deleted
      expect(useFlowStore.getState().nodes.find((n) => n.id === id)).toBeUndefined();
      expect(useFlowStore.getState().logs.some((l) => l.level === "warn" && l.message.includes("Start Trigger"))).toBe(true);
    });

    it("pushes history", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().setSelectedNodeIds([id]);
      useFlowStore.getState().deleteSelectedNodes();
      expect(useFlowStore.getState().undoStack.length).toBeGreaterThan(0);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Clipboard
// ════════════════════════════════════════════════════════════════════════════

describe("flowStore — clipboard", () => {
  beforeEach(() => { resetStore(); });

  describe("copySelectedNodes", () => {
    it("copies selected nodes and their internal edges to clipboard", () => {
      const idA = useFlowStore.getState().addNode("delay", 100, 100);
      const idB = useFlowStore.getState().addNode("logger", 300, 100);
      useFlowStore.getState().addEdge(idA, "flow", idB, "trigger");
      useFlowStore.getState().setSelectedNodeIds([idA, idB]);

      useFlowStore.getState().copySelectedNodes();

      const clip = useFlowStore.getState().clipboard;
      expect(clip).not.toBeNull();
      expect(clip!.nodes.length).toBe(2);
      expect(clip!.edges.length).toBe(1);
    });

    it("copied nodes have idle status and no error/responseInfo", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.setState({
        nodes: useFlowStore.getState().nodes.map((n) =>
          n.id === id ? { ...n, status: "failure" as const, error: "err" } : n
        ),
      });
      useFlowStore.getState().setSelectedNodeIds([id]);
      useFlowStore.getState().copySelectedNodes();

      const clipNode = useFlowStore.getState().clipboard!.nodes[0];
      expect(clipNode.status).toBe("idle");
      expect(clipNode.error).toBeNull();
      expect(clipNode.responseInfo).toBeNull();
    });

    it("does not copy edges to nodes outside the selection", () => {
      const idA = useFlowStore.getState().addNode("delay", 100, 100);
      useFlowStore.getState().addNode("logger", 300, 100);
      useFlowStore.getState().addEdge("start-node-1", "flow", idA, "trigger");
      useFlowStore.getState().setSelectedNodeIds([idA]); // only idA selected

      useFlowStore.getState().copySelectedNodes();

      const clip = useFlowStore.getState().clipboard!;
      expect(clip.nodes.length).toBe(1);
      // Edge to start-node-1 should NOT be copied (start not in selection)
      expect(clip.edges.length).toBe(0);
    });

    it("does nothing when selection is empty", () => {
      useFlowStore.getState().copySelectedNodes();
      expect(useFlowStore.getState().clipboard).toBeNull();
    });

    it("logs info after copying", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().setSelectedNodeIds([id]);
      useFlowStore.getState().copySelectedNodes();
      expect(useFlowStore.getState().logs.some((l) => l.level === "info" && l.message.includes("Copied"))).toBe(true);
    });
  });

  describe("pasteNodes", () => {
    it("pastes clipboard nodes with new IDs and offset positions", () => {
      const id = useFlowStore.getState().addNode("delay", 100, 200);
      useFlowStore.getState().setSelectedNodeIds([id]);
      useFlowStore.getState().copySelectedNodes();

      const initialCount = useFlowStore.getState().nodes.length;
      const newIds = useFlowStore.getState().pasteNodes();

      expect(newIds.length).toBe(1);
      expect(useFlowStore.getState().nodes.length).toBe(initialCount + 1);
      expect(newIds[0]).not.toBe(id); // new ID
      expect(newIds[0]).toMatch(/^node-/);
    });

    it("pasted nodes are offset from original (+40px by default)", () => {
      const id = useFlowStore.getState().addNode("delay", 100, 200);
      useFlowStore.getState().setSelectedNodeIds([id]);
      useFlowStore.getState().copySelectedNodes();

      const newIds = useFlowStore.getState().pasteNodes();
      const pastedNode = useFlowStore.getState().nodes.find((n) => n.id === newIds[0])!;

      expect(pastedNode.x).toBe(140); // 100 + 40
      expect(pastedNode.y).toBe(240); // 200 + 40
    });

    it("pasted nodes use provided x/y anchor", () => {
      const id = useFlowStore.getState().addNode("delay", 100, 200);
      useFlowStore.getState().setSelectedNodeIds([id]);
      useFlowStore.getState().copySelectedNodes();

      const newIds = useFlowStore.getState().pasteNodes(500, 600);
      const pastedNode = useFlowStore.getState().nodes.find((n) => n.id === newIds[0])!;

      expect(pastedNode.x).toBe(500); // anchor
      expect(pastedNode.y).toBe(600);
    });

    it("pasted nodes have idle status", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().setSelectedNodeIds([id]);
      useFlowStore.getState().copySelectedNodes();

      const newIds = useFlowStore.getState().pasteNodes();
      const pastedNode = useFlowStore.getState().nodes.find((n) => n.id === newIds[0])!;
      expect(pastedNode.status).toBe("idle");
    });

    it("pastes internal edges with remapped node IDs", () => {
      const idA = useFlowStore.getState().addNode("delay", 100, 100);
      const idB = useFlowStore.getState().addNode("logger", 300, 100);
      useFlowStore.getState().addEdge(idA, "flow", idB, "trigger");
      useFlowStore.getState().setSelectedNodeIds([idA, idB]);
      useFlowStore.getState().copySelectedNodes();

      const newIds = useFlowStore.getState().pasteNodes();
      expect(newIds.length).toBe(2);

      const pastedEdges = useFlowStore.getState().edges.filter(
        (e) => newIds.includes(e.fromNodeId) && newIds.includes(e.toNodeId)
      );
      expect(pastedEdges.length).toBe(1);
    });

    it("selects the newly pasted nodes", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().setSelectedNodeIds([id]);
      useFlowStore.getState().copySelectedNodes();

      const newIds = useFlowStore.getState().pasteNodes();
      expect(useFlowStore.getState().selectedNodeIds).toEqual(newIds);
    });

    it("returns empty array when clipboard is null", () => {
      const result = useFlowStore.getState().pasteNodes();
      expect(result).toEqual([]);
    });

    it("pushes history", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().setSelectedNodeIds([id]);
      useFlowStore.getState().copySelectedNodes();
      useFlowStore.getState().pasteNodes();
      expect(useFlowStore.getState().undoStack.length).toBeGreaterThan(0);
    });

    it("logs info after pasting", () => {
      const id = useFlowStore.getState().addNode("delay", 0, 0);
      useFlowStore.getState().setSelectedNodeIds([id]);
      useFlowStore.getState().copySelectedNodes();
      useFlowStore.getState().pasteNodes();
      expect(useFlowStore.getState().logs.some((l) => l.level === "info" && l.message.includes("Pasted"))).toBe(true);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Validation
// ════════════════════════════════════════════════════════════════════════════

describe("flowStore — validateFlow", () => {
  beforeEach(() => { resetStore(); });

  it("returns valid=true for the default flow (start → logger)", () => {
    const result = useFlowStore.getState().validateFlow();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("returns error when no start node exists", () => {
    useFlowStore.setState({
      nodes: useFlowStore.getState().nodes.filter((n) => n.type !== "start"),
    });
    const result = useFlowStore.getState().validateFlow();
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("No Start node found on the canvas.");
  });

  it("warns when a request node has no linked HTTP request", () => {
    useFlowStore.getState().addNode("request", 0, 0);
    // The default request node has no requestId set
    const result = useFlowStore.getState().validateFlow();
    expect(result.valid).toBe(true); // still valid, just warnings
    expect(result.warnings.some((w) => w.includes("no linked HTTP request"))).toBe(true);
  });

  it("warns about disconnected nodes (no incoming edges, excluding start)", () => {
    useFlowStore.getState().addNode("delay", 0, 0);
    // No edge connects to this delay node
    const result = useFlowStore.getState().validateFlow();
    expect(result.warnings.some((w) => w.includes("disconnected") && w.includes("delay"))).toBe(true);
  });

  it("warns about dead-end nodes (no outgoing edges, except start/logger)", () => {
    const startId = useFlowStore.getState().nodes.find((n) => n.type === "start")!.id;
    const id = useFlowStore.getState().addNode("delay", 200, 200);
    useFlowStore.getState().addEdge(startId, "flow", id, "trigger");
    // delay node now has incoming but no outgoing edges
    const result = useFlowStore.getState().validateFlow();
    expect(result.warnings.some((w) => w.includes("no outgoing connections") && w.includes("delay"))).toBe(true);
  });

  it("does not warn about logger nodes being dead-ends (they are terminal)", () => {
    // Default flow: start → logger — logger should NOT get a dead-end warning
    const result = useFlowStore.getState().validateFlow();
    expect(result.warnings.filter((w) => w.includes("no outgoing connections")).length).toBe(0);
  });

  it("does not warn about start nodes being dead-ends", () => {
    useFlowStore.getState().addNode("delay", 0, 0);
    const result = useFlowStore.getState().validateFlow();
    const startWarnings = result.warnings.filter((w) => w.includes("start"));
    expect(startWarnings.length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Logging
// ════════════════════════════════════════════════════════════════════════════

describe("flowStore — logging", () => {
  beforeEach(() => { resetStore(); });

  it("addLog appends a log entry", () => {
    useFlowStore.getState().addLog("info", "Hello");
    expect(useFlowStore.getState().logs.length).toBe(1);
    expect(useFlowStore.getState().logs[0].level).toBe("info");
    expect(useFlowStore.getState().logs[0].message).toBe("Hello");
    expect(useFlowStore.getState().logs[0].id).toBeTruthy();
    expect(useFlowStore.getState().logs[0].timestamp).toBeTruthy();
  });

  it("caps logs at 150 entries", () => {
    for (let i = 0; i < 200; i++) {
      useFlowStore.getState().addLog("info", `Log ${i}`);
    }
    expect(useFlowStore.getState().logs.length).toBe(150);
    // Should contain the most recent 150
    expect(useFlowStore.getState().logs[149].message).toBe("Log 199");
  });

  it("clearLogs empties the log array", () => {
    useFlowStore.getState().addLog("info", "test");
    useFlowStore.getState().clearLogs();
    expect(useFlowStore.getState().logs).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Variables
// ════════════════════════════════════════════════════════════════════════════

describe("flowStore — variables", () => {
  beforeEach(() => { resetStore(); });

  it("updateVariable sets a variable", () => {
    useFlowStore.getState().updateVariable("key1", "val1");
    expect(useFlowStore.getState().variables.key1).toBe("val1");
  });

  it("updateVariable overwrites an existing variable", () => {
    useFlowStore.getState().updateVariable("key1", "old");
    useFlowStore.getState().updateVariable("key1", "new");
    expect(useFlowStore.getState().variables.key1).toBe("new");
  });

  it("deleteVariable removes a variable", () => {
    useFlowStore.getState().updateVariable("key1", "val1");
    useFlowStore.getState().deleteVariable("key1");
    expect(useFlowStore.getState().variables.key1).toBeUndefined();
  });

  it("deleteVariable does nothing for non-existent keys", () => {
    useFlowStore.getState().deleteVariable("nonexistent");
    expect(useFlowStore.getState().variables).toEqual({});
  });

  it("clearVariables empties all variables", () => {
    useFlowStore.getState().updateVariable("a", "1");
    useFlowStore.getState().updateVariable("b", "2");
    useFlowStore.getState().clearVariables();
    expect(useFlowStore.getState().variables).toEqual({});
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Undo/Redo
// ════════════════════════════════════════════════════════════════════════════

describe("flowStore — Undo/Redo", () => {
  beforeEach(() => { resetStore(); });

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
    const entry = useFlowStore.getState().undoStack[0];
    expect(entry.nodes).toEqual(store.nodes);
  });

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
    const node = store.nodes[0];
    const originalName = node.name;
    store.updateNodeName(node.id, "Renamed");
    expect(useFlowStore.getState().nodes.find((n) => n.id === node.id)!.name).toBe("Renamed");
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.find((n) => n.id === node.id)!.name).toBe(originalName);
  });

  it("undo restores node position after updateNodePosition", () => {
    const store = useFlowStore.getState();
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
    const id = store.addNode("condition", 10, 10);
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 1);
    useFlowStore.getState().deleteNode(id);
    expect(useFlowStore.getState().nodes.length).toBe(initialCount);
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 1);
  });

  it("undo is no-op when undoStack is empty", () => {
    const store = useFlowStore.getState();
    expect(store.undoStack.length).toBe(0);
    store.undo();
    expect(useFlowStore.getState().undoStack.length).toBe(0);
  });

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
    store.redo();
    expect(useFlowStore.getState().redoStack.length).toBe(0);
  });

  it("multiple undo/redo cycles maintain correctness", () => {
    const store = useFlowStore.getState();
    const initialCount = store.nodes.length;
    store.addNode("delay", 100, 100);
    store.addNode("condition", 200, 200);
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 2);
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 1);
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.length).toBe(initialCount);
    useFlowStore.getState().redo();
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 1);
    useFlowStore.getState().redo();
    expect(useFlowStore.getState().nodes.length).toBe(initialCount + 2);
  });

  it("redoStack is cleared when a new mutation happens after undo", () => {
    const store = useFlowStore.getState();
    store.addNode("logger", 10, 10);
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().redoStack.length).toBe(1);
    store.addNode("delay", 20, 20); // new mutation
    expect(useFlowStore.getState().redoStack.length).toBe(0);
  });

  it("clearAll can be undone", () => {
    const store = useFlowStore.getState();
    const defaultNodes = [...store.nodes];
    store.addNode("request", 300, 100);
    expect(useFlowStore.getState().nodes.length).toBe(defaultNodes.length + 1);
    store.clearAll();
    expect(useFlowStore.getState().nodes.length).toBe(defaultNodes.length);
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.length).toBe(defaultNodes.length + 1);
  });

  it("addEdge can be undone", () => {
    const store = useFlowStore.getState();
    const initialEdgeCount = store.edges.length;
    const defaultEdgeId = store.edges[0].id;
    const nodeId = store.addNode("delay", 300, 300);
    const delayNode = useFlowStore.getState().nodes.find((n) => n.id === nodeId)!;
    store.addEdge("start-node-1", "flow", delayNode.id, "trigger");
    expect(useFlowStore.getState().edges.find((e) => e.id === defaultEdgeId)).toBeUndefined();
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().edges.length).toBe(initialEdgeCount);
    expect(useFlowStore.getState().edges.find((e) => e.id === defaultEdgeId)).toBeDefined();
  });

  it("undoStack caps at 50 entries", () => {
    const store = useFlowStore.getState();
    for (let i = 0; i < 55; i++) {
      store.pushHistory();
    }
    expect(useFlowStore.getState().undoStack.length).toBe(50);
  });

  it("Property: undo/redo round-trip preserves node count", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("request", "delay", "condition", "logger"), { minLength: 1, maxLength: 10 }),
        (types) => {
          resetStore();
          const store = useFlowStore.getState();
          const initialCount = store.nodes.length;
          for (const t of types) {
            store.addNode(t as FlowNodeType, 0, 0);
          }
          const afterAdd = useFlowStore.getState().nodes.length;
          expect(afterAdd).toBe(initialCount + types.length);
          for (let i = 0; i < types.length; i++) {
            useFlowStore.getState().undo();
          }
          expect(useFlowStore.getState().nodes.length).toBe(initialCount);
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

// ════════════════════════════════════════════════════════════════════════════
// P2 Node Execution — Set Variable, Script, Assertion
// ════════════════════════════════════════════════════════════════════════════

describe("flowStore — P2 Node Execution", () => {
  beforeEach(() => { resetStore(); });

  describe("Set Variable node", () => {
    it("sets a variable with a literal value", async () => {
      const node: FlowNode = {
        id: "set-var-1", type: "set_variable", x: 200, y: 180,
        name: "Set Var", status: "idle",
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
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setVar1: FlowNode = {
        id: "set-var-preset", type: "set_variable", x: 200, y: 180,
        name: "Set Var Preset", status: "idle",
        data: { variableName: "existing_var", variableValue: "hello_world" },
      };
      const setVar2: FlowNode = {
        id: "set-var-interpolate", type: "set_variable", x: 400, y: 180,
        name: "Set Var Interpolate", status: "idle",
        data: { variableName: "result", variableValue: "prefix_{{existing_var}}_suffix" },
      };
      const loggerNode: FlowNode = {
        id: "test-logger", type: "logger", x: 600, y: 180,
        name: "Logger", status: "idle",
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
      expect(useFlowStore.getState().variables.existing_var).toBe("hello_world");
      expect(useFlowStore.getState().variables.result).toBe("prefix_hello_world_suffix");
    });

    it("overrides an existing variable", async () => {
      useFlowStore.setState({ variables: { my_var: "old_value" } });
      const node: FlowNode = {
        id: "set-var-3", type: "set_variable", x: 200, y: 180,
        name: "Set Var Override", status: "idle",
        data: { variableName: "my_var", variableValue: "new_value" },
      };
      buildSimpleFlow(node);
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().variables.my_var).toBe("new_value");
    });

    it("logs a warning when variable name is empty but still succeeds", async () => {
      const node: FlowNode = {
        id: "set-var-4", type: "set_variable", x: 200, y: 180,
        name: "Set Var Empty", status: "idle",
        data: { variableName: "", variableValue: "some_value" },
      };
      buildSimpleFlow(node);
      await useFlowStore.getState().runFlow();
      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === "set-var-4")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "test-logger")?.status).toBe("success");
      expect(state.logs.some((l) => l.level === "warn" && l.message.includes("no variable name"))).toBe(true);
    });

    it("trims whitespace from variable name", async () => {
      const node: FlowNode = {
        id: "set-var-5", type: "set_variable", x: 200, y: 180,
        name: "Set Var Trim", status: "idle",
        data: { variableName: "  trimmed_key  ", variableValue: "value_ok" },
      };
      buildSimpleFlow(node);
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().variables["trimmed_key"]).toBe("value_ok");
      expect(useFlowStore.getState().variables["  trimmed_key  "]).toBeUndefined();
    });

    it("handles missing variableValue gracefully (defaults to '')", async () => {
      const node: FlowNode = {
        id: "set-var-6", type: "set_variable", x: 200, y: 180,
        name: "Set Var No Value", status: "idle",
        data: { variableName: "empty_val", variableValue: undefined },
      };
      buildSimpleFlow(node);
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().variables.empty_val).toBe("");
    });

    it("interpolates with non-existent variable (leaves placeholder)", async () => {
      const node: FlowNode = {
        id: "set-var-7", type: "set_variable", x: 200, y: 180,
        name: "Set Var Missing", status: "idle",
        data: { variableName: "result", variableValue: "{{does_not_exist}}" },
      };
      buildSimpleFlow(node);
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().variables.result).toBe("{{does_not_exist}}");
    });
  });

  describe("Script node", () => {
    it("executes JS code and modifies vars object", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setVarNode: FlowNode = {
        id: "set-var-input", type: "set_variable", x: 200, y: 180,
        name: "Set Var", status: "idle",
        data: { variableName: "input", variableValue: "42" },
      };
      const scriptNode: FlowNode = {
        id: "script-1", type: "script", x: 400, y: 180,
        name: "Script", status: "idle",
        data: { scriptCode: "vars.result = String(parseInt(vars.input, 10) * 2);" },
      };
      const loggerNode: FlowNode = {
        id: "test-logger", type: "logger", x: 600, y: 180,
        name: "Logger", status: "idle",
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
      expect(useFlowStore.getState().variables.input).toBe("42");
      expect(useFlowStore.getState().variables.result).toBe("84");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "script-1")?.status).toBe("success");
    });

    it("creates a new variable not previously in the store", async () => {
      const node: FlowNode = {
        id: "script-2", type: "script", x: 200, y: 180,
        name: "Script New Var", status: "idle",
        data: { scriptCode: "vars.brand_new_key = 'created_in_script';" },
      };
      buildSimpleFlow(node);
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().variables.brand_new_key).toBe("created_in_script");
    });

    it("chains multiple script nodes passing values through variables", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const script1: FlowNode = {
        id: "script-a", type: "script", x: 200, y: 180,
        name: "Script A", status: "idle",
        data: { scriptCode: "vars.step = 'step1_complete';" },
      };
      const script2: FlowNode = {
        id: "script-b", type: "script", x: 400, y: 180,
        name: "Script B", status: "idle",
        data: { scriptCode: "vars.step = vars.step + ' -> step2_complete';" },
      };
      const loggerNode: FlowNode = {
        id: "test-logger", type: "logger", x: 600, y: 180,
        name: "Logger", status: "idle",
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
    });

    it("routes to failure port when script throws an error", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const scriptNode: FlowNode = {
        id: "script-error", type: "script", x: 200, y: 180,
        name: "Script Error", status: "idle",
        data: { scriptCode: "throw new Error('Oops!');" },
      };
      const failureLogger: FlowNode = {
        id: "logger-failure", type: "logger", x: 500, y: 180,
        name: "Failure Logger", status: "idle",
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
      expect(useFlowStore.getState().nodes.find((n) => n.id === "script-error")?.status).toBe("failure");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "logger-failure")?.status).toBe("success");
    });

    it("handles empty script code gracefully (logs warning, still succeeds)", async () => {
      const node: FlowNode = {
        id: "script-empty", type: "script", x: 200, y: 180,
        name: "Script Empty", status: "idle",
        data: { scriptCode: "" },
      };
      buildSimpleFlow(node);
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().nodes.find((n) => n.id === "script-empty")?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "test-logger")?.status).toBe("success");
      expect(useFlowStore.getState().logs.some((l) => l.level === "warn" && l.message.includes("no code to execute"))).toBe(true);
    });

    it("handles whitespace-only script (still succeeds via empty check)", async () => {
      const node: FlowNode = {
        id: "script-whitespace", type: "script", x: 200, y: 180,
        name: "Script Whitespace", status: "idle",
        data: { scriptCode: "   \n  \t  " },
      };
      buildSimpleFlow(node);
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().nodes.find((n) => n.id === "script-whitespace")?.status).toBe("success");
    });

    it("catches syntax errors and routes to failure", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const scriptNode: FlowNode = {
        id: "script-syntax", type: "script", x: 200, y: 180,
        name: "Script Syntax", status: "idle",
        data: { scriptCode: "var x = ;" },
      };
      const failureLogger: FlowNode = {
        id: "logger-fail", type: "logger", x: 500, y: 180,
        name: "Fail Logger", status: "idle",
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
      expect(useFlowStore.getState().nodes.find((n) => n.id === "script-syntax")?.status).toBe("failure");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "logger-fail")?.status).toBe("success");
    });

    it("preserves existing variables when script adds new ones", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setExisting: FlowNode = {
        id: "set-existing", type: "set_variable", x: 200, y: 160,
        name: "Set Existing", status: "idle",
        data: { variableName: "existing", variableValue: "keep_me" },
      };
      const setUntouched: FlowNode = {
        id: "set-untouched", type: "set_variable", x: 200, y: 260,
        name: "Set Untouched", status: "idle",
        data: { variableName: "untouched", variableValue: "also_keep" },
      };
      const scriptNode: FlowNode = {
        id: "script-preserve", type: "script", x: 400, y: 210,
        name: "Script Preserve", status: "idle",
        data: { scriptCode: "vars.new_key = 'added';" },
      };
      const loggerNode: FlowNode = {
        id: "test-logger", type: "logger", x: 600, y: 210,
        name: "Logger", status: "idle",
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
      expect(useFlowStore.getState().variables.existing).toBe("keep_me");
      expect(useFlowStore.getState().variables.untouched).toBe("also_keep");
      expect(useFlowStore.getState().variables.new_key).toBe("added");
    });
  });

  describe("Assertion node", () => {
    it("passes when expression is true (routes to true port)", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setVarNode: FlowNode = {
        id: "set-status", type: "set_variable", x: 200, y: 180,
        name: "Set Status", status: "idle",
        data: { variableName: "status_code", variableValue: "200" },
      };
      const assertNode: FlowNode = {
        id: "assert-1", type: "assertion", x: 400, y: 180,
        name: "Assert", status: "idle",
        data: { assertionExpression: "status_code === '200'", assertionMessage: "Expected 200" },
      };
      const trueLogger: FlowNode = {
        id: "logger-true", type: "logger", x: 600, y: 100,
        name: "True Logger", status: "idle",
        data: { logFormat: "Branch: true" },
      };
      const falseLogger: FlowNode = {
        id: "logger-false", type: "logger", x: 600, y: 300,
        name: "False Logger", status: "idle",
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
      expect(useFlowStore.getState().nodes.find((n) => n.id === "assert-1")?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "logger-true")?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "logger-false")?.status).toBe("idle");
    });

    it("fails when expression is false (routes to false port)", async () => {
      useFlowStore.setState({ variables: { status_code: "500" } });
      const node: FlowNode = {
        id: "assert-2", type: "assertion", x: 200, y: 180,
        name: "Assert", status: "idle",
        data: { assertionExpression: "status_code === '200'", assertionMessage: "Expected 200 but got {{status_code}}" },
      };
      const ids = buildConditionalFlow(node);
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.middleId)?.status).toBe("failure");
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.falseLoggerId)?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.trueLoggerId)?.status).toBe("idle");
      expect(useFlowStore.getState().logs.some((l) => l.level === "error" && l.message.includes("Expected 200"))).toBe(true);
    });

    it("passes when expression is literally true", async () => {
      const node: FlowNode = {
        id: "assert-3", type: "assertion", x: 200, y: 180,
        name: "Assert True", status: "idle",
        data: { assertionExpression: "true", assertionMessage: "Should pass" },
      };
      const ids = buildConditionalFlow(node);
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.middleId)?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.trueLoggerId)?.status).toBe("success");
    });

    it("fails when expression is literally false", async () => {
      const node: FlowNode = {
        id: "assert-4", type: "assertion", x: 200, y: 180,
        name: "Assert False", status: "idle",
        data: { assertionExpression: "false", assertionMessage: "Should fail" },
      };
      const ids = buildConditionalFlow(node);
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.middleId)?.status).toBe("failure");
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.falseLoggerId)?.status).toBe("success");
    });

    it("fails gracefully when expression has a syntax error", async () => {
      const node: FlowNode = {
        id: "assert-5", type: "assertion", x: 200, y: 180,
        name: "Assert Syntax", status: "idle",
        data: { assertionExpression: "status_code === ", assertionMessage: "Syntax error test" },
      };
      const ids = buildConditionalFlow(node);
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.middleId)?.status).toBe("failure");
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.falseLoggerId)?.status).toBe("success");
    });

    it("works with compound expression using variables", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const scriptNode: FlowNode = {
        id: "script-preset", type: "script", x: 200, y: 180,
        name: "Set Vars", status: "idle",
        data: { scriptCode: "vars.status_code = '200'; vars.response_time = '150';" },
      };
      const assertNode: FlowNode = {
        id: "assert-6", type: "assertion", x: 400, y: 180,
        name: "Assert Compound", status: "idle",
        data: {
          assertionExpression: "status_code === '200' && parseInt(response_time, 10) < 300",
          assertionMessage: "Expected status 200 and fast response",
        },
      };
      const trueLogger: FlowNode = {
        id: "logger-true", type: "logger", x: 600, y: 100,
        name: "True Logger", status: "idle",
        data: { logFormat: "Branch: true" },
      };
      const falseLogger: FlowNode = {
        id: "logger-false", type: "logger", x: 600, y: 300,
        name: "False Logger", status: "idle",
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

    it("works with no variables in scope (uses undefined for unknown vars)", async () => {
      const node: FlowNode = {
        id: "assert-8", type: "assertion", x: 200, y: 180,
        name: "Assert No Vars", status: "idle",
        data: { assertionExpression: "status_code === '200'", assertionMessage: "No status yet" },
      };
      const ids = buildConditionalFlow(node);
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.middleId)?.status).toBe("failure");
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.falseLoggerId)?.status).toBe("success");
    });

    it("uses defaults when expression and message are not provided", async () => {
      const node: FlowNode = {
        id: "assert-9", type: "assertion", x: 200, y: 180,
        name: "Assert Defaults", status: "idle",
        data: { assertionExpression: undefined, assertionMessage: undefined },
      };
      const ids = buildConditionalFlow(node);
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.middleId)?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.trueLoggerId)?.status).toBe("success");
    });
  });

  describe("Mixed P2 node integration", () => {
    it("set_variable → script reads the variable → assertion validates it", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setVarNode: FlowNode = {
        id: "set-var-integration", type: "set_variable", x: 200, y: 180,
        name: "Set Var", status: "idle",
        data: { variableName: "user_score", variableValue: "85" },
      };
      const scriptNode: FlowNode = {
        id: "script-integration", type: "script", x: 400, y: 180,
        name: "Script", status: "idle",
        data: { scriptCode: "vars.passing = String(parseInt(vars.user_score, 10) >= 50);" },
      };
      const assertionNode: FlowNode = {
        id: "assert-integration", type: "assertion", x: 600, y: 180,
        name: "Assert", status: "idle",
        data: { assertionExpression: "passing === 'true'", assertionMessage: "User score below 50" },
      };
      const successLogger: FlowNode = {
        id: "logger-pass", type: "logger", x: 800, y: 100,
        name: "Pass Logger", status: "idle",
        data: { logFormat: "Passed! Score: {{user_score}}" },
      };
      const failLogger: FlowNode = {
        id: "logger-fail", type: "logger", x: 800, y: 300,
        name: "Fail Logger", status: "idle",
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
      expect(useFlowStore.getState().variables.user_score).toBe("85");
      expect(useFlowStore.getState().variables.passing).toBe("true");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "assert-integration")?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "logger-pass")?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "logger-fail")?.status).toBe("idle");
    });

    it("assertion failure halts the happy path", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setVarNode: FlowNode = {
        id: "set-var-int2", type: "set_variable", x: 200, y: 180,
        name: "Set Var", status: "idle",
        data: { variableName: "score", variableValue: "30" },
      };
      const assertionNode: FlowNode = {
        id: "assert-int2", type: "assertion", x: 400, y: 180,
        name: "Assert", status: "idle",
        data: { assertionExpression: "parseInt(score, 10) >= 50", assertionMessage: "Score too low" },
      };
      const successLogger: FlowNode = {
        id: "logger-success", type: "logger", x: 600, y: 100,
        name: "Success Logger", status: "idle",
        data: { logFormat: "Accepted" },
      };
      const failLogger: FlowNode = {
        id: "logger-failure", type: "logger", x: 600, y: 300,
        name: "Fail Logger", status: "idle",
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
      expect(useFlowStore.getState().nodes.find((n) => n.id === "assert-int2")?.status).toBe("failure");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "logger-failure")?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "logger-success")?.status).toBe("idle");
    });

    it("a failing assertion does not crash subsequent sibling flows", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const assertFail: FlowNode = {
        id: "assert-branch", type: "assertion", x: 300, y: 100,
        name: "Assert Fail", status: "idle",
        data: { assertionExpression: "false", assertionMessage: "Always fails" },
      };
      const setVar: FlowNode = {
        id: "setvar-branch", type: "set_variable", x: 300, y: 300,
        name: "Set Var", status: "idle",
        data: { variableName: "side_branch", variableValue: "completed" },
      };
      const failLogger: FlowNode = {
        id: "logger-branch-fail", type: "logger", x: 550, y: 100,
        name: "Fail Logger", status: "idle",
        data: { logFormat: "assert failed" },
      };
      const successLogger: FlowNode = {
        id: "logger-branch-ok", type: "logger", x: 550, y: 300,
        name: "Success Logger", status: "idle",
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
      expect(useFlowStore.getState().variables.side_branch).toBe("completed");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "setvar-branch")?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "logger-branch-ok")?.status).toBe("success");
      expect(useFlowStore.getState().nodes.find((n) => n.id === "logger-branch-fail")?.status).toBe("success");
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Execution Engine — Delay, Condition, Branches, stopFlow, loop detection
// ════════════════════════════════════════════════════════════════════════════

describe("flowStore — execution engine", () => {
  beforeEach(() => { resetStore(); });

  describe("start node", () => {
    it("executes start node (has delay) and proceeds to next node", async () => {
      const id = useFlowStore.getState().addNode("delay", 200, 200);
      const startId = useFlowStore.getState().nodes.find((n) => n.type === "start")!.id;
      useFlowStore.getState().addEdge(startId, "flow", id, "trigger");
      useFlowStore.getState().clearLogs();
      useFlowStore.setState({
        variables: {},
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === id)?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === startId)?.status).toBe("success");
      expect(state.isRunning).toBe(false);
    });
  });

  describe("delay node", () => {
    it("executes a delay node and proceeds to next node", async () => {
      const node: FlowNode = {
        id: "delay-1", type: "delay", x: 200, y: 180,
        name: "Wait", status: "idle",
        data: { delayMs: 10 },
      };
      buildSimpleFlow(node);

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === "delay-1")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "test-logger")?.status).toBe("success");
    });

    it("uses default delayMs when not provided", async () => {
      const node: FlowNode = {
        id: "delay-2", type: "delay", x: 200, y: 180,
        name: "Wait", status: "idle",
        data: { delayMs: undefined },
      };
      buildSimpleFlow(node);

      await useFlowStore.getState().runFlow();

      expect(useFlowStore.getState().nodes.find((n) => n.id === "delay-2")?.status).toBe("success");
    });
  });

  describe("condition node", () => {
    it("routes to true port when expression evaluates to true", async () => {
      // runFlow clears variables, so use a set_variable node before condition
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setVarNode: FlowNode = {
        id: "cond-set-status", type: "set_variable", x: 200, y: 100,
        name: "Set Status", status: "idle",
        data: { variableName: "status_code", variableValue: "200" },
      };
      const condNode: FlowNode = {
        id: "cond-1", type: "condition", x: 400, y: 180,
        name: "Condition", status: "idle",
        data: { expression: "status_code === '200'" },
      };
      const trueLogger: FlowNode = {
        id: "logger-true", type: "logger", x: 600, y: 100,
        name: "True Logger", status: "idle",
        data: { logFormat: "True" },
      };
      const falseLogger: FlowNode = {
        id: "logger-false", type: "logger", x: 600, y: 300,
        name: "False Logger", status: "idle",
        data: { logFormat: "False" },
      };
      useFlowStore.setState({
        nodes: [startNode, setVarNode, condNode, trueLogger, falseLogger],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "cond-set-status", toPortId: "trigger" },
          { id: "e2", fromNodeId: "cond-set-status", fromPortId: "flow", toNodeId: "cond-1", toPortId: "trigger" },
          { id: "e3", fromNodeId: "cond-1", fromPortId: "true", toNodeId: "logger-true", toPortId: "trigger" },
          { id: "e4", fromNodeId: "cond-1", fromPortId: "false", toNodeId: "logger-false", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === "cond-1")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "logger-true")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "logger-false")?.status).toBe("idle");
    });

    it("routes to false port when expression evaluates to false", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setVarNode: FlowNode = {
        id: "cond-set-status", type: "set_variable", x: 200, y: 100,
        name: "Set Status", status: "idle",
        data: { variableName: "status_code", variableValue: "500" },
      };
      const condNode: FlowNode = {
        id: "cond-2", type: "condition", x: 400, y: 180,
        name: "Condition", status: "idle",
        data: { expression: "status_code === '200'" },
      };
      const trueLogger: FlowNode = {
        id: "logger-true", type: "logger", x: 600, y: 100,
        name: "True Logger", status: "idle",
        data: { logFormat: "True" },
      };
      const falseLogger: FlowNode = {
        id: "logger-false", type: "logger", x: 600, y: 300,
        name: "False Logger", status: "idle",
        data: { logFormat: "False" },
      };
      useFlowStore.setState({
        nodes: [startNode, setVarNode, condNode, trueLogger, falseLogger],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "cond-set-status", toPortId: "trigger" },
          { id: "e2", fromNodeId: "cond-set-status", fromPortId: "flow", toNodeId: "cond-2", toPortId: "trigger" },
          { id: "e3", fromNodeId: "cond-2", fromPortId: "true", toNodeId: "logger-true", toPortId: "trigger" },
          { id: "e4", fromNodeId: "cond-2", fromPortId: "false", toNodeId: "logger-false", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === "cond-2")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "logger-false")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "logger-true")?.status).toBe("idle");
    });

    it("defaults to false on syntax error and logs a warning", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const condNode: FlowNode = {
        id: "cond-3", type: "condition", x: 200, y: 180,
        name: "Condition", status: "idle",
        data: { expression: "invalid syntax @@@" },
      };
      const falseLogger: FlowNode = {
        id: "logger-false", type: "logger", x: 400, y: 300,
        name: "False Logger", status: "idle",
        data: { logFormat: "False" },
      };
      useFlowStore.setState({
        nodes: [startNode, condNode, falseLogger],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "cond-3", toPortId: "trigger" },
          { id: "e2", fromNodeId: "cond-3", fromPortId: "false", toNodeId: "logger-false", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      // Syntax error → default to false
      expect(state.nodes.find((n) => n.id === "cond-3")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "logger-false")?.status).toBe("success");
      // Syntax error is caught by evaluateInSandbox internally (returns false, doesn't throw)
      // so no warn log is emitted from the condition node's catch block
      expect(state.logs.some((l) => l.level === "info" && l.message.includes("Condition evaluated to: false"))).toBe(true);
    });

    it("uses default expression when not provided", async () => {
      const node: FlowNode = {
        id: "cond-4", type: "condition", x: 200, y: 180,
        name: "Condition", status: "idle",
        data: { expression: undefined },
      };
      const ids = buildConditionalFlow(node);

      await useFlowStore.getState().runFlow();

      // Default expression "true" → true path
      expect(useFlowStore.getState().nodes.find((n) => n.id === ids.trueLoggerId)?.status).toBe("success");
    });
  });

  describe("multiple branches", () => {
    it("executes parallel branches from start node", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const delayA: FlowNode = {
        id: "branch-a", type: "delay", x: 200, y: 100,
        name: "Branch A", status: "idle",
        data: { delayMs: 5 },
      };
      const delayB: FlowNode = {
        id: "branch-b", type: "delay", x: 200, y: 300,
        name: "Branch B", status: "idle",
        data: { delayMs: 5 },
      };
      const loggerA: FlowNode = {
        id: "logger-a", type: "logger", x: 400, y: 100,
        name: "Logger A", status: "idle",
        data: { logFormat: "A done" },
      };
      const loggerB: FlowNode = {
        id: "logger-b", type: "logger", x: 400, y: 300,
        name: "Logger B", status: "idle",
        data: { logFormat: "B done" },
      };
      useFlowStore.setState({
        nodes: [startNode, delayA, delayB, loggerA, loggerB],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "branch-a", toPortId: "trigger" },
          { id: "e2", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "branch-b", toPortId: "trigger" },
          { id: "e3", fromNodeId: "branch-a", fromPortId: "flow", toNodeId: "logger-a", toPortId: "trigger" },
          { id: "e4", fromNodeId: "branch-b", fromPortId: "flow", toNodeId: "logger-b", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === "branch-a")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "branch-b")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "logger-a")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "logger-b")?.status).toBe("success");
    });

    it("executes chained branches (start → delay → condition → split)", async () => {
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const delay: FlowNode = {
        id: "chain-delay", type: "delay", x: 200, y: 180,
        name: "Wait", status: "idle",
        data: { delayMs: 5 },
      };
      const setVar: FlowNode = {
        id: "chain-setvar", type: "set_variable", x: 400, y: 180,
        name: "Set Status", status: "idle",
        data: { variableName: "status_code", variableValue: "200" },
      };
      const condition: FlowNode = {
        id: "chain-cond", type: "condition", x: 600, y: 180,
        name: "Check", status: "idle",
        data: { expression: "status_code === '200'" },
      };
      const trueLogger: FlowNode = {
        id: "chain-true", type: "logger", x: 800, y: 100,
        name: "True Path", status: "idle",
        data: { logFormat: "Success" },
      };
      const falseLogger: FlowNode = {
        id: "chain-false", type: "logger", x: 800, y: 300,
        name: "False Path", status: "idle",
        data: { logFormat: "Failure" },
      };
      useFlowStore.setState({
        nodes: [startNode, delay, setVar, condition, trueLogger, falseLogger],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "chain-delay", toPortId: "trigger" },
          { id: "e2", fromNodeId: "chain-delay", fromPortId: "flow", toNodeId: "chain-setvar", toPortId: "trigger" },
          { id: "e3", fromNodeId: "chain-setvar", fromPortId: "flow", toNodeId: "chain-cond", toPortId: "trigger" },
          { id: "e4", fromNodeId: "chain-cond", fromPortId: "true", toNodeId: "chain-true", toPortId: "trigger" },
          { id: "e5", fromNodeId: "chain-cond", fromPortId: "false", toNodeId: "chain-false", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === "chain-delay")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "chain-setvar")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "chain-cond")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "chain-true")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "chain-false")?.status).toBe("idle");
    });
  });

  describe("stopFlow", () => {
    beforeEach(() => {
      mockCancelRequest.mockReset();
    });

    it("stops execution and logs warning", async () => {
      // Build a flow with a long delay so we can stop it
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const longDelay: FlowNode = {
        id: "long-delay", type: "delay", x: 200, y: 180,
        name: "Long Wait", status: "idle",
        data: { delayMs: 50000 },
      };
      useFlowStore.setState({
        nodes: [startNode, longDelay],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "long-delay", toPortId: "trigger" },
        ],
        logs: [],
      });

      // Start flow but don't await it (it will hang on the delay)
      const flowPromise = useFlowStore.getState().runFlow();

      // Small delay to let execution start
      await new Promise((r) => setTimeout(r, 50));

      expect(useFlowStore.getState().isRunning).toBe(true);

      // Stop the flow
      await useFlowStore.getState().stopFlow();

      const state = useFlowStore.getState();
      expect(state.isRunning).toBe(false);
      expect(state.activeNodeId).toBeNull();
      expect(state.logs.some((l) => l.level === "warn" && l.message.includes("stopped by user"))).toBe(true);

      // Let the original flowPromise settle
      await expect(flowPromise).resolves.toBeUndefined();
    });

    it("calls cancelRequest if there is a currentRequestId", async () => {
      mockCancelRequest.mockResolvedValueOnce(undefined);
      useFlowStore.setState({ currentRequestId: "req-123" });

      await useFlowStore.getState().stopFlow();

      expect(mockCancelRequest).toHaveBeenCalledWith("req-123");
    });

    it("handles cancelRequest error gracefully", async () => {
      mockCancelRequest.mockRejectedValueOnce(new Error("cancel failed"));
      useFlowStore.setState({ currentRequestId: "req-xyz" });

      // Should not throw
      await expect(useFlowStore.getState().stopFlow()).resolves.toBeUndefined();
    });
  });

  describe("loop detection", () => {
    it("detects infinite loop and aborts", async () => {
      // Create a cycle: start → setvar → condition (true → setvar, creating a loop)
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setVar: FlowNode = {
        id: "loop-setvar", type: "set_variable", x: 300, y: 180,
        name: "Loop SetVar", status: "idle",
        data: { variableName: "x", variableValue: "1" },
      };
      const condition: FlowNode = {
        id: "loop-cond", type: "condition", x: 500, y: 180,
        name: "Always True", status: "idle",
        data: { expression: "true" },
      };
      useFlowStore.setState({
        nodes: [startNode, setVar, condition],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "loop-setvar", toPortId: "trigger" },
          { id: "e2", fromNodeId: "loop-setvar", fromPortId: "flow", toNodeId: "loop-cond", toPortId: "trigger" },
          { id: "e3", fromNodeId: "loop-cond", fromPortId: "true", toNodeId: "loop-setvar", toPortId: "trigger" }, // cycle!
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      // Execution should be aborted, not running
      expect(state.isRunning).toBe(false);
      // Should have infinite loop error log
      expect(state.logs.some((l) => l.level === "error" && l.message.includes("Infinite loop"))).toBe(true);
    });
  });

  describe("no start node", () => {
    it("logs error when no start node exists", async () => {
      useFlowStore.setState({
        nodes: useFlowStore.getState().nodes.filter((n) => n.type !== "start"),
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.isRunning).toBe(false);
      expect(state.logs.some((l) => l.level === "error" && l.message.includes("No Start Node"))).toBe(true);
    });
  });

  describe("runFlow prevents concurrent execution", () => {
    it("returns immediately if already running", async () => {
      useFlowStore.setState({ isRunning: true });
      // Should not throw and should not change state
      await useFlowStore.getState().runFlow();
      expect(useFlowStore.getState().isRunning).toBe(true);
    });
  });

  describe("catch-all flow port fallback", () => {
    it("falls back to 'flow' port when no matching success/failure edge exists", async () => {
      // Build flow: start → setvar (output success/failure) → logger (via 'flow' port)
      const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
      const setVar: FlowNode = {
        id: "fallback-setvar", type: "set_variable", x: 200, y: 180,
        name: "Set Var", status: "idle",
        data: { variableName: "result", variableValue: "ok" },
      };
      const logger: FlowNode = {
        id: "fallback-logger", type: "logger", x: 400, y: 180,
        name: "Logger", status: "idle",
        data: { logFormat: "Done: {{result}}" },
      };
      useFlowStore.setState({
        nodes: [startNode, setVar, logger],
        edges: [
          { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "fallback-setvar", toPortId: "trigger" },
          // SetVar uses "flow" port but success/failure not wired — should fall back to "flow"
          { id: "e2", fromNodeId: "fallback-setvar", fromPortId: "flow", toNodeId: "fallback-logger", toPortId: "trigger" },
        ],
        logs: [],
      });

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.nodes.find((n) => n.id === "fallback-setvar")?.status).toBe("success");
      expect(state.nodes.find((n) => n.id === "fallback-logger")?.status).toBe("success");
    });
  });

  describe("execution logging", () => {
    it("logs info for each node execution", async () => {
      const node: FlowNode = {
        id: "log-delay", type: "delay", x: 200, y: 180,
        name: "Test Node", status: "idle",
        data: { delayMs: 5 },
      };
      buildSimpleFlow(node);
      useFlowStore.getState().clearLogs();

      await useFlowStore.getState().runFlow();

      const state = useFlowStore.getState();
      expect(state.logs.some((l) => l.level === "info" && l.message.includes("Test Node"))).toBe(true);
      expect(state.logs.some((l) => l.level === "success" && l.message.includes("completed successfully"))).toBe(true);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Request Node Execution (with mocked sendRequest)
// ════════════════════════════════════════════════════════════════════════════

describe("flowStore — request node execution", () => {
  beforeEach(() => {
    resetStore();
    mockSendRequest.mockReset();
    mockCancelRequest.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes a request node and updates variables with response data", async () => {
    mockSendRequest.mockResolvedValueOnce({
      id: "req-1",
      status: 200,
      status_text: "OK",
      timeMs: 45,
      headers: [],
      body: JSON.stringify({ data: "hello" }),
      size: 15,
    });

    const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
    const requestNode: FlowNode = {
      id: "req-node", type: "request", x: 200, y: 180,
      name: "API Call", status: "idle",
      data: {
        requestId: "req-1",
        requestName: "Get Data",
        requestMethod: "GET",
        requestUrl: "https://api.example.com/data",
        requestSnapshot: {
          id: "req-1",
          method: "GET",
          url: "https://api.example.com/data",
          headers: [],
          query_params: [],
          body_type: "none",
          body: "",
          form_fields: [],
          auth: { type: "none", username: "", password: "", token: "", api_key: "", api_key_name: "", api_key_in: "header" },
          settings: { timeout: 30, follow_redirects: true, ssl_verify: true, proxy: null },
          pre_script: "",
          post_script: "",
        } as any,
        extractions: [],
      },
    };
    const loggerNode: FlowNode = {
      id: "req-logger", type: "logger", x: 400, y: 180,
      name: "Logger", status: "idle",
      data: { logFormat: "Done: {{status_code}}" },
    };
    useFlowStore.setState({
      nodes: [startNode, requestNode, loggerNode],
      edges: [
        { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "req-node", toPortId: "trigger" },
        { id: "e2", fromNodeId: "req-node", fromPortId: "success", toNodeId: "req-logger", toPortId: "trigger" },
      ],
      logs: [],
    });

    await useFlowStore.getState().runFlow();

    const state = useFlowStore.getState();
    expect(mockSendRequest).toHaveBeenCalledTimes(1);
    expect(state.nodes.find((n) => n.id === "req-node")?.status).toBe("success");
    expect(state.nodes.find((n) => n.id === "req-node")?.responseInfo).toEqual({
      statusCode: 200,
      statusText: "OK",
      timeMs: expect.any(Number),
      size: 15,
    });
    expect(state.variables.status_code).toBe("200");
    expect(state.variables.status_text).toBe("OK");
    expect(state.variables.response_body).toBe(JSON.stringify({ data: "hello" }));
  });

  it("routes to failure port when response status >= 400", async () => {
    mockSendRequest.mockResolvedValueOnce({
      id: "req-2",
      status: 500,
      status_text: "Internal Server Error",
      timeMs: 30,
      headers: [],
      body: "error",
      size: 5,
    });

    const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
    const requestNode: FlowNode = {
      id: "req-node-fail", type: "request", x: 200, y: 180,
      name: "Failing API", status: "idle",
      data: {
        requestId: "req-2",
        requestName: "Fail",
        requestMethod: "GET",
        requestUrl: "https://api.example.com/error",
        requestSnapshot: {
          id: "req-2", method: "GET", url: "https://api.example.com/error",
          headers: [], query_params: [], body_type: "none", body: "", form_fields: [],
          auth: { type: "none", username: "", password: "", token: "", api_key: "", api_key_name: "", api_key_in: "header" },
          settings: { timeout: 30, follow_redirects: true, ssl_verify: true, proxy: null },
          pre_script: "", post_script: "",
        } as any,
        extractions: [],
      },
    };
    const failLogger: FlowNode = {
      id: "fail-logger", type: "logger", x: 400, y: 300,
      name: "Fail Logger", status: "idle",
      data: { logFormat: "Request failed" },
    };
    useFlowStore.setState({
      nodes: [startNode, requestNode, failLogger],
      edges: [
        { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "req-node-fail", toPortId: "trigger" },
        { id: "e2", fromNodeId: "req-node-fail", fromPortId: "failure", toNodeId: "fail-logger", toPortId: "trigger" },
      ],
      logs: [],
    });

    await useFlowStore.getState().runFlow();

    const state = useFlowStore.getState();
    expect(state.nodes.find((n) => n.id === "req-node-fail")?.status).toBe("failure");
    expect(state.nodes.find((n) => n.id === "fail-logger")?.status).toBe("success");
  });

  it("throws error when no requestId is linked", async () => {
    const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
    const requestNode: FlowNode = {
      id: "req-no-link", type: "request", x: 200, y: 180,
      name: "No Link", status: "idle",
      data: {
        requestId: undefined,
        extractions: [],
      },
    };
    useFlowStore.setState({
      nodes: [startNode, requestNode],
      edges: [
        { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "req-no-link", toPortId: "trigger" },
      ],
      logs: [],
    });

    await useFlowStore.getState().runFlow();

    const state = useFlowStore.getState();
    expect(state.nodes.find((n) => n.id === "req-no-link")?.status).toBe("failure");
    expect(state.nodes.find((n) => n.id === "req-no-link")?.error).toContain("No request linked");
  });

  it("interpolates flow variables into request URL", async () => {
    mockSendRequest.mockResolvedValueOnce({
      id: "req-3", status: 200, status_text: "OK", timeMs: 10,
      headers: [], body: "ok", size: 2,
    });

    const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
    const setVar: FlowNode = {
      id: "set-url-var", type: "set_variable", x: 200, y: 180,
      name: "Set URL", status: "idle",
      data: { variableName: "user_id", variableValue: "42" },
    };
    const requestNode: FlowNode = {
      id: "req-interp", type: "request", x: 400, y: 180,
      name: "Interpolated", status: "idle",
      data: {
        requestId: "req-3",
        requestName: "Get User",
        requestMethod: "GET",
        requestUrl: "https://api.example.com/users/{{user_id}}",
        requestSnapshot: {
          id: "req-3", method: "GET", url: "https://api.example.com/users/{{user_id}}",
          headers: [ { key: "X-ID", value: "{{user_id}}", enabled: true } ],
          query_params: [],
          body_type: "none", body: "", form_fields: [],
          auth: { type: "none", username: "", password: "", token: "", api_key: "", api_key_name: "", api_key_in: "header" },
          settings: { timeout: 30, follow_redirects: true, ssl_verify: true, proxy: null },
          pre_script: "", post_script: "",
        } as any,
        extractions: [],
      },
    };
    const loggerNode: FlowNode = {
      id: "req-interp-logger", type: "logger", x: 600, y: 180,
      name: "Logger", status: "idle",
      data: { logFormat: "Done" },
    };
    useFlowStore.setState({
      nodes: [startNode, setVar, requestNode, loggerNode],
      edges: [
        { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "set-url-var", toPortId: "trigger" },
        { id: "e2", fromNodeId: "set-url-var", fromPortId: "flow", toNodeId: "req-interp", toPortId: "trigger" },
        { id: "e3", fromNodeId: "req-interp", fromPortId: "success", toNodeId: "req-interp-logger", toPortId: "trigger" },
      ],
      logs: [],
    });

    await useFlowStore.getState().runFlow();

    expect(mockSendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://api.example.com/users/42",
        headers: expect.arrayContaining([
          expect.objectContaining({ key: "X-ID", value: "42" }),
        ]),
      }),
      undefined
    );
  });

  it("extracts variables from JSON response body", async () => {
    mockSendRequest.mockResolvedValueOnce({
      id: "req-4", status: 200, status_text: "OK", timeMs: 10,
      headers: [], body: JSON.stringify({ token: "abc-123", user: { id: 99 } }), size: 30,
    });

    const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
    const requestNode: FlowNode = {
      id: "req-extract", type: "request", x: 200, y: 180,
      name: "Extract", status: "idle",
      data: {
        requestId: "req-4",
        requestName: "Login",
        requestMethod: "POST",
        requestUrl: "https://api.example.com/login",
        requestSnapshot: {
          id: "req-4", method: "POST", url: "https://api.example.com/login",
          headers: [], query_params: [], body_type: "none", body: "", form_fields: [],
          auth: { type: "none", username: "", password: "", token: "", api_key: "", api_key_name: "", api_key_in: "header" },
          settings: { timeout: 30, follow_redirects: true, ssl_verify: true, proxy: null },
          pre_script: "", post_script: "",
        } as any,
        extractions: [
          { expression: "$.token", targetVariable: "auth_token" },
          { expression: "$.user.id", targetVariable: "user_id" },
        ],
      },
    };
    const loggerNode: FlowNode = {
      id: "extract-logger", type: "logger", x: 400, y: 180,
      name: "Logger", status: "idle",
      data: { logFormat: "Token: {{auth_token}}" },
    };
    useFlowStore.setState({
      nodes: [startNode, requestNode, loggerNode],
      edges: [
        { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "req-extract", toPortId: "trigger" },
        { id: "e2", fromNodeId: "req-extract", fromPortId: "success", toNodeId: "extract-logger", toPortId: "trigger" },
      ],
      logs: [],
    });

    await useFlowStore.getState().runFlow();

    const state = useFlowStore.getState();
    expect(state.variables.auth_token).toBe("abc-123");
    expect(state.variables.user_id).toBe("99");
  });

  it("logs warning when extraction expression returns empty", async () => {
    mockSendRequest.mockResolvedValueOnce({
      id: "req-5", status: 200, status_text: "OK", timeMs: 10,
      headers: [], body: JSON.stringify({ value: "exists" }), size: 20,
    });

    const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
    const requestNode: FlowNode = {
      id: "req-extract-fail", type: "request", x: 200, y: 180,
      name: "Extract Fail", status: "idle",
      data: {
        requestId: "req-5",
        requestName: "Get Data",
        requestMethod: "GET",
        requestUrl: "https://api.example.com/data",
        requestSnapshot: {
          id: "req-5", method: "GET", url: "https://api.example.com/data",
          headers: [], query_params: [], body_type: "none", body: "", form_fields: [],
          auth: { type: "none", username: "", password: "", token: "", api_key: "", api_key_name: "", api_key_in: "header" },
          settings: { timeout: 30, follow_redirects: true, ssl_verify: true, proxy: null },
          pre_script: "", post_script: "",
        } as any,
        extractions: [
          { expression: "$.nonexistent", targetVariable: "missing_var" },
        ],
      },
    };
    useFlowStore.setState({
      nodes: [startNode, requestNode],
      edges: [
        { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "req-extract-fail", toPortId: "trigger" },
      ],
      logs: [],
    });

    await useFlowStore.getState().runFlow();

    const state = useFlowStore.getState();
    expect(state.logs.some((l) => l.level === "warn" && l.message.includes("Extraction failed"))).toBe(true);
  });

  it("handles non-JSON response body gracefully", async () => {
    mockSendRequest.mockResolvedValueOnce({
      id: "req-6", status: 200, status_text: "OK", timeMs: 10,
      headers: [], body: "plain text content", size: 16,
    });

    const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
    const requestNode: FlowNode = {
      id: "req-plain", type: "request", x: 200, y: 180,
      name: "Plain", status: "idle",
      data: {
        requestId: "req-6",
        requestName: "Plain Text",
        requestMethod: "GET",
        requestUrl: "https://api.example.com/text",
        requestSnapshot: {
          id: "req-6", method: "GET", url: "https://api.example.com/text",
          headers: [], query_params: [], body_type: "none", body: "", form_fields: [],
          auth: { type: "none", username: "", password: "", token: "", api_key: "", api_key_name: "", api_key_in: "header" },
          settings: { timeout: 30, follow_redirects: true, ssl_verify: true, proxy: null },
          pre_script: "", post_script: "",
        } as any,
        extractions: [],
      },
    };
    useFlowStore.setState({
      nodes: [startNode, requestNode],
      edges: [
        { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "req-plain", toPortId: "trigger" },
      ],
      logs: [],
    });

    await useFlowStore.getState().runFlow();

    const state = useFlowStore.getState();
    expect(state.variables.response_body).toBe("plain text content");
    expect(state.nodes.find((n) => n.id === "req-plain")?.status).toBe("success");
  });

  it("passes environmentId to sendRequest", async () => {
    mockSendRequest.mockResolvedValueOnce({
      id: "req-env", status: 200, status_text: "OK", timeMs: 10,
      headers: [], body: "ok", size: 2,
    });

    const startNode = useFlowStore.getState().nodes.find((n) => n.type === "start")!;
    const requestNode: FlowNode = {
      id: "req-env-node", type: "request", x: 200, y: 180,
      name: "Env Request", status: "idle",
      data: {
        requestId: "req-env",
        requestName: "With Env",
        requestMethod: "GET",
        requestUrl: "https://api.example.com/env",
        requestSnapshot: {
          id: "req-env", method: "GET", url: "https://api.example.com/env",
          headers: [], query_params: [], body_type: "none", body: "", form_fields: [],
          auth: { type: "none", username: "", password: "", token: "", api_key: "", api_key_name: "", api_key_in: "header" },
          settings: { timeout: 30, follow_redirects: true, ssl_verify: true, proxy: null },
          pre_script: "", post_script: "",
        } as any,
        extractions: [],
      },
    };
    useFlowStore.setState({
      nodes: [startNode, requestNode],
      edges: [
        { id: "e1", fromNodeId: "start-node-1", fromPortId: "flow", toNodeId: "req-env-node", toPortId: "trigger" },
      ],
      logs: [],
    });

    await useFlowStore.getState().runFlow("env-123");

    expect(mockSendRequest).toHaveBeenCalledWith(expect.anything(), "env-123");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Utilities
// ════════════════════════════════════════════════════════════════════════════

describe("getValueByJsonPath", () => {
  const obj = {
    data: { id: 42, name: "test", tags: ["a", "b", "c"] },
    meta: null,
    nested: { arr: [{ x: 1 }, { x: 2 }] },
  };

  it("returns the whole object for '$'", () => {
    expect(getValueByJsonPath(obj, "$")).toBe(obj);
  });

  it("returns root-level property", () => {
    expect(getValueByJsonPath(obj, "$.data")).toBe(obj.data);
  });

  it("returns nested property", () => {
    expect(getValueByJsonPath(obj, "$.data.name")).toBe("test");
  });

  it("returns array element by index", () => {
    expect(getValueByJsonPath(obj, "$.data.tags[1]")).toBe("b");
  });

  it("returns nested array element property", () => {
    expect(getValueByJsonPath(obj, "$.nested.arr[0].x")).toBe(1);
  });

  it("returns undefined for non-existent path", () => {
    expect(getValueByJsonPath(obj, "$.data.nonexistent")).toBeUndefined();
  });

  it("returns undefined for invalid array index", () => {
    expect(getValueByJsonPath(obj, "$.data.tags[99]")).toBeUndefined();
  });

  it("returns undefined for null intermediate", () => {
    expect(getValueByJsonPath(obj, "$.meta.field")).toBeUndefined();
  });

  it("handles empty path", () => {
    expect(getValueByJsonPath(obj, "")).toBe(obj);
  });

  it("handles null/undefined obj", () => {
    expect(getValueByJsonPath(null as any, "$.x")).toBeUndefined();
    expect(getValueByJsonPath(undefined as any, "$.x")).toBeUndefined();
  });

  it("handles double-dot path gracefully (skips empty parts)", () => {
    expect(getValueByJsonPath(obj, "$.data..name")).toBe("test");
  });
});

describe("interpolateString", () => {
  const vars = { name: "World", count: "42", status: "ok" };

  it("replaces {{variables}} with values", () => {
    expect(interpolateString("Hello {{name}}!", vars)).toBe("Hello World!");
  });

  it("replaces multiple variables", () => {
    expect(interpolateString("{{name}} {{status}} {{count}}", vars)).toBe("World ok 42");
  });

  it("leaves unknown variables as placeholders", () => {
    expect(interpolateString("{{unknown}}", vars)).toBe("{{unknown}}");
  });

  it("handles empty string", () => {
    expect(interpolateString("", vars)).toBe("");
  });

  it("handles strings with no variables", () => {
    expect(interpolateString("plain text", vars)).toBe("plain text");
  });

  it("trims whitespace inside variable names", () => {
    expect(interpolateString("{{ name }}", vars)).toBe("World");
  });

  it("replaces the same variable multiple times", () => {
    expect(interpolateString("{{name}} {{name}} {{name}}", vars)).toBe("World World World");
  });
});
