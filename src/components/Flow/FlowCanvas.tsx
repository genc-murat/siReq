import React, { useRef, useState } from "react";
import { useFlowStore } from "@/stores/flowStore";
import { FlowNodeComponent } from "./FlowNode";
import type { FlowNode } from "@/stores/flowStore";

interface FlowCanvasProps {
  onNodeSelected: (node: FlowNode | null) => void;
  selectedNodeId: string | null;
}

interface DraggingPort {
  nodeId: string;
  portId: string;
  isOutput: boolean;
  x: number;
  y: number;
}

// Utility: Calculate port position dynamically based on node coordinates
export const getPortPos = (node: FlowNode, portId: string, isOutput: boolean) => {
  const w = 240; // width is w-60 (240px)
  let h = 100;
  if (node.type === "start") h = 76;
  else if (node.type === "delay") h = 100;
  else if (node.type === "logger" || node.type === "condition") h = 108;
  else if (node.type === "request") h = 135;

  const x = isOutput ? node.x + w : node.x;
  let y = node.y + h / 2;

  // Stagger height for multi-port nodes
  if (node.type === "condition") {
    if (portId === "true") y = node.y + 44;
    if (portId === "false") y = node.y + 76;
  } else if (node.type === "request") {
    if (portId === "success") y = node.y + 52;
    if (portId === "failure") y = node.y + 84;
  }

  return { x, y };
};

