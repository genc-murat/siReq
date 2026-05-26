import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  getCollections,
  createCollection,
  deleteCollection,
  updateCollection,
  exportPostmanCollection,
  encryptSecretValue,
  decryptSecretValue,
  createCollectionFolder,
  addRequestToCollection,
  deleteCollectionItem,
  moveCollectionItem,
  countCollectionRequests,
  findCollectionItem,
} from "@/lib/invoke";
import type {
  Collection,
  CollectionItem,
  CollectionFolder,
  CollectionRequest,
  HttpRequest,
  KeyValue,
} from "@/lib/invoke";
import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { useRunnerStore } from "@/stores/runnerStore";
import { useToastStore } from "@/stores/toastStore";
import { useShallow } from "zustand/react/shallow";
import { KeyValueEditor } from "@/components/Request/KeyValueEditor";
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

// ─── Modals ──────────────────────────────────────────────────────────────────

function CollectionVarsModal({
  collection,
  onClose,
  onUpdate,
}: {
  collection: Collection;
  onClose: () => void;
  onUpdate: (col: Collection) => void;
}) {
  const [vars, setVars] = useState<KeyValue[]>([]);
  const [saving, setSaving] = useState(false);
  const initializedRef = useRef(false);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
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
  }, [collection.variables]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const encryptedVars = await Promise.all(
        vars.map(async (v) => {
          if (v.is_secret && v.value && !v.value.startsWith("$enc$")) {
            const encrypted = await encryptSecretValue(v.value);
            return { ...v, value: `$enc$${encrypted}` };
          }
          return v;
        })
      );
      const updated = {
        ...collection,
        variables: encryptedVars,
        updated_at: new Date().toISOString(),
      };
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-popover border rounded-xl shadow-xl w-[480px] max-h-[80vh] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold text-foreground">
            Variables: {collection.name}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          >
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
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          >
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

