import { useState } from "react";
import { cn } from "@/lib/utils";
import { HistoryList } from "./HistoryList";
import { CollectionList } from "./CollectionList";
import { EnvironmentSelector } from "./EnvironmentSelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CurlImport } from "@/components/CurlImport";

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
      <div className="flex border-b border-sidebar-border shrink-0">
        {sidebarTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSidebarTab(tab.id)}
            className={cn(
              "flex-1 px-2 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px",
              activeSidebarTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
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
        <CurlImport />
        <ThemeToggle />
      </div>
    </div>
  );
}
