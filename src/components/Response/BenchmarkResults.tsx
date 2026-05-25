import { useCallback, useEffect, useMemo, useState } from "react";
import { useRequestStore } from "@/stores/requestStore";
import { cn } from "@/lib/utils";
import type { BenchmarkHistoryEntry } from "@/lib/invoke";
import { clearBenchmarkHistory } from "@/lib/invoke";
import { useToastStore } from "@/stores/toastStore";
import { BenchmarkCompareView } from "./BenchmarkCompareView";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function statCard(label: string, value: string, color?: string) {
  return (
    <div className="flex flex-col items-center p-3 rounded-lg bg-secondary/30 min-w-[80px] transition-all duration-150">
      <span className={cn("text-lg font-bold tabular-nums", color)}>{value}</span>
      <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>
    </div>
  );
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return "text-green-500";
  if (status >= 300 && status < 400) return "text-yellow-500";
  if (status >= 400 && status < 500) return "text-orange-500";
  return "text-red-500";
}

const methodColors: Record<string, string> = {
  GET: "text-green-500",
  POST: "text-yellow-500",
  PUT: "text-blue-500",
  PATCH: "text-orange-500",
  DELETE: "text-red-500",
  HEAD: "text-purple-500",
  OPTIONS: "text-teal-500",
  TRACE: "text-gray-500",
};

