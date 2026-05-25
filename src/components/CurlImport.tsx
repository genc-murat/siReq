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
    } catch (e: any) {
      setError(e?.toString() ?? "Failed to parse cURL command");
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground hover:text-foreground"
        title="Import cURL"
      >
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
        className="w-full bg-background text-foreground text-xs px-2 py-1 rounded border border-input focus:outline-none focus:ring-1 focus:ring-ring resize-none h-20"
        autoFocus
      />
      {error && <div className="text-xs text-destructive">{error}</div>}
      <div className="flex gap-1">
        <button onClick={handleImport} className="text-xs text-primary hover:underline">Import</button>
        <button onClick={() => { setOpen(false); setCurl(""); setError(null); }} className="text-xs text-muted-foreground hover:underline">Cancel</button>
      </div>
    </div>
  );
}
