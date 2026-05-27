import type { LatencyProfile } from "@/lib/invoke";
import { Clock } from "lucide-react";

interface MockLatencyEditorProps {
  latency: LatencyProfile | null | undefined;
  onChange: (latency: LatencyProfile | null) => void;
}

export function MockLatencyEditor({ latency, onChange }: MockLatencyEditorProps) {
  const mode = latency?.mode || "none";

  const handleModeChange = (newMode: string) => {
    if (newMode === "none") {
      onChange(null);
    } else {
      onChange({
        mode: newMode as LatencyProfile["mode"],
        fixed_ms: latency?.fixed_ms || 200,
        min_ms: latency?.min_ms || 100,
        max_ms: latency?.max_ms || 500,
        mean_ms: latency?.mean_ms || 300,
        std_dev_ms: latency?.std_dev_ms || 50,
      });
    }
  };

  const handleValChange = (field: keyof LatencyProfile, val: string) => {
    if (!latency) return;
    const num = val === "" ? null : Math.min(30000, Math.max(0, parseInt(val) || 0));
    onChange({
      ...latency,
      [field]: num,
    });
  };

  return (
    <div className="space-y-4 p-4 rounded-xl border bg-card/40 backdrop-blur-sm shadow-inner">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground/80">
        <Clock className="w-4 h-4 text-primary" />
        <span>Latency Simulation</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {["none", "fixed", "random_range", "normal_distribution"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => handleModeChange(m)}
            className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-all duration-200 capitalize ${
              (m === "none" && !latency) || latency?.mode === m
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-background/50 border-border text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {m.replace("_", " ")}
          </button>
        ))}
      </div>

      {latency && (
        <div className="grid grid-cols-2 gap-3 pt-1 animate-fadeIn">
          {mode === "fixed" && (
            <div className="col-span-2 space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Fixed Delay (ms)</label>
              <input
                type="number"
                min="0"
                max="30000"
                value={latency.fixed_ms ?? ""}
                onChange={(e) => handleValChange("fixed_ms", e.target.value)}
                className="w-full h-8 bg-background border rounded-lg px-3 text-xs focus:outline-none focus:border-primary transition-colors"
                placeholder="200"
              />
            </div>
          )}

          {mode === "random_range" && (
            <>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Min Delay (ms)</label>
                <input
                  type="number"
                  min="0"
                  max="30000"
                  value={latency.min_ms ?? ""}
                  onChange={(e) => handleValChange("min_ms", e.target.value)}
                  className="w-full h-8 bg-background border rounded-lg px-3 text-xs focus:outline-none focus:border-primary transition-colors"
                  placeholder="100"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Max Delay (ms)</label>
                <input
                  type="number"
                  min="0"
                  max="30000"
                  value={latency.max_ms ?? ""}
                  onChange={(e) => handleValChange("max_ms", e.target.value)}
                  className="w-full h-8 bg-background border rounded-lg px-3 text-xs focus:outline-none focus:border-primary transition-colors"
                  placeholder="500"
                />
              </div>
            </>
          )}

          {mode === "normal_distribution" && (
            <>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Mean Delay (ms)</label>
                <input
                  type="number"
                  min="0"
                  max="30000"
                  value={latency.mean_ms ?? ""}
                  onChange={(e) => handleValChange("mean_ms", e.target.value)}
                  className="w-full h-8 bg-background border rounded-lg px-3 text-xs focus:outline-none focus:border-primary transition-colors"
                  placeholder="300"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Standard Deviation (ms)</label>
                <input
                  type="number"
                  min="0"
                  max="30000"
                  value={latency.std_dev_ms ?? ""}
                  onChange={(e) => handleValChange("std_dev_ms", e.target.value)}
                  className="w-full h-8 bg-background border rounded-lg px-3 text-xs focus:outline-none focus:border-primary transition-colors"
                  placeholder="50"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
