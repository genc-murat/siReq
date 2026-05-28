import { useReplayStore } from "@/stores/replayStore";

const methodColors: Record<string, string> = {
  GET: "bg-green-500",
  POST: "bg-yellow-500",
  PUT: "bg-blue-500",
  PATCH: "bg-orange-500",
  DELETE: "bg-red-500",
  HEAD: "bg-purple-500",
  OPTIONS: "bg-teal-500",
  TRACE: "bg-gray-500",
};

const latencyColor = (ms: number): string => {
  if (ms < 100) return "bg-green-500";
  if (ms < 300) return "bg-yellow-500";
  if (ms < 700) return "bg-orange-500";
  return "bg-red-500";
};

export function ReplayWaterfall() {
  const { entries, currentRunEntryResults, activeEntryId, setActiveEntryId } = useReplayStore();

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground/60 border border-dashed border-border rounded-xl">
        <svg className="h-8 w-8 text-muted-foreground/45 mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <span className="text-xs font-semibold">No requests in waterfall</span>
        <span className="text-[10px] mt-1">Import requests and run replay to see the waterfall chart</span>
      </div>
    );
  }

  const maxTime = Math.max(
    ...entries.map((e) => {
      const result = currentRunEntryResults.get(e.id);
      return result?.replayed_response?.time_ms ?? e.original_response.time_ms;
    }),
    1
  );

  const waterfallScale = (ms: number) => Math.max(4, (ms / maxTime) * 100);

  return (
    <div className="flex-1 flex flex-col gap-1.5 p-1 overflow-auto min-h-0 select-none">
      <div className="flex items-center gap-2 mb-1 px-1 shrink-0">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex-[2]">Request</span>
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex-[3]">Waterfall</span>
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-16 text-right">Time</span>
      </div>

      {entries.map((entry, index) => {
        const isActive = activeEntryId === entry.id;
        const result = currentRunEntryResults.get(entry.id);
        const responseTime = result?.replayed_response?.time_ms ?? entry.original_response.time_ms;
        const status = result?.status;
        const barWidth = waterfallScale(responseTime);
        const color = methodColors[entry.original_request.method] || "bg-muted";
        const latColor = latencyColor(responseTime);

        return (
          <div
            key={entry.id}
            onClick={() => setActiveEntryId(entry.id)}
            className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-150 ${
              isActive
                ? "bg-primary/5 ring-1 ring-primary/20"
                : "hover:bg-muted/30"
            }`}
          >
            <div className="flex-[2] flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-mono font-bold text-muted-foreground/60 w-4 text-center shrink-0">
                {index + 1}
              </span>
              <div className={`w-1.5 h-3.5 rounded-sm shrink-0 ${color}`} />
              <span className="text-[11px] font-mono font-semibold truncate text-foreground/90">
                {entry.original_request.url.replace(/^https?:\/\/[^/]+/, "")}
              </span>
            </div>

            <div className="flex-[3] flex items-center h-4 relative">
              <div
                className={`h-3 rounded-sm transition-all duration-300 ${latColor} opacity-70 group-hover:opacity-100`}
                style={{ width: `${barWidth}%` }}
              />
              {result?.diff && result.diff.timing_diff_ms > 100 && (
                <div
                  className="absolute h-3 rounded-sm bg-red-500/25 border border-red-500/30"
                  style={{
                    left: `${barWidth}%`,
                    width: `${Math.min(waterfallScale(result.diff.timing_diff_ms), 100 - barWidth)}%`,
                  }}
                />
              )}
            </div>

            <div className="w-16 text-right flex items-center justify-end gap-1.5 shrink-0">
              {status === "failed" && (
                <span className="text-[9px] font-bold text-destructive">FAIL</span>
              )}
              <span className="text-[10px] font-mono font-bold text-muted-foreground">
                {responseTime}ms
              </span>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/40 px-1 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-sm bg-green-500" />
          <span className="text-[9px] text-muted-foreground">&lt;100ms</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-sm bg-yellow-500" />
          <span className="text-[9px] text-muted-foreground">&lt;300ms</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-sm bg-orange-500" />
          <span className="text-[9px] text-muted-foreground">&lt;700ms</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-sm bg-red-500" />
          <span className="text-[9px] text-muted-foreground">&gt;700ms</span>
        </div>
      </div>
    </div>
  );
}
