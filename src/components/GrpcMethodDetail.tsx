import { useState, useCallback } from "react";
import type { GrpcFieldInfo, GrpcMethodInfo } from "@/lib/invoke";
import { ProtoFormBuilder, buildDefaultValues } from "./GrpcProtoForm";

// ─── Sample JSON Builder ────────────────────────────────────────────────────

function buildSampleJson(fields: GrpcFieldInfo[]): string {
  const obj: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.is_map) {
      obj[f.name] = { key1: "value1" };
    } else if (f.label === "repeated") {
      obj[f.name] = [];
    } else if (f.field_type === "string") {
      obj[f.name] = "string";
    } else if (f.field_type === "int32" || f.field_type === "int64" || f.field_type === "uint32" || f.field_type === "uint64" || f.field_type === "sint32" || f.field_type === "sint64" || f.field_type === "fixed32" || f.field_type === "fixed64" || f.field_type === "sfixed32" || f.field_type === "sfixed64") {
      obj[f.name] = 0;
    } else if (f.field_type === "double" || f.field_type === "float") {
      obj[f.name] = 0.0;
    } else if (f.field_type === "bool") {
      obj[f.name] = false;
    } else if (f.field_type === "bytes") {
      obj[f.name] = "";
    } else {
      obj[f.name] = {};
    }
  }
  return JSON.stringify(obj, null, 2);
}

// ─── Live JSON Preview ────────────────────────────────────────────────────────

function JsonPreview({ values }: { values: Record<string, unknown> }) {
  const json = JSON.stringify(values, null, 2);

  return (
    <textarea
      readOnly
      value={json}
      className="w-full h-full resize-none bg-transparent text-[12px] font-mono leading-relaxed p-3 text-foreground focus:outline-none"
      spellCheck={false}
    />
  );
}

// ─── Method Detail View ─────────────────────────────────────────────────────

