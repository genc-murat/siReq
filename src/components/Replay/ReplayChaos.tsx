import { useState } from "react";
import { useReplayStore } from "@/stores/replayStore";
import type { ChaosConfig } from "@/lib/invoke";

const defaultChaos: ChaosConfig = {
  enabled: false,
  timeout_probability: 0.1,
  timeout_min_ms: 1000,
  timeout_max_ms: 5000,
  delay_probability: 0.2,
  delay_min_ms: 100,
  delay_max_ms: 500,
  error_probability: 0.1,
  error_status_codes: [500, 502, 503],
};

export function ReplayChaos() {
  const { sessions, activeSessionId, updateChaosConfig } = useReplayStore();
  const session = sessions.find((s) => s.id === activeSessionId);

  const config: ChaosConfig = session?.chaos_config ?? defaultChaos;

  const [localConfig, setLocalConfig] = useState<ChaosConfig>(config);

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <span className="text-sm">No session active.</span>
      </div>
    );
  }

  const update = (updates: Partial<ChaosConfig>) => {
    const next = { ...localConfig, ...updates };
    setLocalConfig(next);
    updateChaosConfig(next);
  };

  const totalRisk = Math.round(
    (localConfig.timeout_probability * 100 +
      localConfig.delay_probability * 100 +
      localConfig.error_probability * 100) / 3
  );

  const riskLevel =
    totalRisk < 20 ? { label: "Low", color: "text-green-500" } :
    totalRisk < 50 ? { label: "Medium", color: "text-amber-500" } :
    { label: "High", color: "text-destructive" };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-auto">
      <div className="max-w-3xl w-full mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold text-foreground tracking-tight">Chaos Replay</h2>
            <p className="text-xs text-muted-foreground">
              Inject random failures, delays, and timeouts during replay to test system resilience.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold ${riskLevel.color}`}>Risk: {riskLevel.label} ({totalRisk}%)</span>
            <button
              onClick={() => update({ enabled: !localConfig.enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                localConfig.enabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                  localConfig.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        <div className={`transition-opacity duration-200 ${localConfig.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-red-500/10 text-red-500">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-foreground">Timeout Injection</span>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">Probability</span>
                  <span className="text-xs font-bold text-foreground">{Math.round(localConfig.timeout_probability * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0" max="100" step="5"
                  value={Math.round(localConfig.timeout_probability * 100)}
                  onChange={(e) => update({ timeout_probability: parseInt(e.target.value) / 100 })}
                  className="w-full accent-primary h-1.5"
                />
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-muted-foreground uppercase font-bold">Min (ms)</span>
                    <input
                      type="number"
                      value={localConfig.timeout_min_ms}
                      onChange={(e) => update({ timeout_min_ms: parseInt(e.target.value) || 0 })}
                      className="text-xs bg-background rounded-lg border border-input px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-muted-foreground uppercase font-bold">Max (ms)</span>
                    <input
                      type="number"
                      value={localConfig.timeout_max_ms}
                      onChange={(e) => update({ timeout_max_ms: parseInt(e.target.value) || 0 })}
                      className="text-xs bg-background rounded-lg border border-input px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-foreground">Delay Injection</span>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">Probability</span>
                  <span className="text-xs font-bold text-foreground">{Math.round(localConfig.delay_probability * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0" max="100" step="5"
                  value={Math.round(localConfig.delay_probability * 100)}
                  onChange={(e) => update({ delay_probability: parseInt(e.target.value) / 100 })}
                  className="w-full accent-primary h-1.5"
                />
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-muted-foreground uppercase font-bold">Min (ms)</span>
                    <input
                      type="number"
                      value={localConfig.delay_min_ms}
                      onChange={(e) => update({ delay_min_ms: parseInt(e.target.value) || 0 })}
                      className="text-xs bg-background rounded-lg border border-input px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-muted-foreground uppercase font-bold">Max (ms)</span>
                    <input
                      type="number"
                      value={localConfig.delay_max_ms}
                      onChange={(e) => update({ delay_max_ms: parseInt(e.target.value) || 0 })}
                      className="text-xs bg-background rounded-lg border border-input px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-foreground">Error Injection</span>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">Probability</span>
                  <span className="text-xs font-bold text-foreground">{Math.round(localConfig.error_probability * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0" max="100" step="5"
                  value={Math.round(localConfig.error_probability * 100)}
                  onChange={(e) => update({ error_probability: parseInt(e.target.value) / 100 })}
                  className="w-full accent-primary h-1.5"
                />
                <div className="flex flex-col gap-1 mt-1">
                  <span className="text-[9px] text-muted-foreground uppercase font-bold">Error Status Codes</span>
                  <input
                    type="text"
                    value={localConfig.error_status_codes.join(", ")}
                    onChange={(e) => {
                      const codes = e.target.value.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n) && n > 0);
                      update({ error_status_codes: codes.length > 0 ? codes : [500] });
                    }}
                    className="text-xs bg-background rounded-lg border border-input px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full"
                    placeholder="500, 502, 503"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 bg-muted/20 border border-border/60 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Chaos Preview</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {localConfig.enabled ? (
                <>
                  Each request has a <strong>{Math.round(localConfig.timeout_probability * 100)}%</strong> chance of timeout,{' '}
                  <strong>{Math.round(localConfig.delay_probability * 100)}%</strong> chance of {localConfig.delay_min_ms}-{localConfig.delay_max_ms}ms delay,{' '}
                  and <strong>{Math.round(localConfig.error_probability * 100)}%</strong> chance of returning a {localConfig.error_status_codes.join("/")} error response.
                </>
              ) : (
                "Chaos mode is disabled. Enable it to inject random failures during replay."
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
