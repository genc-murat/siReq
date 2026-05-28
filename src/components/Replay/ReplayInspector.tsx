import { useState } from "react";
import { ReplayDiffViewer } from "./ReplayDiffViewer";
import type { ReplayEntry, ReplayEntryResult } from "@/lib/invoke";

interface ReplayInspectorProps {
  entry: ReplayEntry | null;
  entryResult?: ReplayEntryResult | null;
}

export function ReplayInspector({ entry, entryResult }: ReplayInspectorProps) {
  const [viewTab, setViewTab] = useState<"snapshots" | "diff" | "assertions">("snapshots");

  if (!entry) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-card/25 rounded-xl border border-border">
        <svg className="h-8 w-8 text-muted-foreground/35 mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5h.01" />
        </svg>
        <span className="text-xs">Select a request from the timeline to inspect its snapshot, assertions, and visual diff analysis.</span>
      </div>
    );
  }

  const renderHeaders = (headers: [string, string][]) => {
    if (headers.length === 0) return <span className="text-[10px] text-muted-foreground italic">No headers</span>;
    return (
      <div className="flex flex-col gap-1 text-[11px] font-mono">
        {headers.map(([k, v], idx) => (
          <div key={idx} className="flex gap-2">
            <span className="text-muted-foreground font-semibold shrink-0">{k}:</span>
            <span className="text-foreground/80 break-all">{v}</span>
          </div>
        ))}
      </div>
    );
  };

  const getStatusClass = (status: number) => {
    if (status >= 200 && status < 300) return "bg-green-500/10 text-green-500 border-green-500/20";
    if (status >= 400 && status < 500) return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    if (status >= 500) return "bg-red-500/10 text-red-500 border-red-500/20";
    return "bg-muted text-foreground border-border";
  };

  const replayedResp = entryResult?.replayed_response;
  const replayedReq = entryResult?.replayed_request;
  const diff = entryResult?.diff;
  const error = entryResult?.error;
  const assertionResults = entryResult?.assertion_results ?? [];

  return (
    <div className="flex-1 flex flex-col bg-card ring-1 ring-border rounded-xl overflow-hidden min-h-0">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-bold text-foreground truncate">
            {entry.original_request.name || entry.original_request.url}
          </span>
        </div>
        <div className="flex bg-background ring-1 ring-border rounded-lg p-0.5 shrink-0 gap-0.5">
          <button
            onClick={() => setViewTab("snapshots")}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all duration-150 ${
              viewTab === "snapshots" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setViewTab("diff")}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all duration-150 ${
              viewTab === "diff" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Diff Analyzer
          </button>
          <button
            onClick={() => setViewTab("assertions")}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all duration-150 flex items-center gap-1 ${
              viewTab === "assertions" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>Assertions</span>
            {assertionResults.length > 0 && (
              <span className={`h-1.5 w-1.5 rounded-full ${
                assertionResults.some((a) => a.enabled && !a.passed) ? "bg-red-500" : "bg-green-500"
              }`} />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        {viewTab === "snapshots" && (
          <div className="flex-1 overflow-auto p-4 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-3 min-h-0">
              <div className="flex items-center justify-between shrink-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Original Snapshot</span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getStatusClass(entry.original_response.status)}`}>
                  {entry.original_response.status} {entry.original_response.status_text}
                </span>
              </div>

              <div className="bg-background/45 ring-1 ring-border rounded-xl p-3 flex flex-col gap-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Request URL</span>
                  <span className="text-[11px] font-mono break-all font-semibold text-foreground/80">{entry.original_request.url}</span>
                </div>
                <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Request Headers</span>
                  {renderHeaders(entry.original_request.headers.map((h) => [h.key, h.value]))}
                </div>
                {entry.original_request.body && (
                  <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Request Body</span>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-card/65 rounded-lg border border-border p-2 text-foreground/80 max-h-[140px] overflow-auto">
                      {entry.original_request.body}
                    </pre>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 flex-1 min-h-[150px]">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Response Body</span>
                <pre className="flex-1 font-mono text-[11px] bg-background/50 ring-1 ring-border rounded-xl p-3 overflow-auto whitespace-pre text-foreground/95 select-text select-all">
                  {entry.original_response.body}
                </pre>
              </div>
            </div>

            <div className="flex flex-col gap-3 min-h-0 border-t md:border-t-0 md:border-l border-border/60 md:pl-4">
              <div className="flex items-center justify-between shrink-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Replayed Output</span>
                {replayedResp ? (
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getStatusClass(replayedResp.status)}`}>
                    {replayedResp.status} {replayedResp.status_text}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border">
                    Not Replayed
                  </span>
                )}
              </div>

              <div className="bg-background/45 ring-1 ring-border rounded-xl p-3 flex flex-col gap-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Request URL</span>
                  <span className="text-[11px] font-mono break-all font-semibold text-primary/90">
                    {replayedReq?.url ?? entry.original_request.url}
                  </span>
                </div>
                <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Request Headers</span>
                  {renderHeaders((replayedReq ?? entry.original_request).headers.map((h) => [h.key, h.value]))}
                </div>
                {entry.original_request.body && (
                  <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Request Body</span>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-card/65 rounded-lg border border-border p-2 text-foreground/80 max-h-[140px] overflow-auto">
                      {replayedReq?.body ?? entry.original_request.body}
                    </pre>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 flex-1 min-h-[150px]">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Response Body</span>
                {error ? (
                  <div className="flex-1 bg-destructive/5 border border-destructive/15 rounded-xl p-3 text-destructive font-mono text-[11px] overflow-auto">
                    {error}
                  </div>
                ) : replayedResp ? (
                  <pre className="flex-1 font-mono text-[11px] bg-background/50 ring-1 ring-border rounded-xl p-3 overflow-auto whitespace-pre text-foreground/95 select-text select-all">
                    {replayedResp.body}
                  </pre>
                ) : (
                  <div className="flex-1 border border-dashed border-border rounded-xl flex items-center justify-center text-muted-foreground text-xs">
                    Replay execution pending...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {viewTab === "diff" && (
          <div className="flex-1 overflow-hidden p-4 min-h-0 flex flex-col">
            <ReplayDiffViewer
              diff={diff ?? null}
              originalBody={entry.original_response.body}
            />
          </div>
        )}

        {viewTab === "assertions" && (
          <div className="flex-1 overflow-auto p-4 min-h-0 flex flex-col gap-3">
            <div className="flex flex-col gap-1 border-b border-border/60 pb-3 shrink-0">
              <span className="text-foreground font-semibold text-xs">Assertion Evaluation Report</span>
              <p className="text-[11px] text-muted-foreground">
                Lists all evaluated assertions for the replayed request execution.
              </p>
            </div>

            {assertionResults.length === 0 ? (
              <div className="border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-xs">
                No assertions evaluated for this replayed run. Define assertions in the Assertions tab.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {assertionResults.map((assertion) => (
                  <div
                    key={assertion.id}
                    className={`border rounded-xl p-3.5 flex items-center justify-between gap-4 ${
                      !assertion.enabled
                        ? "bg-card border-border/50 opacity-60"
                        : assertion.passed
                        ? "bg-green-500/5 border-green-500/15"
                        : "bg-destructive/5 border-destructive/15"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {assertion.enabled && (
                        <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                          assertion.passed ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"
                        }`}>
                          {assertion.passed ? (
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </div>
                      )}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-foreground/90 capitalize leading-none">
                          {assertion.type.replace("_", " ")} Matching
                        </span>
                        <span className="text-[10px] text-muted-foreground mt-1">
                          Expected: <code className="font-mono bg-muted/65 px-1 py-0.5 rounded border border-border text-foreground/80">{assertion.expected}</code>
                          {assertion.actual && (
                            <>
                              {" "}· Actual: <code className={`font-mono px-1 py-0.5 rounded border ${
                                assertion.passed ? "bg-green-500/10 border-green-500/10 text-green-500" : "bg-destructive/10 border-destructive/10 text-destructive"
                              }`}>{assertion.actual}</code>
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      !assertion.enabled
                        ? "bg-muted text-muted-foreground border border-border"
                        : assertion.passed
                        ? "bg-green-500/15 text-green-500 border border-green-500/10"
                        : "bg-destructive/15 text-destructive border border-destructive/10"
                    }`}>
                      {!assertion.enabled ? "Disabled" : assertion.passed ? "Passed" : "Failed"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
