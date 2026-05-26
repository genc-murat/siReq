import { useState } from "react";
import type { GrpcResponse, GrpcFieldInfo } from "@/lib/invoke";
import { ResponseSchemaTreeView } from "./GrpcSchemaTree";

// ─── Response Panel ─────────────────────────────────────────────────────────

export function ResponseView({
  response,
  outputFields,
}: {
  response: GrpcResponse;
  outputFields: GrpcFieldInfo[];
}) {
  const [viewMode, setViewMode] = useState<"raw" | "tree">("tree");
  const headers = response.headers ?? [];
  const statusCode = parseInt(response.status_code);
  const isError = statusCode !== 0 || (response.error !== null && response.error !== "");

  return (
    <div className="flex-1 flex flex-col min-h-0 border-l">
      <div className="shrink-0 px-3 py-2 border-b flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            isError ? "bg-destructive/15 text-destructive" : "bg-emerald-500/15 text-emerald-600"
          }`}>
            {isError ? `Error ${response.status_code}` : "OK"}
          </span>
          <span className="text-[11px] text-muted-foreground">{response.time_ms}ms</span>
          <span className="text-[11px] text-muted-foreground">· {response.size} bytes</span>
        </div>
        {response.status_message && (
          <span className="text-[11px] text-muted-foreground/60 truncate">{response.status_message}</span>
        )}
        {/* View mode toggle */}
        <div className="ml-auto flex items-center gap-0.5 bg-muted/50 rounded p-0.5">
          <button
            onClick={() => setViewMode("tree")}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-all font-medium ${
              viewMode === "tree"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground/50 hover:text-foreground/70"
            }`}
            title="Schema tree view"
          >
            <svg className="h-3 w-3 inline-block mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
            </svg>
            Tree
          </button>
          <button
            onClick={() => setViewMode("raw")}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-all font-medium ${
              viewMode === "raw"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground/50 hover:text-foreground/70"
            }`}
            title="Raw JSON text"
          >
            {"{ }"} Raw
          </button>
        </div>
      </div>

      {headers.length > 0 && (
        <details className="shrink-0 border-b">
          <summary className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
            Headers ({headers.length})
          </summary>
          <div className="px-3 pb-2 max-h-32 overflow-y-auto">
            {headers.map(([k, v], i) => (
              <div key={i} className="flex gap-2 text-[11px] font-mono">
                <span className="text-muted-foreground/60 shrink-0">{k}:</span>
                <span className="text-foreground/80 break-all">{v}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {viewMode === "tree" ? (
        <ResponseSchemaTreeView fields={outputFields} body={response.body} />
      ) : (
        <div className="flex-1 min-h-0">
          <textarea
            readOnly
            value={response.body}
            className="w-full h-full resize-none bg-transparent text-[13px] font-mono leading-relaxed p-3 text-foreground focus:outline-none"
            spellCheck={false}
          />
        </div>
      )}

      {response.error && (
        <div className="shrink-0 px-3 py-2 bg-destructive/10 border-t border-destructive/20">
          <div className="text-[11px] font-medium text-destructive mb-0.5">Error</div>
          <div className="text-[11px] text-destructive/80 font-mono break-all">{response.error}</div>
        </div>
      )}
    </div>
  );
}

// ─── Streaming Messages View ────────────────────────────────────────────────

export function StreamingMessages({
  messages,
  outputFields,
}: {
  messages: GrpcResponse[];
  outputFields: GrpcFieldInfo[];
}) {
  const [viewMode, setViewMode] = useState<"raw" | "tree">("tree");

  if (messages.length === 0) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0 border-l">
      <div className="shrink-0 px-3 py-2 border-b flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Stream Messages</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">{messages.length}</span>
        {/* View mode toggle */}
        <div className="ml-auto flex items-center gap-0.5 bg-muted/50 rounded p-0.5">
          <button
            onClick={() => setViewMode("tree")}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-all font-medium ${
              viewMode === "tree"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground/50 hover:text-foreground/70"
            }`}
            title="Schema tree view"
          >
            <svg className="h-3 w-3 inline-block mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
            </svg>
            Tree
          </button>
          <button
            onClick={() => setViewMode("raw")}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-all font-medium ${
              viewMode === "raw"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground/50 hover:text-foreground/70"
            }`}
            title="Raw JSON text"
          >
            {"{ }"} Raw
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {messages.map((msg, i) => (
          <details key={i} className="border-b border-border/30" defaultChecked={i === messages.length - 1}>
            <summary className="px-3 py-1.5 text-[11px] font-mono cursor-pointer hover:bg-accent/30 transition-colors select-none flex items-center gap-2">
              <span className="text-muted-foreground/50">#{i + 1}</span>
              <span className="text-emerald-500/80">{msg.time_ms}ms</span>
              <span className="text-muted-foreground/50">{msg.size} bytes</span>
            </summary>
            <div className="px-3 pb-2">
              {viewMode === "tree" ? (
                <ResponseSchemaTreeView fields={outputFields} body={msg.body} />
              ) : (
                <pre className="text-[12px] font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed">{msg.body}</pre>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
