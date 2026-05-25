import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

export function SettingsDrawer() {
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const settings = useRequestStore((s) => s.request.settings);
  const setSettings = useRequestStore((s) => s.setSettings);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingsOpen, setSettingsOpen]);

  // Focus trap
  useEffect(() => {
    if (settingsOpen) {
      const firstInput = drawerRef.current?.querySelector("input, button");
      (firstInput as HTMLElement)?.focus();
    }
  }, [settingsOpen]);

  if (!settingsOpen) return null;

  const update = (partial: Partial<typeof settings>) => {
    setSettings({ ...settings, ...partial });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
        onClick={() => setSettingsOpen(false)}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 h-full w-80 max-w-[90vw] bg-popover border-l shadow-2xl z-50 flex flex-col animate-in slide-in-from-right"
        style={{ animationDuration: "150ms" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold">Request Settings</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Timeout */}
          <section>
            <label className="text-xs font-medium text-foreground mb-2 block">
              Timeout
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={600}
                value={settings.timeout}
                onChange={(e) => update({ timeout: Math.max(1, Number(e.target.value) || 30) })}
                className="flex-1 bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus-within:ring-1 focus-within:ring-ring transition-all duration-150"
              />
              <span className="text-xs text-muted-foreground">seconds</span>
            </div>
          </section>

          {/* Toggles */}
          <section className="space-y-3">
            <label className="text-xs font-medium text-foreground block mb-1">
              Behavior
            </label>

            <ToggleRow
              label="Follow Redirects"
              description="Automatically follow HTTP 3xx redirects"
              checked={settings.follow_redirects}
              onChange={(v) => update({ follow_redirects: v })}
            />

            <ToggleRow
              label="SSL Verification"
              description="Verify TLS/SSL certificates (disable for self-signed certs)"
              checked={settings.ssl_verify}
              onChange={(v) => update({ ssl_verify: v })}
            />
          </section>

          {/* Proxy */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-foreground">
                Proxy
              </label>
              <button
                onClick={() => {
                  if (settings.proxy) {
                    update({ proxy: { ...settings.proxy, enabled: !settings.proxy.enabled } });
                  } else {
                    update({ proxy: { enabled: true, url: "", username: "", password: "" } });
                  }
                }}
                className={cn(
                  "text-[10px] px-2 py-1 rounded-lg transition-all duration-150",
                  settings.proxy?.enabled
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                {settings.proxy?.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            {settings.proxy && (
              <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                <div>
                  <label className="text-[10px] text-muted-foreground">Proxy URL</label>
                  <input
                    type="text"
                    placeholder="http://proxy.example.com:8080"
                    value={settings.proxy.url}
                    onChange={(e) =>
                      update({ proxy: { ...settings.proxy!, url: e.target.value } })
                    }
                    className="w-full bg-background text-foreground text-xs px-2 py-1 rounded-lg border border-input focus:outline-none focus-within:ring-1 focus-within:ring-ring transition-all duration-150 mt-0.5"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">Username</label>
                    <input
                      type="text"
                      placeholder="(optional)"
                      value={settings.proxy.username}
                      onChange={(e) =>
                        update({ proxy: { ...settings.proxy!, username: e.target.value } })
                      }
                      className="w-full bg-background text-foreground text-xs px-2 py-1 rounded-lg border border-input focus:outline-none focus-within:ring-1 focus-within:ring-ring transition-all duration-150 mt-0.5"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">Password</label>
                    <input
                      type="password"
                      placeholder="(optional)"
                      value={settings.proxy.password}
                      onChange={(e) =>
                        update({ proxy: { ...settings.proxy!, password: e.target.value } })
                      }
                      className="w-full bg-background text-foreground text-xs px-2 py-1 rounded-lg border border-input focus:outline-none focus-within:ring-1 focus-within:ring-ring transition-all duration-150 mt-0.5"
                    />
                  </div>
                </div>
              </div>
            )}

            {!settings.proxy && (
              <button
                onClick={() => update({ proxy: { enabled: true, url: "", username: "", password: "" } })}
                className="w-full text-xs px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all duration-150"
              >
                + Add Proxy
              </button>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          "relative shrink-0 w-9 h-5 rounded-full transition-all duration-150 mt-0.5",
          checked ? "bg-primary" : "bg-secondary"
        )}
      >
        <span
          className={cn(
            "block w-3.5 h-3.5 bg-background rounded-full shadow-sm transition-transform mt-0.5 ml-0.5",
            checked && "translate-x-4"
          )}
        />
      </button>
      <div className="flex flex-col">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground">{description}</span>
      </div>
    </div>
  );
}
