import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface Props {
  status200: number;
  status400: number;
  status500: number;
  statusOther: number;
}

const COLORS = {
  success: "hsl(142 76% 36%)",
  warning: "hsl(38 92% 50%)",
  error: "hsl(0 72% 51%)",
  other: "hsl(215 20% 65%)",
};

export function StatusDistributionChart({ status200, status400, status500, statusOther }: Props) {
  const total = status200 + status400 + status500 + statusOther;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[120px] text-muted-foreground text-xs">
        No data
      </div>
    );
  }

  const data = [
    { name: "2xx Success", value: status200, color: COLORS.success },
    { name: "4xx Client Error", value: status400, color: COLORS.warning },
    { name: "5xx Server Error", value: status500, color: COLORS.error },
    { name: "Other", value: statusOther, color: COLORS.other },
  ].filter((d) => d.value > 0);

  return (
    <div className="flex items-center gap-4">
      <div className="w-[100px] h-[100px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={28}
              outerRadius={44}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "11px",
              }}
              formatter={(value: number | string | boolean) => [`${value} requests`, undefined]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="font-medium ml-auto">
              {((d.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
