import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { diffLines } from "diff";
import { CompareSelector } from "./CompareSelector";

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

export function StatsBar() {
  const response = useRequestStore((s) => s.response);
  const lastResponse = useRequestStore((s) => s.lastResponse);
  const compareResponse = useUIStore((s) => s.compareResponse);
  const setCompareResponse = useUIStore((s) => s.setCompareResponse);
  const [compareOpen, setCompareOpen] = useState(false);

  const diffBadge = useMemo(() => {
    if (!response || !lastResponse) return null;

    const parts: { label: string; color: string }[] = [];

    // Status change
    if (response.status !== lastResponse.status) {
      const statusClass =
        response.status >= 200 && response.status < 300 ? "text-green-500" :
        response.status >= 400 ? "text-red-500" :
        "text-yellow-500";
      parts.push({
        label: `${lastResponse.status}→${response.status}`,
        color: statusClass,
      });
    }

    // Body diff
    try {
      const bodyChanges = diffLines(lastResponse.body || "", response.body || "");
      const added = bodyChanges
        .filter((c) => c.added)
        .reduce((sum, c) => sum + (c.count ?? c.value.split("\n").length - 1), 0);
      const removed = bodyChanges
        .filter((c) => c.removed)
        .reduce((sum, c) => sum + (c.count ?? c.value.split("\n").length - 1), 0);
      if (added > 0 || removed > 0) {
        parts.push({
          label: `${added > 0 ? `+${added}` : ""}${added > 0 && removed > 0 ? "/" : ""}${removed > 0 ? `−${removed}` : ""} lines`,
          color: added > 0 && removed > 0 ? "text-yellow-500" : added > 0 ? "text-green-500" : "text-red-500",
        });
      }
    } catch {
      // Ignore diff errors
    }

    // Time change
    if (response.time_ms !== lastResponse.time_ms) {
      const diff = response.time_ms - lastResponse.time_ms;
      const isFaster = diff < 0;
      parts.push({
        label: `${isFaster ? "−" : "+"}${Math.abs(diff)}ms`,
        color: isFaster ? "text-green-500" : "text-red-500",
      });
    }

    return parts.length > 0 ? parts : null;
  }, [response, lastResponse]);

  if (!response) return null;

  return (
    <>
      <div className="flex items-center gap-4 px-3 py-1.5 text-xs border-b bg-card shrink-0">
        <span className={cn("font-semibold", statusColor(response.status))}>
          {response.status} {response.status_text}
        </span>
        <span className="text-muted-foreground">
          {response.time_ms} ms
        </span>
        <span className="text-muted-foreground">
          {formatSize(response.size)}
        </span>
        {!compareResponse && diffBadge && (
          <button
            onClick={() => setCompareResponse(lastResponse)}
            className="flex items-center gap-1.5 text-[10px] hover:bg-accent/50 px-1.5 py-0.5 -mx-1.5 rounded transition-colors cursor-pointer"
            title="Show diff with previous response"
          >
            <span className="text-muted-foreground/30">|</span>
            {diffBadge.map((part, i) => (
              <span key={i} className={cn("font-medium", part.color)}>
                {part.label}
              </span>
            ))}
          </button>
        )}
        <div className="flex-1" />
        {compareResponse ? (
          <div className="flex items-center gap-2">
            <span className="text-yellow-500 text-[10px] bg-yellow-500/10 rounded px-1.5 py-0.5 flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18M9 12h6m-7 6h8" />
              </svg>
              Comparing
            </span>
            <span className="text-muted-foreground text-[10px] max-w-[120px] truncate">
              {compareResponse.status} {compareResponse.status_text}
            </span>
            <button
              onClick={() => setCompareResponse(null)}
              className="text-muted-foreground hover:text-foreground p-0.5 transition-colors"
              title="Clear comparison"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {lastResponse && (
              <button
                onClick={() => setCompareResponse(lastResponse)}
                className="text-muted-foreground hover:text-foreground text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent transition-colors"
                title="Compare with the previous response"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                </svg>
                Compare with previous
              </button>
            )}
            <button
              onClick={() => setCompareOpen(true)}
              className="text-muted-foreground hover:text-foreground text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent transition-colors"
              title="Compare with a history entry"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18M9 12h6m-7 6h8" />
              </svg>
              Compare
            </button>
          </div>
        )}
      </div>
      <CompareSelector open={compareOpen} onClose={() => setCompareOpen(false)} />
    </>
  );
}
