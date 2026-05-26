import { useState, useCallback, useRef, useEffect } from "react";
import { useUIStore } from "@/stores/uiStore";
import { useGraphQLStore } from "@/stores/graphqlStore";
import { useRequestStore } from "@/stores/requestStore";
import { useToastStore } from "@/stores/toastStore";
import { sendRequest } from "@/lib/invoke";
import type { AuthConfig, KeyValue } from "@/lib/invoke";
import {
  buildGraphQLRequestBody,
  buildGraphQLHeaders,
  detectOperationType,
  parseVariablesSafe,
  isValidVariablesJson,
} from "@/lib/graphqlRequest";
import { introspectEndpoint, buildSchemaFromSDL } from "@/lib/graphqlIntrospection";
import { GraphQLSubscriptionManager } from "@/lib/graphqlSubscription";
import { GraphQLQueryEditor } from "./GraphQLQueryEditor";
import { VariablesEditor } from "./VariablesEditor";
import { SchemaExplorer } from "./SchemaExplorer";
import { GraphQLHistoryPanel } from "./GraphQLHistoryPanel";
import {
  GraphQLResponseViewer,
  type GraphQLResponse,
} from "./GraphQLResponseViewer";
import { KeyValueEditor } from "@/components/Request/KeyValueEditor";
import { cn } from "@/lib/utils";

// ─── Auth Section ─────────────────────────────────────────────────────────────

const AUTH_TYPES: { value: AuthConfig["type"]; label: string }[] = [
  { value: "none", label: "None" },
  { value: "bearer", label: "Bearer" },
  { value: "basic", label: "Basic" },
  { value: "api_key", label: "API Key" },
];

function defaultAuth(): AuthConfig {
  return {
    type: "none",
    username: "",
    password: "",
    token: "",
    api_key: "",
    api_key_name: "",
    api_key_in: "header",
  };
}

