import { useState } from "react";
import type { MockLogEntry, MockStats } from "@/lib/invoke";
import { useMockStore } from "@/stores/mockStore";
import { MockLogDetail } from "./MockLogDetail";
import {
  Activity,
  Trash2,
  Search,
  ChevronRight,
  Clock,
  AlertOctagon,
  Zap,
  Terminal
} from "lucide-react";

interface MockLogViewerProps {
  serverId: string;
}

const DEFAULT_LOGS: MockLogEntry[] = [];
const DEFAULT_STATS: MockStats = {
  request_count: 0,
  error_count: 0,
  average_latency_ms: 0,
};

export function MockLogViewer({ serverId }: MockLogViewerProps) {
  const logs = useMockStore((s) => s.serverLogs[serverId] || DEFAULT_LOGS);
  const stats = useMockStore((s) => s.serverStats[serverId] || DEFAULT_STATS);
  const clearLogs = useMockStore((s) => s.clearLogs);

  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<MockLogEntry | null>(null);

  const filteredLogs = logs.filter(
    (log) =>
      log.path.toLowerCase().includes(search.toLowerCase()) ||
      log.method.toLowerCase().includes(search.toLowerCase()) ||
      String(log.response_status).includes(search)
  );

  return (
    <div className="w-80 border-l bg-card/60 backdrop-blur-sm shrink-0 flex flex-col h-full select-none">
      {/* Metrics Dashboard */}
      <div className="p-4 border-b space-y-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4.5 h-4.5 text-primary" />
            <h2 className="font-semibold text-sm text-foreground">Stats & Logs</h2>
          </div>
          {logs.length > 0 && (
            <button
              onClick={() => clearLogs(serverId)}
              className="p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Clear Logs"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Stats Grid Dashboard */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-background/40 p-2.5 rounded-xl border border-border/60">
            <div className="flex items-center justify-center text-primary mb-1">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <span className="text-[14px] font-bold font-mono text-foreground/90 block">
              {stats.request_count}
            </span>
            <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-wider">Req</span>
          </div>

          <div className="bg-background/40 p-2.5 rounded-xl border border-border/60">
            <div className="flex items-center justify-center text-rose-400 mb-1">
              <AlertOctagon className="w-3.5 h-3.5" />
            </div>
            <span className="text-[14px] font-bold font-mono text-rose-400 block">
              {stats.error_count}
            </span>
            <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-wider">Err</span>
          </div>

          <div className="bg-background/40 p-2.5 rounded-xl border border-border/60">
            <div className="flex items-center justify-center text-emerald-400 mb-1">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <span className="text-[14px] font-bold font-mono text-emerald-400 block">
              {stats.average_latency_ms.toFixed(0)}
            </span>
            <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-wider">Avg Latency</span>
          </div>
        </div>

        {/* Search inside logs */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter logs..."
            className="w-full h-8 bg-background border border-border/80 rounded-lg pl-8 pr-3 text-xs focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Log list console stream */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0 bg-background/10">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/60 italic text-xs space-y-2 select-none">
            <Terminal className="w-8 h-8 text-muted-foreground/30 animate-pulse" />
            <span>No requests yet...</span>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isError = log.response_status >= 400;
            return (
              <div
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className="group flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-background/40 hover:bg-accent/40 cursor-pointer select-none transition-all duration-150 animate-fadeIn"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 pr-1.5">
                  <span
                    className={`text-[8px] font-bold px-1 py-0.5 rounded uppercase tracking-wider shrink-0 select-none ${
                      log.method === "GET" && "bg-emerald-500/10 text-emerald-400"
                    } ${
                      log.method === "POST" && "bg-blue-500/10 text-blue-400"
                    } ${
                      log.method === "DELETE" && "bg-rose-500/10 text-rose-400"
                    } ${
                      !["GET", "POST", "DELETE"].includes(log.method) && "bg-zinc-500/10 text-zinc-400"
                    }`}
                  >
                    {log.method}
                  </span>
                  <span className="text-[10px] font-mono text-foreground/80 truncate flex-1 leading-relaxed">
                    {log.path}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 select-none font-mono">
                  <span className="text-[9px] text-muted-foreground/60">{log.latency_ms}ms</span>
                  <span
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shadow-inner ${
                      isError
                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/10"
                        : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                    }`}
                  >
                    {log.response_status}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground/80 transition-colors" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Log Transaction Modal Details Overlay */}
      {selectedLog && (
        <MockLogDetail log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}
