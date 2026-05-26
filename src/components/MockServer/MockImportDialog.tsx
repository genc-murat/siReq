import React, { useState, useEffect } from "react";
import { X, FileText, Database, Upload, HelpCircle } from "lucide-react";
import { getCollections } from "@/lib/invoke";
import type { Collection } from "@/lib/invoke";
import { useMockStore } from "@/stores/mockStore";
import { useToastStore } from "@/stores/toastStore";

interface MockImportDialogProps {
  onClose: () => void;
}

export function MockImportDialog({ onClose }: MockImportDialogProps) {
  const [importType, setImportType] = useState<"openapi" | "collection">("openapi");
  const [name, setName] = useState("");
  const [port, setPort] = useState(8080);
  const [specContent, setSpecContent] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);

  const importOpenApi = useMockStore((s) => s.importOpenApi);
  const importCollection = useMockStore((s) => s.importCollection);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    let active = true;
    getCollections()
      .then((cols) => {
        if (active) {
          setCollections(cols);
          if (cols.length > 0) {
            setSelectedCollectionId(cols[0].id);
            setName(`${cols[0].name} Mock`);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load collections for import", err);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleTypeChange = (type: "openapi" | "collection") => {
    setImportType(type);
    if (type === "collection" && collections.length > 0) {
      const selected = collections.find((c) => c.id === selectedCollectionId);
      setName(`${selected?.name || "Collection"} Mock`);
    } else {
      setName("OpenAPI Mock");
    }
  };

  const handleCollectionChange = (colId: string) => {
    setSelectedCollectionId(colId);
    const selected = collections.find((c) => c.id === colId);
    if (selected) {
      setName(`${selected.name} Mock`);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast("Please enter the server name.", "error");
      return;
    }
    if (port < 1024 || port > 65535) {
      addToast("Port number must be between 1024 and 65535.", "error");
      return;
    }
    if (importType === "openapi" && !specContent.trim()) {
      addToast("Please enter the OpenAPI specification content.", "error");
      return;
    }

    setLoading(true);
    try {
      if (importType === "openapi") {
        await importOpenApi(specContent, name, port);
        addToast("OpenAPI successfully imported and mock server created!", "success");
      } else {
        await importCollection(selectedCollectionId, name, port);
        addToast("Collection successfully imported and mock server created!", "success");
      }
      onClose();
    } catch (err) {
      console.error(err);
      addToast(`Import failed: ${err}`, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-card w-full max-w-lg rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/80 bg-accent/30">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">New Mock Server (Import)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleImport} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Import Source Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Import Source</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange("openapi")}
                className={`flex items-center justify-center gap-2 py-2 px-3 border rounded-lg text-xs font-semibold transition-all duration-200 ${
                  importType === "openapi"
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>OpenAPI / Swagger Spec</span>
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange("collection")}
                className={`flex items-center justify-center gap-2 py-2 px-3 border rounded-lg text-xs font-semibold transition-all duration-200 ${
                  importType === "collection"
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Database className="w-4 h-4" />
                <span>Existing Collection</span>
              </button>
            </div>
          </div>

          {/* Common Fields: Name & Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Server Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. User API Mock"
                className="w-full h-9 bg-background border border-border rounded-lg px-3 text-xs focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">TCP Port</label>
              <input
                type="number"
                required
                min="1024"
                max="65535"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 8080)}
                placeholder="8080"
                className="w-full h-9 bg-background border border-border rounded-lg px-3 text-xs focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Import Mode Content */}
          {importType === "openapi" ? (
            <div className="space-y-1.5 flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">OpenAPI JSON or YAML Content</label>
                <span className="text-[9px] text-muted-foreground/60 flex items-center gap-0.5">
                  <HelpCircle className="w-3 h-3" />
                  Version 2.x or 3.x supported
                </span>
              </div>
              <textarea
                value={specContent}
                onChange={(e) => setSpecContent(e.target.value)}
                placeholder="Paste your JSON or YAML spec here..."
                rows={10}
                className="w-full bg-background border border-border rounded-lg p-3 text-xs font-mono focus:outline-none focus:border-primary transition-colors resize-y h-48"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Select Collection</label>
              {collections.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground bg-accent/15 border border-dashed rounded-lg">
                  No available collections found. Please create a collection first.
                </div>
              ) : (
                <select
                  value={selectedCollectionId}
                  onChange={(e) => handleCollectionChange(e.target.value)}
                  className="w-full h-9 bg-background border border-border rounded-lg px-2 text-xs focus:outline-none focus:border-primary transition-colors cursor-pointer"
                >
                  {collections.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.name} ({col.requests.length} requests)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-end gap-2 border-t border-border/80 pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-muted-foreground bg-background hover:text-foreground hover:bg-accent rounded-lg border transition-all duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (importType === "collection" && collections.length === 0)}
              className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/95 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-md transition-all duration-150 flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <span>Create Mock Server</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
