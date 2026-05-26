import { Panel, Group, Separator } from "react-resizable-panels";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { MainPanel } from "@/components/MainPanel";
import { TabBar } from "@/components/TabBar";
import { CommandPalette } from "@/components/CommandPalette";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { ToastContainer } from "@/components/ToastContainer";
import { useUIStore } from "@/stores/uiStore";
import { useRequestStore } from "@/stores/requestStore";
import { useTabStore } from "@/stores/tabStore";
import { useToastStore } from "@/stores/toastStore";
import { useWebSocketStore } from "@/stores/websocketStore";
import { useEffect } from "react";
import { generateCurl } from "@/lib/curlGenerator";
import { cn } from "@/lib/utils";

export function Layout() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const toolMode = useUIStore((s) => s.toolMode);
  const setToolMode = useUIStore((s) => s.setToolMode);
  const addToast = useToastStore((s) => s.addToast);
  const wsDisconnected = useWebSocketStore((s) => s.status) === "disconnected";

  const handleNew = () => {
    useTabStore.getState().createTab();
    addToast("New request", "info");
  };

  const handleCopyCurl = () => {
    const curl = generateCurl(useRequestStore.getState().request);
    navigator.clipboard.writeText(curl);
    addToast("Copied as cURL", "success");
  };

  // Global keyboard shortcuts for tool mode switching
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const alt = e.altKey;
      if (!mod || !alt) return;
      if (e.key === "h") {
        e.preventDefault();
        setToolMode("http");
      } else if (e.key === "w") {
        e.preventDefault();
        if (!wsDisconnected) {
          useWebSocketStore.getState().reset();
        }
        setToolMode("websocket");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setToolMode, wsDisconnected]);

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="h-10 border-b flex items-center px-3 bg-card shrink-0 gap-1.5">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          title="Toggle sidebar (Ctrl+B)"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <span className="font-semibold text-sm text-primary ml-1 mr-2">siReq</span>
        <div className="h-4 w-px bg-border" />
        <span className="text-[10px] text-muted-foreground/50 font-mono uppercase tracking-wider ml-2">HTTP Client</span>
        <div className="flex-1" />
        {/* Tool switcher */}
        <button
          onClick={() => setToolMode("http")}
          className={cn(
            "px-2 py-1 rounded-lg text-xs transition-all duration-150 flex items-center gap-1",
            toolMode === "http"
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
          title="HTTP Request"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          <span>HTTP</span>
        </button>
        <button
          onClick={() => {
            if (!wsDisconnected) {
              useWebSocketStore.getState().reset();
            }
            setToolMode("websocket");
          }}
          className={cn(
            "px-2 py-1 rounded-lg text-xs transition-all duration-150 flex items-center gap-1",
            toolMode === "websocket"
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
          title="WebSocket Test"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.07a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L3.67 9.976" />
          </svg>
          <span>WebSocket</span>
        </button>
        <button
          onClick={() => setToolMode("grpc")}
          className={cn(
            "px-2 py-1 rounded-lg text-xs transition-all duration-150 flex items-center gap-1",
            toolMode === "grpc"
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
          title="gRPC Client"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>gRPC</span>
        </button>
        <button
          onClick={() => setToolMode("graphql")}
          className={cn(
            "px-2 py-1 rounded-lg text-xs transition-all duration-150 flex items-center gap-1",
            toolMode === "graphql"
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
          title="GraphQL Client"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span>GraphQL</span>
        </button>

        <button
          onClick={() => setToolMode("mock")}
          className={cn(
            "px-2 py-1 rounded-lg text-xs transition-all duration-150 flex items-center gap-1",
            toolMode === "mock"
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
          title="Smart Mock Server"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
          <span>Mock</span>
        </button>
        <div className="h-4 w-px bg-border" />
        <button
          onClick={handleNew}
          className="px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150 flex items-center gap-1"
          title="New tab (Ctrl+T)"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span>New</span>
        </button>
        <button
          onClick={handleCopyCurl}
          className="px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150 flex items-center gap-1"
          title="Copy as cURL"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z" />
          </svg>
          <span>cURL</span>
        </button>
      </header>
      <TabBar />
      <Group orientation="horizontal" className="flex-1">
        {sidebarOpen && (
          <>
            <Panel defaultSize="260px" minSize="200px" maxSize="500px">
              <Sidebar />
            </Panel>
            <Separator
              style={{ width: 4, cursor: "col-resize" }}
              className="bg-border hover:bg-primary/50 active:bg-primary/70 transition-all duration-150"
            />
          </>
        )}
        <Panel>
          <MainPanel />
        </Panel>
      </Group>
      <CommandPalette />
      <ShortcutsDialog />
      <SettingsDrawer />
      <ToastContainer />
    </div>
  );
}
