import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  grpcParseProto,
  grpcCallUnary,
  grpcCallServerStreaming,
  grpcCallClientStreaming,
  grpcCallBidiStreaming,
  grpcReflectListServices,
  grpcReflectGetProto,
  type GrpcDescriptorSet,
  type GrpcServiceInfo,
  type GrpcMethodInfo,
  type GrpcFieldInfo,
  type GrpcResponse,
} from "@/lib/invoke";
import { ProtoFormBuilder, buildDefaultValues } from "./GrpcProtoForm";

// ─── Proto Editor Tab ───────────────────────────────────────────────────────

function ProtoEditor({
  content,
  onChange,
  onParse,
  parsing,
}: {
  content: string;
  onChange: (v: string) => void;
  onParse: () => void;
  parsing: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Proto Source</span>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <input
              type="file"
              accept=".proto"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = () => onChange(reader.result as string);
                  reader.readAsText(file);
                }
              }}
            />
            📁 Upload .proto
          </label>
          <button
            onClick={onParse}
            disabled={parsing || !content.trim()}
            className="text-[11px] px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium"
          >
            {parsing ? "Parsing..." : "▶ Parse"}
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-full resize-none bg-transparent text-[13px] font-mono leading-relaxed p-3 text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
          placeholder={`syntax = "proto3";\n\nservice Greeter {\n  rpc SayHello (HelloRequest) returns (HelloReply);\n}\n\nmessage HelloRequest {\n  string name = 1;\n}\n\nmessage HelloReply {\n  string message = 1;\n}`}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

// ─── Message Builder ────────────────────────────────────────────────────────

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

function JsonEditor({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-1 border-b shrink-0">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <button
          onClick={() => {
            try {
              const parsed = JSON.parse(value);
              onChange(JSON.stringify(parsed, null, 2));
            } catch { /* ignore */ }
          }}
          className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
        >
          Format
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-full resize-none bg-transparent text-[13px] font-mono leading-relaxed p-3 text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
        spellCheck={false}
      />
    </div>
  );
}

// ─── Service Tree ────────────────────────────────────────────────────────────

