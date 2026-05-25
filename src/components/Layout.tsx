import { Panel, Group, Separator } from "react-resizable-panels";
import { Sidebar } from "@/components/Sidebar/Sidebar";
import { MainPanel } from "@/components/MainPanel";
import { ToastContainer } from "@/components/ToastContainer";
import { useUIStore } from "@/stores/uiStore";
import { useRequestStore } from "@/stores/requestStore";
import { useToastStore } from "@/stores/toastStore";
import { generateCurl } from "@/lib/curlGenerator";

export function Layout() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const reset = useRequestStore((s) => s.reset);
  const addToast = useToastStore((s) => s.addToast);

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="h-10 border-b flex items-center px-3 bg-card shrink-0 gap-2">
        <button
          onClick={toggleSidebar}
          className="text-muted-foreground hover:text-foreground"
          title="Toggle sidebar (Ctrl+B)"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="font-semibold text-sm text-primary">siReq</span>
        <div className="flex-1" />
        <button
          onClick={() => { reset(); addToast("New request", "info"); }}
          className="text-xs text-muted-foreground hover:text-foreground"
          title="New request (Ctrl+N)"
        >
          New
        </button>
        <button
          onClick={() => {
            const curl = generateCurl(useRequestStore.getState().request);
            navigator.clipboard.writeText(curl);
            addToast("Copied as cURL", "success");
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
          title="Copy as cURL"
        >
          cURL
        </button>
      </header>
      <Group orientation="horizontal" className="flex-1">
        {sidebarOpen && (
          <>
            <Panel defaultSize="260px" minSize="200px" maxSize="500px">
              <Sidebar />
            </Panel>
            <Separator
              style={{ width: 4, cursor: "col-resize" }}
              className="bg-border hover:bg-primary/50 active:bg-primary/70 transition-colors"
            />
          </>
        )}
        <Panel>
          <MainPanel />
        </Panel>
      </Group>
      <ToastContainer />
    </div>
  );
}
