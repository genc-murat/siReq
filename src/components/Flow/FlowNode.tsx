import React, { useRef } from "react";
import { cn } from "@/lib/utils";
import type { FlowNode } from "@/stores/flowStore";

interface FlowNodeProps {
  node: FlowNode;
  selected: boolean;
  active: boolean;
  multiSelected?: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onDragStart: (e: React.MouseEvent, nodeId: string) => void;
  onDelete: () => void;
  onPortMouseDown: (e: React.MouseEvent, nodeId: string, portId: string, isOutput: boolean) => void;
}

export const FlowNodeComponent: React.FC<FlowNodeProps> = ({
  node,
  selected,
  active,
  multiSelected,
  onSelect,
  onDragStart,
  onDelete,
  onPortMouseDown,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);

  // Define port configurations (relative offsets will be calculated dynamically by the Canvas)
  const getPorts = () => {
    switch (node.type) {
      case "start":
        return {
          inputs: [],
          outputs: [{ id: "flow", label: "Trigger", color: "bg-green-500" }],
        };
      case "delay":
      case "logger":
      case "set_variable":
        return {
          inputs: [{ id: "trigger", label: "In", color: "bg-primary" }],
          outputs: [{ id: "flow", label: "Out", color: "bg-primary" }],
        };
      case "script":
        return {
          inputs: [{ id: "trigger", label: "In", color: "bg-primary" }],
          outputs: [
            { id: "flow", label: "Success", color: "bg-green-500" },
            { id: "failure", label: "Error", color: "bg-red-500" },
          ],
        };
      case "condition":
      case "assertion":
        return {
          inputs: [{ id: "trigger", label: "In", color: "bg-primary" }],
          outputs: [
            { id: "true", label: "True" , color: "bg-green-500" },
            { id: "false", label: "False", color: "bg-red-500" },
          ],
        };
      case "request":
        return {
          inputs: [{ id: "trigger", label: "In", color: "bg-primary" }],
          outputs: [
            { id: "success", label: "Success", color: "bg-green-500" },
            { id: "failure", label: "Failure", color: "bg-red-500" },
          ],
        };
      default:
        return { inputs: [], outputs: [] };
    }
  };

  const { inputs, outputs } = getPorts();

  // Highlight border based on active running state or selection
  const borderClass = active
    ? "border-cyan-400 shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400 animate-pulse"
    : node.status === "success"
    ? "border-green-500/50 shadow-sm shadow-green-500/5 bg-card"
    : node.status === "failure"
    ? "border-red-500/50 shadow-sm shadow-red-500/5 bg-card"
    : multiSelected
    ? "border-primary/50 ring-1 ring-primary/30 shadow-md shadow-primary/10 bg-accent/20"
    : selected
    ? "border-primary ring-1 ring-primary shadow-md shadow-primary/10"
    : "border-border hover:border-muted-foreground/40 bg-card";

  const getMethodBadgeColor = (method: string = "GET") => {
    switch (method.toUpperCase()) {
      case "GET":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "POST":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "PUT":
      case "PATCH":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "DELETE":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const getNodeIcon = () => {
    switch (node.type) {
      case "start":
        return (
          <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          </svg>
        );
      case "delay":
        return (
          <svg className="h-4 w-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "condition":
        return (
          <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        );
      case "logger":
        return (
          <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case "request":
        return (
          <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
        );
      case "set_variable":
        return (
          <svg className="h-4 w-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case "script":
        return (
          <svg className="h-4 w-4 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
          </svg>
        );
      case "assertion":
        return (
          <svg className="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={nodeRef}
      style={{ left: node.x, top: node.y }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e);
      }}
      className={cn(
        "absolute w-60 border rounded-xl bg-card text-card-foreground select-none flex flex-col shadow-sm transition-all duration-150 group/node cursor-pointer z-10",
        borderClass
      )}
    >
      {/* Header (Drag area) */}
      <div
        onMouseDown={(e) => {
          if (
            (e.target as HTMLElement).closest(".nodrag") ||
            (e.target as HTMLElement).closest(".port-handle")
          )
            return;
          onDragStart(e, node.id);
        }}
        className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/40 rounded-t-xl shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          {getNodeIcon()}
          <span className="text-xs font-semibold truncate text-foreground">{node.name}</span>
        </div>
        <div className="flex items-center gap-1.5 opacity-0 group-hover/node:opacity-100 transition-opacity duration-150 nodrag">
          {node.type !== "start" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-100"
              title="Delete node"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Input Ports (Left Side) */}
      {inputs.length > 0 && (
        <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 flex flex-col gap-2.5 z-20">
          {inputs.map((port) => (
            <div
              key={port.id}
              data-port-id={port.id}
              data-node-id={node.id}
              data-is-output="false"
              onMouseDown={(e) => {
                e.stopPropagation();
                onPortMouseDown(e, node.id, port.id, false);
              }}
              className="port-handle w-3 h-3 rounded-full border border-border bg-card cursor-crosshair flex items-center justify-center hover:scale-125 hover:bg-primary transition-all duration-100 group/port"
              title={port.label}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground group-hover/port:bg-card" />
              {/* Tooltip */}
              <span className="absolute left-4 bg-popover text-popover-foreground border px-1.5 py-0.5 text-[9px] rounded font-medium opacity-0 pointer-events-none group-hover/port:opacity-100 transition-opacity duration-100 whitespace-nowrap shadow-sm">
                {port.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Body contents */}
      <div className="p-3 text-xs flex-1 flex flex-col justify-center min-h-[4rem] nodrag">
        {node.type === "start" && (
          <div className="text-center py-2 text-muted-foreground text-[10px] font-mono uppercase tracking-wider">
            Flow Starting Point
          </div>
        )}

        {node.type === "delay" && (
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase font-medium">Wait Time</div>
            <div className="font-mono text-sm text-foreground flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 text-yellow-500 animate-spin" style={{ animationDuration: "3s" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{node.data.delayMs ?? 1000} ms</span>
            </div>
          </div>
        )}

        {node.type === "logger" && (
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase font-medium">Console Format</div>
            <div className="font-mono text-[10px] text-muted-foreground line-clamp-2 bg-muted/40 rounded px-1.5 py-1 border border-border/40 break-all leading-relaxed" title={node.data.logFormat}>
              {node.data.logFormat || "(empty log format)"}
            </div>
          </div>
        )}

        {node.type === "condition" && (
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase font-medium">Javascript Condition</div>
            <div className="font-mono text-[10px] text-purple-400 bg-purple-950/15 border border-purple-500/20 px-1.5 py-1 rounded line-clamp-2 break-all" title={node.data.expression}>
              {node.data.expression || "true"}
            </div>
          </div>
        )}

        {node.type === "set_variable" && (
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase font-medium">Set Variable</div>
            <div className="font-mono text-[11px] text-orange-400 bg-orange-950/15 border border-orange-500/20 px-1.5 py-1 rounded break-all" title={node.data.variableName}>
              {node.data.variableName || "(no name)"} = {node.data.variableValue || ""}
            </div>
          </div>
        )}

        {node.type === "script" && (
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase font-medium">Script</div>
            <div className="font-mono text-[10px] text-cyan-400 bg-cyan-950/15 border border-cyan-500/20 px-1.5 py-1 rounded line-clamp-3 break-all leading-relaxed" title={node.data.scriptCode}>
              {node.data.scriptCode ? node.data.scriptCode.split('\n').slice(0, 3).join('\n').substring(0, 80) + (node.data.scriptCode.length > 80 ? '...' : '') : "(empty)"}
            </div>
          </div>
        )}

        {node.type === "assertion" && (
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase font-medium">Assert</div>
            <div className="font-mono text-[10px] text-rose-400 bg-rose-950/15 border border-rose-500/20 px-1.5 py-1 rounded break-all line-clamp-2" title={node.data.assertionExpression}>
              {node.data.assertionExpression || "true"}
            </div>
            {node.data.assertionMessage && (
              <div className="text-[9px] text-muted-foreground truncate px-1">{node.data.assertionMessage}</div>
            )}
          </div>
        )}

        {node.type === "request" && (
          <div className="space-y-2">
            {node.data.requestId ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={cn("px-1.5 py-0.5 rounded font-bold text-[9px] border", getMethodBadgeColor(node.data.requestMethod))}>
                    {node.data.requestMethod ?? "GET"}
                  </span>
                  <span className="font-medium text-foreground truncate text-[11px]" title={node.data.requestName}>
                    {node.data.requestName}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground truncate font-mono bg-muted/30 px-1.5 py-0.5 rounded border border-border/30" title={node.data.requestUrl}>
                  {node.data.requestUrl || "no url"}
                </div>
              </div>
            ) : (
              <div className="text-center py-2 text-[10px] text-muted-foreground/60 italic border border-dashed rounded-lg">
                No Request Linked
              </div>
            )}

            {/* Response execution status info */}
            {node.responseInfo && (
              <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-border/40 font-mono text-[9px] text-muted-foreground shrink-0">
                <div>
                  <span className={cn(
                    "font-bold",
                    node.responseInfo.statusCode >= 200 && node.responseInfo.statusCode < 300
                      ? "text-green-500"
                      : "text-red-500"
                  )}>
                    {node.responseInfo.statusCode}
                  </span>
                </div>
                <div className="text-right">{node.responseInfo.timeMs}ms</div>
                <div className="text-right">
                  {node.responseInfo.size > 1024
                    ? `${(node.responseInfo.size / 1024).toFixed(0)}K`
                    : `${node.responseInfo.size}B`}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Output Ports (Right Side) */}
      {outputs.length > 0 && (
        <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 flex flex-col gap-2.5 z-20">
          {outputs.map((port) => (
            <div
              key={port.id}
              data-port-id={port.id}
              data-node-id={node.id}
              data-is-output="true"
              onMouseDown={(e) => {
                e.stopPropagation();
                onPortMouseDown(e, node.id, port.id, true);
              }}
              className="port-handle w-3 h-3 rounded-full border border-border bg-card cursor-crosshair flex items-center justify-center hover:scale-125 hover:bg-primary transition-all duration-100 group/port"
              title={port.label}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground group-hover/port:bg-card" />
              {/* Tooltip */}
              <span className="absolute right-4 bg-popover text-popover-foreground border px-1.5 py-0.5 text-[9px] rounded font-medium opacity-0 pointer-events-none group-hover/port:opacity-100 transition-opacity duration-100 whitespace-nowrap shadow-sm">
                {port.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
