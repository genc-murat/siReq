import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { wsConnect, wsSend, wsDisconnect } from "@/lib/invoke";
import type { WsMessageEvent } from "@/lib/invoke";
import { useWebSocketStore } from "@/stores/websocketStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

export function WebSocketPanel() {
  const connectionId = useWebSocketStore((s) => s.connectionId);
  const status = useWebSocketStore((s) => s.status);
  const url = useWebSocketStore((s) => s.url);
  const messages = useWebSocketStore((s) => s.messages);
  const setConnectionId = useWebSocketStore((s) => s.setConnectionId);
  const setStatus = useWebSocketStore((s) => s.setStatus);
  const setUrl = useWebSocketStore((s) => s.setUrl);
  const addMessage = useWebSocketStore((s) => s.addMessage);
  const clearMessages = useWebSocketStore((s) => s.clearMessages);
  const reset = useWebSocketStore((s) => s.reset);
  const addToast = useToastStore((s) => s.addToast);
  const activeEnvironmentId = useUIStore((s) => s.activeEnvironmentId);

  const [inputMsg, setInputMsg] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for Tauri events
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      const unlistener1 = await listen<WsMessageEvent>("ws-message", (event) => {
        addMessage(event.payload);
      });
      unlisteners.push(unlistener1);

      const unlistener2 = await listen<{ connectionId: string; status: string }>(
        "ws-status",
        (event) => {
          const { status: s } = event.payload;
          if (s === "connected") setStatus("connected");
          if (s === "disconnected") {
            setStatus("disconnected");
            setConnectionId(null);
          }
          if (s === "connecting") setStatus("connecting");
        }
      );
      unlisteners.push(unlistener2);

      const unlistener3 = await listen<{ connectionId: string; error: string }>(
        "ws-error",
        (event) => {
          addMessage({
            connection_id: event.payload.connectionId,
            direction: "system",
            data: `Error: ${event.payload.error}`,
            is_binary: false,
          });
          setStatus("disconnected");
          setConnectionId(null);
          addToast("WebSocket connection failed", "error");
        }
      );
      unlisteners.push(unlistener3);
    };

    setup();

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [addMessage, addToast, setConnectionId, setStatus]);

  const handleConnect = async () => {
    if (!url.trim()) {
      addToast("Please enter a WebSocket URL", "info");
      return;
    }
    try {
      clearMessages();
      setStatus("connecting");
      const id = await wsConnect(url.trim(), activeEnvironmentId);
      setConnectionId(id);
      addMessage({
        connection_id: id,
        direction: "system",
        data: `Connecting to ${url.trim()}...`,
        is_binary: false,
      });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      addMessage({
        connection_id: "",
        direction: "system",
        data: `Failed to connect: ${errMsg}`,
        is_binary: false,
      });
      setStatus("disconnected");
      addToast("Connection failed", "error");
    }
  };

  const handleDisconnect = async () => {
    if (connectionId) {
      try {
        await wsDisconnect(connectionId);
      } catch {
        // ignore
      }
    }
    reset();
    addMessage({
      connection_id: "",
      direction: "system",
      data: "Disconnected",
      is_binary: false,
    });
  };

  const handleSend = async () => {
    const text = inputMsg.trim();
    if (!text || !connectionId) return;

    try {
      await wsSend(connectionId, text, activeEnvironmentId);
      setInputMsg("");
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      addToast(`Send failed: ${errMsg}`, "error");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div className="h-full flex flex-col">
      {/* Connection bar */}
      <div className="flex items-center gap-2 p-3 border-b shrink-0">
        <div className="flex items-center gap-1.5 flex-1">
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            URL:
          </span>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isConnected && !isConnecting) {
                handleConnect();
              }
            }}
            placeholder="wss://example.com/socket"
            disabled={isConnected || isConnecting}
            className="flex-1 bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 font-mono transition-all duration-150"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={cn(
                "inline-block w-2 h-2 rounded-full",
                status === "connected"
                  ? "bg-green-500"
                  : status === "connecting"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-gray-500"
              )}
            />
            <span className="text-xs text-muted-foreground capitalize">
              {status}
            </span>
          </div>
        </div>
        {!isConnected ? (
          <button
            onClick={handleConnect}
            disabled={isConnecting || !url.trim()}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 shrink-0",
              isConnecting
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isConnecting ? "Connecting..." : "Connect"}
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all duration-150 shrink-0"
          >
            Disconnect
          </button>
        )}
        <button
          onClick={clearMessages}
          className="px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150 shrink-0"
          title="Clear log"
        >
          Clear
        </button>
      </div>

      {/* Message log */}
      <div className="flex-1 overflow-auto min-h-0 p-2 space-y-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1">
            <svg className="h-8 w-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.918-5.919 15.234-5.919 21.152 0M12 21a.75.75 0 100-1.5.75.75 0 000 1.5z" />
            </svg>
            <span className="text-xs">Connect to a WebSocket to see messages</span>
            <span className="text-[10px] opacity-50">Tip: Try wss://echo.websocket.org</span>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "text-xs rounded-lg px-2.5 py-1.5 font-mono leading-relaxed break-all",
                msg.direction === "sent"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : msg.direction === "received"
                    ? "bg-accent text-accent-foreground border border-border"
                    : "bg-muted text-muted-foreground border border-border/50 italic"
              )}
            >
              <span className="text-[10px] opacity-50 mr-2 shrink-0">
                {msg.timestamp}
              </span>
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase mr-2 shrink-0",
                  msg.direction === "sent"
                    ? "text-primary"
                    : msg.direction === "received"
                      ? "text-blue-500"
                      : "text-muted-foreground"
                )}
              >
                {msg.direction === "sent" ? "→" : msg.direction === "received" ? "←" : "●" }
              </span>
              <span>{msg.data}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>

      {/* Message input */}
      <div className="flex items-center gap-2 p-3 border-t shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={inputMsg}
          onChange={(e) => setInputMsg(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? "Type a message and press Enter..." : "Connect to send messages..."}
          disabled={!isConnected}
          className="flex-1 bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 font-mono transition-all duration-150"
        />
        <button
          onClick={handleSend}
          disabled={!isConnected || !inputMsg.trim()}
          className={cn(
            "px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 shrink-0",
            isConnected && inputMsg.trim()
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          Send
        </button>
      </div>
    </div>
  );
}