export function MethodDetail({
  method,
  onCall,
}: {
  method: GrpcMethodInfo;
  onCall: (inputJson: string | string[]) => void;
}) {
  const isClientStreaming = method.client_streaming && !method.server_streaming;
  const isServerStreaming = method.server_streaming && !method.client_streaming;
  const isBidiStreaming = method.client_streaming && method.server_streaming;

  // Mode: "form" (visual builder) or "json" (raw textarea)
  const [editorMode, setEditorMode] = useState<"form" | "json">("form");

  // Form builder state
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() => buildDefaultValues(method.input_fields));

  // For client-streaming, we have an array of JSON inputs (always JSON mode for multi-message)
  const [singleInput, setSingleInput] = useState(() => buildSampleJson(method.input_fields));
  const [multiInputs, setMultiInputs] = useState<string[]>([buildSampleJson(method.input_fields)]);
  const [calling, setCalling] = useState(false);

  const handleCall = useCallback(async () => {
    setCalling(true);
    try {
      if (isClientStreaming || isBidiStreaming) {
        await onCall(multiInputs);
      } else {
        if (editorMode === "form") {
          await onCall(JSON.stringify(formValues, null, 2));
        } else {
          await onCall(singleInput);
        }
      }
    } finally {
      setCalling(false);
    }
  }, [singleInput, multiInputs, isClientStreaming, isBidiStreaming, onCall, editorMode, formValues]);

  const [prevMethodName, setPrevMethodName] = useState("");
  if (method.full_name !== prevMethodName) {
    setPrevMethodName(method.full_name);
    const defaults = buildDefaultValues(method.input_fields);
    setFormValues(defaults);
    setSingleInput(buildSampleJson(method.input_fields));
    setMultiInputs([buildSampleJson(method.input_fields)]);
    setEditorMode(method.input_fields.some(f => f.sub_fields.length > 0 || f.enum_values.length > 0 || f.is_map) ? "form" : "form");
  }

  // Add/remove messages for client-streaming
  const addMessage = useCallback(() => {
    setMultiInputs((prev) => [...prev, buildSampleJson(method.input_fields)]);
  }, [method.input_fields]);

  const removeMessage = useCallback((idx: number) => {
    setMultiInputs((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateMessage = useCallback((idx: number, val: string) => {
    setMultiInputs((prev) => prev.map((v, i) => (i === idx ? val : v)));
  }, []);

  const methodKind = isClientStreaming ? "Client Streaming" : isServerStreaming ? "Server Streaming" : isBidiStreaming ? "Bidirectional" : "Unary";
  const methodColor = isClientStreaming ? "bg-blue-500/15 text-blue-600" : isServerStreaming ? "bg-amber-500/15 text-amber-600" : isBidiStreaming ? "bg-purple-500/15 text-purple-600" : "bg-emerald-500/15 text-emerald-600";

  const hasMultiMessage = isClientStreaming || isBidiStreaming;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Method header */}
      <div className="px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${methodColor}`}>
            {methodKind}
          </span>
          <span className="text-xs font-mono text-foreground">{method.name}</span>
        </div>
        <div className="text-[11px] text-muted-foreground/70 font-mono">
          {method.client_streaming ? "stream " : ""}{method.input_type} → {method.server_streaming ? "stream " : ""}{method.output_type}
        </div>
      </div>

      {/* Input fields info */}
      <div className="shrink-0 px-3 py-1.5 border-b">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Input Fields</div>
        <div className="flex flex-wrap gap-1">
          {method.input_fields.map((f) => (
            <span
              key={f.name}
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
              title={`${f.label} ${f.field_type}`}
            >
              {f.name}: {f.field_type}
              {f.label === "repeated" ? "[]" : ""}
              {f.is_map ? "{…}" : ""}
            </span>
          ))}
        </div>
      </div>

      {/* Editor: Form builder or JSON textarea */}
      {hasMultiMessage ? (
        // Multi-message (client-streaming / bidi): always use JSON mode
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto border-b">
          <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b bg-muted/20">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Messages ({multiInputs.length})
            </span>
            <button
              onClick={addMessage}
              className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-all font-medium"
            >
              + Add Message
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {multiInputs.map((json, idx) => (
              <details key={idx} className="border-b border-border/30" defaultChecked={idx === multiInputs.length - 1}>
                <summary className="px-3 py-1.5 text-[11px] font-mono cursor-pointer hover:bg-accent/30 transition-colors select-none flex items-center gap-2">
                  <span className="text-muted-foreground/50">Message #{idx + 1}</span>
                  {multiInputs.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeMessage(idx); }}
                      className="ml-auto text-muted-foreground/40 hover:text-destructive transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </summary>
                <div className="px-3 pb-2">
                  <textarea
                    value={json}
                    onChange={(e) => updateMessage(idx, e.target.value)}
                    className="w-full h-24 resize-none bg-transparent text-[12px] font-mono leading-relaxed text-foreground focus:outline-none border border-border/40 rounded p-1.5"
                    spellCheck={false}
                  />
                </div>
              </details>
            ))}
          </div>
        </div>
      ) : editorMode === "form" ? (
        <div className="flex-1 min-h-0 flex border-b">
          {/* Visual form builder */}
          <div className="flex-1 flex flex-col min-h-0 border-r">
            <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b bg-muted/20">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Form Input</span>
              <button
                onClick={() => setEditorMode("json")}
                className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors font-medium"
              >
                JSON Mode
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              <ProtoFormBuilder
                fields={method.input_fields}
                values={formValues}
                onChange={setFormValues}
              />
            </div>
          </div>
          {/* Live JSON preview */}
          <div className="w-80 shrink-0 flex flex-col min-h-0">
            <div className="shrink-0 px-3 py-1.5 border-b bg-muted/20">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Live Preview</span>
            </div>
            <div className="flex-1 min-h-0 p-0">
              <JsonPreview values={formValues} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col border-b">
          <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b bg-muted/20">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Input (JSON)</span>
            <button
              onClick={() => setEditorMode("form")}
              className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
            >
              Form Mode
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <textarea
              value={singleInput}
              onChange={(e) => setSingleInput(e.target.value)}
              className="w-full h-full resize-none bg-transparent text-[13px] font-mono leading-relaxed p-3 text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {/* Call/Stream button */}
      <div className="shrink-0 px-3 py-2 flex items-center gap-2">
        <button
          onClick={handleCall}
          disabled={calling || (isClientStreaming && multiInputs.length === 0)}
          className="px-4 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-xs font-medium"
        >              {calling ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {isBidiStreaming ? "Streaming..." : isClientStreaming ? "Sending..." : isServerStreaming ? "Streaming..." : "Calling..."}
            </span>
          ) : (
            `▶ ${isBidiStreaming ? `Send ${multiInputs.length} Message${multiInputs.length !== 1 ? "s" : ""}` : isClientStreaming ? `Send ${multiInputs.length} Message${multiInputs.length !== 1 ? "s" : ""}` : isServerStreaming ? "Start Stream" : "Call"}`
          )}
        </button>
      </div>
    </div>
  );
}