function ServiceTree({
  services,
  activeMethod,
  onSelectMethod,
}: {
  services: GrpcServiceInfo[];
  activeMethod: { svc: string; method: string } | null;
  onSelectMethod: (svc: string, method: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {services.map((svc) => (
        <div key={svc.full_name}>
          <button
            onClick={() => setExpanded((p) => ({ ...p, [svc.full_name]: !p[svc.full_name] }))}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-accent/50 transition-colors"
          >
            <svg
              className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform ${expanded[svc.full_name] ? "rotate-90" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M6 4l8 6-8 6V4z" />
            </svg>
            <span className="text-xs font-medium text-foreground truncate">{svc.name}</span>
          </button>
          {expanded[svc.full_name] && (
            <div className="ml-3 border-l border-border/60">
              {svc.methods.map((m) => {
                const isActive = activeMethod?.svc === svc.full_name && activeMethod?.method === m.name;
                return (
                  <button
                    key={m.full_name}
                    onClick={() => onSelectMethod(svc.full_name, m.name)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                      isActive ? "bg-primary/15 text-primary" : "hover:bg-accent/30 text-muted-foreground"
                    }`}
                  >
                    <span className="text-[10px] font-mono shrink-0">
                      {m.server_streaming ? "⇄" : "→"}
                    </span>
                    <span className="text-xs truncate">{m.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      {services.length === 0 && (
        <div className="px-3 py-4 text-[11px] text-muted-foreground text-center italic">
          Parse a .proto file to see services
        </div>
      )}
    </div>
  );
}

// ─── Live JSON Preview ────────────────────────────────────────────────────────

function JsonPreview({ values }: { values: Record<string, unknown> }) {
  // Use simple stringify — no need for useMemo here, React's bailout handles small objects fine
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

function MethodDetail({
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

  useEffect(() => {
    const defaults = buildDefaultValues(method.input_fields);
    setFormValues(defaults);
    setSingleInput(buildSampleJson(method.input_fields));
    setMultiInputs([buildSampleJson(method.input_fields)]);
    setEditorMode(method.input_fields.some(f => f.sub_fields.length > 0 || f.enum_values.length > 0 || f.is_map) ? "form" : "form");
  }, [method.full_name]);

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

// ─── Response Panel ─────────────────────────────────────────────────────────

function ResponseView({ response }: { response: GrpcResponse }) {
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

      <div className="flex-1 min-h-0">
        <textarea
          readOnly
          value={response.body}
          className="w-full h-full resize-none bg-transparent text-[13px] font-mono leading-relaxed p-3 text-foreground focus:outline-none"
          spellCheck={false}
        />
      </div>

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

function StreamingMessages({ messages }: { messages: GrpcResponse[] }) {
  if (messages.length === 0) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0 border-l">
      <div className="shrink-0 px-3 py-2 border-b flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Stream Messages</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">{messages.length}</span>
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
              <pre className="text-[12px] font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed">{msg.body}</pre>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ─── Connection Bar ─────────────────────────────────────────────────────────

function ConnectionBar({
  address,
  tls,
  onAddressChange,
  onTlsChange,
  onDiscover,
  discovering,
  disabled,
}: {
  address: string;
  tls: boolean;
  onAddressChange: (v: string) => void;
  onTlsChange: (v: boolean) => void;
  onDiscover: () => void;
  discovering: boolean;
  disabled: boolean;
}) {
  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
      <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Server:</span>
      <span className="text-[11px] text-muted-foreground/50">{tls ? "https://" : "http://"}</span>
      <input
        value={address}
        onChange={(e) => onAddressChange(e.target.value)}
        placeholder="localhost:50051"
        disabled={disabled}
        className="flex-1 bg-transparent text-[13px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
      />
      <button
        onClick={onDiscover}
        disabled={discovering || !address.trim()}
        className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-1"
        title="Discover services via gRPC reflection"
      >
        {discovering ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        ) : (
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        )}
        {discovering ? "Discovering..." : "Discover"}
      </button>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={tls}
          onChange={(e) => onTlsChange(e.target.checked)}
          disabled={disabled}
          className="rounded border-border"
        />
        TLS
      </label>
    </div>
  );
}

// ─── Discovered Services List ───────────────────────────────────────────────

function DiscoveredServicesList({
  services,
  onLoadService,
  loadingService,
}: {
  services: string[];
  onLoadService: (name: string) => void;
  loadingService: string | null;
}) {
  return (
    <div className="flex flex-col py-1">
      <div className="px-3 py-1.5">
        <span className="text-[10px] font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          Reflected Services
        </span>
        <span className="text-[10px] text-muted-foreground/60 mt-0.5">{services.length} service{services.length !== 1 ? "s" : ""} discovered</span>
      </div>
      {services.map((svc) => (
        <div
          key={svc}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/30 transition-colors group"
        >
          <span className="text-xs font-mono text-foreground truncate flex-1">{svc}</span>
          <button
            onClick={() => onLoadService(svc)}
            disabled={loadingService === svc}
            className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all opacity-0 group-hover:opacity-100 font-medium"
          >
            {loadingService === svc ? (
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-primary border-t-transparent block" />
            ) : (
              "Load"
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main GrpcPanel ─────────────────────────────────────────────────────────

export function GrpcPanel() {
  // Proto state
  const [protoContent, setProtoContent] = useState("");
  const [descriptor, setDescriptor] = useState<GrpcDescriptorSet | null>(null);
  const [parsing, setParsing] = useState(false);
  const [protoError, setProtoError] = useState<string | null>(null);

  // Connection state
  const [address, setAddress] = useState("localhost:50051");
  const [tls, setTls] = useState(false);

  // Reflection state
  const [discovering, setDiscovering] = useState(false);
  const [discoveredServices, setDiscoveredServices] = useState<string[] | null>(null);
  const [reflectError, setReflectError] = useState<string | null>(null);
  const [loadingService, setLoadingService] = useState<string | null>(null);

  // Method selection
  const [activeMethod, setActiveMethod] = useState<{ svc: string; method: string; info: GrpcMethodInfo } | null>(null);

  // Response state
  const [responses, setResponses] = useState<GrpcResponse[]>([]);
  const [streamingMessages, setStreamingMessages] = useState<GrpcResponse[]>([]);
  const [showStreaming, setShowStreaming] = useState(false);

  // Parse proto
  const handleParse = useCallback(async () => {
    setParsing(true);
    setProtoError(null);
    try {
      const result = await grpcParseProto(protoContent);
      setDescriptor(result);
      setActiveMethod(null);
      setResponses([]);
      setStreamingMessages([]);
      setDiscoveredServices(null);
    } catch (e) {
      setProtoError(String(e));
    } finally {
      setParsing(false);
    }
  }, [protoContent]);

  // Select method
  const handleSelectMethod = useCallback((svcFullName: string, methodName: string) => {
    if (!descriptor) return;
    const svc = descriptor.services.find((s) => s.full_name === svcFullName);
    if (!svc) return;
    const method = svc.methods.find((m) => m.name === methodName);
    if (!method) return;
    setActiveMethod({ svc: svcFullName, method: methodName, info: method });
    setResponses([]);
    setStreamingMessages([]);
    setShowStreaming(false);
  }, [descriptor]);

  // Discover services via reflection
  const handleReflectDiscover = useCallback(async () => {
    setDiscovering(true);
    setReflectError(null);
    setDiscoveredServices(null);
    try {
      const services = await grpcReflectListServices(address, tls);
      setDiscoveredServices(services);
    } catch (e) {
      setReflectError(String(e));
    } finally {
      setDiscovering(false);
    }
  }, [address, tls]);

  // Load a discovered service's full proto descriptor
  const handleReflectLoadService = useCallback(async (svcName: string) => {
    setLoadingService(svcName);
    setReflectError(null);
    try {
      const result = await grpcReflectGetProto(address, tls, svcName);
      setDescriptor(result);
      setActiveMethod(null);
      setResponses([]);
      setStreamingMessages([]);
      setDiscoveredServices(null);
    } catch (e) {
      setReflectError(String(e));
    } finally {
      setLoadingService(null);
    }
  }, [address, tls]);

  // Call method
  const handleCall = useCallback(async (inputJsonOrArray: string | string[]) => {
    if (!activeMethod || !descriptor) return;
    setResponses([]);
    setStreamingMessages([]);
    setShowStreaming(false);

    const isBidi = activeMethod.info.client_streaming && activeMethod.info.server_streaming;
    const isServerStream = activeMethod.info.server_streaming && !activeMethod.info.client_streaming;
    const isClientStream = activeMethod.info.client_streaming && !activeMethod.info.server_streaming;

    if (isBidi) {
      try {
        const msgs = await grpcCallBidiStreaming(
          address,
          tls,
          descriptor.proto_id,
          activeMethod.svc,
          activeMethod.method,
          inputJsonOrArray as string[],
          100,
        );
        setStreamingMessages(msgs);
        setShowStreaming(true);
      } catch (e) {
        setResponses([{
          status_code: "2",
          status_message: String(e),
          headers: [],
          body: "",
          size: 0,
          time_ms: 0,
          error: String(e),
        }]);
      }
    } else if (isServerStream) {
      try {
        const msgs = await grpcCallServerStreaming(
          address,
          tls,
          descriptor.proto_id,
          activeMethod.svc,
          activeMethod.method,
          inputJsonOrArray as string,
          100,
        );
        setStreamingMessages(msgs);
        setShowStreaming(true);
      } catch (e) {
        setResponses([{
          status_code: "2",
          status_message: String(e),
          headers: [],
          body: "",
          size: 0,
          time_ms: 0,
          error: String(e),
        }]);
      }
    } else if (isClientStream) {
      try {
        const resp = await grpcCallClientStreaming(
          address,
          tls,
          descriptor.proto_id,
          activeMethod.svc,
          activeMethod.method,
          inputJsonOrArray as string[],
        );
        setResponses([resp]);
      } catch (e) {
        setResponses([{
          status_code: "2",
          status_message: String(e),
          headers: [],
          body: "",
          size: 0,
          time_ms: 0,
          error: String(e),
        }]);
      }
    } else { // Unary
      try {
        const resp = await grpcCallUnary(
          address,
          tls,
          descriptor.proto_id,
          activeMethod.svc,
          activeMethod.method,
          inputJsonOrArray as string,
        );
        setResponses([resp]);
      } catch (e) {
        setResponses([{
          status_code: "2",
          status_message: String(e),
          headers: [],
          body: "",
          size: 0,
          time_ms: 0,
          error: String(e),
        }]);
      }
    }
  }, [activeMethod, descriptor, address, tls]);

  // Resolve active method info for the detail view
  const detailMethod = activeMethod?.info ?? null;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20">
        <div className="flex items-center gap-1.5">
          <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M8 9l3 3-3 3m5 0h3" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="2" y="3" width="20" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-semibold text-foreground">gRPC</span>
        </div>
        {descriptor && (
          <span className="text-[10px] text-muted-foreground/60 font-mono ml-1">
            {descriptor.services.length} service{descriptor.services.length !== 1 ? "s" : ""} ·{" "}
            {descriptor.services.reduce((s, svc) => s + svc.methods.length, 0)} methods
            {descriptor.from_cache && (
              <span
                className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 text-[9px] font-semibold uppercase tracking-wider"
                title="Proto compiled from cache — same content as previous parse"
              >
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                Cached
              </span>
            )}
          </span>
        )}
      </div>

      <ConnectionBar
        address={address}
        tls={tls}
        onAddressChange={setAddress}
        onTlsChange={setTls}
        onDiscover={handleReflectDiscover}
        discovering={discovering}
        disabled={parsing}
      />

      {reflectError && (
        <div className="shrink-0 px-3 py-1.5 bg-destructive/10 border-b border-destructive/20">
          <div className="text-[11px] text-destructive font-mono break-all">
            <span className="font-medium mr-1">Reflection:</span>{reflectError}
          </div>
        </div>
      )}

      {protoError && (
        <div className="shrink-0 px-3 py-1.5 bg-destructive/10 border-b border-destructive/20">
          <div className="text-[11px] text-destructive font-mono break-all">{protoError}</div>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Left panel: Proto editor, Service tree, or Discovered services */}
        <div className="w-72 shrink-0 flex flex-col border-r min-h-0">
          {descriptor ? (
            <>
              <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b bg-muted/20">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Services</span>
                <button
                  onClick={() => { setDescriptor(null); setActiveMethod(null); setResponses([]); setStreamingMessages([]); }}
                  className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  ✕ Clear
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ServiceTree
                  services={descriptor.services}
                  activeMethod={activeMethod ? { svc: activeMethod.svc, method: activeMethod.method } : null}
                  onSelectMethod={handleSelectMethod}
                />
              </div>
            </>
          ) : discoveredServices ? (
            <>
              <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b bg-muted/20">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Discovery</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDiscoveredServices(null)}
                    className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
                  >
                    ✕ Cancel
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <DiscoveredServicesList
                  services={discoveredServices}
                  onLoadService={handleReflectLoadService}
                  loadingService={loadingService}
                />
                {discoveredServices.length === 0 && (
                  <div className="px-3 py-4 text-[11px] text-muted-foreground text-center italic">
                    No services reported by server.
                    <br />
                    Make sure the server has reflection enabled.
                  </div>
                )}
              </div>
            </>
          ) : (
            <ProtoEditor
              content={protoContent}
              onChange={setProtoContent}
              onParse={handleParse}
              parsing={parsing}
            />
          )}
        </div>

        {/* Center panel: Method details / Input builder */}
        <div className="flex-1 flex flex-col min-h-0">
          {detailMethod ? (
            <MethodDetail method={detailMethod} onCall={handleCall} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <svg className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M8 9l3 3-3 3m5 0h3" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="2" y="3" width="20" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-sm text-muted-foreground/50 mb-1">Upload a <span className="font-mono text-foreground/60">.proto</span> file</p>
                <p className="text-xs text-muted-foreground/40">or click <span className="font-mono text-foreground/60">Discover</span> to auto-detect services!</p>
              </div>
            </div>
          )}
        </div>

        {/* Right panel: Response */}
        {showStreaming && streamingMessages.length > 0 ? (
          <StreamingMessages messages={streamingMessages} />
        ) : responses.length > 0 ? (
          <ResponseView response={responses[0]} />
        ) : null}
      </div>
    </div>
  );
}
