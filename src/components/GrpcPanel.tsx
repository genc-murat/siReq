import { useState, useCallback, useMemo } from "react";
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
  type GrpcResponse,
} from "@/lib/invoke";
import { useUIStore } from "@/stores/uiStore";
import { EnvironmentSelector } from "./Sidebar/EnvironmentSelector";
import { GrpcHistoryPanel } from "./GrpcHistoryPanel";
import { ConnectionBar } from "./GrpcConnectionBar";
import { MethodDetail } from "./GrpcMethodDetail";
import { ResponseView, StreamingMessages } from "./GrpcResponseView";

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
  const [searchQuery, setSearchQuery] = useState("");

  // Filter services and methods based on search query
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return services;
    const q = searchQuery.toLowerCase();
    return services
      .map((svc) => ({
        ...svc,
        methods: svc.methods.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.full_name.toLowerCase().includes(q) ||
            m.input_type.toLowerCase().includes(q) ||
            m.output_type.toLowerCase().includes(q)
        ),
      }))
      .filter((svc) => svc.methods.length > 0 || svc.name.toLowerCase().includes(q) || svc.full_name.toLowerCase().includes(q));
  }, [services, searchQuery]);

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {/* Search bar */}
      <div className="px-3 py-1.5 border-b border-border/40">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter methods…"
            className="w-full bg-accent/40 text-[11px] text-foreground placeholder:text-muted-foreground/30 pl-7 pr-2 py-1.5 rounded border border-border/40 focus:outline-none focus:border-primary/50 focus:bg-accent/60 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-foreground/60 transition-colors"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="text-[10px] text-muted-foreground/50 mt-1">
            {filtered.reduce((s, svc) => s + svc.methods.length, 0)} method{filtered.reduce((s, svc) => s + svc.methods.length, 0) !== 1 ? "s" : ""} found
          </div>
        )}
      </div>

      {filtered.map((svc) => (
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
            <span className="text-[10px] text-muted-foreground/40 ml-auto tabular-nums">{svc.methods.length}</span>
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
      {filtered.length === 0 && (
        <div className="px-3 py-4 text-[11px] text-muted-foreground text-center italic">
          {searchQuery ? "No matching methods found" : "Parse a .proto file to see services"}
        </div>
      )}
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

  // Environment & History state
  const activeEnvironmentId = useUIStore((s) => s.activeEnvironmentId);
  const [showHistory, setShowHistory] = useState(false);
  const [showEnvSelector, setShowEnvSelector] = useState(false);

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
          activeEnvironmentId,
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
          activeEnvironmentId,
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
          activeEnvironmentId,
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
          activeEnvironmentId,
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
  }, [activeMethod, descriptor, address, tls, activeEnvironmentId]);

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
        <button
          onClick={() => setShowEnvSelector((p) => !p)}
          className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded transition-all font-medium ${
            activeEnvironmentId
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
          }`}
          title={activeEnvironmentId ? "Environment active — click to switch" : "No environment selected — click to set"}
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
          </svg>
          Env
        </button>
        <button
          onClick={() => setShowHistory((p) => !p)}
          className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded transition-all font-medium ${
            showHistory
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
          }`}
          title={`${showHistory ? "Close" : "Show"} gRPC request history`}
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          History
        </button>
      </div>

      {/* Environment selector popover */}
      {showEnvSelector && (
        <div className="shrink-0 px-3 py-2 border-b bg-muted/20">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Environment</span>
            <button
              onClick={() => setShowEnvSelector(false)}
              className="text-[9px] px-1.5 py-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-accent/50 transition-all"
            >
              ✕ Close
            </button>
          </div>
          <EnvironmentSelector />
        </div>
      )}

      {/* Proto descriptor info bar */}
      {descriptor && (
        <div className="shrink-0 px-3 py-1 border-b bg-muted/20">
          <span className="text-[10px] text-muted-foreground/70">
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
        </div>
      )}

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

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left panel: Proto editor, Service tree, Discovered services, or History */}
        <div className="w-72 shrink-0 flex flex-col border-r min-h-0">
          {showHistory ? (
            <GrpcHistoryPanel
              onRestore={(entry) => {
                setAddress(entry.address);
                setTls(entry.tls);
                setShowHistory(false);
              }}
            />
          ) : descriptor ? (
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
          <StreamingMessages messages={streamingMessages} outputFields={activeMethod?.info.output_fields ?? []} />
        ) : responses.length > 0 ? (
          <ResponseView response={responses[0]} outputFields={activeMethod?.info.output_fields ?? []} />
        ) : null}
      </div>
    </div>
  );
}
