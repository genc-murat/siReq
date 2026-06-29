import { cn } from "@/lib/utils";
import type { RunMode } from "@/lib/invoke";

const MODES: { value: RunMode; label: string; description: string }[] = [
  { value: "functional", label: "Functional", description: "Run all requests as-is" },
  { value: "smoke", label: "Smoke", description: "Run tagged smoke tests only" },
  { value: "regression", label: "Regression", description: "Compare against baseline" },
  { value: "load", label: "Load", description: "Concurrent load test" },
];

export function RunnerModeSelector({
  value,
  onChange,
}: {
  value: RunMode;
  onChange: (mode: RunMode) => void;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Run Mode</div>
      <div className="flex gap-1 bg-muted/30 rounded-lg p-0.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => onChange(m.value)}
            className={cn(
              "flex-1 px-3 py-1.5 text-[11px] font-medium rounded-md transition-all duration-150",
              value === m.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
            title={m.description}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
