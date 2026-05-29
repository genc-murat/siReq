import { useState } from "react";
import { useReplayStore } from "@/stores/replayStore";

export function ReplayEnvironmentMap() {
  const { sessions, activeSessionId, addRemapRule, updateRemapRule, deleteRemapRule } = useReplayStore();
  const [pattern, setPattern] = useState("");
  const [replacement, setReplacement] = useState("");

  const session = sessions.find((s) => s.id === activeSessionId);

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <span className="text-sm">No session active. Select or create a session to manage remap rules.</span>
      </div>
    );
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;
    addRemapRule(pattern.trim(), replacement.trim());
    setPattern("");
    setReplacement("");
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-auto">
      <div className="max-w-4xl w-full mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-foreground tracking-tight">Environment URL Remapping</h2>
          <p className="text-xs text-muted-foreground">
            Remap request endpoints automatically when executing replays. For example, map production hosts to local environments during debugging.
          </p>
        </div>

        {/* Add Rule Form */}
        <form onSubmit={handleAdd} className="bg-card/50 ring-1 ring-border rounded-xl p-4 flex flex-col md:flex-row items-end gap-3.5 shadow-sm">
          <div className="flex-1 flex flex-col gap-1.5 w-full">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Find Pattern</label>
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="e.g. https://api.production.com"
              className="w-full text-xs bg-background rounded-lg border border-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60 transition-all duration-150"
            />
          </div>
          <div className="shrink-0 flex items-center justify-center pb-2.5">
            <svg className="h-4 w-4 text-muted-foreground/50 rotate-90 md:rotate-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </div>
          <div className="flex-1 flex flex-col gap-1.5 w-full">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Replace With</label>
            <input
              type="text"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder="e.g. http://localhost:8080"
              className="w-full text-xs bg-background rounded-lg border border-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60 transition-all duration-150"
            />
          </div>
          <button
            type="submit"
            className="shrink-0 w-full md:w-auto bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg hover:bg-primary/95 transition-all duration-150 shadow-sm"
          >
            Add Rule
          </button>
        </form>

        {/* Rules List */}
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Active Rules ({session.remap_rules.length})</span>
          
          {session.remap_rules.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-xs">
              No URL remapping rules configured. Requests will be replayed exactly as captured.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {session.remap_rules.map((rule) => (
                <div
                  key={rule.id}
                  className="bg-card border border-border rounded-xl p-3.5 flex items-center justify-between gap-4 group hover:border-primary/25 hover:shadow-sm transition-all duration-150"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => updateRemapRule(rule.id, { enabled: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-primary accent-primary cursor-pointer shrink-0"
                    />
                    <div className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-3 min-w-0 flex-1">
                      <span className="text-xs font-mono font-semibold truncate max-w-[240px] text-foreground/90 bg-muted/65 px-2 py-0.5 rounded border border-border">
                        {rule.pattern}
                      </span>
                      <svg className="h-3 w-3 text-muted-foreground/45 shrink-0 hidden md:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                      </svg>
                      <span className="text-xs font-mono font-semibold truncate max-w-[240px] text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/10">
                        {rule.replacement || "(Empty)"}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => deleteRemapRule(rule.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150 shrink-0"
                    title="Delete rule"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
