import React from "react";
import type { CorsConfig } from "@/lib/invoke";
import { Network } from "lucide-react";

interface MockCorsEditorProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  config: CorsConfig;
  onConfigChange: (config: CorsConfig) => void;
}

const AVAILABLE_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD", "TRACE"];

export function MockCorsEditor({ enabled, onEnabledChange, config, onConfigChange }: MockCorsEditorProps) {
  const handleToggleMethod = (method: string) => {
    let nextMethods = [...config.allow_methods];
    if (nextMethods.includes(method)) {
      nextMethods = nextMethods.filter((m) => m !== method);
    } else {
      nextMethods.push(method);
    }
    onConfigChange({
      ...config,
      allow_methods: nextMethods,
    });
  };

  return (
    <div className="space-y-4 p-4 rounded-xl border bg-card/40 backdrop-blur-sm shadow-inner">
      <div className="flex items-center justify-between border-b pb-3 border-border/60">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground/80">
          <Network className="w-4 h-4 text-primary" />
          <span>CORS Configuration</span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-background border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-3 w-3 after:w-3 after:transition-all peer-checked:bg-primary/20 peer-checked:border-primary/50 peer-checked:after:bg-primary" />
          <span className="ml-2 text-[11px] font-semibold text-muted-foreground/80 peer-checked:text-primary tracking-wider uppercase">
            {enabled ? "Enabled" : "Disabled"}
          </span>
        </label>
      </div>

      {enabled && (
        <div className="space-y-4 pt-1 animate-fadeIn">
          {/* Allow Origin */}
          <div className="grid grid-cols-3 items-center gap-2">
            <label className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Access-Control-Allow-Origin</label>
            <input
              type="text"
              value={config.allow_origin}
              onChange={(e) => onConfigChange({ ...config, allow_origin: e.target.value })}
              placeholder="*"
              className="col-span-2 h-8 bg-background border border-border rounded-lg px-3 text-xs focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Allow Credentials */}
          <div className="grid grid-cols-3 items-center gap-2">
            <label className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Allow Credentials</label>
            <div className="col-span-2 flex items-center">
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.allow_credentials}
                  onChange={(e) => onConfigChange({ ...config, allow_credentials: e.target.checked })}
                  className="sr-only peer"
                  disabled={config.allow_origin === "*"}
                />
                <div className="w-9 h-5 bg-background border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-muted-foreground after:border-border after:border after:rounded-full after:h-3 w-3 after:w-3 after:transition-all peer-checked:bg-primary/20 peer-checked:border-primary/50 peer-checked:after:bg-primary peer-disabled:opacity-50" />
                {config.allow_origin === "*" && (
                  <span className="ml-3 text-[10px] text-muted-foreground/60 italic">
                    (Cannot be enabled when Origin is '*')
                  </span>
                )}
              </label>
            </div>
          </div>

          {/* Allow Methods */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider block">Access-Control-Allow-Methods</label>
            <div className="flex flex-wrap gap-1 bg-background/40 p-2.5 rounded-lg border border-border/60">
              {AVAILABLE_METHODS.map((method) => {
                const isActive = config.allow_methods.includes(method);
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => handleToggleMethod(method)}
                    className={`py-1 px-2.5 rounded text-[10px] font-semibold transition-all duration-200 border ${
                      isActive
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-background/40 border-border/80 text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    {method}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Allow Headers */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider block">Access-Control-Allow-Headers</label>
            <input
              type="text"
              value={config.allow_headers.join(", ")}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  allow_headers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="Content-Type, Authorization"
              className="w-full h-8 bg-background border border-border rounded-lg px-3 text-xs focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>
      )}
    </div>
  );
}
