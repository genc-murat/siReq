import { useMemo } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import type { PerformancePoint } from "@/lib/invoke";

interface Props {
  data: PerformancePoint[];
  height?: number;
}

export function PerformanceChart({ data, height = 200 }: Props) {
  const chartData = useMemo(() => {
    return data.map((p) => ({
      date: p.date.length > 10 ? p.date.slice(5, 10) : p.date,
      avg: Number(p.avg_ms.toFixed(1)),
      p95: Number(p.p95_ms.toFixed(1)),
      min: p.min_ms,
      max: p.max_ms,
      count: p.count,
    }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">
        No performance data available
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="avgGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="p95Grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.15} />
              <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            width={40}
            unit="ms"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
          />
          <Area
            type="monotone"
            dataKey="p95"
            stroke="hsl(var(--destructive))"
            strokeOpacity={0.5}
            fill="url(#p95Grad)"
            strokeWidth={1}
            dot={false}
            name="P95"
          />
          <Area
            type="monotone"
            dataKey="avg"
            stroke="hsl(var(--primary))"
            fill="url(#avgGrad)"
            strokeWidth={2}
            dot={false}
            name="Avg"
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-4 mt-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 rounded-full bg-primary" />
          Average
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 rounded-full bg-destructive/50" />
          P95
        </span>
      </div>
    </div>
  );
}
