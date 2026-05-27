import type { MockLogEntry } from "@/lib/invoke";
import { X, Copy, Check, Info, AlertTriangle, ShieldAlert } from "lucide-react";
import { useState } from "react";

interface MockLogDetailProps {
  log: MockLogEntry;
  onClose: () => void;
}

export function MockLogDetail({ log, onClose }: MockLogDetailProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const isError = log.response_status >= 400;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-card w-full max-w-4xl h-[85vh] rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-accent/30 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                log.method === "GET" && "bg-emerald-500/10 text-emerald-400"
              } ${
                log.method === "POST" && "bg-blue-500/10 text-blue-400"
              } ${
                log.method === "DELETE" && "bg-rose-500/10 text-rose-400"
              } ${
                !["GET", "POST"].includes(log.method) && "bg-zinc-500/10 text-zinc-400"
              }`}
            >
              {log.method}
            </span>
            <span className="font-semibold text-xs text-foreground font-mono truncate max-w-[500px]">
              {log.path}
            </span>
            <span className="text-[10px] text-muted-foreground/60 font-mono pl-2">
              {log.timestamp}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dynamic Details Split Column Content */}
        <div className="flex-1 overflow-hidden flex min-h-0 divide-x divide-border">
          {/* Left Column: Request Details */}
          <div className="w-1/2 flex flex-col h-full overflow-y-auto p-5 space-y-4">
            <h3 className="text-xs font-bold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
              <ShieldAlert className="w-4.5 h-4.5 text-primary" />
              Incoming Request
            </h3>

            {/* Query Params */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Query Parameters</span>
              {Object.keys(log.request_headers).length === 0 ? (
                <div className="text-[11px] text-muted-foreground/60 italic">No query parameters.</div>
              ) : (
                <div className="border rounded-lg overflow-hidden bg-background/50 text-[11px] font-mono divide-y">
                  {Object.keys(log.request_headers).map((k) => {
                    // Extract query parameters from URL or use a simple heuristic
                    // Actually let's just parse the path/query in front-end
                    const url = new URL(`http://localhost${log.path}`);
                    const val = url.searchParams.get(k);
                    if (val === null) return null;
                    return (
                      <div key={k} className="flex p-2 gap-2 hover:bg-accent/20">
                        <div className="w-1/3 font-semibold text-primary truncate select-all">{k}</div>
                        <div className="flex-1 text-foreground break-all select-all">{val}</div>
                      </div>
                    );
                  })}
                  {/* Fallback query mapping directly */}
                  {log.path.includes("?") && (
                    <div className="p-2 text-muted-foreground/80 italic font-medium">
                      {log.path.split("?")[1]}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Request Headers */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Request Headers</span>
              <div className="border rounded-lg overflow-hidden bg-background/50 text-[11px] font-mono divide-y max-h-48 overflow-y-auto">
                {Object.entries(log.request_headers).map(([k, v]) => (
                  <div key={k} className="flex p-2 gap-2 hover:bg-accent/20">
                    <div className="w-1/3 font-semibold text-primary truncate select-all">{k}</div>
                    <div className="flex-1 text-foreground break-all select-all">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Request Body */}
            <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Request Body</span>
                {log.request_body && (
                  <button
                    onClick={() => handleCopy(log.request_body, "req-body")}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                  >
                    {copiedField === "req-body" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              {log.request_body ? (
                <pre className="flex-1 bg-background border p-3 rounded-lg text-xs font-mono overflow-auto select-all text-foreground whitespace-pre">
                  {log.request_body}
                </pre>
              ) : (
                <div className="py-4 text-[11px] text-muted-foreground/60 italic text-center border border-dashed rounded-lg bg-background/30 select-none">
                  Empty request body.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Response Details */}
          <div className="w-1/2 flex flex-col h-full overflow-y-auto p-5 space-y-4">
            <h3 className="text-xs font-bold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
              <Info className="w-4.5 h-4.5 text-primary" />
              Mock Response
            </h3>

            {/* General Info */}
            <div className="grid grid-cols-3 gap-2 bg-background/30 p-3 rounded-xl border border-border/80">
              <div className="text-center">
                <span className="text-[9px] text-muted-foreground uppercase font-semibold block mb-0.5">Response Code</span>
                <span
                  className={`text-sm font-bold font-mono ${
                    isError ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {log.response_status}
                </span>
              </div>
              <div className="text-center border-x">
                <span className="text-[9px] text-muted-foreground uppercase font-semibold block mb-0.5">Latency</span>
                <span className="text-sm font-bold font-mono text-foreground/90">
                  {log.latency_ms} ms
                </span>
              </div>
              <div className="text-center">
                <span className="text-[9px] text-muted-foreground uppercase font-semibold block mb-0.5">Scenario</span>
                <span className="text-xs font-bold text-primary truncate block px-1" title={log.matched_scenario || "None"}>
                  {log.matched_scenario || "None"}
                </span>
              </div>
            </div>

            {/* Warnings Alert Box */}
            {log.warnings.length > 0 && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1.5">
                <div className="flex items-center gap-1.5 text-rose-400 text-[11px] font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Template Warnings</span>
                </div>
                <ul className="list-disc pl-4 text-[10px] text-rose-300/90 font-mono space-y-0.5 max-h-24 overflow-y-auto">
                  {log.warnings.map((w, idx) => (
                    <li key={idx} className="break-all">{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Response Headers */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Response Headers</span>
              <div className="border rounded-lg overflow-hidden bg-background/50 text-[11px] font-mono divide-y max-h-48 overflow-y-auto">
                {Object.entries(log.response_headers).map(([k, v]) => (
                  <div key={k} className="flex p-2 gap-2 hover:bg-accent/20">
                    <div className="w-1/3 font-semibold text-primary truncate select-all">{k}</div>
                    <div className="flex-1 text-foreground break-all select-all">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Response Body */}
            <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Response Body</span>
                {log.response_body && (
                  <button
                    onClick={() => handleCopy(log.response_body, "resp-body")}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                  >
                    {copiedField === "resp-body" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              {log.response_body ? (
                <pre className="flex-1 bg-background border p-3 rounded-lg text-xs font-mono overflow-auto select-all text-foreground whitespace-pre">
                  {log.response_body}
                </pre>
              ) : (
                <div className="py-4 text-[11px] text-muted-foreground/60 italic text-center border border-dashed rounded-lg bg-background/30 select-none">
                  Empty response body.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