export const FlowCanvas: React.FC<FlowCanvasProps> = ({ onNodeSelected, selectedNodeId }) => {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const pan = useFlowStore((s) => s.pan);
  const zoom = useFlowStore((s) => s.zoom);
  const isRunning = useFlowStore((s) => s.isRunning);
  const activeNodeId = useFlowStore((s) => s.activeNodeId);

  const setPan = useFlowStore((s) => s.setPan);
  const setZoom = useFlowStore((s) => s.setZoom);
  const updateNodePosition = useFlowStore((s) => s.updateNodePosition);
  const addEdge = useFlowStore((s) => s.addEdge);
  const deleteEdge = useFlowStore((s) => s.deleteEdge);
  const deleteNode = useFlowStore((s) => s.deleteNode);

  const canvasRef = useRef<HTMLDivElement>(null);
  
  // Local drag-and-pan canvas state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Local drag node state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Local connection-drawing state
  const [activePort, setActivePort] = useState<DraggingPort | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Handle Zoom on Wheel scroll
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 0.05;
    const direction = e.deltaY < 0 ? 1 : -1;
    setZoom((prev) => Math.min(2, Math.max(0.3, prev + direction * zoomFactor)));
  };

  // Convert client viewport coordinates to Canvas space
  const screenToCanvas = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  };

  // Handle mousedown on Canvas to start Panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    if ((e.target as HTMLElement).closest(".nodrag")) return; // Don't pan if dragging node contents
    
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  // Drag handles
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    } else if (draggingNodeId) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      // Align to grid (snap to 10px intervals for clean layout)
      const snapX = Math.round((pos.x - dragOffset.x) / 10) * 10;
      const snapY = Math.round((pos.y - dragOffset.y) / 10) * 10;
      updateNodePosition(draggingNodeId, snapX, snapY);
    } else if (activePort) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setMousePos(pos);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
    setActivePort(null);
  };

  // Node Drag Start
  const handleNodeDragStart = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    onNodeSelected(nodes.find((n) => n.id === nodeId) ?? null);
    
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const pos = screenToCanvas(e.clientX, e.clientY);
    setDragOffset({ x: pos.x - node.x, y: pos.y - node.y });
    setDraggingNodeId(nodeId);
  };

  // Port connection start drawing
  const handlePortMouseDown = (e: React.MouseEvent, nodeId: string, portId: string, isOutput: boolean) => {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const portPos = getPortPos(node, portId, isOutput);
    setActivePort({
      nodeId,
      portId,
      isOutput,
      x: portPos.x,
      y: portPos.y,
    });
    setMousePos(portPos);
  };

  // Port mouse up (connecting the edge)
  const handlePortMouseUp = (nodeId: string, portId: string, isOutput: boolean) => {
    if (!activePort) return;
    
    // Disallow output-to-output or input-to-input connection
    if (activePort.isOutput === isOutput) return;

    const fromNode = activePort.isOutput ? activePort.nodeId : nodeId;
    const fromPort = activePort.isOutput ? activePort.portId : portId;
    const toNode = activePort.isOutput ? nodeId : activePort.nodeId;
    const toPort = activePort.isOutput ? portId : activePort.portId;

    addEdge(fromNode, fromPort, toNode, toPort);
    setActivePort(null);
  };

  // SVG Bezier Curve Generator
  const getBezierPath = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = Math.abs(x2 - x1);
    const controlOffset = Math.max(50, dx * 0.4);
    return `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div
      ref={canvasRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="flex-1 h-full bg-background relative overflow-hidden select-none cursor-grab active:cursor-grabbing"
      style={{
        backgroundImage: "radial-gradient(hsl(var(--color-border)) 1.2px, transparent 1.2px)",
        backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
      onClick={() => onNodeSelected(null)}
    >
      {/* Node & Edge Layer */}
      <div
        className="absolute inset-0 origin-top-left pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-auto">
          <defs>
            {/* Glowing neon arrow marker */}
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--color-primary)" />
            </marker>
            <marker
              id="arrow-success"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#22c55e" />
            </marker>
            <marker
              id="arrow-failure"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444" />
            </marker>
          </defs>

          {/* Render Connections (Edges) */}
          {edges.map((edge) => {
            const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
            const toNode = nodes.find((n) => n.id === edge.toNodeId);
            if (!fromNode || !toNode) return null;

            const fromPos = getPortPos(fromNode, edge.fromPortId, true);
            const toPos = getPortPos(toNode, edge.toPortId, false);

            const path = getBezierPath(fromPos.x, fromPos.y, toPos.x, toPos.y);

            // Determine edge color based on port type
            let strokeColor = "stroke-border hover:stroke-primary/70";
            let marker = "url(#arrow)";
            let isPathActive = false;

            if (edge.fromPortId === "success" || edge.fromPortId === "true") {
              strokeColor = "stroke-green-500/40 hover:stroke-green-500/90";
              marker = "url(#arrow-success)";
              if (fromNode.status === "success") isPathActive = true;
            } else if (edge.fromPortId === "failure" || edge.fromPortId === "false") {
              strokeColor = "stroke-red-500/40 hover:stroke-red-500/90";
              marker = "url(#arrow-failure)";
              if (fromNode.status === "failure") isPathActive = true;
            } else {
              strokeColor = "stroke-primary/45 hover:stroke-primary/80";
              if (fromNode.status === "success") isPathActive = true;
            }

            // Highlighting running active wire pulse animation
            const isPulseActive = isRunning && isPathActive;

            return (
              <g key={edge.id} className="cursor-pointer group">
                {/* Fat invisible line for hover capture */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={12}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm("Delete this connection?")) {
                      deleteEdge(edge.id);
                    }
                  }}
                />
                
                {/* Rendered bezier wire */}
                <path
                  d={path}
                  fill="none"
                  className={strokeColor}
                  strokeWidth={2}
                  markerEnd={marker}
                  style={{ transition: "stroke 0.15s ease" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm("Delete this connection?")) {
                      deleteEdge(edge.id);
                    }
                  }}
                />

                {/* Traveling execution pulse (Neon Dot) */}
                {isPulseActive && (
                  <circle r="4" fill={edge.fromPortId === "failure" ? "#ef4444" : "#22c55e"}>
                    <animateMotion dur="1.2s" repeatCount="indefinite" path={path} />
                  </circle>
                )}
              </g>
            );
          })}

          {/* Render Active Temporary Wire Drawing */}
          {activePort && (
            <path
              d={getBezierPath(activePort.x, activePort.y, mousePos.x, mousePos.y)}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth={2}
              strokeDasharray="4 4"
              className="animate-[dash_1s_linear_infinite]"
            />
          )}
        </svg>

        {/* Render Flow Nodes (HTML Layer) */}
        <div className="absolute inset-0 pointer-events-auto">
          {nodes.map((node) => (
            <FlowNodeComponent
              key={node.id}
              node={node}
              selected={node.id === selectedNodeId}
              active={node.id === activeNodeId}
              onSelect={() => onNodeSelected(node)}
              onDragStart={handleNodeDragStart}
              onDelete={() => deleteNode(node.id)}
              onPortMouseDown={handlePortMouseDown}
            />
          ))}
        </div>
      </div>

      {/* Floating Overlay for port drop-connection detection */}
      {activePort && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          {nodes.map((node) => {
            // Render drop-detectors overlay
            const isOutputTarget = !activePort.isOutput;

            const targets = isOutputTarget
              ? // If drawing from an input port, we seek to connect to outputs
                node.type === "start"
                ? [{ id: "flow" }]
                : node.type === "condition"
                ? [{ id: "true" }, { id: "false" }]
                : node.type === "request"
                ? [{ id: "success" }, { id: "failure" }]
                : [{ id: "flow" }]
              : // If drawing from an output, we seek to connect to inputs (which is only "trigger" for standard nodes)
                node.type !== "start"
                ? [{ id: "trigger" }]
                : [];

            return targets.map((port) => {
              const pos = getPortPos(node, port.id, isOutputTarget);
              const screenX = pos.x * zoom + pan.x;
              const screenY = pos.y * zoom + pan.y;

              return (
                <div
                  key={`${node.id}-${port.id}`}
                  style={{
                    left: screenX - 12,
                    top: screenY - 12,
                  }}
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    handlePortMouseUp(node.id, port.id, isOutputTarget);
                  }}
                  className="absolute w-6 h-6 rounded-full border-2 border-dashed border-primary bg-primary/20 cursor-pointer pointer-events-auto flex items-center justify-center hover:scale-125 transition-transform duration-100 animate-pulse"
                />
              );
            });
          })}
        </div>
      )}
    </div>
  );
};