function HistoryListItem({ entry, onSelect, onDelete, onToggleCompare, active, compareSelected }: {
  entry: BenchmarkHistoryEntry;
  onSelect: () => void;
  onDelete: () => void;
  onToggleCompare: () => void;
  active?: boolean;
  compareSelected?: boolean;
}) {
  const date = new Date(entry.created_at);
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-1.5 px-2.5 py-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-all duration-150 text-xs border-b border-border/20 last:border-0",
        active && "bg-accent/30 ring-1 ring-primary/20",
        compareSelected && "bg-primary/10"
      )}
    >
      {/* Compare checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleCompare(); }}
        className={cn(
          "shrink-0 w-4 h-4 rounded-lg border flex items-center justify-center transition-all duration-150",
          compareSelected
            ? "bg-primary border-primary text-primary-foreground shadow-sm"
            : "border-muted-foreground/30 hover:border-muted-foreground/60"
        )}
      >
        {compareSelected && (
          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <span className={cn("font-bold shrink-0", methodColors[entry.request.method] ?? "")}>
        {entry.request.method}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-muted-foreground">{entry.request.url || "No URL"}</span>
          <span className="text-[9px] text-muted-foreground/50 shrink-0">×{entry.result.iterations}</span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground/60">
          <span>{date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="text-blue-400/70">{entry.result.avg_ms.toFixed(0)}ms avg</span>
          <span className={cn(entry.result.success_count === entry.result.iterations ? "text-green-500/70" : "text-red-500/70")}>
            {entry.result.success_count}/{entry.result.iterations}
          </span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="p-1 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-150"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function BenchmarkResults() {
  const benchmarkResult = useRequestStore((s) => s.benchmarkResult);
  const benchmarkLoading = useRequestStore((s) => s.benchmarkLoading);
  const benchmarkHistory = useRequestStore((s) => s.benchmarkHistory);
  const benchmarkHistoryLoading = useRequestStore((s) => s.benchmarkHistoryLoading);
  const loadBenchmarkHistory = useRequestStore((s) => s.loadBenchmarkHistory);
  const loadHistoricBenchmark = useRequestStore((s) => s.loadHistoricBenchmark);
  const deleteBenchmarkHistoryItem = useRequestStore((s) => s.deleteBenchmarkHistoryItem);
  const addToast = useToastStore((s) => s.addToast);
  const [showHistory, setShowHistory] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompareOverlay, setShowCompareOverlay] = useState(false);

  const compareEntries = useMemo(() => {
    if (compareIds.length !== 2) return [null, null] as const;
    const a = benchmarkHistory.find((e) => e.id === compareIds[0]) ?? null;
    const b = benchmarkHistory.find((e) => e.id === compareIds[1]) ?? null;
    return [a, b] as const;
  }, [compareIds, benchmarkHistory]);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }, []);

  const handleCompareOpen = useCallback(() => {
    if (compareIds.length === 2) setShowCompareOverlay(true);
  }, [compareIds]);

  const handleCompareClose = useCallback(() => {
    setShowCompareOverlay(false);
  }, []);

  // Load history on mount
  useEffect(() => {
    loadBenchmarkHistory();
  }, []);

  if (benchmarkLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Running benchmark...</span>
          <span className="text-[10px] text-muted-foreground/60">Sending requests sequentially</span>
        </div>
      </div>
    );
  }

  if (!benchmarkResult) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-3">
          <svg className="h-10 w-10 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.321 6.176c1.044-.363 2.136-.549 3.29-.549 5.531 0 8.39 5.262 7.202 9.813m-9.178 3.847c-1.043.363-2.136.549-3.29.549-5.531 0-8.39-5.262-7.202-9.813m1.987-3.456a10.393 10.393 0 00-1.525 1.724m2.296-3.146a10.404 10.404 0 00-1.524 1.724m-4.498 1.48l.1.1m-1.309 1.248l-1.069.894m1.069-.894l1.068.894m0 0l1.068-.894M16.5 13.5a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
          </svg>
          <p>No benchmark results</p>
        </div>
      </div>
    );
  }

  const r = benchmarkResult;

  // Build distribution buckets (tookit-style)
  const maxTime = r.max_ms;
  const minTime = r.min_ms;
  const range = Math.max(maxTime - minTime, 1);
  const bucketCount = Math.min(r.times_ms.length, 15);
  const bucketSize = range / bucketCount;

  const buckets = new Array(bucketCount).fill(0);
  for (const t of r.times_ms) {
    const idx = Math.min(Math.floor((t - minTime) / bucketSize), bucketCount - 1);
    buckets[idx]++;
  }
  const maxBucketCount = Math.max(...buckets, 1);

  return (
    <div className="h-full flex">
      {/* Main stats panel */}
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4 min-w-0">
        {/* Header */}
      <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.321 6.176c1.044-.363 2.136-.549 3.29-.549 5.531 0 8.39 5.262 7.202 9.813m-9.178 3.847c-1.043.363-2.136.549-3.29.549-5.531 0-8.39-5.262-7.202-9.813m1.987-3.456a10.393 10.393 0 00-1.525 1.724m2.296-3.146a10.404 10.404 0 00-1.524 1.724m-4.498 1.48l.1.1m-1.309 1.248l-1.069.894m1.069-.894l1.068.894m0 0l1.068-.894M16.5 13.5a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
          </div>
          <span className="text-sm font-semibold">Benchmark Results</span>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "ml-auto text-[10px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-150",
              showHistory ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History ({benchmarkHistory.length})
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-5 gap-2">
          {statCard("Avg", formatMs(r.avg_ms), "text-blue-400")}
          {statCard("Min", formatMs(r.min_ms), "text-green-500")}
          {statCard("Max", formatMs(r.max_ms), "text-red-500")}
          {statCard("Median", formatMs(r.median_ms), "text-yellow-500")}
          {statCard("P95", formatMs(r.p95_ms), "text-orange-500")}
        </div>

        {/* P99 + success/failure + total bytes */}
        <div className="grid grid-cols-4 gap-2">
          {statCard("P99", formatMs(r.p99_ms), "text-red-400")}
          <div className="flex flex-col items-center p-3 rounded-lg bg-secondary/30 min-w-[80px] transition-all duration-150">
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold tabular-nums text-green-500">{r.success_count}</span>
              {r.failure_count > 0 && (
                <>
                  <span className="text-muted-foreground text-xs">/</span>
                  <span className="text-lg font-bold tabular-nums text-red-500">{r.failure_count}</span>
                </>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              {r.failure_count > 0 ? "Success / Failed" : "Success"}
            </span>
          </div>
          {statCard("Total", formatSize(r.total_bytes))}
      <div className="flex flex-col items-center p-3 rounded-lg bg-secondary/30 min-w-[80px] transition-all duration-150">
            <span className="text-lg font-bold tabular-nums">
              {r.success_count > 0 && r.iterations > 0
                ? `${((r.success_count / r.iterations) * 100).toFixed(1)}%`
                : "0%"}
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">Success Rate</span>
          </div>
        </div>

        {/* Status Distribution */}
        {r.statuses.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1.5">Status Codes</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(
                r.statuses.reduce<Record<number, number>>((acc, s) => {
                  acc[s] = (acc[s] || 0) + 1;
                  return acc;
                }, {})
              )
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([status, count]) => (
                  <span
                    key={status}
                    className={cn(
                      "text-[10px] font-medium px-2 py-0.5 rounded-full",
                      getStatusColor(Number(status)),
                      "bg-current/10"
                    )}
                  >
                    {status} × {count}
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* Errors */}
        {r.errors.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-red-500 mb-1.5">Errors ({r.errors.length})</div>
        <div className="flex flex-col gap-1 max-h-[100px] overflow-auto">
              {r.errors.map((err, i) => (
                <div key={i} className="text-[10px] text-red-400/80 bg-red-500/5 rounded-lg px-2.5 py-1.5 break-all border border-red-500/10">
                  <span className="font-medium">#{i + 1}:</span> {err}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timing Distribution Bar Chart */}
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-1.5">Timing Distribution</div>
      <div className="flex items-end gap-[2px] h-20">
            {buckets.map((count, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm bg-primary/40 hover:bg-primary/60 transition-all duration-150 relative group"
                style={{ height: `${(count / maxBucketCount) * 100}%` }}
              >
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block text-[9px] text-muted-foreground whitespace-nowrap bg-secondary px-1.5 py-0.5 rounded-lg shadow-sm">
                  {count} req
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground/50 mt-1">
            <span>{formatMs(minTime)}</span>
            <span>{formatMs(maxTime)}</span>
          </div>
        </div>

        {/* Individual Results (collapsible) */}
        <details className="group">
          <summary className="text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-all duration-150 list-none flex items-center gap-1">
            <svg className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Individual Results
          </summary>
      <div className="mt-1.5 max-h-[200px] overflow-auto border rounded-lg">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-secondary/30 text-muted-foreground">
                  <th className="text-left px-2 py-1 font-medium">#</th>
                  <th className="text-right px-2 py-1 font-medium">Time</th>
                  <th className="text-right px-2 py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {r.times_ms.map((time, i) => (
                  <tr key={i} className="border-t border-border/30 hover:bg-secondary/20">
                    <td className="px-2 py-0.5 text-muted-foreground">{i + 1}</td>
                    <td className={cn(
                      "px-2 py-0.5 text-right tabular-nums",
                      time > r.p95_ms ? "text-red-400" : time > r.avg_ms * 1.5 ? "text-yellow-500" : "text-muted-foreground"
                    )}>
                      {time}ms
                    </td>
                    <td className={cn("px-2 py-0.5 text-right", getStatusColor(r.statuses[i] ?? 0))}>
                      {r.statuses[i] ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* History Sidebar */}
      {showHistory && (
        <div className="w-64 shrink-0 border-l bg-card flex flex-col">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b shrink-0">
            <span className="text-[11px] font-medium text-muted-foreground">Benchmark History</span>
            <div className="flex items-center gap-1">
              {compareIds.length === 2 && compareEntries[0] && compareEntries[1] && (
                <button
                  onClick={handleCompareOpen}
                  className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-all duration-150"
                  title="Compare selected"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M9 12h6m-7 6h8" />
                  </svg>
                </button>
              )}
              {benchmarkHistory.length > 0 && (
                <button
                  onClick={async () => {
                    await clearBenchmarkHistory();
                    setActiveHistoryId(null);
                    setCompareIds([]);
                    loadBenchmarkHistory();
                    addToast("Benchmark history cleared", "info");
                  }}
                  className="p-1.5 rounded-lg text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
                  title="Clear history"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {benchmarkHistoryLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : benchmarkHistory.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <svg className="h-6 w-6 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.321 6.176c1.044-.363 2.136-.549 3.29-.549 5.531 0 8.39 5.262 7.202 9.813m-9.178 3.847c-1.043.363-2.136.549-3.29.549-5.531 0-8.39-5.262-7.202-9.813" />
                </svg>
                <span className="text-[11px] text-muted-foreground">No benchmark history</span>
                <span className="text-[9px] text-muted-foreground/50">Run a benchmark to see results here</span>
              </div>
            ) : (
              benchmarkHistory.map((entry) => (
                <HistoryListItem
                  key={entry.id}
                  entry={entry}
                  active={activeHistoryId === entry.id}
                  compareSelected={compareIds.includes(entry.id)}
                  onToggleCompare={() => toggleCompare(entry.id)}
                  onSelect={() => {
                    setActiveHistoryId(entry.id);
                    loadHistoricBenchmark(entry);
                  }}
                  onDelete={async () => {
                    if (activeHistoryId === entry.id) setActiveHistoryId(null);
                    setCompareIds((prev) => prev.filter((x) => x !== entry.id));
                    await deleteBenchmarkHistoryItem(entry.id);
                    addToast("Deleted benchmark entry", "info");
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Compare overlay */}
      {showCompareOverlay && compareEntries[0] && compareEntries[1] && (
        <BenchmarkCompareView
          entryA={compareEntries[0]}
          entryB={compareEntries[1]}
          onClose={handleCompareClose}
        />
      )}
    </div>
  );
}
