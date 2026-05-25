import type { BenchmarkResult, BenchmarkHistoryEntry } from "@/lib/invoke";
import { cn } from "@/lib/utils";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return "text-green-500";
  if (status >= 300 && status < 400) return "text-yellow-500";
  if (status >= 400 && status < 500) return "text-orange-500";
  return "text-red-500";
}

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

interface CompareRowProps {
  label: string;
  a: string;
  b: string;
  aColor?: string;
  bColor?: string;
  winner?: "a" | "b" | "tie";
  lowerIsBetter?: boolean;
}

function CompareRow({ label, a, b, aColor, bColor, winner, lowerIsBetter = true }: CompareRowProps) {
  const aClass = winner === "a" ? "text-green-500" : winner === "b" ? "text-red-400" : "";
  const bClass = winner === "b" ? "text-green-500" : winner === "a" ? "text-red-400" : "";
  const arrowUp = lowerIsBetter ? "↓" : "↑";
  return (
    <div className="grid grid-cols-[120px_1fr_60px_1fr] gap-2 items-center py-1.5 border-b border-border/20 last:border-0 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums text-right", aClass, aColor)}>
        {a}{winner === "a" && <span className="ml-1 text-[9px]">{arrowUp}</span>}
      </span>
      <span className="text-center text-muted-foreground/40 text-[9px]">vs</span>
      <span className={cn("font-medium tabular-nums", bClass, bColor)}>
        {winner === "b" && <span className="mr-1 text-[9px]">{arrowUp}</span>}{b}
      </span>
    </div>
  );
}

