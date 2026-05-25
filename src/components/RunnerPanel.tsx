import { useEffect } from "react";
import { useRunnerStore } from "@/stores/runnerStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { cn } from "@/lib/utils";

function statusColor(status: number): string {
  if (status === 0) return "text-red-500";
  if (status >= 200 && status < 300) return "text-green-500";
  if (status >= 300 && status < 400) return "text-yellow-500";
  if (status >= 400 && status < 500) return "text-orange-500";
  return "text-red-500";
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RunnerPanel() {
  const isRunning = useRunnerStore((s) => s.isRunning);
  const completed = useRunnerStore((s) => s.completed);
  const runResult = useRunnerStore((s) => s.runResult);
  const collectionId = useRunnerStore((s) => s.collectionId);
  const collectionName = useRunnerStore((s) => s.collectionName);
  const totalRequests = useRunnerStore((s) => s.totalRequests);
  const delayMs = useRunnerStore((s) => s.delayMs);
  const stopOnFailure = useRunnerStore((s) => s.stopOnFailure);
  const setDelayMs = useRunnerStore((s) => s.setDelayMs);
  const setStopOnFailure = useRunnerStore((s) => s.setStopOnFailure);
  const startRun = useRunnerStore((s) => s.startRun);
  const resetRunState = useRunnerStore((s) => s.resetRunState);

  const setShowRunner = useUIStore((s) => s.setShowRunner);
  const activeEnvironmentId = useUIStore((s) => s.activeEnvironmentId);
  const addToast = useToastStore((s) => s.addToast);

  const handleRun = () => {
    if (!collectionId) return;
    startRun(collectionId, collectionName, activeEnvironmentId);
  };

  const handleClose = () => {
    if (isRunning) return; // Don't close while running
    setShowRunner(false);
    resetRunState();
  };

  const progress = totalRequests > 0
    ? Math.round((runResult?.results.length ?? 0) / totalRequests * 100)
    : 0;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <button
          onClick={handleClose}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          title="Close runner"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            </svg>
            <div>
              <h2 className="text-sm font-semibold truncate">{collectionName}</h2>
              <p className="text-[10px] text-muted-foreground">Collection Runner</p>
            </div>
          </div>
        </div>
        {isRunning && (
          <div className="flex items-center gap-2 text-primary text-xs">
            <div className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Running...</span>
          </div>
        )}
        {completed && !isRunning && (
          <div className="flex items-center gap-2 text-xs">
            <span className={cn(
              "font-medium",
              (runResult?.failed ?? 0) > 0 ? "text-red-500" : "text-green-500"
            )}>
              {runResult?.passed}/{runResult?.total} passed
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto min-h-0 p-4 space-y-4">
        {/* Controls section */}
        {!isRunning && !completed && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Delay:</label>
                <select
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                  className="bg-background text-foreground text-xs px-2 py-1 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
                >
                  <option value={0}>None</option>
                  <option value={100}>100ms</option>
                  <option value={200}>200ms</option>
                  <option value={500}>500ms</option>
                  <option value={1000}>1s</option>
                  <option value={2000}>2s</option>
                  <option value={5000}>5s</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="stopOnFailure"
                  checked={stopOnFailure}
                  onChange={(e) => setStopOnFailure(e.target.checked)}
                  className="rounded-lg border-input"
                />
                <label htmlFor="stopOnFailure" className="text-xs text-muted-foreground">
                  Stop on failure
                </label>
              </div>
            </div>
            <button
              onClick={handleRun}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-all duration-150 flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
              Run Collection ({totalRequests} requests)
            </button>
          </div>
        )}

        {/* Summary card */}
        {completed && runResult && (
          <div className="grid grid-cols-4 gap-3">
            <SummaryCard label="Passed" value={runResult.passed.toString()} color="text-green-500" />
            <SummaryCard label="Failed" value={runResult.failed.toString()} color={runResult.failed > 0 ? "text-red-500" : "text-muted-foreground"} />
            <SummaryCard label="Total Time" value={formatTime(runResult.total_time_ms)} color="text-foreground" />
            <SummaryCard label="Avg Time" value={
              runResult.results.length > 0
                ? formatTime(runResult.results.reduce((s, r) => s + r.time_ms, 0) / runResult.results.length)
                : "-"
            } color="text-foreground" />
          </div>
        )}

        {/* Progress bar */}
        {isRunning && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Executing requests...</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Request results table */}
        {runResult && runResult.results.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Results ({runResult.results.length})
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Method</th>
                    <th className="px-3 py-2 font-medium">Name / URL</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Size</th>
                    <th className="px-3 py-2 font-medium">Tests</th>
                  </tr>
                </thead>
                <tbody>
                  {runResult.results.map((r, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "border-t border-border/40 hover:bg-muted/20 transition-all duration-150",
                        r.error && "bg-destructive/5"
                      )}
                    >
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2">
                        <span className="font-semibold">{r.request_method}</span>
                      </td>
                      <td className="px-3 py-2 max-w-[300px]">
                        <div className="truncate" title={`${r.request_name} — ${r.request_url}`}>
                          {r.request_name || r.request_url || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {r.error ? (
                          <span className="text-red-500 font-medium" title={r.error}>Error</span>
                        ) : (
                          <span className={cn("font-medium", statusColor(r.status_code))}>
                            {r.status_code} {r.status_text}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.time_ms > 0 ? formatTime(r.time_ms) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.size > 0 ? formatSize(r.size) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.test_results.length > 0 ? (
                          <div className="flex gap-1">
                            {(() => {
                              const passed = r.test_results.filter((t) => t.passed).length;
                              const failed = r.test_results.filter((t) => !t.passed).length;
                              return (
                                <>
                                  {passed > 0 && <span className="text-green-500">{passed}✓</span>}
                                  {failed > 0 && <span className="text-red-500">{failed}✗</span>}
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Run history */}
        <RunHistorySection />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className={cn("text-lg font-semibold", color)}>{value}</div>
    </div>
  );
}

function RunHistorySection() {
  const runHistory = useRunnerStore((s) => s.runHistory);
  const runHistoryLoading = useRunnerStore((s) => s.runHistoryLoading);
  const deleteRunHistoryItem = useRunnerStore((s) => s.deleteRunHistoryItem);
  const clearAllRunHistory = useRunnerStore((s) => s.clearAllRunHistory);
  const loadRunHistory = useRunnerStore((s) => s.loadRunHistory);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    loadRunHistory();
  }, [loadRunHistory]);

  if (runHistoryLoading) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">Loading history...</div>
    );
  }

  if (runHistory.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">No run history yet</div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Run History ({runHistory.length})
        </h3>
        <button
          onClick={clearAllRunHistory}
          className="text-[10px] text-destructive font-medium px-2 py-1 rounded-lg hover:bg-destructive/10 transition-all duration-150"
        >
          Clear all
        </button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Collection</th>
              <th className="px-3 py-2 font-medium">Passed/Failed</th>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {runHistory.map((entry) => (
              <tr key={entry.id} className="border-t border-border/40 hover:bg-muted/20 transition-all duration-150">
                <td className="px-3 py-2 font-medium max-w-[200px] truncate">{entry.collection_name}</td>
                <td className="px-3 py-2">
                  <span className="text-green-500">{entry.passed}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className={entry.failed > 0 ? "text-red-500" : "text-muted-foreground"}>{entry.failed}</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{formatTime(entry.total_time_ms)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(entry.started_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => deleteRunHistoryItem(entry.id)}
                    className="text-muted-foreground hover:text-destructive p-1 rounded-lg hover:bg-destructive/10 transition-all duration-150"
                    title="Delete entry"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
