import { Fragment, useEffect, useRef, useState } from "react";
import { useRunnerStore } from "@/stores/runnerStore";
import { useFlowStore } from "@/stores/flowStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { buildRunnerChainData } from "@/lib/runnerChainUtils";

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

export function RunnerPanel() {
  const isRunning = useRunnerStore((s) => s.isRunning);
  const completed = useRunnerStore((s) => s.completed);
  const runResult = useRunnerStore((s) => s.runResult);
  const mode = useRunnerStore((s) => s.mode);
  const collectionId = useRunnerStore((s) => s.collectionId);
  const collectionName = useRunnerStore((s) => s.collectionName);
  const flowName = useRunnerStore((s) => s.flowName);
  const totalRequests = useRunnerStore((s) => s.totalRequests);
  const delayMs = useRunnerStore((s) => s.delayMs);
  const stopOnFailure = useRunnerStore((s) => s.stopOnFailure);
  const setDelayMs = useRunnerStore((s) => s.setDelayMs);
  const setStopOnFailure = useRunnerStore((s) => s.setStopOnFailure);
  const startRun = useRunnerStore((s) => s.startRun);
  const runFlow = useRunnerStore((s) => s.runFlow);
  const resetRunState = useRunnerStore((s) => s.resetRunState);

  // Data-driven state
  const dataDrivenMode = useRunnerStore((s) => s.dataDrivenMode);
  const dataset = useRunnerStore((s) => s.dataset);
  const datasetFileName = useRunnerStore((s) => s.datasetFileName);
  const setDataDrivenMode = useRunnerStore((s) => s.setDataDrivenMode);
  const setDataset = useRunnerStore((s) => s.setDataset);

  const setShowRunner = useUIStore((s) => s.setShowRunner);
  const activeEnvironmentId = useUIStore((s) => s.activeEnvironmentId);

  // Flow execution live state
  const flowNodes = useFlowStore((s) => s.nodes);
  const flowLogs = useFlowStore((s) => s.logs);
  const flowActiveNodeId = useFlowStore((s) => s.activeNodeId);
  const flowIsRunning = useFlowStore((s) => s.isRunning);
  const flowVariables = useFlowStore((s) => s.variables);
  const stopFlow = useFlowStore((s) => s.stopFlow);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleRun = () => {
    if (mode === "flow") {
      setParseError(null);
      runFlow(flowName, activeEnvironmentId);
    } else if (collectionId) {
      setParseError(null);
      startRun(collectionId, collectionName, activeEnvironmentId);
    }
  };

  const handleClose = () => {
    if (isRunning) return;
    setShowRunner(false);
    resetRunState();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    try {
      const text = await file.text();
      const fileName = file.name;

      if (fileName.endsWith(".csv")) {
        // Parse CSV
        const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        if (lines.length < 2) {
          setParseError("CSV must have a header row and at least one data row");
          return;
        }
        const headers = lines[0].split(",").map((h) => h.trim());
        const rows = lines.slice(1).map((line) => {
          const values = line.split(",").map((v) => v.trim());
          const row: Record<string, string> = {};
          headers.forEach((h, i) => {
            row[h] = values[i] ?? "";
          });
          return { values: row };
        });

        setDataset(
          { name: file.name.replace(/\.[^/.]+$/, ""), rows },
          file.name
        );
      } else if (fileName.endsWith(".json")) {
        // Parse JSON (array of objects)
        const data = JSON.parse(text);
        if (!Array.isArray(data) || data.length === 0) {
          setParseError("JSON must be a non-empty array of objects");
          return;
        }
        const rows = data.map((item: Record<string, unknown>) => ({
          values: Object.fromEntries(
            Object.entries(item).map(([k, v]) => [k, String(v ?? "")])
          ),
        }));

        setDataset(
          { name: file.name.replace(/\.[^/.]+$/, ""), rows },
          file.name
        );
      } else {
        setParseError("Unsupported file format. Use .csv or .json");
      }
    } catch (err) {
      setParseError(`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Reset file input so same file can be re-uploaded
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const progress = totalRequests > 0
    ? Math.round((runResult?.results.length ?? 0) / totalRequests * 100)
    : 0;

  const [expandedVarsRow, setExpandedVarsRow] = useState<number | null>(null);

  const { extractionGroups, chainFlow, totalExtractions } = buildRunnerChainData(runResult);

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
            {mode === "flow" ? (
              <svg className="h-5 w-5 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="6" cy="6" r="3" />
                <circle cx="18" cy="18" r="3" />
                <circle cx="18" cy="6" r="3" />
                <path d="M6 9v7a3 3 0 0 0 3 3h6M18 9v6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
            )}
            <div>
              <h2 className="text-sm font-semibold truncate">{mode === "flow" ? flowName : collectionName}</h2>
              <p className="text-[10px] text-muted-foreground">
                {mode === "flow"
                  ? dataDrivenMode ? "Data-Driven Flow Runner" : "Flow Runner"
                  : dataDrivenMode ? "Data-Driven Runner" : "Collection Runner"}
              </p>
            </div>
          </div>
        </div>
        {isRunning && (
          <div className="flex items-center gap-2 text-primary text-xs">
            <div className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {mode === "flow" && flowActiveNodeId ? (
              <span>Executing: {flowNodes.find(n => n.id === flowActiveNodeId)?.name || "..."}</span>
            ) : (
              <span>Running...</span>
            )}
          </div>
        )}
        {completed && !isRunning && (
          <div className="flex items-center gap-2 text-xs">
            <span className={cn(
              "font-medium",
              (runResult?.failed ?? 0) > 0 ? "text-red-500" : "text-green-500"
            )}>
              {runResult?.passed}/{runResult?.total} iterations passed
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto min-h-0 p-4 space-y-4">
        {/* Flow summary: node statuses when flow is completed */}
        {mode === "flow" && completed && runResult && (
          <div className="border rounded-lg overflow-hidden">
            <div className="text-[10px] font-medium text-muted-foreground px-3 py-1.5 border-b bg-muted/30 flex items-center gap-1.5">
              <svg className="h-3 w-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="6" cy="6" r="3" />
                <circle cx="18" cy="18" r="3" />
                <circle cx="18" cy="6" r="3" />
                <path d="M6 9v7a3 3 0 0 0 3 3h6M18 9v6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Flow Nodes ({flowNodes.length})
            </div>
            <div className="text-[10px] font-mono divide-y divide-border/40">
              {flowNodes.map((node) => (
                <div key={node.id} className="px-3 py-1.5 flex items-center gap-2 hover:bg-accent/20 transition-all duration-150">
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    node.status === "success" ? "bg-green-500" :
                    node.status === "failure" ? "bg-red-500" :
                    node.status === "running" ? "bg-yellow-500 animate-pulse" :
                    "bg-muted-foreground/30"
                  )} />
                  <span className="font-semibold text-foreground shrink-0">{node.type}</span>
                  <span className="text-muted-foreground truncate">{node.name}</span>
                  <span className="ml-auto">
                    {node.status === "success" && <span className="text-green-500">✓</span>}
                    {node.status === "failure" && <span className="text-red-500">✗ {node.error || ""}</span>}
                    {node.status === "idle" && <span className="text-muted-foreground/40">—</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flow logs */}
        {mode === "flow" && flowLogs.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="text-[10px] font-medium text-muted-foreground px-3 py-1.5 border-b bg-muted/30 flex items-center gap-1.5">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Flow Logs ({flowLogs.length})
            </div>
            <div className="max-h-40 overflow-auto font-mono text-[10px] divide-y divide-border/40">
              {flowLogs.slice(-50).map((log) => (
                <div key={log.id} className="px-3 py-1 flex items-start gap-1.5 hover:bg-accent/20">
                  <span className={cn(
                    "shrink-0 px-1 rounded text-[8px] font-bold uppercase",
                    log.level === "success" && "text-green-500 bg-green-950/20",
                    log.level === "error" && "text-red-500 bg-red-950/20",
                    log.level === "warn" && "text-yellow-500 bg-yellow-950/20",
                    log.level === "info" && "text-muted-foreground bg-muted/30"
                  )}>{log.level}</span>
                  <span className="text-muted-foreground break-all">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flow variables summary */}
        {mode === "flow" && completed && Object.keys(flowVariables).length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="text-[10px] font-medium text-muted-foreground px-3 py-1.5 border-b bg-muted/30 flex items-center gap-1.5">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
              Flow Variables ({Object.keys(flowVariables).length})
            </div>
            <div className="text-[10px] font-mono divide-y divide-border/40">
              {Object.entries(flowVariables).map(([key, value]) => (
                <div key={key} className="px-3 py-1.5 flex items-center gap-2 hover:bg-accent/20 transition-all duration-150">
                  <span className="font-semibold text-foreground shrink-0">{key}</span>
                  <span className="text-muted-foreground/40">=</span>
                  <span className="text-primary truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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

            {/* Data-driven mode toggle */}
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="dataDrivenMode"
                    checked={dataDrivenMode}
                    onChange={(e) => {
                      setDataDrivenMode(e.target.checked);
                      if (!e.target.checked) {
                        setDataset(null, "");
                      }
                    }}
                    className="rounded-lg border-input"
                  />
                  <label htmlFor="dataDrivenMode" className="text-xs font-medium text-foreground">
                    Data-Driven Run
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    Run collection with multiple data sets
                  </span>
                </div>
              </div>

              {dataDrivenMode && (
                <div className="space-y-2 pl-6">
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.json"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="datasetFileInput"
                    />
                    <label
                      htmlFor="datasetFileInput"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border rounded-lg hover:bg-accent cursor-pointer transition-all duration-150"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Upload CSV/JSON
                    </label>
                    {dataset && (
                      <span className="text-[10px] text-green-500 font-medium">
                        {datasetFileName} ({dataset.rows.length} rows)
                      </span>
                    )}
                  </div>
                  {parseError && (
                    <div className="text-[10px] text-red-500">{parseError}</div>
                  )}
                  {dataset && dataset.rows.length > 0 && (
                    <div className="text-[10px] text-muted-foreground space-y-1">
                      <div className="font-medium text-foreground">Dataset Preview:</div>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="bg-muted/50 text-left">
                              {Object.keys(dataset.rows[0].values).map((key) => (
                                <th key={key} className="px-2 py-1 font-medium">{key}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {dataset.rows.slice(0, 3).map((row, i) => (
                              <tr key={i} className="border-t border-border/40">
                                {Object.values(row.values).map((val, j) => (
                                  <td key={j} className="px-2 py-1 truncate max-w-[120px]" title={val}>{val}</td>
                                ))}
                              </tr>
                            ))}
                            {dataset.rows.length > 3 && (
                              <tr className="border-t border-border/40">
                                <td colSpan={Object.keys(dataset.rows[0].values).length} className="px-2 py-1 text-muted-foreground italic">
                                  ...and {dataset.rows.length - 3} more rows
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span>Each row will run <strong>{totalRequests}</strong> request(s)</span>
                        <span className="text-muted-foreground/50">→</span>
                        <span className="font-medium text-primary">{totalRequests * dataset.rows.length} total executions</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleRun}
              disabled={dataDrivenMode && !dataset}
              className={cn(
                "px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-all duration-150 flex items-center gap-2",
                (dataDrivenMode && !dataset) && "opacity-50 cursor-not-allowed"
              )}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
              {mode === "flow"
                ? dataDrivenMode && dataset
                  ? `Run Flow (${dataset.rows.length} iterations)`
                  : `Run Flow`
                : dataDrivenMode && dataset
                  ? `Run (${totalRequests * dataset.rows.length} executions)`
                  : `Run Collection (${totalRequests} requests)`}
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

        {/* Extracted variables summary — grouped by request */}
        {completed && totalExtractions > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="text-[10px] font-medium text-muted-foreground px-3 py-1.5 border-b bg-muted/30 flex items-center gap-1.5">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
              Extracted Variables ({totalExtractions} from {extractionGroups.length} request{extractionGroups.length > 1 ? "s" : ""})
            </div>
            <div className="divide-y divide-border/40">
              {extractionGroups.map((group) => (
                <div key={group.index}>
                  {/* Request header */}
                  <div className="px-3 py-1.5 flex items-center gap-2 bg-muted/20 text-[10px] font-medium">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded font-bold",
                      group.hasError ? "bg-red-950/20 text-red-500" :
                      group.statusCode >= 200 && group.statusCode < 300 ? "bg-green-950/20 text-green-500" :
                      "bg-yellow-950/20 text-yellow-500"
                    )}>
                      #{group.index + 1}
                    </span>
                    <span className="font-mono text-muted-foreground">{group.requestMethod}</span>
                    <span className="text-foreground truncate" title={group.requestName}>{group.requestName}</span>
                    <span className="ml-auto text-primary font-semibold">{group.variables.length} var{group.variables.length > 1 ? "s" : ""}</span>
                  </div>
                  {/* Variables list */}
                  <div className="text-[10px] font-mono">
                    {group.variables.map(([key, value], vi) => (
                      <div key={vi} className="px-6 py-1.5 flex items-center gap-2 hover:bg-accent/20 transition-all duration-150 border-t border-border/20">
                        <svg className="h-2.5 w-2.5 text-cyan-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="font-semibold text-foreground shrink-0">{key}</span>
                        <span className="text-muted-foreground/40">=</span>
                        <span className="text-primary truncate" title={value}>{value}</span>
                        {/* Show chain indicator if this var flows to a later request */}
                        {chainFlow.filter(f => f.varName === key && f.fromIndex === group.index).length > 0 && (
                          <span className="ml-auto text-[8px] text-cyan-500 font-medium flex items-center gap-1">
                            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            chained
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* Chain flow summary */}
            {chainFlow.length > 0 && (
              <div className="border-t border-border/40 px-3 py-2 bg-muted/10">
                <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Chain Flow
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {chainFlow.map((flow, fi) => (
                    <div key={fi} className="flex items-center gap-1 text-[9px] bg-cyan-950/15 text-cyan-400 rounded px-1.5 py-0.5 font-medium">
                      <span>#{flow.fromIndex + 1}</span>
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      <span className="font-semibold text-cyan-200">{flow.varName}</span>
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      <span>#{flow.toIndex + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Progress bar */}
        {isRunning && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{mode === "flow" ? "Executing flow nodes..." : "Executing requests..."}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            {/* Flow active node indicator */}
            {mode === "flow" && flowActiveNodeId && (
              <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-1">
                <div className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
                Current: {flowNodes.find(n => n.id === flowActiveNodeId)?.name || "..."}
              </div>
            )}
          </div>
        )}

        {/* Flow Stop button during execution */}
        {mode === "flow" && flowIsRunning && (
          <button
            onClick={() => stopFlow()}
            className="w-full px-3 py-2 bg-red-600 text-white hover:bg-red-500 text-xs font-bold rounded-lg shadow-md transition-all duration-150 flex items-center justify-center gap-2"
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
            Stop Flow Execution
          </button>
        )}

        {/* Request results table */}
        {runResult && runResult.results.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {mode === "flow" ? "Iteration Results" : "Results"} ({runResult.results.length})
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Iter</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Vars</th>
                  </tr>
                </thead>
                <tbody>
                  {runResult.results.map((r, i) => (
                    <Fragment key={i}>
                      <tr
                        className={cn(
                          "border-t border-border/40 hover:bg-muted/20 transition-all duration-150",
                          r.error && "bg-destructive/5"
                        )}
                      >
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          {r.iteration !== null && r.iteration !== undefined ? (
                            <span className="text-[10px] bg-muted rounded px-1.5 py-0.5 font-medium">
                              #{r.iteration + 1}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-[10px]">
                            {mode === "flow" ? (
                              <span className="text-cyan-400">FLOW</span>
                            ) : (
                              r.request_method
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 max-w-[250px]">
                          <div className="truncate" title={`${r.request_name} — ${r.request_url}`}>
                            {mode === "flow" ? (
                              <span>{r.request_url || "Flow Execution"}</span>
                            ) : (
                              r.request_name || r.request_url || "—"
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {r.error ? (
                            <span className="text-red-500 font-medium" title={r.error}>Error</span>
                          ) : (
                            <span className={cn("font-medium", statusColor(r.status_code))}>
                              {r.status_code}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {r.time_ms > 0 ? formatTime(r.time_ms) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {r.extracted_variables && r.extracted_variables.length > 0 ? (
                            <button
                              onClick={() => setExpandedVarsRow(expandedVarsRow === i ? null : i)}
                              className="text-[10px] text-primary font-medium hover:text-primary/80 transition-all duration-150 flex items-center gap-1"
                            >
                              <svg className={cn(
                                "h-3 w-3 transition-transform duration-150",
                                expandedVarsRow === i && "rotate-90"
                              )} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              {r.extracted_variables.length} var{r.extracted_variables.length > 1 ? "s" : ""}
                            </button>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                      </tr>
                      {expandedVarsRow === i && r.extracted_variables && r.extracted_variables.length > 0 && (
                        <tr className="bg-cyan-950/5">
                          <td colSpan={7} className="px-6 py-2">
                            <div className="text-[10px] font-mono space-y-1">
                              {r.extracted_variables.map(([key, value], vi) => (
                                <div key={vi} className="flex items-center gap-2 hover:bg-accent/20 px-2 py-0.5 rounded transition-all duration-150">
                                  <svg className="h-2.5 w-2.5 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                  </svg>
                                  <span className="font-bold text-foreground">{key}</span>
                                  <span className="text-muted-foreground/40">=</span>
                                  <span className="text-primary truncate max-w-[300px]" title={value}>{value}</span>
                                  {chainFlow.some(f => f.varName === key && f.fromIndex === i) && (
                                    <span className="ml-auto text-[8px] text-cyan-500 font-medium">→ chained to request #{chainFlow.filter(f => f.varName === key && f.fromIndex === i).map(f => f.toIndex + 1).join(", ")}</span>
                                  )}
                                  {chainFlow.some(f => f.varName === key && f.toIndex === i) && (
                                    <span className="ml-auto text-[8px] text-yellow-500 font-medium">← from request #{chainFlow.filter(f => f.varName === key && f.toIndex === i).map(f => f.fromIndex + 1).join(", ")}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
