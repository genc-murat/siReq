import { useRef, useState } from "react";
import { MethodSelector } from "./MethodSelector";
import { UrlBar } from "./UrlBar";
import { HeadersTab } from "./HeadersTab";
import { QueryTab } from "./QueryTab";
import { AuthTab } from "./AuthTab";
import { BodyTab } from "./BodyTab";
import { ScriptsTab } from "./ScriptsTab";
import { SchemaTab } from "./SchemaTab";
import { Tabs } from "@/components/Tabs";
import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { useTabStore } from "@/stores/tabStore";
import { useToastStore } from "@/stores/toastStore";
import { generateCurl } from "@/lib/curlGenerator";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { cn } from "@/lib/utils";

const requestTabs = [
  { id: "params", label: "Params" },
  { id: "headers", label: "Headers" },
  { id: "body", label: "Body" },
  { id: "auth", label: "Auth" },
  { id: "scripts", label: "Scripts" },
  { id: "schema", label: "Schema" },
];

export function RequestBuilder() {
  const loading = useRequestStore((s) => s.loading);
  const activeTab = useUIStore((s) => s.activeTab);
  const environmentId = useUIStore((s) => s.activeEnvironmentId);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const addToast = useToastStore((s) => s.addToast);
  const urlRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts(urlRef);

  const benchmarkLoading = useRequestStore((s) => s.benchmarkLoading);
  const request = useRequestStore((s) => s.request);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const [benchmarkCount, setBenchmarkCount] = useState(10);
  const benchmarkRef = useRef<HTMLDivElement>(null);

  return (
    <div className="h-full flex flex-col p-3 gap-2 overflow-hidden">
      <div className="flex items-center gap-2 shrink-0">
        <MethodSelector />
        <UrlBar inputRef={urlRef} />
        <button
          onClick={() => useRequestStore.getState().send(environmentId)}
          disabled={loading || benchmarkLoading}
          className={cn(
            "px-5 py-1.5 rounded-md text-sm font-medium transition-colors shrink-0",
            loading || benchmarkLoading
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {loading ? "Sending..." : benchmarkLoading ? "Benchmarking..." : "Send"}
        </button>
        {/* Benchmark dropdown */}
        <div className="relative shrink-0" ref={benchmarkRef}>
          <button
            onClick={() => setBenchmarkOpen(!benchmarkOpen)}
            disabled={loading || benchmarkLoading}
            className={cn(
              "px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border shrink-0 flex items-center gap-1",
              loading || benchmarkLoading
                ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
            title="Benchmark (send multiple times)"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.321 6.176c1.044-.363 2.136-.549 3.29-.549 5.531 0 8.39 5.262 7.202 9.813m-9.178 3.847c-1.043.363-2.136.549-3.29.549-5.531 0-8.39-5.262-7.202-9.813m1.987-3.456a10.393 10.393 0 00-1.525 1.724m2.296-3.146a10.404 10.404 0 00-1.524 1.724m-4.498 1.48l.1.1m-1.309 1.248l-1.069.894m1.069-.894l1.068.894m0 0l1.068-.894M16.5 13.5a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
            Benchmark
          </button>
          {benchmarkOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setBenchmarkOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg p-3 w-[180px] animate-in fade-in slide-in-from-top-1">
                <div className="text-[10px] font-medium text-muted-foreground mb-1.5">Benchmark Settings</div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Iterations</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={benchmarkCount}
                  onChange={(e) => setBenchmarkCount(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-full px-2 py-1 rounded border bg-background text-xs mb-2 focus:outline-none focus:border-primary"
                />
                <button
                  onClick={() => {
                    setBenchmarkOpen(false);
                    useRequestStore.getState().runBenchmark(benchmarkCount, environmentId);
                  }}
                  className="w-full px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Start Benchmark
                </button>
                <p className="text-[9px] text-muted-foreground/50 mt-1.5 text-center">
                  Sends {benchmarkCount} sequential request{benchmarkCount !== 1 ? "s" : ""}
                </p>
              </div>
            </>
          )}
        </div>
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
      <Tabs
        tabs={requestTabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        className="shrink-0"
        trailing={
          <>
            <button
              onClick={() => {
                useRequestStore.getState().reset();
                addToast("New request", "info");
              }}
              className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
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
              className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
              title="Copy as cURL"
            >
              <span className="text-[11px] font-mono font-semibold">&lt;/&gt;</span>
            </button>
          </>
        }
      />
      <div className="flex-1 overflow-auto min-h-0">
        {activeTab === "params" && <QueryTab />}
        {activeTab === "headers" && <HeadersTab />}
        {activeTab === "body" && <BodyTab />}
        {activeTab === "auth" && <AuthTab />}
        {activeTab === "scripts" && <ScriptsTab />}
        {activeTab === "schema" && <SchemaTab />}
      </div>
    </div>
  );
}
