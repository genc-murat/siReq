import { useState } from "react";
import type { ReplayDiff } from "@/lib/invoke";

interface ReplayDiffViewerProps {
  diff: ReplayDiff | null;
  originalBody: string;
}

export function ReplayDiffViewer({ diff, originalBody }: ReplayDiffViewerProps) {
  const [tab, setTab] = useState<"body" | "headers" | "schema" | "timing">("body");

  if (!diff) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-card/25 rounded-xl border border-border">
        <svg className="h-8 w-8 text-muted-foreground/45 mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-xs">No diff available. Replay the request to compare outputs.</span>
      </div>
    );
  }

  // Latency heat calculations
  const timingDiff = diff.timing_diff_ms;
  const isSlower = timingDiff > 0;
  const timingPercent = Math.min(100, Math.max(10, Math.round((Math.abs(timingDiff) / 500) * 100)));

  return (
    <div className="flex-1 flex flex-col bg-background/50 ring-1 ring-border rounded-xl overflow-hidden min-h-0">
      {/* Tabs */}
      <div className="flex border-b border-border bg-card/65 shrink-0 px-3 py-1 gap-1">
        <button
          onClick={() => setTab("body")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
            tab === "body" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          }`}
        >
          <span>Response Body</span>
          {(diff.body_diff.added_keys.length > 0 || diff.body_diff.removed_keys.length > 0 || diff.body_diff.modified_keys.length > 0) && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          )}
        </button>
        <button
          onClick={() => setTab("headers")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
            tab === "headers" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          }`}
        >
          <span>Headers</span>
          {(diff.headers_diff.added.length > 0 || diff.headers_diff.removed.length > 0 || diff.headers_diff.modified.length > 0) && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          )}
        </button>
        <button
          onClick={() => setTab("schema")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
            tab === "schema" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          }`}
        >
          <span>Schema Drift</span>
          {diff.schema_drift.length > 0 && (
            <span className="bg-destructive/15 text-destructive text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {diff.schema_drift.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("timing")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
            tab === "timing" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          }`}
        >
          <span>Latency Analysis</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isSlower ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"}`}>
            {isSlower ? `+${timingDiff}ms` : `${timingDiff}ms`}
          </span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 overflow-auto p-4 min-h-0 text-xs font-mono select-text">
        {tab === "body" && (
          <div className="flex flex-col gap-3 h-full">
            {diff.body_diff.type === "json" ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2 shrink-0">
                  <span className="bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-[10px] px-2 py-0.5 rounded-lg font-semibold">
                    +{diff.body_diff.added_keys.length} Added
                  </span>
                  <span className="bg-destructive/10 border border-destructive/20 text-destructive text-[10px] px-2 py-0.5 rounded-lg font-semibold">
                    -{diff.body_diff.removed_keys.length} Removed
                  </span>
                  <span className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] px-2 py-0.5 rounded-lg font-semibold">
                    ~{diff.body_diff.modified_keys.length} Modified
                  </span>
                </div>

                {diff.body_diff.added_keys.length === 0 && diff.body_diff.removed_keys.length === 0 && diff.body_diff.modified_keys.length === 0 ? (
                  <div className="bg-green-500/5 text-green-500/90 text-xs rounded-xl p-4 text-center border border-green-500/10 mt-4">
                    Response body exactly matches the original snapshot. No differences found.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {diff.body_diff.added_keys.map((k) => (
                      <div key={k} className="flex items-center gap-2 p-2 bg-green-500/5 ring-1 ring-green-500/10 rounded-lg">
                        <span className="text-green-500 font-bold shrink-0">[+]</span>
                        <span className="font-semibold text-foreground">{k}</span>
                        <span className="text-muted-foreground/70 ml-auto">Added to replayed response</span>
                      </div>
                    ))}

                    {diff.body_diff.removed_keys.map((k) => (
                      <div key={k} className="flex items-center gap-2 p-2 bg-destructive/5 ring-1 ring-destructive/10 rounded-lg">
                        <span className="text-destructive font-bold shrink-0">[-]</span>
                        <span className="font-semibold text-foreground">{k}</span>
                        <span className="text-muted-foreground/70 ml-auto">Removed from replayed response</span>
                      </div>
                    ))}

                    {diff.body_diff.modified_keys.map((m) => (
                      <div key={m.key} className="flex flex-col gap-1 p-2 bg-amber-500/5 ring-1 ring-amber-500/10 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-500 font-bold shrink-0">[~]</span>
                          <span className="font-semibold text-foreground">{m.key}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-1 border-t border-amber-500/10 pt-1 text-[11px]">
                          <div>
                            <span className="text-muted-foreground/60 block text-[9px] uppercase tracking-wider font-semibold">Original</span>
                            <span className="text-destructive line-through whitespace-pre-wrap break-all">{m.original}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground/60 block text-[9px] uppercase tracking-wider font-semibold">Replayed</span>
                            <span className="text-green-500 whitespace-pre-wrap break-all">{m.replayed}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 whitespace-pre-wrap break-all bg-card/45 ring-1 ring-border rounded-xl p-4">
                {diff.body_diff.text_diff?.map((line, idx) => (
                  <div
                    key={idx}
                    className={`p-1.5 rounded-lg border leading-relaxed ${
                      line.type === "added"
                        ? "bg-green-500/10 text-green-500 border-green-500/20 font-bold"
                        : line.type === "removed"
                        ? "bg-destructive/10 text-destructive border-destructive/20 font-bold line-through"
                        : line.type === "modified"
                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20 font-bold"
                        : "text-foreground/75 border-transparent"
                    }`}
                  >
                    {line.value}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "headers" && (
          <div className="flex flex-col gap-3">
            {diff.headers_diff.added.length === 0 && diff.headers_diff.removed.length === 0 && diff.headers_diff.modified.length === 0 ? (
              <div className="bg-green-500/5 text-green-500/90 rounded-xl p-4 text-center border border-green-500/10 mt-4">
                Response headers exactly match the original snapshot.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {diff.headers_diff.added.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 p-2 bg-green-500/5 ring-1 ring-green-500/10 rounded-lg">
                    <span className="text-green-500 font-bold shrink-0">[+]</span>
                    <span className="font-semibold text-foreground">{k}:</span>
                    <span className="text-green-500 truncate">{v}</span>
                  </div>
                ))}

                {diff.headers_diff.removed.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 p-2 bg-destructive/5 ring-1 ring-destructive/10 rounded-lg">
                    <span className="text-destructive font-bold shrink-0">[-]</span>
                    <span className="font-semibold text-foreground">{k}:</span>
                    <span className="text-destructive/80 line-through truncate">{v}</span>
                  </div>
                ))}

                {diff.headers_diff.modified.map((m) => (
                  <div key={m.name} className="flex flex-col gap-1 p-2 bg-amber-500/5 ring-1 ring-amber-500/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-500 font-bold shrink-0">[~]</span>
                      <span className="font-semibold text-foreground">{m.name}:</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-1 border-t border-amber-500/10 pt-1 text-[11px]">
                      <div>
                        <span className="text-muted-foreground/60 block text-[9px] uppercase tracking-wider font-semibold">Original</span>
                        <span className="text-destructive truncate">{m.original}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground/60 block text-[9px] uppercase tracking-wider font-semibold">Replayed</span>
                        <span className="text-green-500 truncate">{m.replayed}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "schema" && (
          <div className="flex flex-col gap-3">
            {diff.schema_drift.length === 0 ? (
              <div className="bg-green-500/5 text-green-500/90 rounded-xl p-4 text-center border border-green-500/10 mt-4">
                No schema changes or field type shifts detected. Response schema is stable.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {diff.schema_drift.map((driftMsg, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 p-3 bg-destructive/5 border border-destructive/10 rounded-xl">
                    <svg className="h-4 w-4 text-destructive shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <span className="font-semibold text-destructive block">Schema Shift Detected</span>
                      <p className="text-[11px] text-foreground/80 mt-0.5">{driftMsg}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "timing" && (
          <div className="flex flex-col gap-6 p-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-foreground font-semibold">Latency Differential Analysis</span>
              <p className="text-xs text-muted-foreground">
                Compares response speed metrics between production captured time and local replayed time.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1 text-center">
                <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Original Time</span>
                <span className="text-xl font-bold text-foreground">
                  {originalBody ? JSON.parse(originalBody || "{}").__time ?? "120ms" : "120ms"}
                  {/* Fallback to simple simulated original time if not inside body */}
                  {diff.timing_diff_ms !== undefined ? " (Snapshot)" : ""}
                </span>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1 text-center">
                <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Replayed Time</span>
                <span className={`text-xl font-bold ${isSlower ? "text-red-500" : "text-green-500"}`}>
                  {originalBody ? (JSON.parse(originalBody || "{}").__time ?? 120) + diff.timing_diff_ms : 120 + diff.timing_diff_ms}ms
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-muted-foreground uppercase tracking-wider">Performance Delta</span>
                <span className={isSlower ? "text-red-500" : "text-green-500"}>
                  {isSlower ? `+${timingDiff}ms Slower` : `${timingDiff}ms Faster`}
                </span>
              </div>

              <div className="h-2 w-full bg-muted rounded-full overflow-hidden mt-1 flex">
                <div
                  style={{ width: `${timingPercent}%` }}
                  className={`h-full rounded-full transition-all duration-300 ${isSlower ? "bg-red-500" : "bg-green-500"}`}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
