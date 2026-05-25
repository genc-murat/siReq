import { useIntelligenceStore } from "@/stores/intelligenceStore";
import { PerformanceChart } from "./PerformanceChart";
import { SchemaEvolutionTimeline } from "./SchemaEvolutionTimeline";
import { StatusDistributionChart } from "./StatusDistributionChart";
import { cn } from "@/lib/utils";

export function EndpointDetail() {
  const detail = useIntelligenceStore((s) => s.selectedEndpoint);
  const loading = useIntelligenceStore((s) => s.loading);

  if (loading && !detail) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading endpoint details...</span>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Select an endpoint to view details
      </div>
    );
  }

  const totalRequests = detail.request_count;
  const successPct = totalRequests > 0 ? ((detail.status_200_count / totalRequests) * 100).toFixed(1) : "0";
  const statusData = {
    status200: detail.status_200_count,
    status400: detail.status_400_count,
    status500: detail.status_500_count,
    statusOther: detail.status_other_count,
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
          {detail.method}
        </span>
        <span className="font-mono text-sm font-medium">{detail.endpoint_key}</span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-2">
        <MiniKPI label="Requests" value={detail.request_count.toLocaleString()} />
        <MiniKPI label="Avg Time" value={`${detail.avg_time_ms.toFixed(1)}ms`} />
        <MiniKPI label="P95" value={`${detail.p95_time_ms.toFixed(1)}ms`} />
        <MiniKPI label="Success" value={`${successPct}%`} color={Number(successPct) >= 95 ? "text-green-500" : Number(successPct) >= 80 ? "text-yellow-500" : "text-red-500"} />
        <MiniKPI label="Avg Size" value={formatBytes(detail.avg_size_bytes)} />
      </div>

      {/* Performance history chart */}
      <div className="bg-card border rounded-xl p-3">
        <div className="text-xs font-medium text-foreground mb-2">Performance Timeline</div>
        <PerformanceChart data={detail.performance_history} height={180} />
      </div>

      {/* Row: Status Distribution + Schema Evolution */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border rounded-xl p-3">
          <div className="text-xs font-medium text-foreground mb-2">Status Distribution</div>
          <StatusDistributionChart {...statusData} />
        </div>
        <div className="bg-card border rounded-xl p-3">
          <div className="text-xs font-medium text-foreground mb-2">Schema Evolution</div>
          <SchemaEvolutionTimeline versions={detail.schema_evolution} />
        </div>
      </div>

      {/* Recent requests table */}
      {detail.recent_requests.length > 0 && (
        <div className="bg-card border rounded-xl p-3">
          <div className="text-xs font-medium text-foreground mb-2">Recent Requests</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-2 py-1.5 text-[10px] text-muted-foreground font-medium">Time</th>
                  <th className="text-right px-2 py-1.5 text-[10px] text-muted-foreground font-medium">Status</th>
                  <th className="text-right px-2 py-1.5 text-[10px] text-muted-foreground font-medium">Duration</th>
                  <th className="text-right px-2 py-1.5 text-[10px] text-muted-foreground font-medium">Size</th>
                  <th className="text-right px-2 py-1.5 text-[10px] text-muted-foreground font-medium">Schema</th>
                </tr>
              </thead>
              <tbody>
                {detail.recent_requests.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors duration-100">
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {r.created_at.length > 16 ? r.created_at.slice(0, 16).replace("T", " ") : r.created_at}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <span className={cn(
                        "font-mono text-[10px] font-medium px-1 py-0.5 rounded",
                        r.status >= 200 && r.status < 300 && "bg-green-500/10 text-green-600",
                        r.status >= 300 && r.status < 400 && "bg-blue-500/10 text-blue-600",
                        r.status >= 400 && r.status < 500 && "bg-yellow-500/10 text-yellow-600",
                        r.status >= 500 && "bg-red-500/10 text-red-600",
                      )}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{r.time_ms.toFixed(0)}ms</td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">{formatBytes(r.size)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <span className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        r.schema_fingerprint === detail.schema_evolution[detail.schema_evolution.length - 1]?.fingerprint
                          ? "bg-green-500"
                          : "bg-yellow-500"
                      )} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* First/last seen */}
      <div className="flex items-center justify-center gap-6 text-[10px] text-muted-foreground">
        <span>First seen: {detail.first_seen.length > 10 ? detail.first_seen.slice(0, 10) : detail.first_seen}</span>
        <span>Last seen: {detail.last_seen.length > 10 ? detail.last_seen.slice(0, 10) : detail.last_seen}</span>
      </div>
    </div>
  );
}

function MiniKPI({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-card border rounded-lg p-2.5 text-center">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-sm font-bold ${color ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

