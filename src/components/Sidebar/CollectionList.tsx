import { useEffect, useState } from "react";
import { getCollections, createCollection, deleteCollection, updateCollection } from "@/lib/invoke";
import type { Collection, HttpRequest } from "@/lib/invoke";
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

export function CollectionList() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [newName, setNewName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const activeCollectionId = useUIStore((s) => s.activeCollectionId);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    getCollections().then(setCollections);
  }, []);

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

  return (
    <div className="flex flex-col">
      <div className="flex gap-1 px-2 py-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New collection..."
          className="flex-1 bg-background text-foreground text-xs px-2 py-1 rounded border border-input focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button onClick={create} className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90">
          +
        </button>
      </div>
      {collections.length === 0 && (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">No collections</div>
      )}
      {collections.map((col) => (
        <div key={col.id} className="border-b border-sidebar-border">
          <div className="flex items-center gap-1 px-3 py-1.5">
            <button
              onClick={() => setExpandedId(expandedId === col.id ? null : col.id)}
              className="text-xs hover:text-primary"
            >
              {expandedId === col.id ? "▼" : "▶"}
            </button>
            <span className="text-xs font-medium flex-1 truncate">{col.name}</span>
            <button
              onClick={() => saveCurrentRequest(col.id)}
              className="text-xs text-primary hover:underline"
            >
              Save
            </button>
            <button
              onClick={() => remove(col.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {expandedId === col.id && (
            <div className="pl-5">
              {col.requests.map((req, i) => (
                <div
                  key={i}
                  onClick={() => loadRequest(req)}
                  className="px-2 py-1 text-xs cursor-pointer hover:bg-sidebar-accent flex items-center gap-2"
                >
                  <span className={`font-bold ${methodColors[req.method] ?? ""}`}>{req.method}</span>
                  <span className="truncate">{req.url || "No URL"}</span>
                </div>
              ))}
              {col.requests.length === 0 && (
                <div className="px-2 py-1 text-xs text-muted-foreground">No requests saved</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
