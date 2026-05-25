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
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Send a request to see the response
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
