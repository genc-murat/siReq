import { useState } from "react";
import { importCurl } from "@/lib/invoke";
import { useRequestStore } from "@/stores/requestStore";
import { useToastStore } from "@/stores/toastStore";

export function CurlImport() {
  const [open, setOpen] = useState(false);
  const [curl, setCurl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  const handleImport = async () => {
    if (!curl.trim()) return;
    try {
      setError(null);
      const request = await importCurl(curl.trim());
      useRequestStore.getState().setRequest(request);
      setOpen(false);
      setCurl("");
      addToast("cURL imported", "success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : e?.toString() ?? "Failed to parse cURL command");
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground hover:bg-accent px-2 py-1 rounded-lg transition-all duration-150 flex items-center gap-1"
        title="Import cURL"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3" />
        </svg>
        cURL
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      <textarea
        value={curl}
        onChange={(e) => setCurl(e.target.value)}
        placeholder="Paste cURL command here..."
        className="w-full bg-background text-foreground text-xs px-2 py-1 rounded-lg border border-input focus:outline-none focus-within:ring-1 focus-within:ring-ring transition-all duration-150 resize-none h-20"
        autoFocus
      />
      {error && <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-2 py-1">{error}</div>}
      <div className="flex gap-1">
        <button onClick={handleImport} className="text-xs font-medium px-2 py-1 rounded-lg text-primary hover:bg-primary/10 transition-all duration-150">Import</button>
        <button onClick={() => { setOpen(false); setCurl(""); setError(null); }} className="text-xs font-medium px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150">Cancel</button>
      </div>
    </div>
  );
}
