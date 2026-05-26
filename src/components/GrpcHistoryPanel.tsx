import { useState, useCallback, useEffect } from "react";
import {
  getGrpcHistory,
  deleteGrpcHistory,
  clearGrpcHistory,
  type GrpcHistoryEntry,
} from "@/lib/invoke";

// ─── Time formatting helper ────────────────────────────────────────────────

function formatTimeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString();
}

// ─── Method kind color helper ──────────────────────────────────────────────

function methodKindColor(kind: string): string {
  switch (kind) {
    case "Unary": return "bg-emerald-500/15 text-emerald-600";
    case "ServerStreaming": return "bg-amber-500/15 text-amber-600";
    case "ClientStreaming": return "bg-blue-500/15 text-blue-600";
    case "Bidirectional": return "bg-purple-500/15 text-purple-600";
    default: return "bg-muted text-muted-foreground";
  }
}

// ─── gRPC History Panel ────────────────────────────────────────────────────

export function GrpcHistoryPanel({
  onRestore,
}: {
  onRestore: (entry: GrpcHistoryEntry) => void;
}) {
  const [entries, setEntries] = useState<GrpcHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailEntry, setDetailEntry] = useState<GrpcHistoryEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getGrpcHistory(50, 0);
      setEntries(list);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteGrpcHistory(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch { /* ignore */ }
  }, []);

  const handleClear = useCallback(async () => {
    try {
      await clearGrpcHistory();
      setEntries([]);
    } catch { /* ignore */ }
  }, []);

  // Detail view
  if (detailEntry) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20">
          <button
            onClick={() => setDetailEntry(null)}
            className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            ← Back
          </button>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex-1">History Detail</span>
          <button
            onClick={() => { onRestore(detailEntry); setDetailEntry(null); }}
            className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-all font-medium"
          >
            Restore
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${methodKindColor(detailEntry.method_kind)}`}>
              {detailEntry.method_kind}
            </span>
            <span className="font-mono text-foreground/80">{detailEntry.method_name}</span>
          </div>
          <div className="text-muted-foreground/60">
            {detailEntry.tls ? "https://" : "http://"}{detailEntry.address}
          </div>
          <div className="text-muted-foreground/40">
            {new Date(detailEntry.created_at).toLocaleString()}
          </div>

          {detailEntry.input_json && (
            <>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-3">Input</div>
              <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap bg-muted/30 rounded p-2 max-h-40 overflow-y-auto">
                {detailEntry.input_json}
              </pre>
            </>
          )}

          {detailEntry.input_jsons.length > 0 && (
            <>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-3">Inputs ({detailEntry.input_jsons.length})</div>
              {detailEntry.input_jsons.map((json, i) => (
                <pre key={i} className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap bg-muted/30 rounded p-2 max-h-24 overflow-y-auto">
                  [{i + 1}] {json}
                </pre>
              ))}
            </>
          )}

          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-3">Response</div>
          {detailEntry.error ? (
            <div className="text-[11px] font-mono text-destructive bg-destructive/10 rounded p-2">
              {detailEntry.error}
            </div>
          ) : (
            detailEntry.responses.map((r, i) => (
              <div key={i} className="border border-border/40 rounded overflow-hidden">
                <div className="flex items-center gap-2 px-2 py-1 bg-muted/20 text-[10px] text-muted-foreground">
                  <span className="font-mono">{r.status_code}</span>
                  <span>·</span>
                  <span>{r.time_ms}ms</span>
                  <span>·</span>
                  <span>{r.size} bytes</span>
                </div>
                <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap p-2 max-h-48 overflow-y-auto">
                  {r.body || "(empty)"}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b bg-muted/20">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          History
        </span>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            className="text-[9px] text-muted-foreground/50 hover:text-destructive transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-4 text-[11px] text-muted-foreground text-center italic">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-muted-foreground text-center italic">
            No gRPC calls yet
          </div>
        ) : (
          entries.map((entry) => {
            const isError = entry.error !== null || entry.responses.some(r => r.error);
            const timeAgo = formatTimeAgo(entry.created_at);
            return (
              <div
                key={entry.id}
                onClick={() => setDetailEntry(entry)}
                className="group px-3 py-2 hover:bg-accent/30 transition-colors cursor-pointer border-b border-border/20"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${methodKindColor(entry.method_kind)}`}>
                    {entry.method_kind}
                  </span>
                  <span className="text-xs font-mono text-foreground/80 truncate flex-1">{entry.method_name}</span>
                  <span className={`text-[10px] font-mono ${isError ? "text-destructive/70" : "text-emerald-600/70"}`}>
                    {isError ? "✕" : "✓"}
                  </span>
                  <button
                    onClick={(e) => handleDelete(entry.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground/30 hover:text-destructive transition-all text-[10px]"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                  <span className="truncate max-w-[140px]">{entry.address}</span>
                  <span>·</span>
                  <span>{timeAgo}</span>
                  {entry.responses.length > 0 && !isError && (
                    <>
                      <span>·</span>
                      <span>{entry.responses[0].time_ms}ms</span>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="shrink-0 px-3 py-1.5 border-t flex items-center">
        <button
          onClick={load}
          disabled={loading}
          className="text-[9px] text-muted-foreground/40 hover:text-foreground transition-colors disabled:opacity-30"
        >
          ↻ Refresh
        </button>
        {entries.length > 0 && (
          <span className="ml-auto text-[9px] text-muted-foreground/30">{entries.length} entry{entries.length !== 1 ? "s" : ""}</span>
        )}
      </div>
    </div>
  );
}
