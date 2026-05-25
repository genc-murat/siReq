import { useEffect, useState } from "react";
import { getHistory } from "@/lib/invoke";
import type { HistoryEntry } from "@/lib/invoke";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

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

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return "text-green-500";
  if (status >= 300 && status < 400) return "text-yellow-500";
  if (status >= 400 && status < 500) return "text-orange-500";
  return "text-red-500";
}

interface CompareSelectorProps {
  open: boolean;
  onClose: () => void;
}

export function CompareSelector({ open, onClose }: CompareSelectorProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const setCompareResponse = useUIStore((s) => s.setCompareResponse);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch("");
    getHistory(100, 0)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = search.trim()
    ? entries.filter(
        (e) =>
          e.request.url.toLowerCase().includes(search.toLowerCase()) ||
          e.request.method.toLowerCase().includes(search.toLowerCase()) ||
          String(e.response.status).includes(search)
      )
    : entries;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-card border border-border rounded-lg shadow-xl w-[480px] max-h-[400px] flex flex-col z-10"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
          <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18M9 12h6m-7 6h8" />
          </svg>
          <span className="text-sm font-medium">Compare with history</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-1.5 shrink-0">
          <div className="flex items-center bg-background rounded border border-input px-2 py-1">
            <svg className="h-3 w-3 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by URL, method, or status..."
              className="flex-1 bg-transparent text-xs px-1.5 py-0.5 focus:outline-none text-foreground placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
              Loading history...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-8 text-center">
              <svg className="h-6 w-6 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6h18M9 12h6m-7 6h8" />
              </svg>
              <span className="text-xs text-muted-foreground">
                {search ? "No matching entries" : "No history entries yet"}
              </span>
            </div>
          ) : (
            <div className="py-1">
              {filtered.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    setCompareResponse(entry.response);
                    onClose();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b border-border/40 last:border-0"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className={cn("font-bold shrink-0", methodColors[entry.request.method] ?? "")}>
                      {entry.request.method}
                    </span>
                    <span className="truncate flex-1 text-foreground">{entry.request.url || "No URL"}</span>
                    <span className={cn("font-medium shrink-0", statusColor(entry.response.status))}>
                      {entry.response.status}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {entry.response.time_ms}ms
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span>{new Date(entry.created_at).toLocaleString()}</span>
                    {entry.request.name && (
                      <>
                        <span>·</span>
                        <span className="truncate">{entry.request.name}</span>
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
