import { useIntelligenceStore } from "@/stores/intelligenceStore";
import { StatusDistributionChart } from "./StatusDistributionChart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { useMemo } from "react";

export function IntelligenceOverview() {
  const overview = useIntelligenceStore((s) => s.overview);
  const analyzing = useIntelligenceStore((s) => s.analyzing);
  const analyze = useIntelligenceStore((s) => s.analyze);

  const dailyData = useMemo(() => {
    if (!overview) return [];
    return overview.daily_request_counts.map((d) => ({
      date: d.date.length > 10 ? d.date.slice(5, 10) : d.date,
      count: d.count,
    }));
  }, [overview]);

  if (!overview) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <svg className="h-12 w-12 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <div>
          <p className="text-sm text-muted-foreground mb-1">No intelligence data yet</p>
          <p className="text-xs text-muted-foreground/60">Send some requests first, then run an analysis</p>
        </div>
        <button
          onClick={analyze}
          disabled={analyzing}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all duration-150 flex items-center gap-2"
        >
          {analyzing ? (
            <>
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Analyzing...
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              Analyze Now
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-auto">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        <KPICard
          icon={<EndpointIcon />}
          label="Endpoints"
          value={overview.total_endpoints.toString()}
        />
        <KPICard
          icon={<RequestsIcon />}
          label="Total Requests"
          value={overview.total_requests.toLocaleString()}
        />
        <KPICard
          icon={<TimeIcon />}
          label="Avg Response"
          value={`${overview.avg_response_time_ms.toFixed(1)}ms`}
        />
        <KPICard
          icon={<ChangeIcon />}
          label="Schema Changes"
          value={overview.total_schema_changes.toString()}
          highlight={overview.total_schema_changes > 0}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Daily request volume */}
        <div className="col-span-2 bg-card border rounded-xl p-3">
          <div className="text-xs font-medium text-foreground mb-2">Request Volume</div>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={dailyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[140px] text-muted-foreground text-xs">No data</div>
          )}
        </div>

        {/* Status distribution */}
        <div className="bg-card border rounded-xl p-3">
          <div className="text-xs font-medium text-foreground mb-2">Status Codes</div>
          <StatusDistributionChart
            status200={Math.round((overview.status_200_pct / 100) * overview.total_requests)}
            status400={Math.round((overview.status_400_pct / 100) * overview.total_requests)}
            status500={Math.round((overview.status_500_pct / 100) * overview.total_requests)}
            statusOther={0}
          />
        </div>
      </div>

      {/* Regressions alert */}
      {overview.endpoints_with_regression > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-center gap-3">
          <svg className="h-5 w-5 text-destructive shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div>
            <span className="text-xs font-semibold text-destructive">
              {overview.endpoints_with_regression} endpoint{overview.endpoints_with_regression > 1 ? "s" : ""} with performance regression detected
            </span>
            <p className="text-[10px] text-destructive/70 mt-0.5">
              Response times have increased by more than 20% compared to baseline
            </p>
          </div>
        </div>
      )}

      {/* Last analyzed */}
      <div className="text-[10px] text-muted-foreground text-center">
        Last analyzed: {overview.last_analyzed ? new Date(overview.last_analyzed).toLocaleString() : "Never"}
        <button
          onClick={analyze}
          disabled={analyzing}
          className="ml-2 text-primary hover:underline disabled:opacity-50"
        >
          {analyzing ? "Analyzing..." : "Re-analyze"}
        </button>
      </div>
    </div>
  );
}

function KPICard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`bg-card border rounded-xl p-3 flex items-center gap-3 ${highlight ? "border-yellow-500/30" : ""}`}>
      <div className={`p-2 rounded-lg ${highlight ? "bg-yellow-500/10 text-yellow-500" : "bg-primary/10 text-primary"}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold ${highlight ? "text-yellow-500" : "text-foreground"}`}>{value}</div>
      </div>
    </div>
  );
}

function EndpointIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function RequestsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

function TimeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
    </svg>
  );
}

function ChangeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
