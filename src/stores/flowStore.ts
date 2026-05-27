import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HttpRequest, HttpResponse } from "@/lib/invoke";
import { sendRequest, cancelRequest } from "@/lib/invoke";
import { executeSandboxed, evaluateInSandbox } from "@/lib/sandbox";


export type FlowNodeType = "start" | "request" | "condition" | "delay" | "logger" | "set_variable" | "script" | "assertion";

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  x: number;
  y: number;
  name: string;
  status?: "idle" | "running" | "success" | "failure";
  error?: string | null;
  responseInfo?: {
    statusCode: number;
    statusText: string;
    timeMs: number;
    size: number;
  } | null;
  data: {
    // For request nodes
    requestId?: string; // Links to existing HTTP request
    requestName?: string;
    requestMethod?: string;
    requestUrl?: string;
    requestSnapshot?: Partial<HttpRequest>;
    extractions?: {
      expression: string;
      targetVariable: string;
    }[];
    // For condition nodes
    expression?: string; // JS expression evaluated with vars, e.g. "status === 200"
    // For delay nodes
    delayMs?: number;
    // For logger nodes
    logFormat?: string; // String with {{var}} replacements
    // For set_variable nodes
    variableName?: string;
    variableValue?: string;
    // For script nodes
    scriptCode?: string;
    // For assertion nodes
    assertionExpression?: string;
    assertionMessage?: string;
  };
}

export interface FlowEdge {
  id: string;
  fromNodeId: string;
  fromPortId: string; // "success" | "failure" | "flow" | "true" | "false"
  toNodeId: string;
  toPortId: string; // "trigger"
}

interface FlowHistoryEntry {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface FlowState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  pan: { x: number; y: number };
  zoom: number;
  variables: Record<string, string>;
  logs: { id: string; timestamp: string; level: "info" | "success" | "warn" | "error"; message: string }[];
  isRunning: boolean;
  activeNodeId: string | null;

  // Actions
  setPan: (pan: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  addNode: (type: FlowNodeType, x: number, y: number) => string;
  updateNodeData: (id: string, data: Partial<FlowNode["data"]>) => void;
  updateNodePosition: (id: string, x: number, y: number) => void;
  updateNodeName: (id: string, name: string) => void;
  deleteNode: (id: string) => void;
  addEdge: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => void;
  deleteEdge: (id: string) => void;
  clearAll: () => void;
  resetExecution: () => void;
  addLog: (level: "info" | "success" | "warn" | "error", message: string) => void;
  clearLogs: () => void;
  updateVariable: (name: string, value: string) => void;
  deleteVariable: (name: string) => void;
  clearVariables: () => void;

  // Execution Engine
  runFlow: (environmentId?: string | null) => Promise<void>;
  stopFlow: () => Promise<void>;
  currentRequestId: string | null;

  // Undo/Redo
  undoStack: FlowHistoryEntry[];
  redoStack: FlowHistoryEntry[];
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Multi-select
  selectedNodeIds: string[];
  setSelectedNodeIds: (ids: string[]) => void;
  toggleSelectedNodeId: (id: string) => void;
  clearSelectedNodeIds: () => void;
  deleteSelectedNodes: () => void;

  // Clipboard
  clipboard: { nodes: FlowNode[]; edges: FlowEdge[] } | null;
  copySelectedNodes: () => void;
  pasteNodes: (x?: number, y?: number) => string[];

  // Validation
  validateFlow: () => { valid: boolean; errors: string[]; warnings: string[] };
}

// Utility: JSONPath-like simple extractor (e.g. $.data.id or $.token)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getValueByJsonPath(obj: any, path: string): any {
  if (!path || path === "$" || path === "$.") return obj;
  try {
    const parts = path
      .replace(/^\$/, "")
      .split(/.(?![^[]*\])/)
      .filter((p) => p !== "");
    
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      const arrayMatch = part.match(/^([^[]+)\[(\d+)\]$/);
      if (arrayMatch) {
        const prop = arrayMatch[1];
        const index = parseInt(arrayMatch[2], 10);
        current = current[prop];
        if (Array.isArray(current)) {
          current = current[index];
        } else {
          return undefined;
        }
      } else {
        current = current[part];
      }
    }
    return current;
  } catch {
    return undefined;
  }
}

