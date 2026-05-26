import React, { useEffect, useState, useRef } from "react";
import { useFlowStore } from "@/stores/flowStore";
import { useUIStore } from "@/stores/uiStore";
import { useTabStore } from "@/stores/tabStore";
import { FlowCanvas } from "./FlowCanvas";
import { getCollections } from "@/lib/invoke";
import type { FlowNode, FlowNodeType } from "@/stores/flowStore";
import type { CollectionRequest, CollectionItem } from "@/lib/invoke";
import { cn } from "@/lib/utils";

export const FlowPanel: React.FC = () => {
  const nodes = useFlowStore((s) => s.nodes);
  const variables = useFlowStore((s) => s.variables);
  const logs = useFlowStore((s) => s.logs);
  const isRunning = useFlowStore((s) => s.isRunning);

  const addNode = useFlowStore((s) => s.addNode);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const updateNodeName = useFlowStore((s) => s.updateNodeName);
  const deleteNode = useFlowStore((s) => s.deleteNode);
  const clearAll = useFlowStore((s) => s.clearAll);
  const resetExecution = useFlowStore((s) => s.resetExecution);
  const clearLogs = useFlowStore((s) => s.clearLogs);
  const runFlow = useFlowStore((s) => s.runFlow);
  const stopFlow = useFlowStore((s) => s.stopFlow);

  const activeEnvironmentId = useUIStore((s) => s.activeEnvironmentId);

  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [flatRequests, setFlatRequests] = useState<CollectionRequest[]>([]);
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<"inspector" | "variables">("inspector");

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Flatten collection items helper
  const flattenRequests = (items: CollectionItem[]): CollectionRequest[] => {
    let reqs: CollectionRequest[] = [];
    for (const item of items) {
      if (item.type === "request") {
        reqs.push(item);
      } else {
        reqs = reqs.concat(flattenRequests(item.items));
      }
    }
    return reqs;
  };

  // Fetch available workspace requests
  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const collections = await getCollections();
        const colReqs = collections.flatMap((c) => flattenRequests(c.requests));
        
        // Also combine requests currently open in tabs
        const tabReqs = useTabStore
          .getState()
          .tabs.map((t) => ({ ...t.request, type: "request" as const }));

        // Deduplicate by request ID or URL/Name
        const combined = [...colReqs];
        for (const tr of tabReqs) {
          if (!combined.some((cr) => cr.id === tr.id)) {
            combined.push(tr);
          }
        }
        
        setFlatRequests(combined);
      } catch (err) {
        console.error("Failed to load collections for Flow Editor:", err);
      }
    };

    fetchRequests();
  }, [nodes]);

  // Keep selectedNode in sync with store state
  useEffect(() => {
    if (selectedNode) {
      const updated = nodes.find((n) => n.id === selectedNode.id);
      setSelectedNode(updated ?? null);
    }
  }, [nodes, selectedNode]);

  // Scroll to bottom of Flow Terminal when logs are printed
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const handleAddNode = (type: FlowNodeType) => {
    // Drop the node in the center-left of the canvas view
    const canvasWidth = 800;
    const canvasHeight = 500;
    const scrollX = -useFlowStore.getState().pan.x;
    const scrollY = -useFlowStore.getState().pan.y;
    const zoom = useFlowStore.getState().zoom;

    const x = Math.round((scrollX + canvasWidth / 3) / zoom / 10) * 10;
    const y = Math.round((scrollY + canvasHeight / 3) / zoom / 10) * 10;

    const nodeId = addNode(type, x, y);
    const addedNode = useFlowStore.getState().nodes.find((n) => n.id === nodeId);
    if (addedNode) {
      setSelectedNode(addedNode);
      setActiveRightTab("inspector");
    }
  };

  const handleRun = () => {
    runFlow(activeEnvironmentId);
  };

  // Extractions editor methods (Request node specific)
  const addExtraction = () => {
    if (!selectedNode || selectedNode.type !== "request") return;
    const extractions = selectedNode.data.extractions ?? [];
    const updated = [
      ...extractions,
      { expression: "$.", targetVariable: "" },
    ];
    updateNodeData(selectedNode.id, { extractions: updated });
  };

  const updateExtraction = (index: number, field: "expression" | "targetVariable", value: string) => {
    if (!selectedNode || selectedNode.type !== "request") return;
    const extractions = [...(selectedNode.data.extractions ?? [])];
    extractions[index] = { ...extractions[index], [field]: value };
    updateNodeData(selectedNode.id, { extractions });
  };

  const deleteExtraction = (index: number) => {
    if (!selectedNode || selectedNode.type !== "request") return;
    const extractions = (selectedNode.data.extractions ?? []).filter((_, i) => i !== index);
    updateNodeData(selectedNode.id, { extractions });
  };

  return (
    <div className="flex-1 h-full flex overflow-hidden bg-background">
      {/* Main Workspace (Canvas + Collapsible Terminal) */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        
        {/* Toolbar */}
        <div className="h-12 border-b bg-card px-4 flex items-center justify-between shrink-0 gap-3">
          
          {/* Node Adders */}
          <div className="flex items-center gap-1.5 nodrag">
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mr-1.5">Add Node:</span>
            
            <button
              onClick={() => handleAddNode("request")}
              className="px-2.5 py-1 text-xs font-semibold border rounded-lg hover:bg-accent text-primary transition-all duration-150 flex items-center gap-1"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="2" y="3" width="20" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 9l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              HTTP Request
            </button>

            <button
              onClick={() => handleAddNode("condition")}
              className="px-2.5 py-1 text-xs font-semibold border rounded-lg hover:bg-accent text-purple-400 transition-all duration-150 flex items-center gap-1"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Condition
            </button>

            <button
              onClick={() => handleAddNode("delay")}
              className="px-2.5 py-1 text-xs font-semibold border rounded-lg hover:bg-accent text-yellow-500 transition-all duration-150 flex items-center gap-1"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Wait Timer
            </button>

            <button
              onClick={() => handleAddNode("logger")}
              className="px-2.5 py-1 text-xs font-semibold border rounded-lg hover:bg-accent text-indigo-400 transition-all duration-150 flex items-center gap-1"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Console Log
            </button>
          </div>

          {/* Execution Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isRunning ? (
              <button
                onClick={stopFlow}
                className="px-3.5 py-1 bg-red-600 text-white hover:bg-red-500 text-xs font-bold rounded-lg shadow-md transition-all duration-150 flex items-center gap-1.5"
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                Stop Flow
              </button>
            ) : (
              <button
                onClick={handleRun}
                className="px-3.5 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg shadow-md shadow-green-600/10 transition-all duration-150 flex items-center gap-1.5"
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Run Flow
              </button>
            )}

            <button
              onClick={resetExecution}
              className="px-2.5 py-1 border text-xs font-medium rounded-lg hover:bg-accent transition-all duration-150"
              title="Reset execution states"
            >
              Reset
            </button>

            <div className="h-4 w-px bg-border mx-1" />

            <button
              onClick={() => {
                if (window.confirm("Clear all nodes and connections?")) {
                  clearAll();
                  setSelectedNode(null);
                }
              }}
              className="px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/10 rounded-lg transition-all duration-150"
              title="Delete all nodes"
            >
              Clear Canvas
            </button>
          </div>
        </div>

        {/* The Grid Canvas */}
        <div className="flex-1 relative min-h-0">
          <FlowCanvas onNodeSelected={setSelectedNode} selectedNodeId={selectedNode?.id ?? null} />
        </div>

        {/* Collapsible Flow Terminal Console */}
        <div className={cn("border-t bg-card transition-all duration-300 flex flex-col shrink-0", terminalCollapsed ? "h-9" : "h-44")}>
          {/* Header */}
          <div className="h-9 border-b px-4 flex items-center justify-between bg-muted/20 select-none cursor-pointer shrink-0" onClick={() => setTerminalCollapsed(!terminalCollapsed)}>
            <div className="flex items-center gap-2">
              <svg className="h-3.5 w-3.5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[11px] font-bold text-foreground font-mono uppercase tracking-wider">Flow Debugger Console</span>
              <span className="text-[9px] font-medium font-mono text-muted-foreground bg-muted border rounded px-1.5 py-0.2">{logs.length} logs</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearLogs();
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/40 px-2 py-0.5 rounded transition-colors duration-100 font-mono"
              >
                Clear
              </button>
              <div className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent/30 transition-all duration-100">
                <svg className={cn("h-4 w-4 transition-transform duration-200", terminalCollapsed ? "" : "transform rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </div>
            </div>
          </div>
          
          {/* Console Stream */}
          {!terminalCollapsed && (
            <div className="flex-1 overflow-auto p-3 font-mono text-[11px] bg-black/10 select-text leading-relaxed">
              {logs.length === 0 ? (
                <div className="text-muted-foreground/45 italic py-2 text-center select-none font-mono">
                  Console stream empty. Click "Run Flow" to stream tracing execution steps here.
                </div>
              ) : (
                <div className="space-y-1">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 hover:bg-white/[0.02] py-0.5 px-1 rounded transition-colors duration-100">
                      <span className="text-muted-foreground/30 shrink-0 select-none">[{log.timestamp}]</span>
                      <span className={cn(
                        "font-bold shrink-0 uppercase select-none text-[9px] px-1 border rounded-[3px]",
                        log.level === "info" && "text-muted-foreground/80 bg-muted/15 border-border/20",
                        log.level === "success" && "text-green-400 bg-green-950/20 border-green-500/25",
                        log.level === "warn" && "text-yellow-400 bg-yellow-950/20 border-yellow-500/25",
                        log.level === "error" && "text-red-400 bg-red-950/20 border-red-500/25"
                      )}>
                        {log.level}
                      </span>
                      <span className={cn(
                        "break-all flex-1",
                        log.level === "success" && "text-green-300",
                        log.level === "error" && "text-red-300/90",
                        log.level === "warn" && "text-yellow-200/90",
                        log.level === "info" && "text-muted-foreground"
                      )}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <div ref={terminalEndRef} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Utility Sidebar (Selected Node Inspector / Variables Live list) */}
      <div className="w-80 border-l bg-card flex flex-col shrink-0 h-full">
        {/* Toggle Head */}
        <div className="flex border-b text-xs shrink-0 select-none">
          <button
            onClick={() => setActiveRightTab("inspector")}
            className={cn(
              "flex-1 py-3 text-center font-bold transition-colors duration-150 border-b-2",
              activeRightTab === "inspector"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Node Inspector
          </button>
          <button
            onClick={() => setActiveRightTab("variables")}
            className={cn(
              "flex-1 py-3 text-center font-bold transition-colors duration-150 border-b-2",
              activeRightTab === "variables"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Live Variables ({Object.keys(variables).length})
          </button>
        </div>

        {/* Tab content area */}
        <div className="flex-1 overflow-auto p-4 min-h-0 select-text">
          {activeRightTab === "inspector" ? (
            selectedNode ? (
              <div className="space-y-5">
                {/* Header info */}
                <div className="space-y-1">
                  <div className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Node Type</div>
                  <div className="text-xs font-bold text-foreground bg-muted/40 border px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    <span>{selectedNode.type.toUpperCase()} Node</span>
                  </div>
                </div>

                {/* Editable Node Label Name */}
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Node Label</label>
                  <input
                    type="text"
                    value={selectedNode.name}
                    onChange={(e) => updateNodeName(selectedNode.id, e.target.value)}
                    className="w-full bg-background border px-3 py-1.5 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
                  />
                </div>

                <div className="h-px bg-border/40 my-3" />

                {/* Delay Node Custom Details */}
                {selectedNode.type === "delay" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Wait Duration (ms)</label>
                    <input
                      type="number"
                      value={selectedNode.data.delayMs ?? 1000}
                      min={0}
                      max={60000}
                      onChange={(e) => updateNodeData(selectedNode.id, { delayMs: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      className="w-full bg-background border px-3 py-1.5 text-xs font-mono rounded-lg focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
                    />
                    <p className="text-[10px] text-muted-foreground">The execution flow will pause at this node for the specified duration.</p>
                  </div>
                )}

                {/* Logger Node Custom Details */}
                {selectedNode.type === "logger" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">Message Format</label>
                    <textarea
                      value={selectedNode.data.logFormat ?? ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { logFormat: e.target.value })}
                      placeholder="User token received: {{flow_token}}"
                      rows={4}
                      className="w-full bg-background border px-3 py-2 text-xs font-mono rounded-lg focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150 resize-y leading-relaxed"
                    />
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Prints to the Flow Terminal below. Interpolates double brace placeholders like <code className="text-primary font-mono bg-muted px-1 py-0.2 rounded">{"{{flow_var}}"}</code>.
                    </p>
                  </div>
                )}

                {/* Condition Node Custom Details */}
                {selectedNode.type === "condition" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">Expression (JavaScript)</label>
                    <textarea
                      value={selectedNode.data.expression ?? "true"}
                      onChange={(e) => updateNodeData(selectedNode.id, { expression: e.target.value })}
                      placeholder="status_code === '200'"
                      rows={3}
                      className="w-full bg-background border px-3 py-2 text-xs font-mono rounded-lg focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150 resize-y"
                    />
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Evaluates the JS statement. Standard variables injected: <code className="text-primary font-mono">status_code</code>, <code className="text-green-500 font-mono">response_time</code>, plus all custom extracted variables.
                    </p>
                  </div>
                )}

                {/* HTTP Request Node Custom Details */}
                {selectedNode.type === "request" && (
                  <div className="space-y-4">
                    
                    {/* Workspace Request Link Selector */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">Linked HTTP Request</label>
                      <select
                        value={selectedNode.data.requestId ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          const found = flatRequests.find((r) => r.id === val);
                          if (found) {
                            updateNodeData(selectedNode.id, {
                              requestId: found.id,
                              requestName: found.name || "Request",
                              requestMethod: found.method,
                              requestUrl: found.url,
                            });
                          } else {
                            updateNodeData(selectedNode.id, {
                              requestId: undefined,
                              requestName: undefined,
                              requestMethod: undefined,
                              requestUrl: undefined,
                            });
                          }
                        }}
                        className="w-full bg-background border px-2 py-1.5 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150 truncate"
                      >
                        <option value="">-- Choose Request from Workspace --</option>
                        {flatRequests.map((req) => (
                          <option key={req.id} value={req.id}>
                            [{req.method}] {req.name || req.url || "Untitled"}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Extractions Panel */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between border-b pb-1.5">
                        <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">Response Extractions</span>
                        <button
                          onClick={addExtraction}
                          className="px-2 py-0.5 text-[9px] font-bold border rounded bg-muted/40 hover:bg-accent text-primary transition-all duration-100"
                        >
                          + Add Extraction
                        </button>
                      </div>

                      {(selectedNode.data.extractions ?? []).length === 0 ? (
                        <div className="text-[10px] text-muted-foreground/60 italic text-center py-4 border border-dashed rounded-lg bg-muted/10">
                          No extractions defined. Connect inputs downstream by saving variables!
                        </div>
                      ) : (
                        <div className="space-y-3 font-mono">
                          {(selectedNode.data.extractions ?? []).map((ext, idx) => (
                            <div key={idx} className="border bg-muted/20 p-2.5 rounded-lg space-y-2 relative group/ext">
                              <button
                                onClick={() => deleteExtraction(idx)}
                                className="absolute right-1 top-1 p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors duration-100"
                                title="Remove extraction"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>

                              <div className="space-y-1">
                                <label className="text-[9px] text-muted-foreground font-semibold">JSONPath Expression</label>
                                <input
                                  type="text"
                                  value={ext.expression}
                                  placeholder="$.data.token"
                                  onChange={(e) => updateExtraction(idx, "expression", e.target.value)}
                                  className="w-full bg-background border px-2 py-1 text-[10px] font-mono rounded focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-100"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] text-muted-foreground font-semibold">Target Variable Name</label>
                                <input
                                  type="text"
                                  value={ext.targetVariable}
                                  placeholder="auth_token"
                                  onChange={(e) => updateExtraction(idx, "targetVariable", e.target.value)}
                                  className="w-full bg-background border px-2 py-1 text-[10px] font-mono rounded focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-100"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Danger Delete Zone */}
                <div className="pt-4 border-t border-border/40">
                  <button
                    onClick={() => {
                      if (window.confirm("Delete this node?")) {
                        deleteNode(selectedNode.id);
                        setSelectedNode(null);
                      }
                    }}
                    className="w-full py-1.5 border border-destructive/30 hover:border-destructive hover:bg-destructive/10 text-destructive text-xs font-semibold rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete Selected Node
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-muted-foreground text-xs italic select-none">
                <svg className="h-10 w-10 mx-auto mb-3 text-muted-foreground/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                Select a visual node on the grid to inspect and configure its attributes.
              </div>
            )
          ) : (
            /* Live Variables list */
            <div className="space-y-3 font-mono">
              <div className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold border-b pb-1.5 flex items-center justify-between">
                <span>Evaluated Flow Context</span>
                <span className="text-primary font-bold">{Object.keys(variables).length} vars</span>
              </div>
              
              {Object.keys(variables).length === 0 ? (
                <div className="text-center py-20 text-muted-foreground text-xs italic select-none">
                  <svg className="h-8 w-8 mx-auto mb-2.5 text-muted-foreground/35" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                  Variables will populate here as extractions occur during flow runs. Reference them using double brackets.
                </div>
              ) : (
                <div className="divide-y divide-border/40 border rounded-lg overflow-hidden bg-muted/10">
                  {Object.entries(variables).map(([key, value]) => (
                    <div key={key} className="p-2.5 flex flex-col gap-1.5 hover:bg-accent/25 transition-colors duration-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-foreground break-all" title={key}>
                          {key}
                        </span>
                        <span className="text-[9px] font-semibold font-mono text-muted-foreground bg-muted border px-1.5 py-0.2 rounded select-all">
                          {"{{" + key + "}}"}
                        </span>
                      </div>
                      <div className="text-[10px] text-primary break-all bg-background px-2 py-1 rounded border leading-relaxed select-text" title={value}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