function ExportModal({
  collectionId,
  onClose,
}: {
  collectionId: string;
  onClose: () => void;
}) {
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-popover border rounded-xl shadow-xl w-[560px] max-h-[80vh] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Export as Postman Collection</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          >
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

// ─── Folder Picker Modal ─────────────────────────────────────────────────────

function FolderPickerModal({
  collection,
  onSelect,
  onClose,
}: {
  collection: Collection;
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-popover border rounded-xl shadow-xl w-[360px] max-h-[60vh] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Select folder</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2 min-h-0">
          <button
            onClick={() => onSelect(null)}
            className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-accent transition-all duration-150"
          >
            <span className="text-muted-foreground">(Root — no folder)</span>
          </button>
          <FolderPickerItems items={collection.requests} depth={0} onSelect={onSelect} />
        </div>
        <div className="flex items-center justify-end px-4 py-3 border-t shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-150"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function FolderPickerItems({
  items,
  depth,
  onSelect,
}: {
  items: CollectionItem[];
  depth: number;
  onSelect: (folderId: string) => void;
}) {
  return (
    <>
      {items.map((item) => {
        if (item.type !== "folder") return null;
        return (
          <div key={item.id}>
            <button
              onClick={() => onSelect(item.id)}
              className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-accent transition-all duration-150 flex items-center gap-2"
              style={{ paddingLeft: `${12 + depth * 16}px` }}
            >
              <svg className="h-3.5 w-3.5 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="truncate">{item.name}</span>
            </button>
            <FolderPickerItems items={item.items} depth={depth + 1} onSelect={onSelect} />
          </div>
        );
      })}
    </>
  );
}

// ─── Drag types ──────────────────────────────────────────────────────────────

interface DragData {
  type: "collection" | "item";
  collectionId: string;
  itemId?: string;
  parentFolderId?: string | null;
}

interface TreeDragState {
  sourceCollectionId: string;
  sourceParentId: string | null;
  itemId: string;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CollectionList() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [newName, setNewName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportCollectionId, setExportCollectionId] = useState<string | null>(null);
  const [collectionVarsColId, setCollectionVarsColId] = useState<string | null>(null);
  const [folderPickerColId, setFolderPickerColId] = useState<string | null>(null);
  const [renamingItem, setRenamingItem] = useState<{ collectionId: string; itemId: string; name: string } | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const dragRef = useRef<TreeDragState | null>(null);
  const addToast = useToastStore((s) => s.addToast);
  const activeCollectionId = useUIStore(useShallow((s) => s.activeCollectionId));
  const setActiveCollectionId = useUIStore(useShallow((s) => s.setActiveCollectionId));

  useEffect(() => {
    getCollections().then(setCollections);

    const handleUpdate = () => {
      getCollections().then(setCollections);
    };
    window.addEventListener("collections-updated", handleUpdate);
    return () => {
      window.removeEventListener("collections-updated", handleUpdate);
    };
  }, []);

  // ─── Search logic: flatten tree ───────────────────────────────────────
  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) return collections;
    const q = searchQuery.toLowerCase();

    function matchesItem(item: CollectionItem): boolean {
      const name = item.name?.toLowerCase() ?? "";
      if (name.includes(q)) return true;
      if (item.type === "request") {
        const req = item as CollectionRequest;
        if (req.url?.toLowerCase().includes(q)) return true;
        if (req.method?.toLowerCase().includes(q)) return true;
      }
      if (item.type === "folder") {
        return (item as CollectionFolder).items.some(matchesItem);
      }
      return false;
    }

    function filterItems(items: CollectionItem[]): CollectionItem[] {
      const result: CollectionItem[] = [];
      for (const item of items) {
        if (item.type === "folder") {
          const filtered = filterItems((item as CollectionFolder).items);
          if (filtered.length > 0 || (item.name?.toLowerCase() ?? "").includes(q)) {
            result.push({ ...item, items: filtered });
          }
        } else {
          if (matchesItem(item)) {
            result.push(item);
          }
        }
      }
      return result;
    }

    return collections
      .map((col) => {
        const nameMatch = col.name.toLowerCase().includes(q);
        const filtered = filterItems(col.requests);
        if (nameMatch || filtered.length > 0) {
          return { ...col, requests: nameMatch ? col.requests : filtered };
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
    if (activeCollectionId === id) setActiveCollectionId(null);
    addToast("Collection deleted", "info");
  };

  const loadRequest = (req: HttpRequest) => {
    useRequestStore.getState().setRequest(req);
  };

  // ─── Save current request ─────────────────────────────────────────────
  const saveCurrentRequest = async (
    collectionId: string,
    folderId: string | null = null
  ) => {
    const col = collections.find((c) => c.id === collectionId);
    if (!col) return;
    const request = useRequestStore.getState().request;
    const result = await addRequestToCollection(
      collectionId,
      { ...request, id: crypto.randomUUID() },
      folderId
    );
    setCollections((prev) =>
      prev.map((c) => (c.id === collectionId ? result : c))
    );
    addToast("Saved to collection", "success");
  };

  // ─── Create folder ────────────────────────────────────────────────────
  const handleCreateFolder = async (
    collectionId: string,
    parentFolderId: string | null = null,
    name: string
  ) => {
    if (!name.trim()) return;
    const result = await createCollectionFolder(
      collectionId,
      name.trim(),
      parentFolderId
    );
    setCollections((prev) =>
      prev.map((c) => (c.id === collectionId ? result : c))
    );
    // Expand the parent folder so the user sees the new folder
    if (parentFolderId) {
      setExpandedFolders((prev) => new Set(prev).add(parentFolderId));
    }
    addToast("Folder created", "success");
  };

  // ─── Delete item ──────────────────────────────────────────────────────
  const handleDeleteItem = async (collectionId: string, itemId: string) => {
    const result = await deleteCollectionItem(collectionId, itemId);
    setCollections((prev) =>
      prev.map((c) => (c.id === collectionId ? result : c))
    );
    addToast("Item deleted", "info");
  };

  // ─── Drag & Drop ──────────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.DragEvent, data: DragData) => {
      dragRef.current = {
        sourceCollectionId: data.collectionId,
        sourceParentId: data.parentFolderId ?? null,
        itemId: data.itemId ?? "",
      };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", data.itemId ?? "");
    },
    []
  );

  // Find an item in the collections tree (could be in any collection)
  const findItemByTree = useCallback(
    (itemId: string): { collection: Collection; item: CollectionItem } | null => {
      for (const col of collections) {
        const item = findCollectionItem(col.requests, itemId);
        if (item) return { collection: col, item };
      }
      return null;
    },
    [collections]
  );

  const handleItemDrop = useCallback(
    async (
      targetCollectionId: string,
      targetFolderId: string | null,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _targetIndex: number
    ) => {
      const drag = dragRef.current;
      if (!drag) return;

      const isSameCollection = drag.sourceCollectionId === targetCollectionId;

      try {
        if (isSameCollection) {
          // Same collection: use moveCollectionItem (handles tree manipulation on backend)
          const result = await moveCollectionItem(
            targetCollectionId,
            drag.itemId,
            targetFolderId,
            0 // end of target folder
          );
          setCollections((prev) =>
            prev.map((c) => (c.id === targetCollectionId ? result : c))
          );
        } else {
          // Cross-collection: need to extract request, remove from source, add to target
          const found = findItemByTree(drag.itemId);
          if (!found) {
            addToast("Item not found", "error");
            return;
          }
          if (found.item.type !== "request") {
            // Cannot move folders across collections yet
            addToast("Cannot move folders across collections", "error");
            return;
          }
          const req = found.item as CollectionRequest;
          const httpReq: HttpRequest = {
            id: req.id,
            name: req.name,
            method: req.method,
            url: req.url,
            headers: req.headers,
            query_params: req.query_params,
            body_type: req.body_type,
            body: req.body,
            form_fields: req.form_fields,
            auth: req.auth,
            settings: req.settings,
            pre_script: req.pre_script,
            post_script: req.post_script,
            examples: req.examples,
          };

          // Add to target collection first, then delete from source
          await addRequestToCollection(
            targetCollectionId,
            httpReq,
            targetFolderId
          );

          // Delete from source
          await deleteCollectionItem(drag.sourceCollectionId, drag.itemId);

          // Reload both collections
          const freshCols = await getCollections();
          setCollections(freshCols);
        }
        addToast("Item moved", "success");
      } catch (e) {
        addToast(`Failed to move: ${e}`, "error");
      }
      dragRef.current = null;
    },
    [addToast, findItemByTree]
  );

  const handleCollectionDrop = useCallback(
    async (e: React.DragEvent, targetColId: string) => {
      e.preventDefault();
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.sourceCollectionId === targetColId) {
        // Same collection, moving to root — use moveCollectionItem
        try {
          const result = await moveCollectionItem(
            targetColId,
            drag.itemId,
            null,
            0
          );
          setCollections((prev) =>
            prev.map((c) => (c.id === targetColId ? result : c))
          );
          addToast("Item moved", "success");
        } catch (e) {
          addToast(`Failed to move: ${e}`, "error");
        }
      } else {
        // Cross-collection move to root of another collection
        try {
          const found = findItemByTree(drag.itemId);
          if (!found) {
            addToast("Item not found", "error");
            return;
          }
          if (found.item.type !== "request") {
            addToast("Cannot move folders across collections", "error");
            return;
          }
          const req = found.item as CollectionRequest;
          const httpReq: HttpRequest = {
            id: req.id,
            name: req.name,
            method: req.method,
            url: req.url,
            headers: req.headers,
            query_params: req.query_params,
            body_type: req.body_type,
            body: req.body,
            form_fields: req.form_fields,
            auth: req.auth,
            settings: req.settings,
            pre_script: req.pre_script,
            post_script: req.post_script,
            examples: req.examples,
          };

          await addRequestToCollection(targetColId, httpReq, null);
          await deleteCollectionItem(drag.sourceCollectionId, drag.itemId);

          const freshCols = await getCollections();
          setCollections(freshCols);
          addToast("Item moved to collection", "success");
        } catch (e) {
          addToast(`Failed to move: ${e}`, "error");
        }
      }
      dragRef.current = null;
    },
    [addToast, findItemByTree]
  );

  const handleRename = async () => {
    if (!renamingItem || !renamingItem.name.trim()) {
      setRenamingItem(null);
      return;
    }
    const currentRenamingItem = renamingItem;
    const col = collections.find((c) => c.id === currentRenamingItem.collectionId);
    if (!col) { setRenamingItem(null); return; }

    const updated = { ...col };

    function renameInTree(items: CollectionItem[]): boolean {
      for (const item of items) {
        if (item.id === currentRenamingItem.itemId) {
          item.name = currentRenamingItem.name.trim();
          return true;
        }
        if (item.type === "folder") {
          if (renameInTree((item as CollectionFolder).items)) return true;
        }
      }
      return false;
    }

    renameInTree(updated.requests);
    updated.updated_at = new Date().toISOString();
    await updateCollection(updated);
    setCollections((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
    setRenamingItem(null);
    addToast("Renamed", "success");
  };

  const hasCollections = collections.length > 0;
  const hasFilteredResults = filteredCollections.length > 0;

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      {/* Modals */}
      {exportCollectionId && (
        <ExportModal
          collectionId={exportCollectionId}
          onClose={() => setExportCollectionId(null)}
        />
      )}
      {collectionVarsColId &&
        (() => {
          const col = collections.find((c) => c.id === collectionVarsColId);
          if (!col) return null;
          return (
            <CollectionVarsModal
              collection={col}
              onClose={() => setCollectionVarsColId(null)}
              onUpdate={(updated) =>
                setCollections((prev) =>
                  prev.map((c) => (c.id === updated.id ? updated : c))
                )
              }
            />
          );
        })()}
      {folderPickerColId &&
        (() => {
          const col = collections.find((c) => c.id === folderPickerColId);
          if (!col) return null;
          return (
            <FolderPickerModal
              collection={col}
              onSelect={(folderId) => {
                saveCurrentRequest(folderPickerColId, folderId);
                setFolderPickerColId(null);
              }}
              onClose={() => setFolderPickerColId(null)}
            />
          );
        })()}

      {/* Rename dialog */}
      {renamingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setRenamingItem(null)}
        >
          <div
            className="bg-popover border rounded-xl shadow-xl w-[320px] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b">
              <h2 className="text-sm font-semibold">Rename</h2>
            </div>
            <div className="p-4">
              <input
                type="text"
                value={renamingItem.name}
                onChange={(e) =>
                  setRenamingItem({ ...renamingItem, name: e.target.value })
                }
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
                className="w-full bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t">
              <button
                onClick={() => setRenamingItem(null)}
                className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                className="px-4 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-150"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

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
            <svg
              className="h-3 w-3 text-muted-foreground shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
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
              <button
                onClick={() => setSearchQuery("")}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
              >
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
          <span className="text-[10px] text-muted-foreground/60">
            Create a collection to organize your requests
          </span>
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
      {filteredCollections.map((col) => {
        const isExpanded = expandedId === col.id && !searchQuery;
        const totalReqs = countCollectionRequests(col.requests);

        return (
          <div key={col.id} className="border-b border-sidebar-border">
            {/* Collection header */}
            <div className="flex items-center gap-1 px-3 py-1.5 group">
              <button
                onClick={() => {
                  if (searchQuery) return;
                  setExpandedId(isExpanded ? null : col.id);
                }}
                className={cn(
                  "text-xs transition-all duration-150",
                  totalReqs > 0
                    ? "text-muted-foreground hover:text-primary"
                    : "text-muted-foreground/40"
                )}
              >
                {isExpanded ? "▼" : "▶"}
              </button>
              <span className="text-xs font-medium flex-1 truncate">{col.name}</span>
              {searchQuery && totalReqs > 0 && (
                <span className="text-[10px] text-muted-foreground">{totalReqs}</span>
              )}
              {/* Run button */}
              <button
                onClick={() => {
                  useRunnerStore.getState().resetRunState();
                  useRunnerStore.setState({
                    collectionId: col.id,
                    collectionName: col.name,
                    totalRequests: totalReqs,
                  });
                  useUIStore.getState().setShowRunner(true, col.id);
                }}
                className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="Run all requests"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
              </button>
              {/* Variables */}
              <button
                onClick={() => setCollectionVarsColId(col.id)}
                className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="Edit collection variables"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              </button>
              {/* Export */}
              <button
                onClick={() => setExportCollectionId(col.id)}
                className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="Export as Postman collection"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
              {/* Save to collection */}
              <button
                onClick={() => setFolderPickerColId(col.id)}
                className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="Save current request to this collection"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
              </button>
              {/* Create folder */}
              <button
                onClick={() => {
                  const name = prompt("Folder name:");
                  if (name) handleCreateFolder(col.id, null, name);
                }}
                className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="Create folder"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m-5 4h10a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </button>
              {/* Delete collection */}
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

            {/* Items area (expanded or search results) */}
            {(isExpanded || searchQuery) && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleCollectionDrop(e, col.id)}
                className="pl-2"
              >
                <TreeItems
                  items={searchQuery ? col.requests : col.requests}
                  collectionId={col.id}
                  depth={0}
                  expandedFolders={expandedFolders}
                  searchQuery={searchQuery}
                  onLoadRequest={loadRequest}
                  onDeleteItem={handleDeleteItem}
                  onRenameItem={(itemId, name) =>
                    setRenamingItem({ collectionId: col.id, itemId, name })
                  }
                  onCreateFolder={(parentFolderId, name) =>
                    handleCreateFolder(col.id, parentFolderId, name)
                  }
                  onDragStart={handleDragStart}
                  onDrop={handleItemDrop}
                  onToggleFolder={(folderId) =>
                    setExpandedFolders((prev) => {
                      const next = new Set(prev);
                      if (next.has(folderId)) {
                        next.delete(folderId);
                      } else {
                        next.add(folderId);
                      }
                      return next;
                    })
                  }
                />
                {totalReqs === 0 && (
                  <div className="px-5 py-1 text-[10px] text-muted-foreground italic">
                    Drop requests here
                  </div>
                )}
              </div>
            )}

            {/* Count when not expanded */}
            {!isExpanded && !searchQuery && (
              <div className="px-7 pb-0.5 text-[10px] text-muted-foreground">
                {totalReqs} request{totalReqs !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tree Items (recursive) ──────────────────────────────────────────────────

function TreeItems({
  items,
  collectionId,
  depth,
  expandedFolders,
  searchQuery,
  onLoadRequest,
  onDeleteItem,
  onRenameItem,
  onCreateFolder,
  onDragStart,
  onDrop,
  onToggleFolder,
}: {
  items: CollectionItem[];
  collectionId: string;
  depth: number;
  expandedFolders: Set<string>;
  searchQuery: string;
  onLoadRequest: (req: HttpRequest) => void;
  onDeleteItem: (collectionId: string, itemId: string) => void;
  onRenameItem: (itemId: string, name: string) => void;
  onCreateFolder: (parentFolderId: string | null, name: string) => void;
  onDragStart: (e: React.DragEvent, data: DragData) => void;
  onDrop: (collectionId: string, folderId: string | null, index: number) => void;
  onToggleFolder: (folderId: string) => void;
}) {
  return (
    <>
      {items.map((item, index) => {
        if (item.type === "folder") {
          const folder = item as CollectionFolder;
          const isExpanded = expandedFolders.has(folder.id);

          return (
            <div key={folder.id}>
              {/* Folder header */}
              <div
                className="flex items-center gap-1 px-2 py-1 group hover:bg-sidebar-accent/30 rounded-lg transition-all duration-150"
                draggable
                onDragStart={(e) =>
                  onDragStart(e, {
                    type: "item",
                    collectionId,
                    itemId: folder.id,
                    parentFolderId: null,
                  })
                }
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDrop(collectionId, folder.id, 0);
                }}
              >
                <button
                  onClick={() => onToggleFolder(folder.id)}
                  className="text-[10px] text-muted-foreground hover:text-primary shrink-0 w-3 transition-all duration-150"
                >
                  {isExpanded ? "▼" : "▶"}
                </button>
                <svg
                  className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={
                      isExpanded
                        ? "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                        : "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    }
                  />
                </svg>
                <span
                  className="text-xs font-medium flex-1 truncate cursor-pointer"
                  onClick={() => onToggleFolder(folder.id)}
                >
                  {folder.name}
                </span>
                {/* Folder context actions */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const name = prompt("Folder name:", "New Folder");
                    if (name) onCreateFolder(folder.id, name);
                  }}
                  className="p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-150"
                  title="Add subfolder"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRenameItem(folder.id, folder.name);
                  }}
                  className="p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-150"
                  title="Rename"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteItem(collectionId, folder.id);
                  }}
                  className="p-0.5 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all duration-150"
                  title="Delete folder"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Folder children */}
              {isExpanded && (
                <div
                  className="border-l border-sidebar-border ml-3 pl-1"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDrop(collectionId, folder.id, 0);
                  }}
                >
                  {folder.items.length > 0 ? (
                    <TreeItems
                      items={folder.items}
                      collectionId={collectionId}
                      depth={depth + 1}
                      expandedFolders={expandedFolders}
                      searchQuery={searchQuery}
                      onLoadRequest={onLoadRequest}
                      onDeleteItem={onDeleteItem}
                      onRenameItem={onRenameItem}
                      onCreateFolder={(_, name) => onCreateFolder(folder.id, name)}
                      onDragStart={onDragStart}
                      onDrop={onDrop}
                      onToggleFolder={onToggleFolder}
                    />
                  ) : (
                    <div className="px-3 py-1 text-[10px] text-muted-foreground italic">
                      Empty folder — drag requests here
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        }

        // It's a request item
        const req = item as CollectionRequest;
        return (
          <div
            key={req.id}
            draggable
            onDragStart={(e) =>
              onDragStart(e, {
                type: "item",
                collectionId,
                itemId: req.id,
                parentFolderId: null,
              })
            }
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDrop(collectionId, null, index);
            }}
            onClick={() => {
              // Convert CollectionRequest to HttpRequest for the store
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { type: _t, examples, ...httpReq } = req;

              // Check if it's a GraphQL request (body_type json, but body has {"query": "..."})
              let isGraphQL = false;
              if (httpReq.body_type === "json" && httpReq.body) {
                try {
                  const parsed = JSON.parse(httpReq.body);
                  if (parsed && typeof parsed === "object" && "query" in parsed) {
                    isGraphQL = true;
                  }
                } catch {
                  // Not valid JSON
                }
              }

              if (isGraphQL) {
                useUIStore.getState().setToolMode("graphql");
              } else if (useUIStore.getState().toolMode === "graphql") {
                useUIStore.getState().setToolMode("http");
              }

              onLoadRequest({
                ...httpReq,
                json_schema: "",
                examples,
              });
            }}
            className={cn(
              "px-2 py-1 text-xs cursor-pointer hover:bg-sidebar-accent flex items-center gap-2 transition-all duration-150 rounded-lg group",
              searchQuery ? "bg-sidebar-accent/30" : ""
            )}
          >
            <span className="text-muted-foreground/30 cursor-grab active:cursor-grabbing shrink-0 text-xs">
              ⠿
            </span>
            {(() => {
              let isGraphQL = false;
              if (req.body_type === "json" && req.body) {
                try {
                  const parsed = JSON.parse(req.body);
                  if (parsed && typeof parsed === "object" && "query" in parsed) {
                    isGraphQL = true;
                  }
                } catch {
                  // Not valid JSON
                }
              }
              if (isGraphQL) {
                return (
                  <span className="shrink-0 text-[9px] bg-purple-600/20 text-purple-400 font-bold px-1 rounded border border-purple-500/30">
                    GQL
                  </span>
                );
              }
              return (
                <span className={cn("font-bold shrink-0 text-[10px]", methodColors[req.method] ?? "")}>
                  {req.method}
                </span>
              );
            })()}
            <span className="truncate flex-1">{req.name || req.url || "No URL"}</span>
            {/* Request context actions */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRenameItem(req.id, req.name);
              }}
              className="p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-150"
              title="Rename"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteItem(collectionId, req.id);
              }}
              className="p-0.5 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all duration-150"
              title="Delete"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        );
      })}
    </>
  );
}
