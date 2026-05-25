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
    <div className="h-full flex flex-col p-3 gap-2.5 overflow-hidden">
      {/* === Integrated URL Bar (Method + URL + Send) === */}
      <div className="flex flex-wrap items-stretch shrink-0 gap-2 sm:gap-0">
        {/* Group: Method + URL + Send (connected bar) */}
        <div className="flex items-stretch flex-1 min-w-[200px] rounded-lg border border-border overflow-hidden shadow-sm ring-1 ring-black/[0.05] focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-all duration-200">
          <MethodSelector integrated />
          <UrlBar inputRef={urlRef} integrated />
          <button
            onClick={() => useRequestStore.getState().send(environmentId)}
            disabled={loading || benchmarkLoading}
            className={cn(
              "px-4 sm:px-5 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase shrink-0 transition-all duration-150",
              loading || benchmarkLoading
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95"
            )}
          >
            {loading ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span className="hidden sm:inline">Sending</span>
              </>
            ) : benchmarkLoading ? (
              <span className="hidden sm:inline">Bench...</span>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
                <span>Send</span>
              </>
            )}
          </button>
        </div>

        {/* Desktop secondary actions (visible on sm+) */}
        <div className="hidden sm:flex items-center gap-1">
          {/* Benchmark dropdown */}
          <div className="relative shrink-0" ref={benchmarkRef}>
            <button
              onClick={() => setBenchmarkOpen(!benchmarkOpen)}
              disabled={loading || benchmarkLoading}
              className={cn(
                "p-2 rounded-lg text-xs font-medium transition-all duration-150 shrink-0 flex items-center gap-1",
                loading || benchmarkLoading
                  ? "text-muted-foreground/30 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              title="Benchmark"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.321 6.176c1.044-.363 2.136-.549 3.29-.549 5.531 0 8.39 5.262 7.202 9.813m-9.178 3.847c-1.043.363-2.136.549-3.29.549-5.531 0-8.39-5.262-7.202-9.813m1.987-3.456a10.393 10.393 0 00-1.525 1.724m2.296-3.146a10.404 10.404 0 00-1.524 1.724m-4.498 1.48l.1.1m-1.309 1.248l-1.069.894m1.069-.894l1.068.894m0 0l1.068-.894M16.5 13.5a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            </button>
            {benchmarkOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setBenchmarkOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-50 bg-popover border rounded-xl shadow-xl p-3.5 w-[200px] animate-in fade-in slide-in-from-top-2">
                  <div className="text-[11px] font-semibold text-foreground mb-2">Benchmark</div>
                  <label className="text-[10px] text-muted-foreground mb-1.5 block">Iterations</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={benchmarkCount}
                    onChange={(e) => setBenchmarkCount(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))}
                    className="w-full px-2.5 py-1.5 rounded-lg border bg-background text-xs mb-3 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    onClick={() => {
                      setBenchmarkOpen(false);
                      useRequestStore.getState().runBenchmark(benchmarkCount, environmentId);
                    }}
                    className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-150"
                  >
                    Start Benchmark
                  </button>
                </div>
              </>
            )}
          </div>
          {/* Cancel (only when loading) */}
          {loading && (
            <button
              onClick={() => useRequestStore.getState().cancel()}
              className="p-2 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-500/10 transition-all duration-150"
              title="Cancel request"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {/* Settings */}
          <button
            onClick={() => useUIStore.getState().setSettingsOpen(true)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
            title="Request settings"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Overflow menu (visible on small screens) */}
        <div className="sm:hidden relative">
          <MoreMenu
            loading={loading}
            benchmarkLoading={benchmarkLoading}
            onOpenBenchmark={() => setBenchmarkOpen(!benchmarkOpen)}
            onCancel={() => useRequestStore.getState().cancel()}
            onSettings={() => useUIStore.getState().setSettingsOpen(true)}
          />
          {benchmarkOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setBenchmarkOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-50 bg-popover border rounded-xl shadow-xl p-3.5 w-[200px] animate-in fade-in slide-in-from-top-2">
                <div className="text-[11px] font-semibold text-foreground mb-2">Benchmark</div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block">Iterations</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={benchmarkCount}
                  onChange={(e) => setBenchmarkCount(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-full px-2.5 py-1.5 rounded-lg border bg-background text-xs mb-3 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  onClick={() => {
                    setBenchmarkOpen(false);
                    useRequestStore.getState().runBenchmark(benchmarkCount, environmentId);
                  }}
                  className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-150"
                >
                  Start Benchmark
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* === Request name (only when set) === */}
      {request.name !== undefined && (
        <div className="shrink-0 flex items-center gap-2 px-1">
          <svg className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <input
            type="text"
            value={request.name || ""}
            onChange={(e) => {
              useRequestStore.getState().setName(e.target.value);
              useTabStore.getState().syncCurrentToTab();
            }}
            placeholder="Request name..."
            className="flex-1 bg-transparent text-xs text-muted-foreground border-b border-dotted border-transparent hover:border-border/50 focus:border-primary/50 focus:outline-none px-0 py-0.5 transition-all duration-150"
          />
        </div>
      )}

      {/* === Tabs (scrollable on narrow screens) === */}
      <div className="shrink-0 overflow-x-auto min-w-0">
        <Tabs
          tabs={requestTabs}
          activeTab={activeTab}
          onChange={setActiveTab}
          trailing={
            <>
              <button
                onClick={() => {
                  useRequestStore.getState().reset();
                  addToast("New request", "info");
                }}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition-all duration-150"
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
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition-all duration-150"
                title="Copy as cURL"
              >
                <span className="text-[11px] font-mono font-semibold">&lt;/&gt;</span>
              </button>
            </>
          }
        />
      </div>

      {/* === Tab content === */}
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

function MoreMenu({
  loading,
  benchmarkLoading,
  onOpenBenchmark,
  onCancel,
  onSettings,
}: {
  loading: boolean;
  benchmarkLoading: boolean;
  onOpenBenchmark: () => void;
  onCancel: () => void;
  onSettings: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="px-2 py-1.5 rounded-lg text-xs font-medium border text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150 flex items-center gap-1"
        title="More options"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
        <span className="hidden sm:inline">More</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-xl py-1 w-[160px] animate-in fade-in slide-in-from-top-1">
            <button
              onClick={() => {
                setOpen(false);
                onOpenBenchmark();
              }}
              disabled={loading || benchmarkLoading}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-all duration-150 flex items-center gap-2 disabled:opacity-40"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.321 6.176c1.044-.363 2.136-.549 3.29-.549 5.531 0 8.39 5.262 7.202 9.813m-9.178 3.847c-1.043.363-2.136.549-3.29.549-5.531 0-8.39-5.262-7.202-9.813m1.987-3.456a10.393 10.393 0 00-1.525 1.724m2.296-3.146a10.404 10.404 0 00-1.524 1.724m-4.498 1.48l.1.1m-1.309 1.248l-1.069.894m1.069-.894l1.068.894m0 0l1.068-.894M16.5 13.5a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              Benchmark
            </button>
            {loading && (
              <button
                onClick={() => {
                  setOpen(false);
                  onCancel();
                }}
                className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-all duration-150 flex items-center gap-2"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-all duration-150 flex items-center gap-2"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
          </div>
        </>
      )}
    </>
  );
}