function StatCardSmall({ label, value, color, winner }: {
  label: string;
  value: string;
  color?: string;
  winner?: "a" | "b";
}) {
  return (
    <div className={cn(
      "flex flex-col items-center p-2 rounded-lg min-w-0 transition-all duration-150",
      winner === "a" ? "bg-green-500/10 ring-1 ring-green-500/30" :
      winner === "b" ? "bg-red-500/10 ring-1 ring-red-500/30" :
      "bg-secondary/30"
    )}>
      <span className={cn("text-base font-bold tabular-nums truncate w-full text-center", color)}>{value}</span>
      <span className="text-[9px] text-muted-foreground mt-0.5">{label}</span>
    </div>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  entryA: BenchmarkHistoryEntry;
  entryB: BenchmarkHistoryEntry;
  onClose: () => void;
}

export function BenchmarkCompareView({ entryA, entryB, onClose }: Props) {
  const a = entryA.result;
  const b = entryB.result;

  // Determine winner for each metric (lower is better for timing, higher is better for success rate)
  const avgW = a.avg_ms < b.avg_ms ? "a" : a.avg_ms > b.avg_ms ? "b" : "tie";
  const minW = a.min_ms < b.min_ms ? "a" : a.min_ms > b.min_ms ? "b" : "tie";
  const maxW = a.max_ms < b.max_ms ? "a" : a.max_ms > b.max_ms ? "b" : "tie";
  const medW = a.median_ms < b.median_ms ? "a" : a.median_ms > b.median_ms ? "b" : "tie";
  const p95W = a.p95_ms < b.p95_ms ? "a" : a.p95_ms > b.p95_ms ? "b" : "tie";
  const p99W = a.p99_ms < b.p99_ms ? "a" : a.p99_ms > b.p99_ms ? "b" : "tie";
  const successW = a.success_count / a.iterations > b.success_count / b.iterations ? "a" :
    a.success_count / a.iterations < b.success_count / b.iterations ? "b" : "tie";
  const bytesW = a.total_bytes > b.total_bytes ? "a" : a.total_bytes < b.total_bytes ? "b" : "tie";

  const winsA = [avgW, minW, maxW, medW, p95W, p99W].filter((w) => w === "a").length;
  const winsB = [avgW, minW, maxW, medW, p95W, p99W].filter((w) => w === "b").length;

  // Build overlay bar charts for timing distribution
  const buildOverlayData = (ra: BenchmarkResult, rb: BenchmarkResult) => {
    const allTimes = [...ra.times_ms, ...rb.times_ms];
    const overallMin = Math.min(...allTimes);
    const overallMax = Math.max(...allTimes);
    const range = Math.max(overallMax - overallMin, 1);
    const bucketCount = 20;
    const bucketSize = range / bucketCount;
    const bucketsA = new Array(bucketCount).fill(0);
    const bucketsB = new Array(bucketCount).fill(0);
    for (const t of ra.times_ms) {
      const idx = Math.min(Math.floor((t - overallMin) / bucketSize), bucketCount - 1);
      bucketsA[idx]++;
    }
    for (const t of rb.times_ms) {
      const idx = Math.min(Math.floor((t - overallMin) / bucketSize), bucketCount - 1);
      bucketsB[idx]++;
    }
    const maxCount = Math.max(...bucketsA, ...bucketsB, 1);
    return { bucketsA, bucketsB, maxCount, overallMin, overallMax };
  };

  const chart = buildOverlayData(a, b);

  const aDate = formatDate(entryA.created_at);
  const bDate = formatDate(entryB.created_at);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      {/* Modal */}
      <div className="relative bg-popover border rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M9 12h6m-7 6h8" />
            </svg>
            <span className="text-sm font-semibold">Benchmark Comparison</span>
            <span className="text-[10px] text-muted-foreground bg-secondary/50 rounded-lg px-1.5 py-0.5 font-medium">
              {winsA > winsB ? "Run A leads" : winsB > winsA ? "Run B leads" : "Tie"}{" "}
              {winsA}-{winsB}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{a.iterations} req each</span>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5 flex flex-col gap-5">
          {/* Entry identifiers */}
          <div className="grid grid-cols-[1fr_60px_1fr] gap-3 items-center">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/5 border border-green-500/20">
              <span className="text-[9px] font-bold text-green-500 bg-green-500/20 px-1.5 py-0.5 rounded-lg">A</span>
              <span className={cn("font-bold text-xs", methodColors[entryA.request.method] ?? "")}>{entryA.request.method}</span>
              <span className="text-xs text-muted-foreground truncate">{entryA.request.url}</span>
              <span className="text-[9px] text-muted-foreground/50 ml-auto">{aDate}</span>
            </div>
            <div className="text-center text-[9px] text-muted-foreground/30">vs</div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <span className="text-[9px] font-bold text-blue-500 bg-blue-500/20 px-1.5 py-0.5 rounded-lg">B</span>
              <span className={cn("font-bold text-xs", methodColors[entryB.request.method] ?? "")}>{entryB.request.method}</span>
              <span className="text-xs text-muted-foreground truncate">{entryB.request.url}</span>
              <span className="text-[9px] text-muted-foreground/50 ml-auto">{bDate}</span>
            </div>
          </div>

          {/* Stats grid - A side */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold text-green-500 bg-green-500/20 px-1.5 py-0.5 rounded-lg">A</span>
              <span className="text-[11px] font-medium text-muted-foreground">Run A Stats</span>
              {avgW === "a" && <span className="text-[9px] text-green-500/70">Faster overall</span>}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              <StatCardSmall label="Avg" value={formatMs(a.avg_ms)} color="text-blue-400" winner={avgW === "a" ? "a" : undefined} />
              <StatCardSmall label="Min" value={formatMs(a.min_ms)} color="text-green-500" winner={minW === "a" ? "a" : undefined} />
              <StatCardSmall label="Max" value={formatMs(a.max_ms)} color="text-red-500" winner={maxW === "a" ? "a" : undefined} />
              <StatCardSmall label="Median" value={formatMs(a.median_ms)} color="text-yellow-500" winner={medW === "a" ? "a" : undefined} />
              <StatCardSmall label="P95" value={formatMs(a.p95_ms)} color="text-orange-500" winner={p95W === "a" ? "a" : undefined} />
              <StatCardSmall label="P99" value={formatMs(a.p99_ms)} color="text-red-400" winner={p99W === "a" ? "a" : undefined} />
              <StatCardSmall label="Success" value={`${((a.success_count / a.iterations) * 100).toFixed(1)}%`} color="text-green-400" winner={successW === "a" ? "a" : undefined} />
            </div>
          </div>

          {/* Stats grid - B side */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-bold text-blue-500 bg-blue-500/20 px-1.5 py-0.5 rounded-lg">B</span>
              <span className="text-[11px] font-medium text-muted-foreground">Run B Stats</span>
              {avgW === "b" && <span className="text-[9px] text-green-500/70">Faster overall</span>}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              <StatCardSmall label="Avg" value={formatMs(b.avg_ms)} color="text-blue-400" winner={avgW === "b" ? "b" : undefined} />
              <StatCardSmall label="Min" value={formatMs(b.min_ms)} color="text-green-500" winner={minW === "b" ? "b" : undefined} />
              <StatCardSmall label="Max" value={formatMs(b.max_ms)} color="text-red-500" winner={maxW === "b" ? "b" : undefined} />
              <StatCardSmall label="Median" value={formatMs(b.median_ms)} color="text-yellow-500" winner={medW === "b" ? "b" : undefined} />
              <StatCardSmall label="P95" value={formatMs(b.p95_ms)} color="text-orange-500" winner={p95W === "b" ? "b" : undefined} />
              <StatCardSmall label="P99" value={formatMs(b.p99_ms)} color="text-red-400" winner={p99W === "b" ? "b" : undefined} />
              <StatCardSmall label="Success" value={`${((b.success_count / b.iterations) * 100).toFixed(1)}%`} color="text-green-400" winner={successW === "b" ? "b" : undefined} />
            </div>
          </div>

          {/* Side-by-side comparison table */}
          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-2">Detailed Comparison</div>
            <div className="border rounded-lg px-4 py-1">
              <CompareRow label="Avg Time" a={formatMs(a.avg_ms)} b={formatMs(b.avg_ms)} winner={avgW} />
              <CompareRow label="Min Time" a={formatMs(a.min_ms)} b={formatMs(b.min_ms)} winner={minW} />
              <CompareRow label="Max Time" a={formatMs(a.max_ms)} b={formatMs(b.max_ms)} winner={maxW} />
              <CompareRow label="Median" a={formatMs(a.median_ms)} b={formatMs(b.median_ms)} winner={medW} />
              <CompareRow label="P95" a={formatMs(a.p95_ms)} b={formatMs(b.p95_ms)} winner={p95W} />
              <CompareRow label="P99" a={formatMs(a.p99_ms)} b={formatMs(b.p99_ms)} winner={p99W} />
              <CompareRow label="Success Rate" a={`${((a.success_count / a.iterations) * 100).toFixed(1)}%`} b={`${((b.success_count / b.iterations) * 100).toFixed(1)}%`} winner={successW} lowerIsBetter={false} />
              <CompareRow label="Total Bytes" a={formatSize(a.total_bytes)} b={formatSize(b.total_bytes)} winner={bytesW} lowerIsBetter={false} />
              <CompareRow label="Failures" a={String(a.failure_count)} b={String(b.failure_count)} winner={a.failure_count < b.failure_count ? "a" : a.failure_count > b.failure_count ? "b" : "tie"} />
            </div>
          </div>

          {/* Status distribution comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-medium text-green-500/70 mb-1">Run A — Status Codes</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(
                  a.statuses.reduce<Record<number, number>>((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {})
                ).sort(([a], [b]) => Number(a) - Number(b)).map(([status, count]) => (
                  <span key={status} className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full", getStatusColor(Number(status)), "bg-current/10")}>
                    {status} × {count}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-blue-500/70 mb-1">Run B — Status Codes</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(
                  b.statuses.reduce<Record<number, number>>((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {})
                ).sort(([a], [b]) => Number(a) - Number(b)).map(([status, count]) => (
                  <span key={status} className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full", getStatusColor(Number(status)), "bg-current/10")}>
                    {status} × {count}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Overlaid timing distribution bar chart */}
          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1.5">Timing Distribution</div>
            <div className="relative h-24">
              {/* A bars (green) */}
              <div className="absolute inset-0 flex items-end gap-[2px]">
                {chart.bucketsA.map((count, i) => (
                  <div
                    key={`a-${i}`}
                    className="flex-1 rounded-t-sm bg-green-500/40 transition-all duration-150 relative group"
                    style={{ height: `${(count / chart.maxCount) * 100}%` }}
                  >
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 hidden group-hover:block text-[8px] text-green-500 whitespace-nowrap bg-secondary px-1 rounded-lg z-10">
                      A: {count}
                    </div>
                  </div>
                ))}
              </div>
              {/* B bars (blue) - slightly lower z-index and offset for overlay effect */}
              <div className="absolute inset-0 flex items-end gap-[2px] ml-[1px]">
                {chart.bucketsB.map((count, i) => (
                  <div
                    key={`b-${i}`}
                    className="flex-1 rounded-t-sm bg-blue-500/40 transition-all duration-150 relative group"
                    style={{ height: `${(count / chart.maxCount) * 100}%`, marginTop: "auto" }}
                  >
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 hidden group-hover:block text-[8px] text-blue-500 whitespace-nowrap bg-secondary px-1 rounded-lg z-10">
                      B: {count}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between text-[8px] text-muted-foreground/50 mt-0.5">
              <span>{formatMs(chart.overallMin)}</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-500/60" /> Run A</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue-500/60" /> Run B</span>
              </span>
              <span>{formatMs(chart.overallMax)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
