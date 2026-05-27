import React, { useEffect, useState, useRef, useCallback, startTransition } from "react";
import { useFlowStore } from "@/stores/flowStore";
import { useUIStore } from "@/stores/uiStore";
import { useRunnerStore } from "@/stores/runnerStore";
import { useTabStore } from "@/stores/tabStore";
import { FlowCanvas } from "./FlowCanvas";
import { getCollections } from "@/lib/invoke";
import type { FlowNode, FlowNodeType } from "@/stores/flowStore";
import type { CollectionRequest, CollectionItem } from "@/lib/invoke";
import { cn } from "@/lib/utils";

// Flatten collection items helper (pure utility, no component deps)
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

  const zoom = useFlowStore((s) => s.zoom);
  const undoStack = useFlowStore((s) => s.undoStack);
  const redoStack = useFlowStore((s) => s.redoStack);
  const selectedNodeIds = useFlowStore((s) => s.selectedNodeIds);
  const clipboard = useFlowStore((s) => s.clipboard);
  const setZoom = useFlowStore((s) => s.setZoom);
  const setPan = useFlowStore((s) => s.setPan);
  const undo = useFlowStore((s) => s.undo);
  const redo = useFlowStore((s) => s.redo);
  const copySelectedNodes = useFlowStore((s) => s.copySelectedNodes);
  const pasteNodes = useFlowStore((s) => s.pasteNodes);
  const deleteSelectedNodes = useFlowStore((s) => s.deleteSelectedNodes);
  const validateFlow = useFlowStore((s) => s.validateFlow);
  const setSelectedNodeIds = useFlowStore((s) => s.setSelectedNodeIds);

  const activeEnvironmentId = useUIStore((s) => s.activeEnvironmentId);

  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [flatRequests, setFlatRequests] = useState<CollectionRequest[]>([]);
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<"inspector" | "variables">("inspector");

  const terminalEndRef = useRef<HTMLDivElement>(null);

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
  }, []);

  // Keep selectedNode in sync with store state
  useEffect(() => {
    if (selectedNode) {
      const updated = nodes.find((n) => n.id === selectedNode.id);
      startTransition(() => {
        setSelectedNode(updated ?? null);
      });
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
    const result = validateFlow();
    if (!result.valid || result.warnings.length > 0) {
      return;
    }
    runFlow(activeEnvironmentId);
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(2, prev + 0.15));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.3, prev - 0.15));
  const handleZoomReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleFitToView = () => {
    const { nodes } = useFlowStore.getState();
    if (nodes.length === 0) return;
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + 240));
    const maxY = Math.max(...nodes.map((n) => n.y + 150));
    const padding = 60;
    const viewW = window.innerWidth * 0.55;
    const viewH = window.innerHeight * 0.6;
    const fitZoom = Math.min(viewW / (maxX - minX + padding * 2), viewH / (maxY - minY + padding * 2), 1.5);
    const clampedZoom = Math.max(0.3, Math.min(2, fitZoom));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setZoom(clampedZoom);
    setPan({ x: viewW / 2 - centerX * clampedZoom, y: viewH / 2 - centerY * clampedZoom });
  };

  const handleCopy = useCallback(() => {
    if (selectedNodeIds.length === 0 && !selectedNode) return;
    if (selectedNodeIds.length === 0 && selectedNode) {
      setSelectedNodeIds([selectedNode.id]);
      copySelectedNodes();
      return;
    }
    copySelectedNodes();
  }, [selectedNodeIds, selectedNode, setSelectedNodeIds, copySelectedNodes]);

  const handlePaste = useCallback(() => {
    if (!clipboard) return;
    const canvasWidth = 800;
    const scrollX = -useFlowStore.getState().pan.x;
    const scrollY = -useFlowStore.getState().pan.y;
    const currentZoom = useFlowStore.getState().zoom;
    const x = Math.round((scrollX + canvasWidth / 3) / currentZoom / 10) * 10;
    const y = Math.round((scrollY + 200) / currentZoom / 10) * 10;
    const newIds = pasteNodes(x, y);
    if (newIds.length > 0) {
      setSelectedNodeIds(newIds);
      const firstNode = useFlowStore.getState().nodes.find((n) => n.id === newIds[0]);
      setSelectedNode(firstNode ?? null);
      setActiveRightTab("inspector");
    }
  }, [clipboard, pasteNodes, setSelectedNodeIds, setSelectedNode]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedNodeIds.length > 0) {
      deleteSelectedNodes();
      setSelectedNode(null);
    } else if (selectedNode) {
      deleteNode(selectedNode.id);
      setSelectedNode(null);
    }
  }, [selectedNodeIds, selectedNode, deleteSelectedNodes, deleteNode, setSelectedNode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement)?.closest("input, textarea, select");
      if (isInput) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        handleDeleteSelected();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (selectedNodeIds.length > 0 || selectedNode) {
          e.preventDefault();
          handleCopy();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (clipboard) {
          e.preventDefault();
          handlePaste();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setSelectedNodeIds(nodes.filter((n) => n.type !== "start").map((n) => n.id));
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeIds, selectedNode, clipboard, nodes, handleCopy, handleDeleteSelected, handlePaste, redo, undo, setSelectedNodeIds]);

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

            <button
              onClick={() => handleAddNode("set_variable")}
              className="px-2.5 py-1 text-xs font-semibold border rounded-lg hover:bg-accent text-orange-400 transition-all duration-150 flex items-center gap-1"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Variable
            </button>

            <button
              onClick={() => handleAddNode("script")}
              className="px-2.5 py-1 text-xs font-semibold border rounded-lg hover:bg-accent text-cyan-400 transition-all duration-150 flex items-center gap-1"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
              </svg>
              Script
            </button>

            <button
              onClick={() => handleAddNode("assertion")}
              className="px-2.5 py-1 text-xs font-semibold border rounded-lg hover:bg-accent text-rose-400 transition-all duration-150 flex items-center gap-1"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Assert
            </button>
          </div>

          {/* View Controls: Zoom + Undo/Redo + Clipboard */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Zoom Controls */}
            <div className="flex items-center gap-0.5 mr-1">
              <button
                onClick={handleZoomOut}
                className="p-1 border rounded hover:bg-accent transition-all duration-100"
                title="Zoom Out"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                </svg>
              </button>
              <button
                onClick={handleZoomReset}
                className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-all duration-100"
                title="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={handleZoomIn}
                className="p-1 border rounded hover:bg-accent transition-all duration-100"
                title="Zoom In"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={handleFitToView}
                className="p-1 border rounded hover:bg-accent transition-all duration-100 ml-0.5"
                title="Fit to view"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>

            <div className="h-4 w-px bg-border" />

            {/* Undo / Redo */}
            <button
              onClick={undo}
              disabled={undoStack.length === 0}
              className="p-1 border rounded hover:bg-accent transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Undo (Ctrl+Z)"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0}
              className="p-1 border rounded hover:bg-accent transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Redo (Ctrl+Shift+Z)"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
              </svg>
            </button>

            <div className="h-4 w-px bg-border" />

            {/* Copy / Paste */}
            <button
              onClick={handleCopy}
              disabled={selectedNodeIds.length === 0 && !selectedNode}
              className="p-1 border rounded hover:bg-accent transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Copy (Ctrl+C)"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="9" width="13" height="13" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={handlePaste}
              disabled={!clipboard}
              className="p-1 border rounded hover:bg-accent transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Paste (Ctrl+V)"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6" />
              </svg>
            </button>

            <div className="h-4 w-px bg-border" />

            {/* Execution Controls */}
            {isRunning ? (
              <button
                onClick={stopFlow}
                className="px-3 py-1 bg-red-600 text-white hover:bg-red-500 text-xs font-bold rounded-lg shadow-md transition-all duration-150 flex items-center gap-1"
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                Stop
              </button>
            ) : (
              <button
                onClick={handleRun}
                className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg shadow-md shadow-green-600/10 transition-all duration-150 flex items-center gap-1"
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Run
              </button>
            )}

            <button
              onClick={resetExecution}
              className="px-2 py-1 border text-xs font-medium rounded-lg hover:bg-accent transition-all duration-150"
              title="Reset execution states"
            >
              Reset
            </button>

            <div className="h-4 w-px bg-border mx-0.5" />

            {/* Run in Runner */}
            <button
              onClick={() => {
                useRunnerStore.getState().setMode("flow", nodes.find(n => n.type === "start")?.name || "My Flow");
                useUIStore.getState().setShowRunner(true);
              }}
              disabled={isRunning}
              className="px-2.5 py-1 text-[11px] font-semibold border border-primary/30 text-primary hover:bg-primary/10 rounded-lg transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
              title="Run this flow in the Runner panel with data-driven support"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <rect x="2" y="3" width="20" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Runner
            </button>

            <div className="h-4 w-px bg-border" />

            <button
              onClick={handleDeleteSelected}
              disabled={selectedNodeIds.length === 0 && !selectedNode}
              className="px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/10 rounded-lg transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Delete selected (Delete)"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>

            <button
              onClick={() => {
                if (window.confirm("Clear all nodes and connections?")) {
                  clearAll();
                  setSelectedNode(null);
                }
              }}
              className="px-1.5 py-1 text-[10px] font-medium text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all duration-150"
              title="Reset to default flow"
            >
              Clear
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

                {/* Set Variable Node Custom Details */}
                {selectedNode.type === "set_variable" && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">Variable Name</label>
                      <input
                        type="text"
                        value={selectedNode.data.variableName ?? ""}
                        onChange={(e) => updateNodeData(selectedNode.id, { variableName: e.target.value })}
                        placeholder="my_var"
                        className="w-full bg-background border px-3 py-1.5 text-xs font-mono rounded-lg focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">Value</label>
                      <input
                        type="text"
                        value={selectedNode.data.variableValue ?? ""}
                        onChange={(e) => updateNodeData(selectedNode.id, { variableValue: e.target.value })}
                        placeholder="{{status_code}}"
                        className="w-full bg-background border px-3 py-1.5 text-xs font-mono rounded-lg focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
                      />
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Supports <code className="text-primary font-mono bg-muted px-1 py-0.2 rounded">{"{{variable}}"}</code> interpolation. The resolved value will be assigned to the variable name above.
                      </p>
                    </div>
                  </div>
                )}

                {/* Script Node Custom Details */}
                {selectedNode.type === "script" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">JavaScript Code</label>
                    <textarea
                      value={selectedNode.data.scriptCode ?? ""}
                      onChange={(e) => updateNodeData(selectedNode.id, { scriptCode: e.target.value })}
                      placeholder={'// Access flow variables via: vars.my_var\nvars.result = vars.status_code || "no status";'}
                      rows={8}
                      className="w-full bg-background border px-3 py-2 text-xs font-mono rounded-lg focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150 resize-y leading-relaxed"
                    />
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Write JavaScript code. Use the <code className="text-primary font-mono bg-muted px-1 py-0.2 rounded">vars</code> object to read and write flow variables. Any value you set on <code className="text-primary font-mono">vars</code> updates the flow context. If an error is thrown, execution flows through the <span className="text-red-500 font-semibold">failure</span> port.
                    </p>
                  </div>
                )}

                {/* Assertion Node Custom Details */}
                {selectedNode.type === "assertion" && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">Expression (JavaScript)</label>
                      <textarea
                        value={selectedNode.data.assertionExpression ?? "true"}
                        onChange={(e) => updateNodeData(selectedNode.id, { assertionExpression: e.target.value })}
                        placeholder="status_code === '200'"
                        rows={3}
                        className="w-full bg-background border px-3 py-2 text-xs font-mono rounded-lg focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150 resize-y"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">Failure Message</label>
                      <input
                        type="text"
                        value={selectedNode.data.assertionMessage ?? ""}
                        onChange={(e) => updateNodeData(selectedNode.id, { assertionMessage: e.target.value })}
                        placeholder="Expected status code to be 200"
                        className="w-full bg-background border px-3 py-1.5 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
                      />
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Evaluates the expression with flow variables injected. If the expression returns <code className="text-red-500 font-mono">false</code>, execution flows through the <span className="text-red-500 font-semibold">failure</span> port with the message above.
                      </p>
                    </div>
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
                            // Store a full snapshot of the request so runFlow doesn't
                            // need to search stores at execution time
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            const { type: _, ...requestSnapshot } = found;
                            updateNodeData(selectedNode.id, {
                              requestId: found.id,
                              requestName: found.name || "Request",
                              requestMethod: found.method,
                              requestUrl: found.url,
                              requestSnapshot,
                            });
                          } else {
                            updateNodeData(selectedNode.id, {
                              requestId: undefined,
                              requestName: undefined,
                              requestMethod: undefined,
                              requestUrl: undefined,
                              requestSnapshot: undefined,
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
