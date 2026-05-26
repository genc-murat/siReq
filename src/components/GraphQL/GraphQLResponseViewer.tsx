import { useState, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { cn } from "@/lib/utils";

export interface GraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
}

export interface GraphQLResponse {
  data: unknown | null;
  errors: GraphQLError[] | null;
  statusCode: number;
  statusText: string;
  timeMs: number;
  sizeBytes: number;
  rawBody: string;
  headers: [string, string][];
}

interface GraphQLResponseViewerProps {
  response: GraphQLResponse | null;
  loading: boolean;
}

type Tab = "data" | "errors" | "raw";

function StatusBadge({ code, text }: { code: number; text: string }) {
  const isSuccess = code >= 200 && code < 300;
  const isError = code >= 400;
  return (
    <span
      className={cn(
        "text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold",
        isSuccess && "bg-emerald-500/15 text-emerald-600",
        !isSuccess && !isError && "bg-amber-500/15 text-amber-600",
        isError && "bg-destructive/15 text-destructive"
      )}
    >
      {code} {text}
    </span>
  );
}

function MetaBar({ response }: { response: GraphQLResponse }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(response.rawBody);
  };

  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20">
      <StatusBadge code={response.statusCode} text={response.statusText} />
      <span className="text-[10px] text-muted-foreground/60">·</span>
      <span className="text-[10px] text-muted-foreground">{response.timeMs}ms</span>
      <span className="text-[10px] text-muted-foreground/60">·</span>
      <span className="text-[10px] text-muted-foreground">
        {response.sizeBytes < 1024
          ? `${response.sizeBytes} B`
          : `${(response.sizeBytes / 1024).toFixed(1)} KB`}
      </span>
      <div className="flex-1" />
      <button
        onClick={handleCopy}
        className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-all"
        title="Copy response JSON"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z" />
        </svg>
        Copy
      </button>
    </div>
  );
}

function JsonLines({ json }: { json: unknown }) {
  const lines = useMemo(() => {
    try {
      return JSON.stringify(json, null, 2).split("\n");
    } catch {
      return ["(unparseable)"];
    }
  }, [json]);

  if (lines.length <= 200) {
    return (
      <pre className="text-[11px] font-mono text-foreground/85 whitespace-pre p-3 leading-relaxed">
        {lines.join("\n")}
      </pre>
    );
  }

  // Virtual scrolling for large responses
  return (
    <Virtuoso
      style={{ height: "100%" }}
      totalCount={lines.length}
      itemContent={(index) => (
        <div className="text-[11px] font-mono text-foreground/85 px-3 leading-relaxed whitespace-pre">
          {lines[index]}
        </div>
      )}
    />
  );
}

function DataTab({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
        No data
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-auto min-h-0">
      <JsonLines json={data} />
    </div>
  );
}

function ErrorsTab({ errors }: { errors: GraphQLError[] }) {
  return (
    <div className="flex-1 overflow-auto min-h-0 p-3 space-y-2">
      {errors.map((err, i) => (
        <div
          key={i}
          className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-1"
        >
          <div className="flex items-start gap-2">
            <svg className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-xs text-destructive font-medium">{err.message}</p>
          </div>
          {err.locations && err.locations.length > 0 && (
            <div className="ml-5 text-[10px] text-destructive/70 font-mono">
              at {err.locations.map((l) => `line ${l.line}, col ${l.column}`).join("; ")}
            </div>
          )}
          {err.path && err.path.length > 0 && (
            <div className="ml-5 text-[10px] text-destructive/60 font-mono">
              path: {err.path.join(" → ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * GraphQL Response Viewer — shows Data/Errors/Raw tabs, meta bar with
 * status code, timing, size, and copy button. Uses virtual scrolling for
 * large responses (Requirement 9.7).
 *
 * Requirements 3.5, 3.6, 9.1–9.7
 */
export function GraphQLResponseViewer({ response, loading }: GraphQLResponseViewerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("data");

  const errorCount = response?.errors?.length ?? 0;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center border-l border-border">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs text-muted-foreground">Sending request…</span>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="h-full flex items-center justify-center border-l border-border">
        <div className="text-center max-w-xs">
          <svg className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <p className="text-sm text-muted-foreground/50">Send a request to see the response</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col border-l border-border min-h-0">
      <MetaBar response={response} />

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-border/60 px-2 pt-1 gap-0.5">
        {(["data", "errors", "raw"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-3 py-1.5 text-[11px] rounded-t transition-all capitalize flex items-center gap-1",
              activeTab === tab
                ? "bg-background border border-b-background border-border text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
            )}
          >
            {tab}
            {tab === "errors" && errorCount > 0 && (
              <span className="bg-destructive/15 text-destructive text-[9px] font-bold px-1 py-0.5 rounded-full">
                {errorCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "data" && <DataTab data={response.data} />}
        {activeTab === "errors" && (
          errorCount > 0 ? (
            <ErrorsTab errors={response.errors!} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
              No errors
            </div>
          )
        )}
        {activeTab === "raw" && (
          <div className="flex-1 overflow-auto h-full min-h-0">
            <pre className="text-[11px] font-mono text-foreground/80 p-3 whitespace-pre-wrap break-all">
              {response.rawBody}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
