import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HttpRequest, HttpResponse } from "@/lib/invoke";
import { sendRequest } from "@/lib/invoke";
import { useRequestStore } from "./requestStore";
import { useTabStore } from "./tabStore";

export type FlowNodeType = "start" | "request" | "condition" | "delay" | "logger";

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
  };
}

export interface FlowEdge {
  id: string;
  fromNodeId: string;
  fromPortId: string; // "success" | "failure" | "flow" | "true" | "false"
  toNodeId: string;
  toPortId: string; // "trigger"
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
  stopFlow: () => void;
}

// Utility: JSONPath-like simple extractor (e.g. $.data.id or $.token)
export function getValueByJsonPath(obj: any, path: string): any {
  if (!path || path === "$" || path === "$.") return obj;
  try {
    const parts = path
      .replace(/^\$/, "")
      .split(/\.(?![^\[]*\])/)
      .filter((p) => p !== "");
    
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      const arrayMatch = part.match(/^([^\[]+)\[(\d+)\]$/);
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
  } catch (e) {
    return undefined;
  }
}

// Utility: string interpolation helper
export function interpolateString(str: string, variables: Record<string, string>): string {
  if (!str) return str;
  return str.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
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

      setPan: (pan) =>
        set((s) => ({
          pan: typeof pan === "function" ? pan(s.pan) : pan,
        })),

      setZoom: (zoom) =>
        set((s) => ({
          zoom: typeof zoom === "function" ? Math.max(0.2, Math.min(2, zoom(s.zoom))) : Math.max(0.2, Math.min(2, zoom)),
        })),

      addNode: (type, x, y) => {
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
            : "Console Log";
        
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
              ? { expression: "status === 200" }
              : type === "logger"
              ? { logFormat: "Status code is {{status_code}}" }
              : { extractions: [] },
        };

        set((s) => ({
          nodes: [...s.nodes, newNode],
        }));

        get().addLog("info", `Added visual node: ${name}`);
        return id;
      },

      updateNodeData: (id, data) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, ...data } }
              : n
          ),
        })),

      updateNodePosition: (id, x, y) =>
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
        })),

      updateNodeName: (id, name) =>
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, name } : n)),
        })),

      deleteNode: (id) =>
        set((s) => ({
          nodes: s.nodes.filter((n) => n.id !== id),
          edges: s.edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id),
        })),

      addEdge: (fromNodeId, fromPortId, toNodeId, toPortId) => {
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

      deleteEdge: (id) =>
        set((s) => ({
          edges: s.edges.filter((e) => e.id !== id),
        })),

      clearAll: () =>
        set({
          nodes: [],
          edges: [],
          variables: {},
          logs: [],
          isRunning: false,
          activeNodeId: null,
        }),

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
        })),
        // Wait, standard console log is fine
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

      // Execution Engine
      stopFlow: () => {
        get().addLog("warn", "Execution stopped by user.");
        set({ isRunning: false, activeNodeId: null });
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
              await new Promise((resolve) => setTimeout(resolve, delay));
              nextPort = "flow";
            } else if (node.type === "logger") {
              const format = node.data.logFormat ?? "";
              const msg = interpolateString(format, get().variables);
              get().addLog("success", `[Log Output] ${msg}`);
              nextPort = "flow";
            } else if (node.type === "condition") {
              // Condition node: evaluate expression
              const expr = node.data.expression ?? "true";
              
              // We'll evaluate in a sandboxed way with variables injected
              let evaluated = false;
              try {
                // Construct a function runner injecting variables
                const varKeys = Object.keys(get().variables);
                const varVals = Object.values(get().variables);
                
                // Create a dynamic function. Example: (status_code) => status_code === 200
                // Use a safe wrapper to prevent syntax crashes
                const fn = new Function(...varKeys, `try { return !!(${expr}); } catch(e) { return false; }`);
                evaluated = fn(...varVals);
              } catch (e) {
                evaluated = false;
                get().addLog("warn", `Condition evaluation failed for: "${expr}". Defaulting to false.`);
              }
              
              get().addLog("info", `Condition evaluated to: ${evaluated}`);
              nextPort = evaluated ? "true" : "false";
            } else if (node.type === "request") {
              // Request node: execute actual request!
              const { requestId } = node.data;
              if (!requestId) {
                throw new Error("No request linked to this node.");
              }

              // Load request details from the store
              // In siReq, collections are in Tauri side or fetched in requestStore.
              // To make this super bullet-proof, we'll fetch the linked request details.
              // If it's the active request in the store, we can use it, or fetch it.
              // Alternatively, we can let user define URL/method on node itself or read from tabStore.
              // Let's resolve the request details. Let's first search in tabStore or requestStore.
              // Since the request is linked, we can read its details.
              const activeRequest = useRequestStore.getState().request;
              let requestToRun: HttpRequest | null = null;
              
              if (activeRequest && activeRequest.id === requestId) {
                requestToRun = activeRequest;
              } else {
                // Search in tabStore
                const tabs = useTabStore.getState().tabs;
                const tab = tabs.find((t) => t.request.id === requestId || t.id === requestId);
                if (tab) {
                  requestToRun = tab.request;
                }
              }

              // If not found in open tabs, construct a fallback request from node data
              if (!requestToRun) {
                requestToRun = {
                  id: requestId,
                  name: node.data.requestName ?? node.name,
                  method: (node.data.requestMethod ?? "GET") as any,
                  url: node.data.requestUrl ?? "",
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
                };
              }

              // Interpolate flow variables inside request URL, headers, body
              const interpolatedRequest = resolveRequestVariables(requestToRun, get().variables);
              get().addLog("info", `Sending ${interpolatedRequest.method} ${interpolatedRequest.url}...`);

              const startTime = Date.now();
              const response: HttpResponse = await sendRequest(
                interpolatedRequest,
                interpolatedRequest.settings.timeout,
                environmentId
              );
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
              
              let parsedBody: any = null;
              try {
                parsedBody = JSON.parse(response.body);
                get().updateVariable("response_body", response.body);
              } catch (e) {
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
          } catch (err: any) {
            success = false;
            nextPort = "failure";
            const errMsg = err.message ?? String(err);
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
      }),
    }
  )
);
