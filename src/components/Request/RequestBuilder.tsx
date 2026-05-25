import { useRef } from "react";
import { MethodSelector } from "./MethodSelector";
import { UrlBar } from "./UrlBar";
import { HeadersTab } from "./HeadersTab";
import { QueryTab } from "./QueryTab";
import { AuthTab } from "./AuthTab";
import { BodyTab } from "./BodyTab";
import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { useTabStore } from "@/stores/tabStore";
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
  const environmentId = useUIStore((s) => s.activeEnvironmentId);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const addToast = useToastStore((s) => s.addToast);
  const urlRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts(urlRef);

  const request = useRequestStore((s) => s.request);

  return (
    <div className="h-full flex flex-col p-3 gap-2 overflow-hidden">
      <div className="flex items-center gap-2 shrink-0">
        <MethodSelector />
        <UrlBar inputRef={urlRef} />
        <button
          onClick={() => useRequestStore.getState().send(environmentId)}
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
        <button
          onClick={() => useUIStore.getState().setSettingsOpen(true)}
          className="shrink-0 px-2 py-1.5 text-muted-foreground hover:text-foreground border rounded-md text-xs transition-colors flex items-center gap-1"
          title="Request settings"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
      {request.name !== undefined && (
        <input
          type="text"
          value={request.name || ""}
          onChange={(e) => {
            useRequestStore.getState().setName(e.target.value);
            useTabStore.getState().syncCurrentToTab();
          }}
          placeholder="Request name..."
          className="shrink-0 bg-transparent text-xs text-muted-foreground border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-1 py-0.5 transition-colors"
        />
      )}
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