function AuthSection({
  auth,
  onChange,
}: {
  auth: AuthConfig;
  onChange: (a: AuthConfig) => void;
}) {
  const upd = (field: string, value: string) =>
    onChange({ ...auth, [field]: value });

  return (
    <div className="flex flex-col gap-3 p-2">
      <div className="flex gap-1">
        {AUTH_TYPES.map((at) => (
          <button
            key={at.value}
            onClick={() => onChange({ ...auth, type: at.value })}
            className={cn(
              "px-2 py-0.5 text-xs rounded-lg transition-all duration-150",
              auth.type === at.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {at.label}
          </button>
        ))}
      </div>

      {auth.type === "bearer" && (
        <input
          type="text"
          value={auth.token}
          onChange={(e) => upd("token", e.target.value)}
          placeholder="Bearer token"
          className="bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all"
        />
      )}
      {auth.type === "basic" && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={auth.username}
            onChange={(e) => upd("username", e.target.value)}
            placeholder="Username"
            className="bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all"
          />
          <input
            type="password"
            value={auth.password}
            onChange={(e) => upd("password", e.target.value)}
            placeholder="Password"
            className="bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all"
          />
        </div>
      )}
      {auth.type === "api_key" && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={auth.api_key_name}
            onChange={(e) => upd("api_key_name", e.target.value)}
            placeholder="Key name (e.g. X-API-Key)"
            className="bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all"
          />
          <input
            type="text"
            value={auth.api_key}
            onChange={(e) => upd("api_key", e.target.value)}
            placeholder="Key value"
            className="bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all"
          />
          <div className="flex gap-2">
            {["header", "query"].map((loc) => (
              <button
                key={loc}
                onClick={() => onChange({ ...auth, api_key_in: loc as "header" | "query" })}
                className={cn(
                  "px-2 py-0.5 text-xs rounded-lg transition-all",
                  auth.api_key_in === loc
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                )}
              >
                {loc.charAt(0).toUpperCase() + loc.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subscription Messages List ───────────────────────────────────────────────

function SubscriptionPanel() {
  const messages = useGraphQLStore((s) => s.subscriptionMessages);
  const status = useGraphQLStore((s) => s.subscriptionStatus);
  const error = useGraphQLStore((s) => s.subscriptionError);
  const clearMessages = useGraphQLStore((s) => s.clearSubscriptionMessages);

  return (
    <div className="h-full flex flex-col border-l border-border min-h-0">
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20">
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            status === "connected" && "bg-emerald-500 animate-pulse",
            status === "connecting" && "bg-amber-500 animate-pulse",
            (status === "disconnected" || status === "error") && "bg-destructive",
            status === "idle" && "bg-muted-foreground/30"
          )}
        />
        <span className="text-[11px] font-medium text-muted-foreground capitalize">{status}</span>
        {messages.length > 0 && (
          <>
            <span className="text-[10px] text-muted-foreground/40">·</span>
            <span className="text-[10px] text-muted-foreground/60">{messages.length} messages</span>
            <div className="flex-1" />
            <button
              onClick={clearMessages}
              className="text-[9px] text-muted-foreground/40 hover:text-destructive transition-colors"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="shrink-0 px-3 py-2 bg-destructive/10 border-b border-destructive/20">
          <p className="text-[11px] text-destructive">{error}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
            Waiting for messages…
          </div>
        ) : (
          [...messages].reverse().map((msg) => (
            <div key={msg.id} className="border-b border-border/20 px-3 py-2">
              <div className="text-[10px] text-muted-foreground/40 mb-1">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
              <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(msg.data), null, 2);
                  } catch {
                    return msg.data;
                  }
                })()}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── SDL Input Modal ─────────────────────────────────────────────────────────

function SDLModal({ onClose, onApply }: { onClose: () => void; onApply: (sdl: string) => void }) {
  const [sdl, setSdl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleApply = () => {
    try {
      buildSchemaFromSDL(sdl);
      setError(null);
      onApply(sdl);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-popover border rounded-xl shadow-xl w-[600px] max-h-[80vh] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold">Paste SDL Schema</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 p-4 overflow-auto min-h-0 flex flex-col gap-2">
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs px-3 py-2 rounded">{error}</div>
          )}
          <textarea
            className="flex-1 w-full bg-background text-foreground text-xs font-mono px-3 py-2 rounded border border-input focus:outline-none resize-none min-h-[300px]"
            placeholder="type Query { ... }"
            value={sdl}
            onChange={(e) => setSdl(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all">Cancel</button>
          <button
            onClick={handleApply}
            disabled={!sdl.trim()}
            className="px-4 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            Apply Schema
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Collection Save Modal ───────────────────────────────────────────────────

function SaveModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("GraphQL Request");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-popover border rounded-xl shadow-xl w-[360px] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Save to Collection</h2>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Request name"
            className="bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") onSave(name); }}
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all">Cancel</button>
          <button
            onClick={() => onSave(name)}
            disabled={!name.trim()}
            className="px-4 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main GraphQL Panel ───────────────────────────────────────────────────────

type LeftPanel = "schema" | "history";
type EditorTab = "query" | "variables" | "auth" | "headers";

export function GraphQLPanel() {
  // URL & query state
  const [url, setUrl] = useState("https://");
  const [query, setQuery] = useState("query {\n  \n}");
  const [variables, setVariables] = useState("{}");
  const [operationName, setOperationName] = useState("");

  // UI state
  const [activeTab, setActiveTab] = useState<EditorTab>("query");
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("schema");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<GraphQLResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auth & headers
  const [auth, setAuth] = useState<AuthConfig>(defaultAuth());
  const [headers, setHeaders] = useState<KeyValue[]>([]);

  // Schema
  const schema = useGraphQLStore((s) => s.schema);
  const schemaError = useGraphQLStore((s) => s.schemaError);
  const introspecting = useGraphQLStore((s) => s.introspecting);
  const setSchema = useGraphQLStore((s) => s.setSchema);
  const setSchemaError = useGraphQLStore((s) => s.setSchemaError);
  const setIntrospecting = useGraphQLStore((s) => s.setIntrospecting);
  const addHistory = useGraphQLStore((s) => s.addHistory);

  // Subscription
  const subscriptionStatus = useGraphQLStore((s) => s.subscriptionStatus);
  const setSubscriptionStatus = useGraphQLStore((s) => s.setSubscriptionStatus);
  const addSubscriptionMessage = useGraphQLStore((s) => s.addSubscriptionMessage);
  const setSubscriptionError = useGraphQLStore((s) => s.setSubscriptionError);
  const clearSubscriptionMessages = useGraphQLStore((s) => s.clearSubscriptionMessages);
  const subscriptionManagerRef = useRef<GraphQLSubscriptionManager | null>(null);

  // Modals
  const [showSDLModal, setShowSDLModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const activeEnvironmentId = useUIStore((s) => s.activeEnvironmentId);

  // Abort controller for HTTP requests
  const abortRef = useRef<AbortController | null>(null);

  const isSubscription = query.trim().toLowerCase().startsWith("subscription");
  const variablesValid = isValidVariablesJson(variables);

  // ─── Sync with Request Store ───
  const activeRequest = useRequestStore((s) => s.request);
  const lastLoadedRequestIdRef = useRef<string | null>(null);

  // Sync from activeRequest when a new request is loaded from the sidebar/collections
  useEffect(() => {
    if (activeRequest && activeRequest.id !== lastLoadedRequestIdRef.current) {
      lastLoadedRequestIdRef.current = activeRequest.id;

      // Check if it's a GraphQL request
      let isGql = false;
      let parsedQuery = "query {\n  \n}";
      let parsedVars = "{}";
      let parsedOpName = "";

      if (activeRequest.body_type === "json" && activeRequest.body) {
        try {
          const parsed = JSON.parse(activeRequest.body);
          if (parsed && typeof parsed === "object" && "query" in parsed) {
            isGql = true;
            parsedQuery = parsed.query || "";
            if (parsed.variables) {
              parsedVars = JSON.stringify(parsed.variables, null, 2);
            }
            if (parsed.operationName) {
              parsedOpName = parsed.operationName;
            }
          }
        } catch {
          // Not valid JSON
        }
      }

      if (isGql) {
        setUrl(activeRequest.url || "https://");
        setQuery(parsedQuery);
        setVariables(parsedVars);
        setOperationName(parsedOpName);
        setHeaders(activeRequest.headers || []);
        setAuth(activeRequest.auth || defaultAuth());
      }
    }
  }, [activeRequest]);

  // Sync local changes back to useRequestStore so that global save buttons work
  useEffect(() => {
    const parsedVars = parseVariablesSafe(variables);
    const bodyStr = JSON.stringify({
      query,
      variables: parsedVars,
      operationName,
    });

    // Only update if something actually changed to avoid infinite loops
    const currentReq = useRequestStore.getState().request;
    if (
      currentReq.url !== url ||
      currentReq.body !== bodyStr ||
      JSON.stringify(currentReq.headers) !== JSON.stringify(headers) ||
      JSON.stringify(currentReq.auth) !== JSON.stringify(auth)
    ) {
      useRequestStore.setState((state) => ({
        request: {
          ...state.request,
          url,
          method: "POST",
          body_type: "json",
          body: bodyStr,
          headers,
          auth,
        },
      }));
    }
  }, [url, query, variables, operationName, headers, auth]);

  // ─── Introspection ────────────────────────────────────────────────────

  const handleIntrospect = useCallback(async () => {
    if (!url.trim()) return;
    setIntrospecting(true);
    setSchemaError(null);
    try {
      const result = await introspectEndpoint(url, headers, auth, activeEnvironmentId);
      setSchema(result.schema, result.sdl);
      setLeftPanel("schema");
    } catch (e) {
      setSchemaError(String(e));
    } finally {
      setIntrospecting(false);
    }
  }, [url, headers, auth, activeEnvironmentId, setIntrospecting, setSchemaError, setSchema]);

  // ─── SDL Apply ───────────────────────────────────────────────────────

  const handleApplySDL = useCallback((sdl: string) => {
    try {
      const s = buildSchemaFromSDL(sdl);
      setSchema(s, sdl);
      setSchemaError(null);
      setLeftPanel("schema");
    } catch (e) {
      setSchemaError(String(e));
    }
    setShowSDLModal(false);
  }, [setSchema, setSchemaError]);

  // ─── Send (HTTP query/mutation) ───────────────────────────────────────

  const handleSend = useCallback(async () => {
    if (!url.trim() || !variablesValid) return;
    setLoading(true);
    setError(null);
    setResponse(null);

    const parsedVars = parseVariablesSafe(variables);
    const body = buildGraphQLRequestBody(query, parsedVars, operationName);
    const builtHeaders = buildGraphQLHeaders(headers, auth);
    const opType = detectOperationType(query);
    const startMs = Date.now();

    const httpRequest = {
      id: crypto.randomUUID(),
      name: operationName || "GraphQL Request",
      method: "POST" as const,
      url,
      headers: builtHeaders,
      query_params: [],
      body_type: "json" as const,
      body,
      form_fields: [],
      auth: { ...auth, type: "none" as const }, // auth already applied via headers
      settings: {
        timeout: 30,
        follow_redirects: true,
        ssl_verify: true,
        proxy: null,
      },
      pre_script: "",
      post_script: "",
      examples: [],
      extractions: [],
    };

    try {
      const httpResp = await sendRequest(httpRequest, 30, activeEnvironmentId);
      const timeMs = Date.now() - startMs;

      let parsed: { data?: unknown; errors?: unknown } = {};
      try {
        parsed = JSON.parse(httpResp.body);
      } catch {
        parsed = {};
      }

      const gqlResponse: GraphQLResponse = {
        data: (parsed.data as unknown) ?? null,
        errors: Array.isArray(parsed.errors) ? (parsed.errors as import("./GraphQLResponseViewer").GraphQLError[]) : null,
        statusCode: httpResp.status,
        statusText: httpResp.status_text,
        timeMs,
        sizeBytes: httpResp.size,
        rawBody: httpResp.body,
        headers: httpResp.headers,
      };

      setResponse(gqlResponse);

      // Save to history
      addHistory({
        id: crypto.randomUUID(),
        url,
        query,
        variables,
        operationName,
        operationType: opType,
        response: httpResp.body,
        statusCode: httpResp.status,
        timeMs,
        sizeBytes: Number(httpResp.size),
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [url, query, variables, operationName, headers, auth, activeEnvironmentId, variablesValid, addHistory]);

  // ─── Subscription connect/disconnect ──────────────────────────────────

  const handleSubscribe = useCallback(() => {
    if (!url.trim()) return;
    clearSubscriptionMessages();
    setSubscriptionStatus("connecting");
    setSubscriptionError(null);

    if (!subscriptionManagerRef.current) {
      subscriptionManagerRef.current = new GraphQLSubscriptionManager();
    }

    const parsedVars = parseVariablesSafe(variables);

    subscriptionManagerRef.current.connect(
      url,
      query,
      parsedVars,
      {
        onConnected: () => setSubscriptionStatus("connected"),
        onMessage: (data) => {
          addSubscriptionMessage({
            id: crypto.randomUUID(),
            data: JSON.stringify(data),
            timestamp: new Date().toISOString(),
          });
        },
        onError: (err) => {
          setSubscriptionStatus("error");
          setSubscriptionError(err.message);
        },
        onComplete: () => {
          setSubscriptionStatus("disconnected");
        },
      }
    );
  }, [url, query, variables, clearSubscriptionMessages, setSubscriptionStatus, setSubscriptionError, addSubscriptionMessage]);

  const handleStop = useCallback(() => {
    subscriptionManagerRef.current?.disconnect();
    setSubscriptionStatus("disconnected");
  }, [setSubscriptionStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      subscriptionManagerRef.current?.disconnect();
    };
  }, []);

  // ─── Cancel HTTP request ──────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);

  // ─── Save to collection ───────────────────────────────────────────────
  // We use requestStore's collection list but create a minimal save dialog
  const handleSaveConfirm = useCallback(async (name: string) => {
    setShowSaveModal(false);
    try {
      const { addRequestToCollection, getCollections } = await import("@/lib/invoke");
      const collections = await getCollections();
      if (collections.length === 0) {
        useToastStore.getState().addToast("No collections found. Please create a collection first.", "error");
        return;
      }
      const first = collections[0];
      const parsedVars = parseVariablesSafe(variables);
      await addRequestToCollection(first.id, {
        id: crypto.randomUUID(),
        name,
        method: "POST",
        url,
        headers: buildGraphQLHeaders(headers, auth),
        query_params: [],
        body_type: "json",
        body: buildGraphQLRequestBody(query, parsedVars, operationName),
        form_fields: [],
        auth,
        settings: { timeout: 30, follow_redirects: true, ssl_verify: true, proxy: null },
        pre_script: "",
        post_script: "",
        examples: [],
        extractions: [],
      });
      useToastStore.getState().addToast(`Saved to collection "${first.name}"`, "success");
      // Fire custom event to reload sidebar collections list
      window.dispatchEvent(new Event("collections-updated"));
    } catch (e) {
      useToastStore.getState().addToast(`Save failed: ${e}`, "error");
    }
  }, [url, query, variables, operationName, headers, auth]);

  // ─── History restore ──────────────────────────────────────────────────

  const handleRestoreHistory = useCallback(
    (entry: { url: string; query: string; variables: string; operationName: string }) => {
      setUrl(entry.url);
      setQuery(entry.query);
      setVariables(entry.variables);
      setOperationName(entry.operationName);
      setLeftPanel("schema");
    },
    []
  );

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20">
        <div className="flex items-center gap-1.5">
          <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span className="text-xs font-semibold text-foreground">GraphQL</span>
        </div>

        <button
          onClick={() => setLeftPanel((p) => p === "history" ? "schema" : "history")}
          className={cn(
            "text-[10px] flex items-center gap-1 px-2 py-1 rounded transition-all font-medium",
            leftPanel === "history"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
          )}
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          History
        </button>

        <button
          onClick={() => setShowSDLModal(true)}
          className="text-[10px] flex items-center gap-1 px-2 py-1 rounded transition-all font-medium text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          SDL
        </button>

        <button
          onClick={() => setShowSaveModal(true)}
          className="text-[10px] flex items-center gap-1 px-2 py-1 rounded transition-all font-medium text-muted-foreground/60 hover:text-foreground hover:bg-accent/50"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Save
        </button>
      </div>

      {/* Schema / introspection error */}
      {schemaError && (
        <div className="shrink-0 px-3 py-1.5 bg-destructive/10 border-b border-destructive/20">
          <p className="text-[11px] text-destructive font-mono break-all">{schemaError}</p>
        </div>
      )}

      {/* Main three-column layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel: Schema Explorer or History */}
        <div className="w-72 shrink-0 flex flex-col border-r min-h-0">
          <div className="shrink-0 flex items-center gap-1 px-3 py-1 border-b bg-muted/20">
            <button
              onClick={() => setLeftPanel("schema")}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded transition-all",
                leftPanel === "schema"
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Schema
            </button>
            <button
              onClick={() => setLeftPanel("history")}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded transition-all",
                leftPanel === "history"
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              History
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {leftPanel === "schema" ? (
              <SchemaExplorer schema={schema ?? null} />
            ) : (
              <GraphQLHistoryPanel onRestore={handleRestoreHistory} />
            )}
          </div>
        </div>

        {/* Center panel: URL bar + editor tabs */}
        <div className="flex-1 flex flex-col min-h-0 border-r">
          {/* URL Bar */}
          <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b">
            <span className="text-[10px] font-mono bg-primary/10 text-primary px-2 py-1 rounded font-semibold shrink-0">
              POST
            </span>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/graphql"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
            />
            {/* Introspect */}
            <button
              onClick={handleIntrospect}
              disabled={introspecting || !url.trim()}
              className="shrink-0 text-[11px] px-2.5 py-1 rounded border border-border hover:bg-accent/50 transition-all text-muted-foreground disabled:opacity-40 flex items-center gap-1"
            >
              {introspecting ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent block" />
              ) : (
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              )}
              {introspecting ? "Loading…" : "Introspect"}
            </button>

            {/* Send / Subscribe / Stop / Cancel */}
            {isSubscription ? (
              subscriptionStatus === "connected" || subscriptionStatus === "connecting" ? (
                <button
                  onClick={handleStop}
                  className="shrink-0 text-[11px] px-3 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all font-medium"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleSubscribe}
                  disabled={!url.trim() || !variablesValid}
                  className="shrink-0 text-[11px] px-3 py-1 rounded bg-purple-600 text-white hover:bg-purple-500 transition-all font-medium disabled:opacity-40"
                >
                  Subscribe
                </button>
              )
            ) : loading ? (
              <button
                onClick={handleCancel}
                className="shrink-0 text-[11px] px-3 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all font-medium flex items-center gap-1"
              >
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                Cancel
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!url.trim() || !variablesValid}
                className="shrink-0 text-[11px] px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-medium disabled:opacity-40"
              >
                Send
              </button>
            )}
          </div>

          {/* Editor Tabs */}
          <div className="shrink-0 flex border-b border-border/60 px-2 pt-1 gap-0.5">
            {(["query", "variables", "auth", "headers"] as EditorTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-3 py-1.5 text-[11px] rounded-t transition-all capitalize",
                  activeTab === tab
                    ? "bg-background border border-b-background border-border text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === "query" && (
              <GraphQLQueryEditor
                value={query}
                onChange={setQuery}
                schema={schema ?? null}
              />
            )}
            {activeTab === "variables" && (
              <div className="h-full p-1">
                <VariablesEditor value={variables} onChange={setVariables} />
              </div>
            )}
            {activeTab === "auth" && (
              <div className="h-full overflow-y-auto">
                <AuthSection auth={auth} onChange={setAuth} />
              </div>
            )}
            {activeTab === "headers" && (
              <div className="h-full overflow-y-auto p-1">
                <KeyValueEditor
                  pairs={headers}
                  onChange={setHeaders}
                  keyPlaceholder="Header name"
                  valuePlaceholder="Header value"
                />
              </div>
            )}
          </div>

          {/* Status bar */}
          {error && (
            <div className="shrink-0 px-3 py-1.5 bg-destructive/10 border-t border-destructive/20">
              <p className="text-[11px] text-destructive truncate">{error}</p>
            </div>
          )}
          {schema && (
            <div className="shrink-0 px-3 py-1 border-t bg-muted/10 text-[10px] text-muted-foreground/50">
              Schema loaded ✓
            </div>
          )}
        </div>

        {/* Right panel: Response or Subscription */}
        <div className="w-[420px] min-w-[280px] shrink-0 min-h-0 flex flex-col">
          {isSubscription ? (
            <SubscriptionPanel />
          ) : (
            <GraphQLResponseViewer response={response} loading={loading} />
          )}
        </div>
      </div>

      {/* Modals */}
      {showSDLModal && (
        <SDLModal onClose={() => setShowSDLModal(false)} onApply={handleApplySDL} />
      )}
      {showSaveModal && (
        <SaveModal onClose={() => setShowSaveModal(false)} onSave={handleSaveConfirm} />
      )}
    </div>
  );
}
