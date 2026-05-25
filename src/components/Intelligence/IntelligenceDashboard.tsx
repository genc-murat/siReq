import { useState } from "react";
import { useIntelligenceStore } from "@/stores/intelligenceStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { IntelligenceOverview } from "./IntelligenceOverview";
import { EndpointList } from "./EndpointList";
import { EndpointDetail } from "./EndpointDetail";

const dashboardTabs = [
  { id: "overview", label: "Overview" },
  { id: "endpoints", label: "Endpoints" },
];

export function IntelligenceDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const selectedEndpoint = useIntelligenceStore((s) => s.selectedEndpoint);
  const clearSelection = useIntelligenceStore((s) => s.clearSelection);
  const error = useIntelligenceStore((s) => s.error);
  const setShowIntelligence = useUIStore((s) => s.setShowIntelligence);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <span className="text-sm font-semibold">API Intelligence</span>
        </div>          <div className="flex items-center gap-1">
            {selectedEndpoint && (
              <button
                onClick={clearSelection}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-accent transition-all duration-150 flex items-center gap-1"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                Back to list
              </button>
            )}
            <button
              onClick={() => setShowIntelligence(false)}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition-all duration-150"
              title="Close Intelligence"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
      </div>

      {/* Error */}
      {error && (
        <div className="shrink-0 px-4 py-2 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2">
          <svg className="h-4 w-4 text-destructive shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="text-xs text-destructive">{error}</span>
        </div>
      )}

      {/* Sub-tabs */}
      {!selectedEndpoint && (
        <div className="shrink-0 flex border-b border-border px-3 pt-1.5 gap-0.5 bg-card">
          {dashboardTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-t-md transition-all duration-150 border-b-2",
                activeTab === tab.id
                  ? "border-primary text-foreground bg-background/50"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/30"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-0 bg-background/50">
        {selectedEndpoint ? (
          <EndpointDetail />
        ) : activeTab === "overview" ? (
          <IntelligenceOverview />
        ) : (
          <EndpointList />
        )}
      </div>
    </div>
  );
}
