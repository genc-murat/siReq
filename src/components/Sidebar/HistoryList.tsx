import { useEffect, useState } from "react";
import { getHistory, deleteHistory, clearHistory } from "@/lib/invoke";
import type { HistoryEntry } from "@/lib/invoke";
import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";

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

export function HistoryList() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const activeHistoryId = useUIStore((s) => s.activeHistoryId);
  const setActiveHistoryId = useUIStore((s) => s.setActiveHistoryId);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    getHistory().then(setEntries);
  }, []);

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

  return (
    <div className="flex flex-col">
      {entries.length > 0 && (
        <div className="flex justify-end px-2 py-1">
          <button onClick={clear} className="text-xs text-destructive hover:underline">
            Clear all
          </button>
        </div>
      )}
      {entries.length === 0 && (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">No history yet</div>
      )}
      {entries.map((entry) => (
        <div
          key={entry.id}
          onClick={() => loadEntry(entry)}
          className={`px-3 py-1.5 cursor-pointer hover:bg-sidebar-accent text-xs border-b border-sidebar-border ${
            activeHistoryId === entry.id ? "bg-sidebar-accent" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`font-bold ${methodColors[entry.request.method] ?? ""}`}>
              {entry.request.method}
            </span>
            <span className="truncate flex-1">{entry.request.url || "No URL"}</span>
            <span className="text-muted-foreground shrink-0">
              {entry.response.status}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); remove(entry.id); }}
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="text-muted-foreground mt-0.5">
            {new Date(entry.created_at).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
