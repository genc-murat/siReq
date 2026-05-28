import { useState } from "react";
import { useReplayStore } from "@/stores/replayStore";
import { replayImportHar } from "@/lib/invoke";
import type { ReplayRunComparison } from "@/lib/invoke";

export function ReplayRuns() {
  const {
    sessions,
    activeSessionId,
    runs,
    activeRunDetail,
    runComparison,
    selectedRunIds,
    loadRunDetail,
    deleteRun,
    compareSelectedRuns,
    setSelectedRunIds,
    entries,
  } = useReplayStore();

  const [showComparison, setShowComparison] = useState(false);

  const session = sessions.find((s) => s.id === activeSessionId);

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <span className="text-sm">No session active.</span>
      </div>
    );
  }

  const toggleRunSelect = (runId: string) => {
    const current = selectedRunIds;
    if (!current) {
      setSelectedRunIds([runId, ""]);
    } else if (current[0] === runId) {
      setSelectedRunIds(null);
    } else if (!current[1]) {
      setSelectedRunIds([current[0], runId]);
    } else if (current[1] === runId) {
      setSelectedRunIds([current[0], ""]);
    } else {
      setSelectedRunIds([current[0], runId]);
    }
  };

  const isSelected = (runId: string) => selectedRunIds?.includes(runId) ?? false;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "partial":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "failed":
        return "bg-destructive/10 text-destructive border-destructive/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-auto">
      <div className="max-w-5xl w-full mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold text-foreground tracking-tight">Replay Runs</h2>
            <p className="text-xs text-muted-foreground">
              Review past replay executions and compare runs to detect regressions.
            </p>
          </div>
          {selectedRunIds && selectedRunIds[0] && selectedRunIds[1] && (
            <button
              onClick={async () => {
                await compareSelectedRuns();
                setShowComparison(true);
              }}
              className="bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg hover:bg-primary/95 transition-all duration-150 shadow-sm"
            >
              Compare Runs
            </button>
          )}
        </div>

        {runs.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-xs">
            No runs recorded yet. Execute a replay to create the first run.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
              Run History ({runs.length}) — Select 2 to compare
            </span>
            {runs.map((run) => (
              <div
                key={run.id}
                className={`bg-card border rounded-xl p-3.5 flex items-center justify-between gap-4 transition-all duration-150 cursor-pointer ${
                  isSelected(run.id) ? "border-primary/45 ring-1 ring-primary/10" : "border-border hover:border-foreground/15"
                }`}
                onClick={() => loadRunDetail(run.id)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={isSelected(run.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleRunSelect(run.id);
                    }}
                    className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-primary accent-primary cursor-pointer shrink-0"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-foreground/90 truncate">
                      Run #{run.id.slice(0, 8)}
                    </span>
                    <span className="text-[9px] text-muted-foreground/75 mt-0.5">
                      {new Date(run.created_at).toLocaleString()} · {run.duration_ms}ms total
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${getStatusBadge(run.status)}`}>
                    {run.status}
                  </span>
                  {run.chaos_config?.enabled && (
                    <span className="text-[10px] font-bold bg-purple-500/10 text-purple-500 border border-purple-500/20 px-2 py-0.5 rounded">
                      Chaos
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRun(run.id);
                    }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showComparison && runComparison && (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-card/65 border-b border-border px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">Run Comparison</span>
              <button
                onClick={() => setShowComparison(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <span className="text-muted-foreground text-[9px] uppercase font-bold block mb-1">Run A</span>
                  <span className="font-mono font-bold">{runComparison.run_a.id.slice(0, 8)}</span>
                  <span className="text-muted-foreground block mt-0.5">{runComparison.run_a.duration_ms}ms · {new Date(runComparison.run_a.created_at).toLocaleString()}</span>
                </div>
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <span className="text-muted-foreground text-[9px] uppercase font-bold block mb-1">Run B</span>
                  <span className="font-mono font-bold">{runComparison.run_b.id.slice(0, 8)}</span>
                  <span className="text-muted-foreground block mt-0.5">{runComparison.run_b.duration_ms}ms · {new Date(runComparison.run_b.created_at).toLocaleString()}</span>
                </div>
              </div>

              {runComparison.comparisons.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-4">No matching entries to compare.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {runComparison.comparisons.map((comp) => {
                    const entry = entries.find((e) => e.id === comp.entry_id);
                    return (
                      <div key={comp.entry_id} className="bg-background/45 ring-1 ring-border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-foreground/90 truncate max-w-[60%]">
                            {entry?.original_request.url ?? comp.entry_id}
                          </span>
                          <div className="flex items-center gap-2">
                            {comp.status_diff && (
                              <span className="text-[9px] font-bold bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded">Status Changed</span>
                            )}
                            {comp.status_code_diff && (
                              <span className="text-[9px] font-bold bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                                {comp.status_code_diff[0]} → {comp.status_code_diff[1]}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Run A:</span>
                            <span className={comp.timing_diff_ms !== null && comp.timing_diff_ms > 0 ? "text-red-500" : "text-green-500"}>
                              {comp.result_a.replayed_response ? `${comp.result_a.replayed_response.time_ms}ms` : "N/A"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Run B:</span>
                            <span className={comp.timing_diff_ms !== null && comp.timing_diff_ms < 0 ? "text-green-500" : "text-red-500"}>
                              {comp.result_b.replayed_response ? `${comp.result_b.replayed_response.time_ms}ms` : "N/A"}
                            </span>
                          </div>
                        </div>
                        {comp.timing_diff_ms !== null && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-[9px] text-muted-foreground">Delta:</span>
                            <span className={`text-[10px] font-bold ${comp.timing_diff_ms > 0 ? "text-red-500" : "text-green-500"}`}>
                              {comp.timing_diff_ms > 0 ? "+" : ""}{comp.timing_diff_ms}ms
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeRunDetail && !showComparison && (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-card/65 border-b border-border px-4 py-3 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-foreground">Run Detail: {activeRunDetail.run.id.slice(0, 8)}</span>
                <span className="text-[10px] text-muted-foreground">{activeRunDetail.run.duration_ms}ms · {activeRunDetail.entry_results.length} entries</span>
              </div>
              <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${getStatusBadge(activeRunDetail.run.status)}`}>
                {activeRunDetail.run.status}
              </span>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {activeRunDetail.entry_results.map((er) => {
                const entry = entries.find((e) => e.id === er.entry_id);
                return (
                  <div key={er.id} className="bg-background/45 ring-1 ring-border rounded-lg p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${er.status === "completed" ? "bg-green-500" : "bg-destructive"}`} />
                      <span className="text-xs font-mono truncate text-foreground/90">
                        {entry?.original_request.url ?? er.entry_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {er.replayed_response && (
                        <span className="text-[10px] font-mono font-bold text-muted-foreground">
                          {er.replayed_response.status} · {er.replayed_response.time_ms}ms
                        </span>
                      )}
                      {er.error && (
                        <span className="text-[9px] text-destructive truncate max-w-[200px]">{er.error}</span>
                      )}
                      <span className="text-[9px] font-bold text-muted-foreground">
                        {er.assertion_results.filter((a) => a.passed).length}/{er.assertion_results.length} passed
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
