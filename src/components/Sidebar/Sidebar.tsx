import { useState } from "react";
import { cn } from "@/lib/utils";
import { HistoryList } from "./HistoryList";
import { CollectionList } from "./CollectionList";
import { EnvironmentSelector } from "./EnvironmentSelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CurlImport } from "@/components/CurlImport";
import { OpenApiImport } from "@/components/OpenApiImport";
import { PostmanImport } from "@/components/PostmanImport";
import { GlobalVariablesDialog } from "@/components/GlobalVariablesDialog";
import { useUIStore } from "@/stores/uiStore";

const sidebarTabs = [
  { id: "history", label: "History" },
  { id: "collections", label: "Collections" },
];

export function Sidebar() {
  const [activeSidebarTab, setActiveSidebarTab] = useState("history");
  const [globalVarsOpen, setGlobalVarsOpen] = useState(false);
  const showIntelligence = useUIStore((s) => s.showIntelligence);
  const setShowIntelligence = useUIStore((s) => s.setShowIntelligence);

  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="px-3 py-2 border-b border-sidebar-border shrink-0">
        <EnvironmentSelector />
      </div>
      <div className="flex border-b border-sidebar-border shrink-0 px-1 pb-1 pt-1.5 gap-0.5">
        {sidebarTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSidebarTab(tab.id)}
            className={cn(
              "flex-1 px-2 py-1 text-xs font-medium rounded-md transition-all duration-150",
              activeSidebarTab === tab.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {activeSidebarTab === "history" && <HistoryList />}
        {activeSidebarTab === "collections" && <CollectionList />}
      </div>
      <GlobalVariablesDialog open={globalVarsOpen} onClose={() => setGlobalVarsOpen(false)} />
      <div className="p-2 border-t border-sidebar-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <CurlImport />
          <span className="text-muted-foreground/40">|</span>
          <PostmanImport onImported={() => setActiveSidebarTab("collections")} />
          <span className="text-muted-foreground/40">|</span>
          <OpenApiImport onImported={() => setActiveSidebarTab("collections")} />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setGlobalVarsOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground hover:bg-accent p-1.5 rounded-lg transition-all duration-150 flex items-center gap-1"
            title="Global Variables"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </button>
          <button
            onClick={() => setShowIntelligence(!showIntelligence)}
            className={showIntelligence ? "text-primary bg-primary/10 p-1.5 rounded-lg transition-all duration-150" : "text-xs text-muted-foreground hover:text-foreground hover:bg-accent p-1.5 rounded-lg transition-all duration-150"}
            title="API Intelligence"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
