import { useState } from "react";
import { cn } from "@/lib/utils";
import { HistoryList } from "./HistoryList";
import { CollectionList } from "./CollectionList";
import { EnvironmentSelector } from "./EnvironmentSelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CurlImport } from "@/components/CurlImport";
import { OpenApiImport } from "@/components/OpenApiImport";

const sidebarTabs = [
  { id: "history", label: "History" },
  { id: "collections", label: "Collections" },
];

export function Sidebar() {
  const [activeSidebarTab, setActiveSidebarTab] = useState("history");

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
      <div className="p-2 border-t border-sidebar-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <CurlImport />
          <span className="text-muted-foreground/40">|</span>
          <OpenApiImport onImported={() => setActiveSidebarTab("collections")} />
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}
