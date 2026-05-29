import { useState } from "react";
import type { KeyValue } from "@/lib/invoke";
import { cn } from "@/lib/utils";

interface VariablesViewerProps {
  variables: KeyValue[];
}

export function VariablesViewer({ variables }: VariablesViewerProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (name: string) => {
    try {
      await navigator.clipboard.writeText(`{{${name}}}`);
      setCopiedId(name);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = `{{${name}}}`;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopiedId(name);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  if (variables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        <div className="flex flex-col items-center gap-2">
          <svg className="h-8 w-8 text-muted-foreground/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          <p>No variables were modified or extracted in this request.</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Configure extractions in the <span className="font-mono text-primary">Scripts</span> tab to chain data between requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          Chainable Variables ({variables.length})
        </h3>
        <span className="text-[10px] text-muted-foreground/60">
          Use <span className="font-mono text-primary">{"{{variable_name}}"}</span> in subsequent requests
        </span>
      </div>

      {/* Quick explainer */}
      <div className="border border-cyan-500/20 bg-cyan-500/5 rounded-lg p-2.5 space-y-1">
        <div className="flex items-start gap-2">
          <svg className="h-4 w-4 text-cyan-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            These variables are automatically stored in your active environment.
            Use <code className="font-mono text-cyan-500 bg-cyan-500/10 px-1 rounded text-[10px]">{"{{variable_name}}"}</code> in any request field
            (URL, headers, body) to reference them. Click <span className="font-mono text-[10px]">[Copy]</span> to copy the syntax.
          </div>
        </div>
      </div>

      {/* Variable list */}
      <div className="space-y-1">
        {variables.map((v) => (
          <div
            key={v.key}
            className="group flex items-center gap-3 border rounded-lg px-3 py-2 hover:bg-accent/30 transition-all duration-150"
          >
            {/* Variable name */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-xs font-semibold text-foreground font-mono shrink-0">
                {v.key}
              </span>
              <span className="text-muted-foreground/30 shrink-0">=</span>
              <span className="text-xs text-primary truncate font-mono" title={v.value}>
                {v.value.length > 100 ? v.value.slice(0, 100) + "…" : v.value}
              </span>
            </div>

            {/* Copy button */}
            <button
              onClick={() => handleCopy(v.key)}
              className={cn(
                "shrink-0 px-2 py-1 text-[10px] font-medium rounded-lg transition-all duration-150 opacity-0 group-hover:opacity-100 focus:opacity-100",
                copiedId === v.key
                  ? "bg-green-500/15 text-green-500"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border"
              )}
              title={`Copy {{${v.key}}} to clipboard`}
            >
              {copiedId === v.key ? (
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
