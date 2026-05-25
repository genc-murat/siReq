import { useEffect, useState, useMemo } from "react";
import { getCollections, createCollection, deleteCollection, updateCollection } from "@/lib/invoke";
import type { Collection, HttpRequest } from "@/lib/invoke";
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

export function CollectionList() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [newName, setNewName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const activeCollectionId = useUIStore((s) => s.activeCollectionId);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    getCollections().then(setCollections);
  }, []);

  // Filter collections and their requests by search
  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) return collections;
    const q = searchQuery.toLowerCase();
    return collections
      .map((col) => {
        const matchingRequests = col.requests.filter(
          (req) =>
            (req.name && req.name.toLowerCase().includes(q)) ||
            req.url.toLowerCase().includes(q) ||
            req.method.toLowerCase().includes(q)
        );
        // Include collection if name matches OR has matching requests
        if (col.name.toLowerCase().includes(q)) {
          return { ...col, requests: col.requests };
        }
        if (matchingRequests.length > 0) {
          return { ...col, requests: matchingRequests };
        }
        return null;
      })
      .filter((col): col is Collection => col !== null);
  }, [collections, searchQuery]);

  const create = async () => {
    if (!newName.trim()) return;
    const col = await createCollection(newName.trim());
    setCollections((prev) => [...prev, col]);
    setNewName("");
    addToast("Collection created", "success");
  };

  const remove = async (id: string) => {
    await deleteCollection(id);
    setCollections((prev) => prev.filter((c) => c.id !== id));
    if (activeCollectionId === id) useUIStore.getState().setActiveCollectionId(null);
    addToast("Collection deleted", "info");
  };

  const loadRequest = (request: HttpRequest) => {
    useRequestStore.getState().setRequest(request);
  };

  const saveCurrentRequest = async (collectionId: string) => {
    const col = collections.find((c) => c.id === collectionId);
    if (!col) return;
    const request = useRequestStore.getState().request;
    const updated = { ...col, requests: [...col.requests, { ...request }] };
    await updateCollection(updated);
    setCollections((prev) => prev.map((c) => (c.id === collectionId ? updated : c)));
    addToast("Saved to collection", "success");
  };

  const hasCollections = collections.length > 0;
  const hasFilteredResults = filteredCollections.length > 0;

  return (
    <div className="flex flex-col">
      {/* Add new collection */}
      <div className="flex gap-1 px-2 py-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New collection..."
          className="flex-1 bg-background text-foreground text-xs px-2 py-1 rounded border border-input focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={create}
          className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
        >
          +
        </button>
      </div>

      {/* Search */}
      {hasCollections && (
        <div className="px-2 pb-1">
          <div className="flex items-center bg-background rounded border border-input px-2 py-1">
            <svg className="h-3 w-3 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search collections..."
              className="flex-1 bg-transparent text-xs px-1.5 py-0.5 focus:outline-none text-foreground placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-foreground">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty states */}
      {!hasCollections && (
        <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
          <svg className="h-8 w-8 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="text-xs text-muted-foreground">No collections yet</span>
          <span className="text-[10px] text-muted-foreground/60">Create a collection to organize your requests</span>
        </div>
      )}
      {searchQuery && !hasFilteredResults && hasCollections && (
        <div className="flex flex-col items-center gap-1 px-6 py-6 text-center">
          <svg className="h-6 w-6 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-xs text-muted-foreground">No matching collections</span>
        </div>
      )}

      {/* Collection list */}
      {filteredCollections.map((col) => {
        const isExpanded = expandedId === col.id && !searchQuery;
        const hasRequests = col.requests.length > 0;

        return (
          <div key={col.id} className="border-b border-sidebar-border">
            <div className="flex items-center gap-1 px-3 py-1.5 group">
              <button
                onClick={() => {
                  if (searchQuery) return; // Don't toggle in search mode - show all
                  setExpandedId(isExpanded ? null : col.id);
                }}
                className={cn(
                  "text-xs transition-colors",
                  hasRequests ? "text-muted-foreground hover:text-primary" : "text-muted-foreground/40"
                )}
              >
                {isExpanded ? "▼" : "▶"}
              </button>
              <span className="text-xs font-medium flex-1 truncate">{col.name}</span>
              {searchQuery && hasRequests && (
                <span className="text-[10px] text-muted-foreground">{col.requests.length}</span>
              )}
              <button
                onClick={() => saveCurrentRequest(col.id)}
                className="text-xs text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Save
              </button>
              <button
                onClick={() => remove(col.id)}
                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Expanded requests or search results */}
            {(isExpanded || searchQuery) && (
              <div className="pl-5">
                {col.requests.map((req, i) => (
                  <div
                    key={i}
                    onClick={() => loadRequest(req)}
                    className={cn(
                      "px-2 py-1 text-xs cursor-pointer hover:bg-sidebar-accent flex items-center gap-2 transition-colors",
                      searchQuery ? "bg-sidebar-accent/30" : ""
                    )}
                  >
                    <span className={cn("font-bold shrink-0", methodColors[req.method] ?? "")}>{req.method}</span>
                    <span className="truncate flex-1">{req.name || req.url || "No URL"}</span>
                  </div>
                ))}
                {!hasRequests && (
                  <div className="px-2 py-1 text-xs text-muted-foreground">No requests saved</div>
                )}
              </div>
            )}

            {/* Auto-show requests count when not expanded */}
            {!isExpanded && !searchQuery && (
              <div className="px-7 pb-0.5 text-[10px] text-muted-foreground">
                {col.requests.length} request{col.requests.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
