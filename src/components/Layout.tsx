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
import { Logo } from "@/components/Logo";
import {
  PanelLeft,
  Zap,
  Workflow,
  Play,
  Plus,
  ClipboardCopy,
  Globe,
  Plug,
  Braces,
  Server,
} from "lucide-react";

type ToolMode = "http" | "websocket" | "grpc" | "mock" | "graphql" | "flow" | "replay";

const toolModes: { id: ToolMode; label: string; icon: typeof Globe; shortcut?: string }[] = [
  { id: "http", label: "HTTP", icon: Globe, shortcut: "⌘⌥H" },
  { id: "websocket", label: "WS", icon: Plug, shortcut: "⌘⌥W" },
  { id: "grpc", label: "gRPC", icon: Zap },
  { id: "graphql", label: "GraphQL", icon: Braces },
  { id: "mock", label: "Mock", icon: Server },
  { id: "flow", label: "Flow", icon: Workflow },
  { id: "replay", label: "Replay", icon: Play },
];

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

  const handleToolSwitch = (mode: ToolMode) => {
    if (mode === "websocket" && !wsDisconnected) {
      useWebSocketStore.getState().reset();
    }
    setToolMode(mode);
  };

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="h-11 border-b flex items-center px-2.5 bg-card shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Toggle sidebar (Ctrl+B)"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="h-5 w-px bg-border mx-0.5" />
          <Logo size={20} />
          <span className="font-bold text-sm tracking-tight">siReq</span>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/50">
            {toolModes.map((tool) => {
              const Icon = tool.icon;
              const isActive = toolMode === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => handleToolSwitch(tool.id)}
                  title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                  className={cn(
                    "relative flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200",
                    isActive
                      ? "bg-background text-foreground shadow-sm border border-border/80"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{tool.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="New tab (Ctrl+T)"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden md:inline">New</span>
          </button>
          <button
            onClick={handleCopyCurl}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Copy as cURL"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            <span className="hidden md:inline">cURL</span>
          </button>
        </div>
      </header>
      {toolMode === "http" && <TabBar />}
      <Group orientation="horizontal" className="flex-1 overflow-hidden">
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
