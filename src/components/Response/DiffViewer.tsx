import { useMemo, useState } from "react";
import { diffLines, type Change } from "diff";
import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import type { HttpResponse } from "@/lib/invoke";

type DiffView = "unified" | "split";
type DiffScope = "body" | "headers" | "both";

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return "text-green-500";
  if (status >= 300 && status < 400) return "text-yellow-500";
  if (status >= 400 && status < 500) return "text-orange-500";
  return "text-red-500";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DiffSummaryBar({ a, b }: { a: HttpResponse; b: HttpResponse }) {
  const statusDiff = a.status !== b.status;
  const timeDiff = Math.abs(a.time_ms - b.time_ms);
  const sizeDiff = Math.abs(a.size - b.size);
  const timeDir = a.time_ms < b.time_ms ? "slower" : a.time_ms > b.time_ms ? "faster" : "same";
  const sizeDir = a.size < b.size ? "larger" : a.size > b.size ? "smaller" : "same";

  return (
    <div className="flex items-center gap-3 px-3 py-2 text-xs border-b bg-card shrink-0 flex-wrap">
      {/* Status */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Status:</span>
        <span className={cn("font-semibold", statusColor(a.status))}>{a.status}</span>
        <span className="text-muted-foreground">vs</span>
        <span className={cn("font-semibold", statusColor(b.status))}>{b.status}</span>
        {statusDiff && (
          <span className="text-yellow-500 text-[10px] bg-yellow-500/10 rounded-lg px-1.5 py-0.5 font-medium">Changed</span>
        )}
      </div>
      <span className="w-px h-3.5 bg-border/40 shrink-0" />
      {/* Time */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Time:</span>
        <span className="font-medium">{a.time_ms}ms</span>
        <span className="text-muted-foreground">vs</span>
        <span className="font-medium">{b.time_ms}ms</span>
        {timeDir !== "same" && (
          <span className={cn("text-[10px] rounded-lg px-1.5 py-0.5 font-medium", timeDir === "faster" ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10")}>
            {timeDiff}ms {timeDir}
          </span>
        )}
      </div>
      <span className="w-px h-3.5 bg-border/40 shrink-0" />
      {/* Size */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Size:</span>
        <span className="font-medium">{formatSize(a.size)}</span>
        <span className="text-muted-foreground">vs</span>
        <span className="font-medium">{formatSize(b.size)}</span>
        {sizeDir !== "same" && (
          <span className="text-muted-foreground text-[10px]">{formatSize(sizeDiff)} {sizeDir}</span>
        )}
      </div>
    </div>
  );
}

function DiffHunk({ change, isLeft, view }: { change: Change; isLeft: boolean; view: DiffView }) {
  if (change.removed && !isLeft) return null;
  if (change.added && isLeft && view === "split") return null;

  const isAdded = change.added;
  const isRemoved = change.removed;

  const bgClass = isAdded
    ? "bg-green-500/10 border-l-2 border-green-500"
    : isRemoved
      ? "bg-red-500/10 border-l-2 border-red-500"
      : "border-l-2 border-transparent";

  const sign = isAdded ? "+ " : isRemoved ? "- " : "  ";

  return (
    <div className={cn("flex font-mono text-xs leading-relaxed", bgClass)}>
      <span className={cn(
        "w-6 shrink-0 text-right select-none",
        isAdded ? "text-green-500/60" : isRemoved ? "text-red-500/60" : "text-muted-foreground/30"
      )}>
        {sign}
      </span>
      <span className={cn(
        "whitespace-pre-wrap break-all flex-1",
        isAdded ? "text-green-600 dark:text-green-400" : isRemoved ? "text-red-600 dark:text-red-400" : "text-foreground"
      )}>
        {change.value.replace(/\n$/, "")}
      </span>
    </div>
  );
}

function UnifiedDiffView({ changes }: { changes: Change[] }) {
  return (
    <div className="py-1">
      {changes.map((change, i) => (
        <DiffHunk key={i} change={change} isLeft={false} view="unified" />
      ))}
    </div>
  );
}

function SplitDiffView({ changes }: { changes: Change[] }) {
  const leftLines: { value: string; type: "same" | "removed" }[] = [];
  const rightLines: { value: string; type: "same" | "added" }[] = [];

  for (const change of changes) {
    if (change.removed) {
      leftLines.push({ value: change.value, type: "removed" });
    } else if (change.added) {
      rightLines.push({ value: change.value, type: "added" });
    } else {
      // Unchanged — split into individual lines for alignment
      const lines = change.value.split("\n");
      const lastIdx = lines.length - 1;
      for (let i = 0; i < lastIdx; i++) {
        leftLines.push({ value: lines[i] + "\n", type: "same" });
        rightLines.push({ value: lines[i] + "\n", type: "same" });
      }
    }
  }

  const maxLines = Math.max(leftLines.length, rightLines.length);
  const rows: { left: typeof leftLines[0] | null; right: typeof rightLines[0] | null }[] = [];

  for (let i = 0; i < maxLines; i++) {
    rows.push({
      left: leftLines[i] ?? null,
      right: rightLines[i] ?? null,
    });
  }

  return (
    <div className="flex min-h-0">
      {/* Left pane */}
      <div className="w-1/2 border-r border-border min-w-0">
        {rows.map((row, i) => (
          <div
            key={i}
            className={cn(
              "flex font-mono text-xs leading-relaxed",
              row.left?.type === "removed" ? "bg-red-500/10" : row.left?.type === "same" ? "" : "bg-muted/20"
            )}
          >
            <span className={cn(
              "w-6 shrink-0 text-right select-none",
              row.left?.type === "removed" ? "text-red-500/60" : "text-muted-foreground/30"
            )}>
              {row.left?.type === "removed" ? "- " : "  "}
            </span>
            <span className={cn(
              "whitespace-pre-wrap break-all flex-1 px-1",
              row.left?.type === "removed" ? "text-red-600 dark:text-red-400" : "text-foreground"
            )}>
              {row.left ? row.left.value.replace(/\n$/, "") : ""}
            </span>
          </div>
        ))}
      </div>
      {/* Right pane */}
      <div className="w-1/2 min-w-0">
        {rows.map((row, i) => (
          <div
            key={i}
            className={cn(
              "flex font-mono text-xs leading-relaxed",
              row.right?.type === "added" ? "bg-green-500/10" : row.right?.type === "same" ? "" : "bg-muted/20"
            )}
          >
            <span className={cn(
              "w-6 shrink-0 text-right select-none",
              row.right?.type === "added" ? "text-green-500/60" : "text-muted-foreground/30"
            )}>
              {row.right?.type === "added" ? "+ " : "  "}
            </span>
            <span className={cn(
              "whitespace-pre-wrap break-all flex-1 px-1",
              row.right?.type === "added" ? "text-green-600 dark:text-green-400" : "text-foreground"
            )}>
              {row.right ? row.right.value.replace(/\n$/, "") : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeadersComparison({ a, b }: { a: HttpResponse; b: HttpResponse }) {
  const allKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const [k] of a.headers) keys.add(k);
    for (const [k] of b.headers) keys.add(k);
    return Array.from(keys).sort();
  }, [a.headers, b.headers]);

  return (
    <div className="p-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="pb-1 font-medium w-8"></th>
            <th className="pb-1 font-medium">Header</th>
            <th className="pb-1 font-medium">Response A</th>
            <th className="pb-1 font-medium">Response B</th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key) => {
            const aVal = a.headers.find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1] ?? "";
            const bVal = b.headers.find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1] ?? "";
            const changed = aVal !== bVal;
            const onlyInA = aVal && !bVal;
            const onlyInB = bVal && !aVal;

            return (
              <tr
                key={key}
                className={cn(
                  "border-b border-border/40 transition-all duration-150",
                  changed ? "bg-yellow-500/5" : "hover:bg-muted/20"
                )}
              >
                <td className="py-1 pr-1">
                  {onlyInA ? (
                    <span className="text-red-500 text-[10px] font-bold">-</span>
                  ) : onlyInB ? (
                    <span className="text-green-500 text-[10px] font-bold">+</span>
                  ) : changed ? (
                    <span className="text-yellow-500 text-[10px]">~</span>
                  ) : (
                    <span className="text-muted-foreground/30 text-[10px]">=</span>
                  )}
                </td>
                <td className="py-1 pr-2 text-primary font-medium max-w-[200px] truncate">{key}</td>
                <td className={cn("py-1 pr-2 break-all font-mono text-[11px]", onlyInB && "text-muted-foreground/40")}>
                  {aVal || "—"}
                </td>
                <td className={cn("py-1 break-all font-mono text-[11px]", onlyInA && "text-muted-foreground/40")}>
                  {bVal || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DiffViewer() {
  const response = useRequestStore((s) => s.response);
  const compareResponse = useUIStore((s) => s.compareResponse);
  const [view, setView] = useState<DiffView>("unified");
  const [scope, setScope] = useState<DiffScope>("body");

  const changes = useMemo(() => {
    if (!response || !compareResponse || scope === "headers") return [];
    return diffLines(response.body || "", compareResponse.body || "");
  }, [response, compareResponse, scope]);

  const headerChanges = useMemo(() => {
    if (!response || !compareResponse) return { added: 0, removed: 0, changed: 0 };
    const aHeaders = new Map(response.headers);
    const bHeaders = new Map(compareResponse.headers);
    let added = 0, removed = 0, changed = 0;
    for (const [k, v] of aHeaders) {
      if (!bHeaders.has(k)) removed++;
      else if (bHeaders.get(k) !== v) changed++;
    }
    for (const [k] of bHeaders) {
      if (!aHeaders.has(k)) added++;
    }
    return { added, removed, changed };
  }, [response, compareResponse]);

  if (!response || !compareResponse) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a response to compare
      </div>
    );
  }

  const addedLines = changes.filter((c) => c.added).length;
  const removedLines = changes.filter((c) => c.removed).length;
  const hasBodyDiff = addedLines > 0 || removedLines > 0;
  const hasHeaderDiff = headerChanges.added > 0 || headerChanges.removed > 0 || headerChanges.changed > 0;
  const hasChanges = hasBodyDiff || hasHeaderDiff;

  if (!hasChanges) {
    return (
      <div className="flex flex-col h-full">
        <DiffSummaryBar a={response} b={compareResponse} />
        <div className="flex items-center justify-center flex-1">
          <div className="flex flex-col items-center gap-2 text-center">
            <svg className="h-8 w-8 text-green-500/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-muted-foreground">No differences found</span>
            <span className="text-xs text-muted-foreground/60">
              Both responses are identical
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <DiffSummaryBar a={response} b={compareResponse} />

      {/* Scope + View controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0 bg-muted/20">
        {/* Scope pills */}
        <div className="flex items-center bg-muted/60 rounded-lg p-0.5 gap-0">
          {(["body", "headers", "both"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn(
                "px-2.5 py-0.5 text-xs font-medium rounded-md transition-all duration-150",
                scope === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "body" ? "Body" : s === "headers" ? "Headers" : "Both"}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* View pills */}
        <div className="flex items-center bg-muted/60 rounded-lg p-0.5 gap-0">
          <button
            onClick={() => setView("unified")}
            className={cn(
              "px-2.5 py-0.5 text-xs font-medium rounded-md transition-all duration-150",
              view === "unified"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Unified
          </button>
          <button
            onClick={() => setView("split")}
            className={cn(
              "px-2.5 py-0.5 text-xs font-medium rounded-md transition-all duration-150",
              view === "split"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Split
          </button>
        </div>
      </div>

      {/* Diff stats */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b text-[10px] text-muted-foreground shrink-0 bg-muted/20">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-green-500" />
          <span>{addedLines} additions</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-red-500" />
          <span>{removedLines} deletions</span>
        </span>
        {headerChanges.changed > 0 && (
          <span className="flex items-center gap-1 text-yellow-500">
            <span className="w-2 h-2 rounded-sm bg-yellow-500" />
            <span>{headerChanges.changed} headers changed</span>
          </span>
        )}
        {headerChanges.added > 0 && (
          <span className="flex items-center gap-1 text-green-500">
            <span className="w-2 h-2 rounded-sm bg-green-500" />
            <span>{headerChanges.added} headers added</span>
          </span>
        )}
        {headerChanges.removed > 0 && (
          <span className="flex items-center gap-1 text-red-500">
            <span className="w-2 h-2 rounded-sm bg-red-500" />
            <span>{headerChanges.removed} headers removed</span>
          </span>
        )}
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto min-h-0">
        {(scope === "body" || scope === "both") && (
          <div className={cn(scope === "both" && "border-b")}>
            {view === "unified" ? (
              <UnifiedDiffView changes={changes} />
            ) : (
              <SplitDiffView changes={changes} />
            )}
          </div>
        )}
        {(scope === "headers" || scope === "both") && (
          <HeadersComparison a={response} b={compareResponse} />
        )}
      </div>
    </div>
  );
}
