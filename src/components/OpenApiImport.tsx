import { useState, useRef } from "react";
import { importOpenApi, countCollectionRequests } from "@/lib/invoke";
import { useToastStore } from "@/stores/toastStore";

interface OpenApiImportProps {
  onImported?: () => void;
}

export function OpenApiImport({ onImported }: OpenApiImportProps) {
  const [open, setOpen] = useState(false);
  const [specContent, setSpecContent] = useState("");
  const [collectionName, setCollectionName] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addToast = useToastStore((s) => s.addToast);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setSpecContent(text);
      // Auto-name from filename
      if (!collectionName) {
        const name = file.name.replace(/\.(json|yaml|yml)$/i, "");
        setCollectionName(name);
      }
      addToast(`Loaded ${file.name}`, "info");
    } catch {
      addToast("Failed to read file", "error");
    }
    // Reset input so re-selecting same file works
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = async () => {
    if (!specContent.trim()) {
      setError("Please paste a spec or select a file");
      return;
    }
    const name = collectionName.trim() || "Imported API";
    setImporting(true);
    setError(null);
    try {
      const collection = await importOpenApi(specContent.trim(), name);
      setOpen(false);
      setSpecContent("");
      setCollectionName("");
      addToast(
        `Imported ${collection.name} with ${countCollectionRequests(collection.requests)} endpoints`,
        "success"
      );
      onImported?.();
    } catch (e: unknown) {
      const errMsg =
        e instanceof Error
          ? e.message
          : e?.toString() ?? "Failed to import spec";
      setError(errMsg);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSpecContent("");
    setCollectionName("");
    setError(null);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        title="Import OpenAPI/Swagger spec"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        OpenAPI
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-popover border rounded-xl shadow-xl w-[520px] max-h-[80vh] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Import OpenAPI / Swagger Spec</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-3 min-h-0">
          {/* Collection name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Collection name</label>
            <input
              type="text"
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              placeholder="My API"
              className="bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus-within:ring-1 focus-within:ring-ring transition-all duration-150"
            />
          </div>

          {/* File select */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Or load from file</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.yaml,.yml"
              onChange={handleFileSelect}
              className="text-xs text-muted-foreground file:mr-2 file:py-0.5 file:px-2 file:text-xs file:font-medium file:rounded-lg file:border-0 file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer transition-all duration-150"
            />
          </div>

          {/* Spec textarea */}
          <div className="flex flex-col gap-1 flex-1 min-h-0">
            <label className="text-xs text-muted-foreground font-medium">Paste spec content (JSON/YAML)</label>
            <textarea
              value={specContent}
              onChange={(e) => setSpecContent(e.target.value)}
              placeholder={`{\n  "openapi": "3.0.0",\n  "info": { "title": "...", "version": "1.0" },\n  "paths": { ... }\n}`}
              className="flex-1 bg-background text-foreground text-xs px-3 py-2 rounded-lg border border-input focus:outline-none focus-within:ring-1 focus-within:ring-ring transition-all duration-150 resize-none font-mono min-h-[200px]"
              spellCheck={false}
              autoFocus
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 text-destructive text-xs px-3 py-2 rounded-lg border border-destructive/20">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing || !specContent.trim()}
            className="px-4 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {importing ? (
              <>
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Importing...
              </>
            ) : (
              "Import"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
