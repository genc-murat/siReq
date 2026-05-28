import { useState, useCallback } from "react";
import { ReplayDiffViewer } from "./ReplayDiffViewer";
import { useReplayStore } from "@/stores/replayStore";
import type { ReplayEntry, ReplayEntryResult, HttpRequest, HttpResponse } from "@/lib/invoke";

interface ReplayInspectorProps {
  entry: ReplayEntry | null;
  entryResult?: ReplayEntryResult | null;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"] as const;

const methodColors: Record<string, string> = {
  GET: "text-green-500",
  POST: "text-yellow-500",
  PUT: "text-blue-500",
  PATCH: "text-orange-500",
  DELETE: "text-red-500",
  HEAD: "text-purple-500",
  OPTIONS: "text-teal-500",
  TRACE: "text-gray-500",
};

export function ReplayInspector({ entry, entryResult }: ReplayInspectorProps) {
  const { updateEntry } = useReplayStore();
  const [viewTab, setViewTab] = useState<"snapshots" | "diff" | "assertions">("snapshots");
  const [editing, setEditing] = useState(false);
  const [editMethod, setEditMethod] = useState(entry?.original_request.method ?? "");
  const [editUrl, setEditUrl] = useState(entry?.original_request.url ?? "");
  const [editHeaders, setEditHeaders] = useState<{ key: string; value: string; enabled: boolean }[]>(
    entry?.original_request.headers.map((h) => ({ key: h.key, value: h.value, enabled: h.enabled })) ?? []
  );
  const [editBody, setEditBody] = useState(entry?.original_request.body ?? "");
  const [editName, setEditName] = useState(entry?.original_request.name ?? "");
  const [editResponseStatusCode, setEditResponseStatusCode] = useState(entry?.original_response.status ?? 0);
  const [editResponseBody, setEditResponseBody] = useState(entry?.original_response.body ?? "");

  const handleSave = useCallback(() => {
    if (!entry) return;
    const updatedRequest: HttpRequest = {
      ...entry.original_request,
      method: editMethod as HttpRequest["method"],
      url: editUrl,
      headers: editHeaders.map((h) => ({ key: h.key, value: h.value, enabled: h.enabled })),
      body: editBody,
      name: editName,
    };
    const updatedResponse: HttpResponse = {
      ...entry.original_response,
      status: editResponseStatusCode,
      body: editResponseBody,
    };
    updateEntry(entry.id, {
      original_request: updatedRequest,
      original_response: updatedResponse,
    });
    setEditing(false);
  }, [entry, editMethod, editUrl, editHeaders, editBody, editName, editResponseStatusCode, editResponseBody, updateEntry]);

  const handleCancel = useCallback(() => {
    if (!entry) return;
    setEditMethod(entry.original_request.method);
    setEditUrl(entry.original_request.url);
    setEditHeaders(entry.original_request.headers.map((h) => ({ key: h.key, value: h.value, enabled: h.enabled })));
    setEditBody(entry.original_request.body);
    setEditName(entry.original_request.name);
    setEditResponseStatusCode(entry.original_response.status);
    setEditResponseBody(entry.original_response.body);
    setEditing(false);
  }, [entry]);

  const addHeader = useCallback(() => {
    setEditHeaders((prev) => [...prev, { key: "", value: "", enabled: true }]);
  }, []);

  const removeHeader = useCallback((index: number) => {
    setEditHeaders((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateHeader = useCallback((index: number, field: "key" | "value" | "enabled", val: string | boolean) => {
    setEditHeaders((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: val } : h)));
  }, []);

  if (!entry) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-card/25 rounded-xl border border-border">
        <svg className="h-8 w-8 text-muted-foreground/35 mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5h.01" />
        </svg>
        <span className="text-xs">Select a request from the timeline to inspect its snapshot, assertions, and visual diff analysis.</span>
      </div>
    );
  }

  const renderHeaders = (headers: [string, string][]) => {
    if (headers.length === 0) return <span className="text-[10px] text-muted-foreground italic">No headers</span>;
    return (
      <div className="flex flex-col gap-1 text-[11px] font-mono">
        {headers.map(([k, v], idx) => (
          <div key={idx} className="flex gap-2">
            <span className="text-muted-foreground font-semibold shrink-0">{k}:</span>
            <span className="text-foreground/80 break-all">{v}</span>
          </div>
        ))}
      </div>
    );
  };

  const getStatusClass = (status: number) => {
    if (status >= 200 && status < 300) return "bg-green-500/10 text-green-500 border-green-500/20";
    if (status >= 400 && status < 500) return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    if (status >= 500) return "bg-red-500/10 text-red-500 border-red-500/20";
    return "bg-muted text-foreground border-border";
  };

  const replayedResp = entryResult?.replayed_response;
  const replayedReq = entryResult?.replayed_request;
  const diff = entryResult?.diff;
  const error = entryResult?.error;
  const assertionResults = entryResult?.assertion_results ?? [];

  return (
    <div className="flex-1 flex flex-col bg-card ring-1 ring-border rounded-xl overflow-hidden min-h-0">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-bold text-foreground truncate">
            {entry.original_request.name || entry.original_request.url}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {viewTab === "snapshots" && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="px-2 py-1 text-[10px] font-bold rounded-md text-primary hover:bg-primary/10 transition-all duration-150 flex items-center gap-1"
              title="Edit entry"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              Edit
            </button>
          )}
          <div className="flex bg-background ring-1 ring-border rounded-lg p-0.5 shrink-0 gap-0.5">
            <button
              onClick={() => { setViewTab("snapshots"); setEditing(false); }}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all duration-150 ${
                viewTab === "snapshots" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Details
            </button>
            <button
              onClick={() => { setViewTab("diff"); setEditing(false); }}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all duration-150 ${
                viewTab === "diff" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Diff Analyzer
            </button>
            <button
              onClick={() => { setViewTab("assertions"); setEditing(false); }}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all duration-150 flex items-center gap-1 ${
                viewTab === "assertions" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Assertions</span>
              {assertionResults.length > 0 && (
                <span className={`h-1.5 w-1.5 rounded-full ${
                  assertionResults.some((a) => a.enabled && !a.passed) ? "bg-red-500" : "bg-green-500"
                }`} />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        {viewTab === "snapshots" && editing && (
          <div className="flex-1 overflow-auto p-4 min-h-0 flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Edit Request</span>

              <div className="flex items-center gap-2">
                <select
                  value={editMethod}
                  onChange={(e) => setEditMethod(e.target.value)}
                  className={`text-[10px] font-bold font-mono px-2 py-1 rounded border border-input bg-background ${methodColors[editMethod] || ""}`}
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="flex-1 text-xs font-mono bg-background rounded-lg border border-input px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="https://api.example.com/endpoint"
                />
              </div>

              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-xs bg-background rounded-lg border border-input px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Request name (optional)"
              />

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Headers</span>
                  <button onClick={addHeader} className="text-[10px] font-bold text-primary hover:bg-primary/10 px-2 py-0.5 rounded transition-all duration-150">+ Add</button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {editHeaders.map((h, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={h.enabled}
                        onChange={(e) => updateHeader(i, "enabled", e.target.checked)}
                        className="h-3 w-3 rounded accent-primary shrink-0"
                      />
                      <input
                        type="text"
                        value={h.key}
                        onChange={(e) => updateHeader(i, "key", e.target.value)}
                        className="w-1/3 text-[11px] font-mono bg-background rounded border border-input px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Header name"
                      />
                      <input
                        type="text"
                        value={h.value}
                        onChange={(e) => updateHeader(i, "value", e.target.value)}
                        className="flex-1 text-[11px] font-mono bg-background rounded border border-input px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Value"
                      />
                      <button
                        onClick={() => removeHeader(i)}
                        className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all duration-150 shrink-0"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Request Body</span>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="text-[11px] font-mono bg-background rounded-lg border border-input p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[100px] resize-y"
                  placeholder="Request body (JSON, text, etc.)"
                />
              </div>
            </div>

            <div className="border-t border-border/60 pt-3 flex flex-col gap-3">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Edit Response Baseline</span>

              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-muted-foreground">Status Code:</span>
                <input
                  type="number"
                  value={editResponseStatusCode}
                  onChange={(e) => setEditResponseStatusCode(Number(e.target.value))}
                  className="w-20 text-[11px] font-mono bg-background rounded-lg border border-input px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Response Body</span>
                <textarea
                  value={editResponseBody}
                  onChange={(e) => setEditResponseBody(e.target.value)}
                  className="text-[11px] font-mono bg-background rounded-lg border border-input p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[100px] resize-y"
                  placeholder="Response body baseline"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
              <button
                onClick={handleCancel}
                className="bg-transparent hover:bg-muted text-muted-foreground text-xs font-semibold px-4 py-2 rounded-lg border border-border transition-all duration-150"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all duration-150"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}

        {viewTab === "snapshots" && !editing && (
          <div className="flex-1 overflow-auto p-4 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-3 min-h-0">
              <div className="flex items-center justify-between shrink-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Original Snapshot</span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getStatusClass(entry.original_response.status)}`}>
                  {entry.original_response.status} {entry.original_response.status_text}
                </span>
              </div>

              <div className="bg-background/45 ring-1 ring-border rounded-xl p-3 flex flex-col gap-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Request URL</span>
                  <span className="text-[11px] font-mono break-all font-semibold text-foreground/80">{entry.original_request.url}</span>
                </div>
                <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Request Headers</span>
                  {renderHeaders(entry.original_request.headers.map((h) => [h.key, h.value]))}
                </div>
                {entry.original_request.body && (
                  <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Request Body</span>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-card/65 rounded-lg border border-border p-2 text-foreground/80 max-h-[140px] overflow-auto">
                      {entry.original_request.body}
                    </pre>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 flex-1 min-h-[150px]">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Response Body</span>
                <pre className="flex-1 font-mono text-[11px] bg-background/50 ring-1 ring-border rounded-xl p-3 overflow-auto whitespace-pre text-foreground/95 select-text select-all">
                  {entry.original_response.body}
                </pre>
              </div>
            </div>

            <div className="flex flex-col gap-3 min-h-0 border-t md:border-t-0 md:border-l border-border/60 md:pl-4">
              <div className="flex items-center justify-between shrink-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Replayed Output</span>
                {replayedResp ? (
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getStatusClass(replayedResp.status)}`}>
                    {replayedResp.status} {replayedResp.status_text}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border">
                    Not Replayed
                  </span>
                )}
              </div>

              <div className="bg-background/45 ring-1 ring-border rounded-xl p-3 flex flex-col gap-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Request URL</span>
                  <span className="text-[11px] font-mono break-all font-semibold text-primary/90">
                    {replayedReq?.url ?? entry.original_request.url}
                  </span>
                </div>
                <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Request Headers</span>
                  {renderHeaders((replayedReq ?? entry.original_request).headers.map((h) => [h.key, h.value]))}
                </div>
                {entry.original_request.body && (
                  <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Request Body</span>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-card/65 rounded-lg border border-border p-2 text-foreground/80 max-h-[140px] overflow-auto">
                      {replayedReq?.body ?? entry.original_request.body}
                    </pre>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 flex-1 min-h-[150px]">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Response Body</span>
                {error ? (
                  <div className="flex-1 bg-destructive/5 border border-destructive/15 rounded-xl p-3 text-destructive font-mono text-[11px] overflow-auto">
                    {error}
                  </div>
                ) : replayedResp ? (
                  <pre className="flex-1 font-mono text-[11px] bg-background/50 ring-1 ring-border rounded-xl p-3 overflow-auto whitespace-pre text-foreground/95 select-text select-all">
                    {replayedResp.body}
                  </pre>
                ) : (
                  <div className="flex-1 border border-dashed border-border rounded-xl flex items-center justify-center text-muted-foreground text-xs">
                    Replay execution pending...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {viewTab === "diff" && (
          <div className="flex-1 overflow-hidden p-4 min-h-0 flex flex-col">
            <ReplayDiffViewer
              diff={diff ?? null}
              originalBody={entry.original_response.body}
            />
          </div>
        )}

        {viewTab === "assertions" && (
          <div className="flex-1 overflow-auto p-4 min-h-0 flex flex-col gap-3">
            <div className="flex flex-col gap-1 border-b border-border/60 pb-3 shrink-0">
              <span className="text-foreground font-semibold text-xs">Assertion Evaluation Report</span>
              <p className="text-[11px] text-muted-foreground">
                Lists all evaluated assertions for the replayed request execution.
              </p>
            </div>

            {assertionResults.length === 0 ? (
              <div className="border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-xs">
                No assertions evaluated for this replayed run. Define assertions in the Assertions tab.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {assertionResults.map((assertion) => (
                  <div
                    key={assertion.id}
                    className={`border rounded-xl p-3.5 flex items-center justify-between gap-4 ${
                      !assertion.enabled
                        ? "bg-card border-border/50 opacity-60"
                        : assertion.passed
                        ? "bg-green-500/5 border-green-500/15"
                        : "bg-destructive/5 border-destructive/15"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {assertion.enabled && (
                        <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                          assertion.passed ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"
                        }`}>
                          {assertion.passed ? (
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </div>
                      )}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-foreground/90 capitalize leading-none">
                          {assertion.type.replace("_", " ")} Matching
                        </span>
                        <span className="text-[10px] text-muted-foreground mt-1">
                          Expected: <code className="font-mono bg-muted/65 px-1 py-0.5 rounded border border-border text-foreground/80">{assertion.expected}</code>
                          {assertion.actual && (
                            <>
                              {" "}· Actual: <code className={`font-mono px-1 py-0.5 rounded border ${
                                assertion.passed ? "bg-green-500/10 border-green-500/10 text-green-500" : "bg-destructive/10 border-destructive/10 text-destructive"
                              }`}>{assertion.actual}</code>
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      !assertion.enabled
                        ? "bg-muted text-muted-foreground border border-border"
                        : assertion.passed
                        ? "bg-green-500/15 text-green-500 border border-green-500/10"
                        : "bg-destructive/15 text-destructive border border-destructive/10"
                    }`}>
                      {!assertion.enabled ? "Disabled" : assertion.passed ? "Passed" : "Failed"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
