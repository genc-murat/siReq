import { useEffect, useState, useMemo } from "react";
import { getHistory, deleteHistory, clearHistory } from "@/lib/invoke";
import type { HistoryEntry } from "@/lib/invoke";
import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { cn } from "@/lib/utils";

const methodColors: Record<string, string> = {
  GET: "text-green-500",
  POST: "text-yellow-500",
  PUT: "text-blue-500",
  PATCH: "text-orange-500",
  DELETE: "text-red-500",
  HEAD: "text-purple-500",
  OPTIONS: "text-teal-500",
  TRACE: "text-gray-500",
};

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (date >= weekAgo) return "This Week";

  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);
  if (date >= monthAgo) return "This Month";

  return "Older";
}

const methodOptions = ["ALL", "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"];

export function HistoryList() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const activeHistoryId = useUIStore((s) => s.activeHistoryId);
  const setActiveHistoryId = useUIStore((s) => s.setActiveHistoryId);
  const addToast = useToastStore((s) => s.addToast);

  const lastResponse = useRequestStore((s) => s.response);
  const lastError = useRequestStore((s) => s.error);

  useEffect(() => {
    getHistory().then(setEntries);
  }, [lastResponse, lastError]);

  // Filter and group entries
  const { grouped, totalCount } = useMemo(() => {
    let filtered = entries;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.request.url.toLowerCase().includes(q) ||
          e.request.method.toLowerCase().includes(q) ||
          String(e.response.status).includes(q) ||
          (e.request.name && e.request.name.toLowerCase().includes(q))
      );
    }

    // Method filter
    if (methodFilter !== "ALL") {
      filtered = filtered.filter((e) => e.request.method === methodFilter);
    }

    // Group by date
    const groups: Record<string, HistoryEntry[]> = {};
    for (const entry of filtered) {
      const group = getDateGroup(entry.created_at);
      if (!groups[group]) groups[group] = [];
      groups[group].push(entry);
    }

    // Order groups chronologically
    const groupOrder = ["Today", "Yesterday", "This Week", "This Month", "Older"];
    const ordered: Record<string, HistoryEntry[]> = {};
    for (const g of groupOrder) {
      if (groups[g]) ordered[g] = groups[g];
    }

    return { grouped: ordered, totalCount: filtered.length };
  }, [entries, searchQuery, methodFilter]);

  const loadEntry = (entry: HistoryEntry) => {
    useRequestStore.getState().setRequest(entry.request);
    if (entry.response) {
      useRequestStore.setState({ response: entry.response });
    }
    setActiveHistoryId(entry.id);
  };

  const remove = async (id: string) => {
    await deleteHistory(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (activeHistoryId === id) setActiveHistoryId(null);
  };

  const clear = async () => {
    await clearHistory();
    setEntries([]);
    setActiveHistoryId(null);
    addToast("History cleared", "info");
  };

  const hasEntries = entries.length > 0;

  return (
    <div className="flex flex-col">
      {/* Search */}
      {hasEntries && (
        <div className="px-2 pt-1.5 pb-1 flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <div className="flex items-center flex-1 bg-background rounded-lg border border-input px-2 py-1 focus-within:ring-1 focus-within:ring-ring transition-all duration-150">
              <svg className="h-3 w-3 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search history..."
                className="flex-1 bg-transparent text-xs px-1.5 py-0.5 focus:outline-none text-foreground placeholder:text-muted-foreground"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "p-1.5 rounded-lg hover:bg-accent transition-all duration-150",
                showFilters || methodFilter !== "ALL" ? "text-primary" : "text-muted-foreground"
              )}
              title="Filter by method"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
          </div>
          {showFilters && (
            <div className="bg-muted/60 rounded-lg p-0.5 flex gap-0.5 flex-wrap">
              {methodOptions.map((m) => (
                <button
                  key={m}
                  onClick={() => setMethodFilter(methodFilter === m ? "ALL" : m)}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium transition-all duration-150",
                    methodFilter === m
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Clear all button */}
      {hasEntries && (
        <div className="flex justify-end px-2 py-1">
          <button onClick={clear} className="text-xs font-medium px-2 py-1 rounded-lg text-destructive hover:bg-destructive/10 transition-all duration-150">
            Clear all
          </button>
        </div>
      )}

      {/* Empty state */}
      {!hasEntries && (
        <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
          <div className="p-3 rounded-lg bg-muted/30 ring-1 ring-border/40">
            <svg className="h-6 w-6 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-xs text-muted-foreground">No requests sent yet</span>
          <span className="text-[10px] text-muted-foreground/60">History will appear here after you send requests</span>
        </div>
      )}

      {searchQuery && totalCount === 0 && hasEntries && (
        <div className="flex flex-col items-center gap-3 px-6 py-6 text-center">
          <div className="p-3 rounded-lg bg-muted/30 ring-1 ring-border/40">
            <svg className="h-6 w-6 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <span className="text-xs text-muted-foreground">No matching requests</span>
        </div>
      )}

      {/* Grouped entries */}
      {Object.entries(grouped).map(([groupName, groupEntries]) => (
        <div key={groupName}>
          <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-sidebar/50 sticky top-0">
            {groupName}
          </div>
          {groupEntries.map((entry) => (                <div
              key={entry.id}
              onClick={() => loadEntry(entry)}
              className={cn(
                "group px-3 py-1.5 cursor-pointer hover:bg-sidebar-accent text-xs border-b border-sidebar-border transition-all duration-150",
                activeHistoryId === entry.id ? "bg-sidebar-accent ring-1 ring-primary/10" : ""
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("font-bold shrink-0", methodColors[entry.request.method] ?? "")}>
                  {entry.request.method}
                </span>
                <span className="truncate flex-1">{entry.request.url || "No URL"}</span>
                <span className={cn(
                  "text-muted-foreground shrink-0 font-medium",
                  entry.response.status >= 200 && entry.response.status < 300 ? "text-green-500" :
                  entry.response.status >= 400 && entry.response.status < 500 ? "text-orange-500" :
                  entry.response.status >= 500 ? "text-red-500" : ""
                )}>
                  {entry.response.status}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); remove(entry.id); }}
                  className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150 shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                <span>{new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {entry.request.name && (
                  <>
                    <span>·</span>
                    <span className="truncate">{entry.request.name}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
