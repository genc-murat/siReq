import { useRef } from "react";
import { MethodSelector } from "./MethodSelector";
import { UrlBar } from "./UrlBar";
import { HeadersTab } from "./HeadersTab";
import { QueryTab } from "./QueryTab";
import { AuthTab } from "./AuthTab";
import { BodyTab } from "./BodyTab";
import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { generateCurl } from "@/lib/curlGenerator";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "params", label: "Params" },
  { id: "headers", label: "Headers" },
  { id: "body", label: "Body" },
  { id: "auth", label: "Auth" },
];

export function RequestBuilder() {
  const loading = useRequestStore((s) => s.loading);
  const activeTab = useUIStore((s) => s.activeTab);
  const timeout = useUIStore((s) => s.timeout);
  const environmentId = useUIStore((s) => s.activeEnvironmentId);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const addToast = useToastStore((s) => s.addToast);
  const urlRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts(urlRef);

  return (
    <div className="h-full flex flex-col p-3 gap-2 overflow-hidden">
      <div className="flex gap-2 shrink-0">
        <MethodSelector />
        <UrlBar inputRef={urlRef} />
        <button
          onClick={() => useRequestStore.getState().send(timeout, environmentId)}
          disabled={loading}
          className={cn(
            "px-5 py-1.5 rounded-md text-sm font-medium transition-colors shrink-0",
            loading
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {loading ? "Sending..." : "Send"}
        </button>
        {loading && (
          <button
            onClick={() => useRequestStore.getState().cancel()}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors shrink-0"
          >
            Cancel
          </button>
        )}
        <div className="flex items-center gap-1 shrink-0 border rounded-md px-2">
          <input
            type="number"
            min={1}
            max={300}
            value={timeout}
            onChange={(e) => useUIStore.getState().setTimeout(Number(e.target.value) || 30)}
            className="w-10 bg-transparent text-xs text-center focus:outline-none"
          />
          <span className="text-xs text-muted-foreground">s</span>
        </div>
      </div>
      <div className="flex gap-1 border-b shrink-0 items-center">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => {
            useRequestStore.getState().reset();
            addToast("New request", "info");
          }}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
          title="New request (Ctrl+N)"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          onClick={() => {
            const curl = generateCurl(useRequestStore.getState().request);
            navigator.clipboard.writeText(curl);
            addToast("Copied as cURL", "success");
          }}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
          title="Copy as cURL"
        >
          &lt;/&gt;
        </button>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        {activeTab === "params" && <QueryTab />}
        {activeTab === "headers" && <HeadersTab />}
        {activeTab === "body" && <BodyTab />}
        {activeTab === "auth" && <AuthTab />}
      </div>
    </div>
  );
}
