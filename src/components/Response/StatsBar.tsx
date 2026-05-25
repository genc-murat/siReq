import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { diffLines } from "diff";
import { CompareSelector } from "./CompareSelector";

function statusStyle(status: number): { bg: string; text: string; dot: string } {
  if (status >= 200 && status < 300) return { bg: "bg-green-500/10", text: "text-green-500", dot: "bg-green-500" };
  if (status >= 300 && status < 400) return { bg: "bg-yellow-500/10", text: "text-yellow-500", dot: "bg-yellow-500" };
  if (status >= 400 && status < 500) return { bg: "bg-orange-500/10", text: "text-orange-500", dot: "bg-orange-500" };
  return { bg: "bg-red-500/10", text: "text-red-500", dot: "bg-red-500" };
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

    if (response.status !== lastResponse.status) {
      const c =
        response.status >= 200 && response.status < 300 ? "text-green-500" :
        response.status >= 400 ? "text-red-500" :
        "text-yellow-500";
      parts.push({ label: `${lastResponse.status}→${response.status}`, color: c });
    }

    try {
      const bodyChanges = diffLines(lastResponse.body || "", response.body || "");
      const added = bodyChanges.filter((c) => c.added).reduce((sum, c) => sum + (c.count ?? c.value.split("\n").length - 1), 0);
      const removed = bodyChanges.filter((c) => c.removed).reduce((sum, c) => sum + (c.count ?? c.value.split("\n").length - 1), 0);
      if (added > 0 || removed > 0) {
        parts.push({
          label: `${added > 0 ? `+${added}` : ""}${added > 0 && removed > 0 ? "/" : ""}${removed > 0 ? `−${removed}` : ""}`,
          color: added > 0 && removed > 0 ? "text-yellow-500" : added > 0 ? "text-green-500" : "text-red-500",
        });
      }
    } catch {}

    if (response.time_ms !== lastResponse.time_ms) {
      const diff = response.time_ms - lastResponse.time_ms;
      parts.push({
        label: `${diff < 0 ? "−" : "+"}${Math.abs(diff)}ms`,
        color: diff < 0 ? "text-green-500" : "text-red-500",
      });
    }

    return parts.length > 0 ? parts : null;
  }, [response, lastResponse]);

  if (!response) return null;

  const s = statusStyle(response.status);

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 text-xs border-b bg-card shrink-0">
        {/* Status pill */}
        <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg font-semibold", s.bg, s.text)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
          {response.status} {response.status_text}
        </span>

        {/* Divider */}
        <span className="w-px h-3.5 bg-border/60 shrink-0" />

        {/* Time */}
        <span className="text-muted-foreground flex items-center gap-1">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
          </svg>
          {response.time_ms} ms
        </span>

        {/* Size */}
        <span className="text-muted-foreground flex items-center gap-1">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z M8 12h8 M12 8v8" />
          </svg>
          {formatSize(response.size)}
        </span>

        {/* Diff badge */}
        {!compareResponse && diffBadge && (
          <button
            onClick={() => setCompareResponse(lastResponse)}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-lg hover:bg-accent transition-all duration-150"
            title="Show diff with previous response"
          >
            <span className="text-muted-foreground/40">|</span>
            {diffBadge.map((part, i) => (
              <span key={i} className={cn("font-medium", part.color)}>
                {part.label}
              </span>
            ))}
          </button>
        )}

        <div className="flex-1" />

        {/* Right side */}
        {compareResponse ? (
          <div className="flex items-center gap-2">
            <span className="text-yellow-500 text-[10px] bg-yellow-500/10 rounded-lg px-2 py-0.5 flex items-center gap-1.5 font-medium">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M9 12h6m-7 6h8" />
              </svg>
              Comparing
            </span>
            <span className="text-muted-foreground text-[10px] max-w-[100px] truncate">
              {compareResponse.status} {compareResponse.status_text}
            </span>
            <button
              onClick={() => setCompareResponse(null)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
              title="Clear comparison"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-0.5">
            {lastResponse && (
              <button
                onClick={() => setCompareResponse(lastResponse)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
                title="Compare with previous response"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setCompareOpen(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
              title="Compare with history entry"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M9 12h6m-7 6h8" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <CompareSelector open={compareOpen} onClose={() => setCompareOpen(false)} />
    </>
  );
}
