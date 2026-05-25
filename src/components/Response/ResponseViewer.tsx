import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { BodyViewer } from "./BodyViewer";
import { HeadersViewer } from "./HeadersViewer";
import { CookiesViewer } from "./CookiesViewer";
import { StatsBar } from "./StatsBar";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "body", label: "Body" },
  { id: "headers", label: "Headers" },
  { id: "cookies", label: "Cookies" },
];

export function ResponseViewer() {
  const response = useRequestStore((s) => s.response);
  const loading = useRequestStore((s) => s.loading);
  const responseTab = useUIStore((s) => s.responseTab);
  const setResponseTab = useUIStore((s) => s.setResponseTab);

  if (!response && !loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-center px-8">
          <svg className="h-10 w-10 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <div className="text-sm text-muted-foreground">
            <p>Enter a URL and send a request to see the response</p>
          </div>
          <div className="flex gap-4 text-[10px] text-muted-foreground/50">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-secondary rounded text-[9px]">Ctrl+Enter</kbd> Send
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-secondary rounded text-[9px]">Ctrl+K</kbd> Commands
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Waiting for response...</span>
        </div>
      </div>
    );
  }

  if (!response) return null;

  return (
    <div className="flex flex-col h-full">
      <StatsBar />
      <div className="flex gap-1 border-b shrink-0 px-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setResponseTab(tab.id)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px",
              responseTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {responseTab === "body" && <BodyViewer />}
        {responseTab === "headers" && <HeadersViewer />}
        {responseTab === "cookies" && <CookiesViewer />}
      </div>
    </div>
  );
}
