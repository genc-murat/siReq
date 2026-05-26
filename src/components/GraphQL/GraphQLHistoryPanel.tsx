import { useState, useCallback } from "react";
import { useGraphQLStore } from "@/stores/graphqlStore";
import type { GraphQLHistoryEntry, GraphQLOperationType } from "@/stores/graphqlStore";
import { cn } from "@/lib/utils";

function formatTimeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString();
}

function opColor(type: GraphQLOperationType): string {
  switch (type) {
    case "query": return "bg-blue-500/15 text-blue-600";
    case "mutation": return "bg-amber-500/15 text-amber-600";
    case "subscription": return "bg-purple-500/15 text-purple-600";
  }
}

interface GraphQLHistoryPanelProps {
  onRestore: (entry: GraphQLHistoryEntry) => void;
}

/**
 * GraphQL History Panel — shows past requests with operation type badge,
 * URL, timing, and timestamp. Supports individual delete and clear all.
 *
 * Requirements 6.2–6.6
 */
export function GraphQLHistoryPanel({ onRestore }: GraphQLHistoryPanelProps) {
  const history = useGraphQLStore((s) => s.history);
  const deleteHistory = useGraphQLStore((s) => s.deleteHistory);
  const clearHistory = useGraphQLStore((s) => s.clearHistory);

  const [detailEntry, setDetailEntry] = useState<GraphQLHistoryEntry | null>(null);

  const handleDelete = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      deleteHistory(id);
      if (detailEntry?.id === id) setDetailEntry(null);
    },
    [deleteHistory, detailEntry]
  );

  // Detail view
  if (detailEntry) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20">
          <button
            onClick={() => setDetailEntry(null)}
            className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            ← Back
          </button>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex-1">
            History Detail
          </span>
          <button
            onClick={() => { onRestore(detailEntry); setDetailEntry(null); }}
            className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-all font-medium"
          >
            Restore
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded", opColor(detailEntry.operationType))}>
              {detailEntry.operationType}
            </span>
            <span className="text-[10px] text-muted-foreground/60 truncate">{detailEntry.url}</span>
          </div>
          <div className="text-[10px] text-muted-foreground/40">
            {new Date(detailEntry.createdAt).toLocaleString()} · {detailEntry.timeMs}ms · {detailEntry.sizeBytes} B
          </div>
          {detailEntry.operationName && (
            <div className="text-[10px] text-muted-foreground font-mono">
              Operation: {detailEntry.operationName}
            </div>
          )}
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-3">Query</div>
          <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap bg-muted/30 rounded p-2 max-h-48 overflow-y-auto">
            {detailEntry.query}
          </pre>
          {detailEntry.variables && detailEntry.variables !== "{}" && (
            <>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-2">Variables</div>
              <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap bg-muted/30 rounded p-2 max-h-24 overflow-y-auto">
                {detailEntry.variables}
              </pre>
            </>
          )}
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-2">Response</div>
          <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap bg-muted/30 rounded p-2 max-h-48 overflow-y-auto">
            {(() => {
              try {
                return JSON.stringify(JSON.parse(detailEntry.response), null, 2);
              } catch {
                return detailEntry.response;
              }
            })()}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b bg-muted/20">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          History
        </span>
        {history.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-[9px] text-muted-foreground/50 hover:text-destructive transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <div className="px-3 py-6 text-[11px] text-muted-foreground text-center italic">
            No GraphQL requests yet
          </div>
        ) : (
          history.map((entry) => (
            <div
              key={entry.id}
              onClick={() => setDetailEntry(entry)}
              className="group px-3 py-2 hover:bg-accent/30 transition-colors cursor-pointer border-b border-border/20"
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={cn("text-[9px] font-mono px-1 py-0.5 rounded", opColor(entry.operationType))}>
                  {entry.operationType}
                </span>
                <span className="text-xs font-mono text-foreground/70 truncate flex-1">
                  {entry.operationName || entry.url}
                </span>
                <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums">
                  {entry.timeMs}ms
                </span>
                <button
                  onClick={(e) => handleDelete(entry.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground/30 hover:text-destructive transition-all text-[10px] ml-1"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
                <span className="truncate max-w-[160px]">{entry.url}</span>
                <span>·</span>
                <span>{formatTimeAgo(entry.createdAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
      {history.length > 0 && (
        <div className="shrink-0 px-3 py-1 border-t text-[9px] text-muted-foreground/30">
          {history.length} / 100 entries
        </div>
      )}
    </div>
  );
}
