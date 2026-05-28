import { useState, useCallback } from "react";
import { useReplayStore } from "@/stores/replayStore";
import type { ReplayEntryResult } from "@/lib/invoke";

const methodColors: Record<string, string> = {
  GET: "bg-green-500/10 text-green-500 border-green-500/20",
  POST: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  PUT: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  PATCH: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  DELETE: "bg-red-500/10 text-red-500 border-red-500/20",
  HEAD: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  OPTIONS: "bg-teal-500/10 text-teal-500 border-teal-500/20",
  TRACE: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

export function ReplayTimeline() {
  const { entries, activeEntryId, setActiveEntryId, removeEntry, reorderEntries, getEntryResult, playbackState } = useReplayStore();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = "0.5";
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = "1";
    setDragIndex(null);
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex !== null && dragIndex !== index) {
      setDropTargetIndex(index);
    }
  }, [dragIndex]);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) return;

    const reordered = [...entries];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    const ids = reordered.map((entry) => entry.id);
    reorderEntries(ids);
    setDragIndex(null);
    setDropTargetIndex(null);
  }, [dragIndex, entries, reorderEntries]);

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground/60 border border-dashed border-border rounded-xl">
        <svg className="h-8 w-8 text-muted-foreground/45 mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-xs font-semibold">No requests in timeline</span>
        <span className="text-[10px] mt-1">Import requests from history using the button on the top-right</span>
      </div>
    );
  }

  const isRunning = playbackState === "playing" || playbackState === "paused";

  return (
    <div className="flex-1 flex flex-col gap-1.5 p-1 overflow-auto min-h-0 select-none">
      {entries.map((entry, index) => {
        const isActive = activeEntryId === entry.id;
        const entryResult: ReplayEntryResult | undefined = getEntryResult(entry.id);
        const methodColor = methodColors[entry.original_request.method] || "bg-muted text-foreground border-border";
        const status = entryResult?.status;
        const replayedResponse = entryResult?.replayed_response;
        const diff = entryResult?.diff;
        const isDragOver = dropTargetIndex === index && dragIndex !== null && dragIndex !== index;

        return (
          <div
            key={entry.id}
            draggable={!isRunning}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onClick={() => setActiveEntryId(entry.id)}
            className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all duration-150 ${
              isDragOver
                ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
                : isActive
                ? "bg-primary/5 border-primary/45 shadow-sm ring-1 ring-primary/10"
                : status === "running"
                ? "bg-primary/5 border-primary/25 animate-pulse"
                : "bg-card border-border hover:border-foreground/20"
            } ${isRunning ? "" : "hover:cursor-grab active:cursor-grabbing"}`}
          >
            {isDragOver && (
              <div className="absolute left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}

            <div className="shrink-0 flex items-center justify-center">
              {status === "running" ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : status === "completed" ? (
                <div className="h-4 w-4 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center text-green-500">
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : status === "failed" ? (
                <div className="h-4 w-4 bg-destructive/10 border border-destructive/20 rounded-full flex items-center justify-center text-destructive">
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              ) : status === "skipped" ? (
                <div className="h-4 w-4 bg-muted border border-border rounded-full flex items-center justify-center text-muted-foreground">
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
                  </svg>
                </div>
              ) : (
                <div className="h-2 w-2 rounded-full bg-muted-foreground/35 ring-4 ring-muted-foreground/5 ml-1" />
              )}
            </div>

            <span className="text-[10px] font-bold text-muted-foreground/60 font-mono w-4 text-center shrink-0">
              {index + 1}
            </span>

            {!isRunning && (
              <div className="shrink-0 opacity-0 group-hover:opacity-40 text-muted-foreground cursor-grab">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="9" cy="6" r="1.5" />
                  <circle cx="15" cy="6" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" />
                  <circle cx="15" cy="12" r="1.5" />
                  <circle cx="9" cy="18" r="1.5" />
                  <circle cx="15" cy="18" r="1.5" />
                </svg>
              </div>
            )}

            <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border tracking-wider shrink-0 ${methodColor}`}>
              {entry.original_request.method}
            </span>

            <div className="flex-1 min-w-0 flex flex-col">
              <span className="text-xs font-semibold truncate text-foreground/90">
                {entry.original_request.url || "No URL Specified"}
              </span>
              {entry.original_request.name && (
                <span className="text-[10px] text-muted-foreground/75 truncate mt-0.5">
                  {entry.original_request.name}
                </span>
              )}
            </div>

            {replayedResponse && (
              <div className="shrink-0 flex items-center gap-3">
                {diff && (
                  <div className="flex items-center gap-1.5 bg-card/65 ring-1 ring-border rounded-lg px-2 py-0.5">
                    <span className={`text-[10px] font-bold ${
                      replayedResponse.status === entry.original_response.status ? "text-green-500" : "text-red-500"
                    }`}>
                      {replayedResponse.status}
                    </span>
                    <span className="text-muted-foreground/35 font-mono">|</span>
                    <span className={`text-[10px] font-bold ${
                      diff.timing_diff_ms > 0 ? "text-red-500/85" : "text-green-500/85"
                    }`}>
                      {replayedResponse.time_ms}ms
                    </span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                removeEntry(entry.id);
              }}
              className="p-1 rounded-lg text-muted-foreground/45 hover:text-destructive hover:bg-destructive/10 transition-all duration-150 shrink-0 opacity-0 group-hover:opacity-100"
              title="Delete request from session"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