// Utility: string interpolation helper
export function interpolateString(str: string, variables: Record<string, string>): string {
  if (!str) return str;
  return str.replace(/{{([^}]+)}}/g, (_, varName) => {
    const trimmed = varName.trim();
    return variables[trimmed] !== undefined ? String(variables[trimmed]) : `{{${trimmed}}}`;
  });
}

// Utility: interpolate headers, URL, body of request
function resolveRequestVariables(req: HttpRequest, variables: Record<string, string>): HttpRequest {
  const resolved = { ...req };
  resolved.url = interpolateString(resolved.url, variables);
  resolved.body = interpolateString(resolved.body, variables);
  
  resolved.headers = resolved.headers.map((h) => ({
    ...h,
    value: interpolateString(h.value, variables),
  }));

  resolved.query_params = resolved.query_params.map((q) => ({
    ...q,
    value: interpolateString(q.value, variables),
  }));

  return resolved;
}

const DEFAULT_NODES: FlowNode[] = [
  {
    id: "start-node-1",
    type: "start",
    x: 80,
    y: 180,
    name: "Start",
    status: "idle",
    data: {},
  },
  {
    id: "logger-node-1",
    type: "logger",
    x: 480,
    y: 180,
    name: "Console Log",
    status: "idle",
    data: {
      logFormat: "Flow successfully completed! User ID: {{user_id}}",
    },
  },
];

const DEFAULT_EDGES: FlowEdge[] = [
  {
    id: "edge-default-1",
    fromNodeId: "start-node-1",
    fromPortId: "flow",
    toNodeId: "logger-node-1",
    toPortId: "trigger",
  },
];

