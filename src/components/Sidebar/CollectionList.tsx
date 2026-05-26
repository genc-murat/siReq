import { useEffect, useState, useMemo, useRef } from "react";
import { getCollections, createCollection, deleteCollection, updateCollection, exportPostmanCollection, encryptSecretValue, decryptSecretValue } from "@/lib/invoke";
import type { Collection, HttpRequest, KeyValue } from "@/lib/invoke";
import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { useRunnerStore } from "@/stores/runnerStore";
import { useToastStore } from "@/stores/toastStore";
import { KeyValueEditor } from "@/components/Request/KeyValueEditor";
import { cn } from "@/lib/utils";

function CollectionVarsModal({ collection, onClose, onUpdate }: { collection: Collection; onClose: () => void; onUpdate: (col: Collection) => void }) {
  const [vars, setVars] = useState<KeyValue[]>([]);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  // Decrypt secret values on load
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
    const decryptAll = async () => {
      const decrypted = await Promise.all(
        (collection.variables ?? []).map(async (v) => {
          if (v.is_secret && v.value.startsWith("$enc$")) {
            try {
              const decrypted = await decryptSecretValue(v.value.slice(5));
              return { ...v, value: decrypted };
            } catch {
              return v;
            }
          }
          return v;
        })
      );
      setVars(decrypted);
    };
    decryptAll();
  }, [collection.variables, initialized]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Encrypt secret values before saving
      const encryptedVars = await Promise.all(
        vars.map(async (v) => {
          if (v.is_secret && v.value && !v.value.startsWith("$enc$")) {
            const encrypted = await encryptSecretValue(v.value);
            return { ...v, value: `$enc$${encrypted}` };
          }
          return v;
        })
      );
      const updated = { ...collection, variables: encryptedVars, updated_at: new Date().toISOString() };
      await updateCollection(updated);
      onUpdate(updated);
      addToast("Collection variables saved", "success");
      onClose();
    } catch (e) {
      addToast(`Failed to save: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-popover border rounded-xl shadow-xl w-[480px] max-h-[80vh] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Variables: {collection.name}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 min-h-0">
          <p className="text-xs text-muted-foreground mb-3">
            Collection variables override global variables and can be overridden by environment variables.
          </p>
          <KeyValueEditor
            pairs={vars}
            onChange={setVars}
            keyPlaceholder="Variable name"
            valuePlaceholder="Value"
            showSecretToggle={true}
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-150 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportModal({ collectionId, onClose }: { collectionId: string; onClose: () => void }) {
  const [json, setJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    exportPostmanCollection(collectionId)
      .then((data) => {
        setJson(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : e?.toString() ?? "Export failed");
        setLoading(false);
      });
  }, [collectionId]);

  const handleCopy = async () => {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
      const textarea = document.querySelector("#export-json-textarea") as HTMLTextAreaElement;
      if (textarea) {
        textarea.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleDownload = () => {
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "collection.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-popover border rounded-xl shadow-xl w-[560px] max-h-[80vh] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Export as Postman Collection</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <svg className="h-5 w-5 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}
          {error && (
            <div className="bg-destructive/10 text-destructive text-xs px-3 py-2 rounded-lg border border-destructive/20">
              {error}
            </div>
          )}
          {json && (
            <textarea
              id="export-json-textarea"
              value={json}
              readOnly
              className="w-full h-[400px] bg-background text-foreground text-xs px-3 py-2 rounded-lg border border-input focus:outline-none resize-none font-mono"
              spellCheck={false}
            />
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
          <button
            onClick={handleDownload}
            disabled={!json}
            className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150 disabled:opacity-50"
          >
            Download
          </button>
          <button
            onClick={handleCopy}
            disabled={!json}
            className="px-3 py-1.5 text-xs rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all duration-150 disabled:opacity-50"
          >
            {copied ? "Copied!" : "Copy JSON"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-150"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [dragOverReqParent, setDragOverReqParent] = useState<string | null>(null);
  const [exportCollectionId, setExportCollectionId] = useState<string | null>(null);
  const [collectionVarsColId, setCollectionVarsColId] = useState<string | null>(null);
  const dragItemRef = useRef<{ type: "collection" | "request"; id: string; parentId?: string; index: number } | null>(null);
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
      {exportCollectionId && <ExportModal collectionId={exportCollectionId} onClose={() => setExportCollectionId(null)} />}
      {collectionVarsColId && (() => {
        const col = collections.find(c => c.id === collectionVarsColId);
        if (!col) return null;
        return (
          <CollectionVarsModal
            collection={col}
            onClose={() => setCollectionVarsColId(null)}
            onUpdate={(updated) => setCollections((prev) => prev.map((c) => c.id === updated.id ? updated : c))}
          />
        );
      })()}
      {/* Add new collection */}
      <div className="flex gap-1 px-2 py-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New collection..."
          className="flex-1 bg-background text-foreground text-xs px-2 py-1 rounded-lg border border-input focus:outline-none focus-within:ring-1 focus-within:ring-ring transition-all duration-150"
        />
        <button
          onClick={create}
          className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all duration-150"
        >
          +
        </button>
      </div>

      {/* Search */}
      {hasCollections && (
        <div className="px-2 pb-1">
          <div className="flex items-center bg-background rounded-lg border border-input px-2 py-1 focus-within:ring-1 focus-within:ring-ring transition-all duration-150">
            <svg className="h-3 w-3 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search collections..."
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
        </div>
      )}

      {/* Empty states */}
      {!hasCollections && (
        <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
          <div className="p-3 rounded-lg bg-muted/30 ring-1 ring-border/40">
            <svg className="h-6 w-6 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <span className="text-xs text-muted-foreground">No collections yet</span>
          <span className="text-[10px] text-muted-foreground/60">Create a collection to organize your requests</span>
        </div>
      )}
      {searchQuery && !hasFilteredResults && hasCollections && (
        <div className="flex flex-col items-center gap-3 px-6 py-6 text-center">
          <div className="p-2.5 rounded-lg bg-muted/30 ring-1 ring-border/40">
            <svg className="h-5 w-5 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <span className="text-xs text-muted-foreground">No matching collections</span>
        </div>
      )}

      {/* Collection list */}
      {filteredCollections.map((col, colIndex) => {
        const isExpanded = expandedId === col.id && !searchQuery;
        const hasRequests = col.requests.length > 0;
        const isDraggedOver = dragOverColId === col.id;

        return (
          <div
            key={col.id}
            className={cn("border-b border-sidebar-border", isDraggedOver && "bg-sidebar-accent/50")}
            draggable={!searchQuery}
            onDragStart={(e) => {
              dragItemRef.current = { type: "collection", id: col.id, index: colIndex };
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", col.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOverColId(col.id);
            }}
            onDragLeave={() => setDragOverColId(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverColId(null);
              const dragged = dragItemRef.current;
              if (!dragged || dragged.type !== "collection" || dragged.id === col.id) return;
              const newCols = [...collections];
              const fromIdx = newCols.findIndex((c) => c.id === dragged.id);
              if (fromIdx === -1) return;
              const [moved] = newCols.splice(fromIdx, 1);
              const toIdx = newCols.findIndex((c) => c.id === col.id);
              newCols.splice(toIdx, 0, moved);
              setCollections(newCols);
              // Persist new order by updating updated_at for each collection
              Promise.all(newCols.map((c, i) =>
                updateCollection({ ...c, updated_at: new Date(Date.now() - i).toISOString() })
              )).then(() => addToast("Collections reordered", "success"));
            }}
          >
            <div className="flex items-center gap-1 px-3 py-1.5 group">
              <button
                onClick={() => {
                  if (searchQuery) return;
                  setExpandedId(isExpanded ? null : col.id);
                }}
                className={cn(
                  "text-xs transition-all duration-150",
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
                onClick={() => {
                  useRunnerStore.getState().resetRunState();
                  useRunnerStore.setState({ collectionId: col.id, collectionName: col.name, totalRequests: col.requests.length });
                  useUIStore.getState().setShowRunner(true, col.id);
                }}
                className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="Run all requests in collection"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
              </button>
              <button
                onClick={() => setCollectionVarsColId(col.id)}
                className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="Edit collection variables"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              </button>
              <button
                onClick={() => setExportCollectionId(col.id)}
                className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="Export as Postman collection"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
              <button
                onClick={() => saveCurrentRequest(col.id)}
                className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="Save current request"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
              </button>
              <button
                onClick={() => remove(col.id)}
                className="p-1 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="Delete collection"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>

            {/* Expanded requests or search results */}
            {(isExpanded || searchQuery) && (
              <div
                className="pl-5"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverReqParent(col.id);
                }}
                onDragLeave={() => setDragOverReqParent(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverReqParent(null);
                  const dragged = dragItemRef.current;
                  if (!dragged) return;
                  if (dragged.type === "request") {
                    if (dragged.parentId === col.id) return; // same collection
                    // Move request between collections
                    const srcIdx = collections.findIndex((c) => c.id === dragged.parentId);
                    const reqToMove = collections[srcIdx]?.requests[dragged.index];
                    if (!reqToMove) return;
                    const newCols = collections.map((c) => ({ ...c }));
                    const srcColClone = { ...newCols.find((c) => c.id === dragged.parentId)! };
                    const dstColClone = { ...newCols.find((c) => c.id === col.id)! };
                    srcColClone.requests = srcColClone.requests.filter((_, i) => i !== dragged.index);
                    dstColClone.requests = [...dstColClone.requests, reqToMove];
                    const updated = newCols.map((c) => {
                      if (c.id === srcColClone.id) return srcColClone;
                      if (c.id === dstColClone.id) return dstColClone;
                      return c;
                    });
                    setCollections(updated);
                    Promise.all([
                      updateCollection(srcColClone),
                      updateCollection(dstColClone),
                    ]).then(() => addToast("Request moved", "success"));
                  }
                }}
              >
                {col.requests.map((req, i) => (
                  <div
                    key={i}
                    draggable
                    onDragStart={(e) => {
                      dragItemRef.current = { type: "request", id: `${col.id}-${i}`, parentId: col.id, index: i };
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dragged = dragItemRef.current;
                      if (!dragged || dragged.type !== "request" || dragged.parentId !== col.id) return;
                      // Reorder within same collection
                      const newCols = [...collections];
                      const colIdx = newCols.findIndex((c) => c.id === col.id);
                      if (colIdx === -1) return;
                      const reqs = [...newCols[colIdx].requests];
                      const [moved] = reqs.splice(dragged.index, 1);
                      // After removing, adjust target index if needed
                      const targetIdx = dragged.index < i ? i - 1 : i;
                      reqs.splice(targetIdx, 0, moved);
                      newCols[colIdx] = { ...newCols[colIdx], requests: reqs };
                      setCollections(newCols);
                      updateCollection(newCols[colIdx]).then(() => addToast("Request reordered", "success"));
                    }}
                    onClick={() => loadRequest(req)}
                    className={cn(
                      "px-2 py-1 text-xs cursor-pointer hover:bg-sidebar-accent flex items-center gap-2 transition-all duration-150 rounded-lg",
                      searchQuery ? "bg-sidebar-accent/30" : "",
                      dragOverReqParent === col.id ? "bg-sidebar-accent/30" : ""
                    )}
                  >
                    <span className="text-muted-foreground/30 cursor-grab active:cursor-grabbing shrink-0 text-xs">⠿</span>
                    <span className={cn("font-bold shrink-0", methodColors[req.method] ?? "")}>{req.method}</span>
                    <span className="truncate flex-1">{req.name || req.url || "No URL"}</span>
                  </div>
                ))}
                {!hasRequests && (
                  <div className="px-2 py-1 text-xs text-muted-foreground italic">
                    Drop requests here
                  </div>
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
