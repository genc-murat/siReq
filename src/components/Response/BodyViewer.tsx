import { useRequestStore } from "@/stores/requestStore";
import { CodeMirrorEditor } from "@/components/CodeMirrorEditor";
import { useState, useMemo } from "react";
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

type ViewMode = "pretty" | "raw" | "preview";

function getPreviewType(contentType: string): "image" | "pdf" | "none" {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.includes("pdf")) return "pdf";
  return "none";
}

export function BodyViewer() {
  const response = useRequestStore((s) => s.response);
  const contentTypeHeader = response?.headers.find(
    ([k]) => k.toLowerCase() === "content-type"
  );
  const contentType = contentTypeHeader?.[1] ?? "";

  const previewType = useMemo(() => getPreviewType(contentType), [contentType]);
  const isBinary = response?.body_base64 != null;
  const [viewMode, setViewMode] = useState<ViewMode>(isBinary ? "preview" : "pretty");

  if (!response) return null;

  const lang = detectLanguage(response.body, contentType);
  const displayBody = viewMode === "pretty" ? tryFormat(response.body, lang) : response.body;

  // Determine which view modes to show
  const showPreview = isBinary && previewType !== "none";
  const showRaw = isBinary || true;

  const viewModes: { value: ViewMode; label: string }[] = [
    ...(showPreview ? [{ value: "preview" as const, label: "Preview" }] : []),
    { value: "pretty", label: "Pretty" },
    { value: "raw", label: "Raw" },
  ];

  const handleCopy = async () => {
    if (isBinary && response.body_base64) {
      // For binary, try to copy the base64
      await navigator.clipboard.writeText(response.body_base64);
    } else {
      await navigator.clipboard.writeText(response.body);
    }
  };

  const handleSave = () => {
    if (isBinary && response.body_base64) {
      // Create a data URL and trigger download
      const dataUrl = `data:${contentType};base64,${response.body_base64}`;
      const a = document.createElement("a");
      a.href = dataUrl;
      const ext = previewType === "image" ? contentType.split("/")[1] || "png" : "pdf";
      a.download = `response.${ext}`;
      a.click();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-3 py-1 shrink-0 items-center">
        {viewModes.map((vm) => (
          <button
            key={vm.value}
            onClick={() => setViewMode(vm.value)}
            className={cn(
              "px-2 py-0.5 text-xs rounded",
              viewMode === vm.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {vm.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          className="px-2 py-0.5 text-xs rounded bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          Copy
        </button>
        {isBinary && (
          <button
            onClick={handleSave}
            className="px-2 py-0.5 text-xs rounded bg-secondary text-secondary-foreground hover:bg-secondary/80"
          >
            Save
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {viewMode === "preview" && isBinary && response.body_base64 ? (
          <div className="h-full flex items-center justify-center bg-secondary/10 p-4 overflow-auto">
            {previewType === "image" ? (
              <img
                src={`data:${contentType};base64,${response.body_base64}`}
                alt="Response preview"
                className="max-w-full max-h-full object-contain rounded shadow-lg"
              />
            ) : previewType === "pdf" ? (
              <iframe
                src={`data:application/pdf;base64,${response.body_base64}`}
                className="w-full h-full rounded border"
                title="PDF preview"
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                Binary response ({response.size} bytes)
              </div>
            )}
          </div>
        ) : (
          <CodeMirrorEditor
            value={displayBody}
            language={viewMode === "pretty" ? lang : "text"}
            readOnly
          />
        )}
      </div>
    </div>
  );
}