export const useFlowStore = create<FlowState>()(
  persist(
    (set, get) => ({
      nodes: DEFAULT_NODES,
      edges: DEFAULT_EDGES,
      pan: { x: 0, y: 0 },
      zoom: 1,
      variables: {},
      logs: [],
      isRunning: false,
      activeNodeId: null,
      currentRequestId: null,
      undoStack: [],
      redoStack: [],
      selectedNodeIds: [],
      clipboard: null,

      setPan: (pan) =>
        set((s) => ({
          pan: typeof pan === "function" ? pan(s.pan) : pan,
        })),

      setZoom: (zoom) =>
        set((s) => ({
          zoom: typeof zoom === "function" ? Math.max(0.2, Math.min(2, zoom(s.zoom))) : Math.max(0.2, Math.min(2, zoom)),
        })),

      addNode: (type, x, y) => {
        // Prevent adding a second start node
        if (type === "start" && get().nodes.some((n) => n.type === "start")) {
          get().addLog("warn", "A Start Trigger node already exists on the canvas.");
          return "";
        }
        get().pushHistory();
        const id = `node-${crypto.randomUUID()}`;
        const name =
          type === "start"
            ? "Start Trigger"
            : type === "request"
            ? "HTTP Request"
            : type === "condition"
            ? "Branch Cond"
            : type === "delay"
            ? "Wait Timer"
            : type === "logger"
            ? "Console Log"
            : type === "set_variable"
            ? "Set Variable"
            : type === "script"
            ? "Script"
            : "Assertion";
        
        const newNode: FlowNode = {
          id,
          type,
          x,
          y,
          name,
          status: "idle",
          data:
            type === "delay"
              ? { delayMs: 1000 }
              : type === "condition"
              ? { expression: "status_code === '200'" }
              : type === "logger"
              ? { logFormat: "Status code is {{status_code}}" }
              : type === "set_variable"
              ? { variableName: "my_var", variableValue: "{{status_code}}" }
              : type === "script"
              ? { scriptCode: "// Access flow variables via: vars.my_var\nvars.result = vars.status_code || 'no status';" }
              : type === "assertion"
              ? { assertionExpression: "status_code === '200'", assertionMessage: "Expected status code to be 200" }
              : { extractions: [] },
        };

        set((s) => ({
          nodes: [...s.nodes, newNode],
        }));

        get().addLog("info", `Added visual node: ${name}`);
        return id;
      },

      updateNodeData: (id, data) => {
        get().pushHistory();
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, ...data } }
              : n
          ),
        }));
      },

      updateNodePosition: (id, x, y) => {
        get().pushHistory();
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
        }));
      },

      updateNodeName: (id, name) => {
        get().pushHistory();
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, name } : n)),
        }));
      },

      deleteNode: (id) => {
        const node = get().nodes.find((n) => n.id === id);
        if (node?.type === "start") {
          get().addLog("warn", "The Start Trigger node cannot be deleted.");
          return;
        }
        get().pushHistory();
        set((s) => ({
          nodes: s.nodes.filter((n) => n.id !== id),
          edges: s.edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id),
          selectedNodeIds: s.selectedNodeIds.filter((nid) => nid !== id),
        }));
      },

      addEdge: (fromNodeId, fromPortId, toNodeId, toPortId) => {
        get().pushHistory();
        // Prevent duplicate edges between the same ports
        const exists = get().edges.some(
          (e) =>
            e.fromNodeId === fromNodeId &&
            e.fromPortId === fromPortId &&
            e.toNodeId === toNodeId &&
            e.toPortId === toPortId
        );
        if (exists) return;

        // Disallow self-loops
        if (fromNodeId === toNodeId) return;

        // Visual trigger connections can only have one target outgoing from a port
        // Clear existing outgoing edges for this specific port
        const edgeId = `edge-${crypto.randomUUID()}`;
        const newEdge: FlowEdge = {
          id: edgeId,
          fromNodeId,
          fromPortId,
          toNodeId,
          toPortId,
        };

        set((s) => ({
          edges: [
            ...s.edges.filter((e) => !(e.fromNodeId === fromNodeId && e.fromPortId === fromPortId)),
            newEdge,
          ],
        }));
      },

      deleteEdge: (id) => {
        get().pushHistory();
        set((s) => ({
          edges: s.edges.filter((e) => e.id !== id),
        }));
      },

      clearAll: () => {
        get().pushHistory();
        set({
          nodes: DEFAULT_NODES.map((n) => ({ ...n, status: "idle", error: null, responseInfo: null })),
          edges: DEFAULT_EDGES,
          variables: {},
          logs: [],
          isRunning: false,
          activeNodeId: null,
          currentRequestId: null,
          selectedNodeIds: [],
          clipboard: null,
        });
      },

      resetExecution: () =>
        set((s) => ({
          nodes: s.nodes.map((n) => ({
            ...n,
            status: "idle",
            error: null,
            responseInfo: null,
          })),
          isRunning: false,
          activeNodeId: null,
        })),

      addLog: (level, message) => {
        const id = crypto.randomUUID();
        const timestamp = new Date().toLocaleTimeString();
        set((s) => ({
          logs: [...s.logs, { id, timestamp, level, message }].slice(-150), // Cap logs at 150 entries
        }));
        console.log(`[Flow ${level.toUpperCase()}] ${message}`);
      },

      clearLogs: () => set({ logs: [] }),

      updateVariable: (name, value) =>
        set((s) => ({
          variables: { ...s.variables, [name]: value },
        })),

      deleteVariable: (name) =>
        set((s) => {
          const next = { ...s.variables };
          delete next[name];
          return { variables: next };
        }),

      clearVariables: () => set({ variables: {} }),

      // === Undo/Redo ===
      pushHistory: () => {
        set((s) => ({
          undoStack: [
            ...s.undoStack.slice(-49),
            { nodes: JSON.parse(JSON.stringify(s.nodes)), edges: JSON.parse(JSON.stringify(s.edges)) },
          ],
          redoStack: [],
        }));
      },

      undo: () => {
        const { undoStack, nodes, edges } = get();
        if (undoStack.length === 0) return;
        const prev = undoStack[undoStack.length - 1];
        set({
          nodes: prev.nodes,
          edges: prev.edges,
          undoStack: undoStack.slice(0, -1),
          redoStack: [...get().redoStack, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
        });
      },

      redo: () => {
        const { redoStack, nodes, edges } = get();
        if (redoStack.length === 0) return;
        const next = redoStack[redoStack.length - 1];
        set({
          nodes: next.nodes,
          edges: next.edges,
          redoStack: redoStack.slice(0, -1),
          undoStack: [...get().undoStack, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
        });
      },

      // === Multi-select ===
      setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),

      toggleSelectedNodeId: (id) =>
        set((s) => ({
          selectedNodeIds: s.selectedNodeIds.includes(id)
            ? s.selectedNodeIds.filter((nid) => nid !== id)
            : [...s.selectedNodeIds, id],
        })),

      clearSelectedNodeIds: () => set({ selectedNodeIds: [] }),

      deleteSelectedNodes: () => {
        const { selectedNodeIds } = get();
        if (selectedNodeIds.length === 0) return;
        get().pushHistory();
        const idsToDelete = selectedNodeIds.filter((id) => {
          const node = get().nodes.find((n) => n.id === id);
          return node?.type !== "start";
        });
        if (idsToDelete.length !== selectedNodeIds.length) {
          get().addLog("warn", "The Start Trigger node cannot be deleted.");
        }
        set((s) => ({
          nodes: s.nodes.filter((n) => !idsToDelete.includes(n.id)),
          edges: s.edges.filter((e) => !idsToDelete.includes(e.fromNodeId) && !idsToDelete.includes(e.toNodeId)),
          selectedNodeIds: [],
        }));
      },

      // === Clipboard ===
      copySelectedNodes: () => {
        const { nodes, edges, selectedNodeIds } = get();
        if (selectedNodeIds.length === 0) return;
        const copiedNodes = nodes
          .filter((n) => selectedNodeIds.includes(n.id))
          .map((n) => ({ ...n, status: "idle" as const, error: null, responseInfo: null }));
        const copiedNodeIds = new Set(copiedNodes.map((n) => n.id));
        const copiedEdges = edges.filter(
          (e) => copiedNodeIds.has(e.fromNodeId) && copiedNodeIds.has(e.toNodeId)
        );
        set({ clipboard: { nodes: copiedNodes, edges: copiedEdges } });
        get().addLog("info", `Copied ${copiedNodes.length} node(s) to clipboard.`);
      },

      pasteNodes: (x?: number, y?: number) => {
        const { clipboard } = get();
        if (!clipboard) return [];
        get().pushHistory();
        const idMap = new Map<string, string>();
        const newNodes = clipboard.nodes.map((n) => {
          const newId = `node-${crypto.randomUUID()}`;
          idMap.set(n.id, newId);
          return {
            ...n,
            id: newId,
            x: (x ?? n.x + 40) + (n.x - clipboard.nodes[0].x),
            y: (y ?? n.y + 40) + (n.y - clipboard.nodes[0].y),
            status: "idle" as const,
            error: null,
            responseInfo: null,
          };
        });
        const newEdges = clipboard.edges.map((e) => ({
          ...e,
          id: `edge-${crypto.randomUUID()}`,
          fromNodeId: idMap.get(e.fromNodeId) ?? e.fromNodeId,
          toNodeId: idMap.get(e.toNodeId) ?? e.toNodeId,
        }));
        const newIds = newNodes.map((n) => n.id);
        set((s) => ({
          nodes: [...s.nodes, ...newNodes],
          edges: [...s.edges, ...newEdges],
          selectedNodeIds: newIds,
        }));
        get().addLog("info", `Pasted ${newNodes.length} node(s).`);
        return newIds;
      },

      // === Flow Validation ===
      validateFlow: () => {
        const { nodes, edges } = get();
        const errors: string[] = [];
        const warnings: string[] = [];

        const startNode = nodes.find((n) => n.type === "start");
        if (!startNode) errors.push("No Start node found on the canvas.");

        const requestNodes = nodes.filter((n) => n.type === "request");
        for (const node of requestNodes) {
          if (!node.data.requestId) {
            warnings.push(`Request node "${node.name}" has no linked HTTP request.`);
          }
        }

        // Check for orphan nodes (no incoming edges, excluding start)
        const nodesWithIncoming = new Set(edges.map((e) => e.toNodeId));
        for (const node of nodes) {
          if (node.type !== "start" && !nodesWithIncoming.has(node.id)) {
            warnings.push(`Node "${node.name}" (${node.type}) is disconnected — it won't be executed.`);
          }
        }

        // Check for dead-end nodes (no outgoing edges)
        const nodesWithOutgoing = new Set(edges.map((e) => e.fromNodeId));
        for (const node of nodes) {
          if (node.type !== "logger" && node.type !== "start" && !nodesWithOutgoing.has(node.id)) {
            warnings.push(`Node "${node.name}" (${node.type}) has no outgoing connections — execution stops here.`);
          }
        }

        return { valid: errors.length === 0, errors, warnings };
      },

      // Execution Engine
      stopFlow: async () => {
        const { currentRequestId } = get();
        if (currentRequestId) {
          try {
            await cancelRequest(currentRequestId);
            get().addLog("info", "In-flight request cancelled.");
          } catch { /* ignore */ }
        }
        get().addLog("warn", "Execution stopped by user.");
        set({ isRunning: false, activeNodeId: null, currentRequestId: null });
      },

      runFlow: async (environmentId) => {
        if (get().isRunning) return;
        
        get().resetExecution();
        set({ isRunning: true, variables: {} });
        get().addLog("info", "Starting flow execution sequence...");

        // Find the start node
        const startNode = get().nodes.find((n) => n.type === "start");
        if (!startNode) {
          get().addLog("error", "Cannot start flow: No Start Node found on the canvas.");
          set({ isRunning: false });
          return;
        }

        // Keep track of visited nodes to prevent loops from crashing the client
        const visitedCount = new Map<string, number>();

        // Stack-like recursive/queue executor
        const executeNode = async (nodeId: string): Promise<void> => {
          if (!get().isRunning) return;

          const count = visitedCount.get(nodeId) ?? 0;
          if (count > 50) {
            get().addLog("error", `Infinite loop detected at node: ${nodeId}. Aborting.`);
            set({ isRunning: false });
            return;
          }
          visitedCount.set(nodeId, count + 1);

          const node = get().nodes.find((n) => n.id === nodeId);
          if (!node) return;

          set({ activeNodeId: nodeId });
          set((s) => ({
            nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, status: "running" } : n)),
          }));

          get().addLog("info", `Executing node: "${node.name}" (${node.type})`);

          let nextPort = "flow";
          let success = true;

          try {
            if (node.type === "start") {
              // Start node just succeeds immediately
              success = true;
              nextPort = "flow";
              await new Promise((resolve) => setTimeout(resolve, 300));
            } else if (node.type === "delay") {
              const delay = node.data.delayMs ?? 1000;
              get().addLog("info", `Waiting for ${delay}ms...`);
              const startTime = Date.now();
              while (Date.now() - startTime < delay) {
                if (!get().isRunning) return;
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              nextPort = "flow";
            } else if (node.type === "set_variable") {
              const varName = node.data.variableName?.trim();
              const rawValue = node.data.variableValue ?? "";
              if (varName) {
                const resolvedValue = interpolateString(rawValue, get().variables);
                get().updateVariable(varName, resolvedValue);
                get().addLog("info", `Set variable "${varName}" = "${resolvedValue}"`);
              } else {
                get().addLog("warn", "Set Variable node has no variable name defined.");
              }
              nextPort = "flow";
            } else if (node.type === "script") {
              const scriptCode = node.data.scriptCode ?? "";
              if (scriptCode.trim()) {
                try {
                  const varsObj = { ...get().variables };
                  executeSandboxed(scriptCode, varsObj);
                  // Capture any changed or new variables from varsObj
                  const currentVars = get().variables;
                  for (const key of Object.keys(varsObj)) {
                    if (varsObj[key] !== currentVars[key]) {
                      get().updateVariable(key, String(varsObj[key]));
                    }
                  }
                  get().addLog("success", "Script executed successfully.");
                  nextPort = "flow";
                } catch (err: unknown) {
                  const errMsg = err instanceof Error ? err.message : String(err);
                  get().addLog("error", `Script execution failed: ${errMsg}`);
                  success = false;
                  nextPort = "failure";
                }
              } else {
                get().addLog("warn", "Script node has no code to execute.");
                nextPort = "flow";
              }
            } else if (node.type === "assertion") {
              const assertionExpr = node.data.assertionExpression ?? "true";
              const assertionMsg = node.data.assertionMessage ?? "Assertion failed";
              const passed = evaluateInSandbox(assertionExpr, get().variables);
              if (passed) {
                get().addLog("success", `Assertion passed: "${assertionExpr}"`);
                nextPort = "true";
              } else {
                get().addLog("error", `Assertion failed: ${assertionMsg} (expression: "${assertionExpr}")`);
                success = false;
                nextPort = "false";
              }
            } else if (node.type === "condition") {
              const expr = node.data.expression ?? "true";
              let evaluated = false;
              try {
                evaluated = evaluateInSandbox(expr, get().variables);
              } catch {
                evaluated = false;
                get().addLog("warn", `Condition evaluation failed for: "${expr}". Defaulting to false.`);
              }
              
              get().addLog("info", `Condition evaluated to: ${evaluated}`);
              nextPort = evaluated ? "true" : "false";
            } else if (node.type === "request") {
              // Request node: execute actual request!
              const { requestId, requestSnapshot } = node.data;
              if (!requestId) {
                throw new Error("No request linked to this node.");
              }

              // Build request from snapshot (stored when user selected it in the inspector)
              const snap = requestSnapshot;
              const requestToRun: HttpRequest = {
                id: requestId,
                name: node.data.requestName ?? node.name,
                method: node.data.requestMethod ?? "GET",
                url: node.data.requestUrl ?? "",
                headers: snap?.headers ?? [],
                query_params: snap?.query_params ?? [],
                body_type: snap?.body_type ?? "none",
                body: snap?.body ?? "",
                form_fields: snap?.form_fields ?? [],
                auth: snap?.auth ?? {
                  type: "none",
                  username: "",
                  password: "",
                  token: "",
                  api_key: "",
                  api_key_name: "",
                  api_key_in: "header",
                },
                settings: snap?.settings ?? {
                  timeout: 30,
                  follow_redirects: true,
                  ssl_verify: true,
                  proxy: null,
                },
                pre_script: snap?.pre_script ?? "",
                post_script: snap?.post_script ?? "",
                json_schema: snap?.json_schema,
                examples: snap?.examples,
                extractions: snap?.extractions,
              };

              // Interpolate flow variables inside request URL, headers, body
              const interpolatedRequest = resolveRequestVariables(requestToRun, get().variables);
              get().addLog("info", `Sending ${interpolatedRequest.method} ${interpolatedRequest.url}...`);

              // Track current request for cancellation support
              set({ currentRequestId: requestId });

              const startTime = Date.now();
              const response: HttpResponse = await sendRequest(
                interpolatedRequest,
                interpolatedRequest.settings.timeout,
                environmentId
              );
              set({ currentRequestId: null });
              const duration = Date.now() - startTime;

              get().addLog(
                response.status >= 200 && response.status < 300 ? "success" : "warn",
                `Response received: ${response.status} ${response.status_text} (${duration}ms)`
              );

              // Update node status
              set((s) => ({
                nodes: s.nodes.map((n) =>
                  n.id === nodeId
                    ? {
                        ...n,
                        responseInfo: {
                          statusCode: response.status,
                          statusText: response.status_text,
                          timeMs: duration,
                          size: response.size,
                        },
                      }
                    : n
                ),
              }));

              // Save response variables to current execution context:
              // Inject standard variables: status_code, status_text, response_time, response_body
              get().updateVariable("status_code", String(response.status));
              get().updateVariable("status_text", response.status_text);
              get().updateVariable("response_time", String(duration));
              
              let parsedBody: unknown = null;
              try {
                parsedBody = JSON.parse(response.body);
                get().updateVariable("response_body", response.body);
              } catch {
                // Body is not JSON
                get().updateVariable("response_body", response.body);
              }

              // Run extractions defined on this node
              if (node.data.extractions && node.data.extractions.length > 0) {
                for (const ext of node.data.extractions) {
                  if (ext.expression && ext.targetVariable) {
                    let value = "";
                    if (parsedBody) {
                      const extractedVal = getValueByJsonPath(parsedBody, ext.expression);
                      value = extractedVal !== undefined ? String(extractedVal) : "";
                    }
                    if (value) {
                      get().updateVariable(ext.targetVariable, value);
                      get().addLog("success", `Extracted variable: ${ext.targetVariable} = "${value}"`);
                    } else {
                      get().addLog("warn", `Extraction failed for expression "${ext.expression}"`);
                    }
                  }
                }
              }

              success = response.status >= 200 && response.status < 400;
              nextPort = success ? "success" : "failure";
            }
          } catch (err: unknown) {
            success = false;
            nextPort = "failure";
            const errMsg = err instanceof Error ? err.message : String(err);
            get().addLog("error", `Node execution failed: ${errMsg}`);
            
            set((s) => ({
              nodes: s.nodes.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      error: errMsg,
                    }
                  : n
              ),
            }));
          }

          // Mark node finished
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === nodeId ? { ...n, status: success ? "success" : "failure" } : n
            ),
          }));

          // Find outbound edges connected to this active nodeId and port
          const outgoingEdges = get().edges.filter(
            (e) => e.fromNodeId === nodeId && e.fromPortId === nextPort
          );

          if (outgoingEdges.length === 0) {
            // Check if there is a catch-all "flow" port connected if success/failure are not wired
            if (nextPort === "success" || nextPort === "failure") {
              const catchAllEdges = get().edges.filter(
                (e) => e.fromNodeId === nodeId && e.fromPortId === "flow"
              );
              if (catchAllEdges.length > 0) {
                for (const edge of catchAllEdges) {
                  await executeNode(edge.toNodeId);
                }
                return;
              }
            }

            get().addLog("info", `Reached end of branch at node: "${node.name}"`);
            return;
          }

          // Execute all connected children
          for (const edge of outgoingEdges) {
            await executeNode(edge.toNodeId);
          }
        };

        // Trigger starting node
        await executeNode(startNode.id);

        if (get().isRunning) {
          get().addLog("success", "Flow execution completed successfully!");
          set({ isRunning: false, activeNodeId: null });
        }
      },
    }),
    {
      name: "sireq-visual-flow",
      partialize: (state) => ({
        nodes: state.nodes.map((n) => ({
          ...n,
          status: "idle",
          error: null,
          responseInfo: null,
        })),
        edges: state.edges,
        pan: state.pan,
        zoom: state.zoom,
        // Don't persist undo/redo/clipboard/selection
      }),
    }
  )
);
