import { useRequestStore } from "@/stores/requestStore";
import { CodeMirrorEditor } from "@/components/CodeMirrorEditor";
import { useState } from "react";
import { cn } from "@/lib/utils";

function detectLanguage(body: string, contentType: string): "json" | "xml" | "html" | "text" {
  if (contentType.includes("json")) return "json";
  if (contentType.includes("xml")) return "xml";
  if (contentType.includes("html")) return "html";
  try { JSON.parse(body); return "json"; } catch {}
  if (body.trim().startsWith("<")) return "xml";
  return "text";
}

function tryFormat(body: string, lang: string): string {
  if (lang === "json") {
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch {}
  }
  return body;
}

type ViewMode = "pretty" | "raw";

export function BodyViewer() {
  const response = useRequestStore((s) => s.response);
  const [viewMode, setViewMode] = useState<ViewMode>("pretty");

  if (!response) return null;

  const contentTypeHeader = response.headers.find(
    ([k]) => k.toLowerCase() === "content-type"
  );
  const contentType = contentTypeHeader?.[1] ?? "";
  const lang = detectLanguage(response.body, contentType);
  const displayBody = viewMode === "pretty" ? tryFormat(response.body, lang) : response.body;

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-3 py-1 shrink-0">
        <button
          onClick={() => setViewMode("pretty")}
          className={cn(
            "px-2 py-0.5 text-xs rounded",
            viewMode === "pretty" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
          )}
        >
          Pretty
        </button>
        <button
          onClick={() => setViewMode("raw")}
          className={cn(
            "px-2 py-0.5 text-xs rounded",
            viewMode === "raw" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
          )}
        >
          Raw
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(response.body)}
          className="px-2 py-0.5 text-xs rounded bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          Copy
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <CodeMirrorEditor
          value={displayBody}
          language={viewMode === "pretty" ? lang : "text"}
          readOnly
        />
      </div>
    </div>
  );
}
