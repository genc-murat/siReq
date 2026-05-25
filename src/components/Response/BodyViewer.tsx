import { useRequestStore } from "@/stores/requestStore";
import { CodeMirrorEditor, type CodeMirrorEditorHandle } from "@/components/CodeMirrorEditor";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Virtuoso } from "react-virtuoso";
import { FindBar } from "./FindBar";
import { cn } from "@/lib/utils";

const LARGE_BODY_THRESHOLD = 100_000; // characters

type SupportedLanguage = "json" | "xml" | "html" | "javascript" | "css" | "text";

function detectLanguage(body: string, contentType: string): SupportedLanguage {
  if (contentType.includes("json")) return "json";
  if (contentType.includes("xml")) return "xml";
  if (contentType.includes("html")) return "html";
  if (contentType.includes("javascript") || contentType.includes("ecmascript")) return "javascript";
  if (contentType.includes("css")) return "css";
  try { JSON.parse(body); return "json"; } catch {}
  const trimmed = body.trim();
  if (trimmed.startsWith("<")) return "xml";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (trimmed.startsWith("@media") || trimmed.startsWith(".") || trimmed.startsWith("#") || trimmed.includes("{") && (trimmed.includes(":") || trimmed.includes(";"))) return "css";
  return "text";
}

function LargeBodyViewer({ body, language, size, findOpen, onFindClose }: {
  body: string;
  language: SupportedLanguage;
  size: number;
  findOpen: boolean;
  onFindClose: () => void;
}) {
  const lines = useMemo(() => body.split("\n"), [body]);
  const lineCount = lines.length;
  const digitCount = String(lineCount).length;
  const [findQuery, setFindQuery] = useState("");
  const [activeFindIdx, setActiveFindIdx] = useState(0);
  const virtuosoRef = useRef<any>(null);

  // Listen to findbar-goto events for scrolling
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const { pos } = detail;
      // Approximate line number from character position
      let lineNum = 0;
      let charCount = 0;
      for (let i = 0; i < lines.length; i++) {
        charCount += lines[i].length + 1; // +1 for newline
        if (charCount > pos) {
          lineNum = i;
          break;
        }
      }
      if (virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({ index: Math.max(0, lineNum - 5), align: "start", behavior: "smooth" });
      }
    };
    window.addEventListener("findbar-goto", handler);
    return () => window.removeEventListener("findbar-goto", handler);
  }, [lines]);

  const findMatches = useMemo(() => {
    if (!findQuery.trim()) return [];
    const results: number[] = [];
    const lowerQuery = findQuery.toLowerCase();
    for (let i = 0; i < lines.length; i++) {
      const lowerLine = lines[i].toLowerCase();
      if (lowerLine.includes(lowerQuery)) {
        results.push(i);
      }
    }
    return results;
  }, [findQuery, lines]);

  // Highlight matched lines
  const highlightLine = useCallback((line: string, query: string) => {
    if (!query.trim()) return line;
    const lowerLine = line.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerLine.indexOf(lowerQuery);
    if (idx === -1) return line;
    return (
      <>
        {line.slice(0, idx)}
        <span className="bg-yellow-500/30 text-yellow-200 rounded-sm">{line.slice(idx, idx + query.length)}</span>
        {line.slice(idx + query.length)}
      </>
    );
  }, []);

  const itemContent = useCallback(
    (index: number) => {
      const line = lines[index] ?? "";
      const isMatch = findMatches.includes(index);
      const isActive = findQuery && activeFindIdx >= 0 && findMatches[activeFindIdx] === index;
      return (
        <div
          className={cn(
            "flex text-xs font-mono leading-relaxed",
            isMatch && "bg-yellow-500/5",
            isActive && "bg-yellow-500/20"
          )}
        >
          <span
            className="select-none text-muted-foreground/40 text-right pr-3 shrink-0 border-r border-border mr-3"
            style={{ minWidth: `${digitCount + 1}ch` }}
          >
            {index + 1}
          </span>
          <span className="whitespace-pre-wrap break-all">
            {highlightLine(line, isMatch ? findQuery : "")}
          </span>
        </div>
      );
    },
    [lines, digitCount, findMatches, activeFindIdx, findQuery, highlightLine]
  );

  return (
    <div className="h-full">
      {findOpen && (
        <FindBar
          text={body}
          onClose={onFindClose}
          readOnly
          onQueryChange={(q) => setFindQuery(q)}
          onResultCount={(current, total) => {
            if (total > 0) {
              setActiveFindIdx(current - 1);
            }
            if (current === 0) setActiveFindIdx(-1);
          }}
        />
      )}
      <div className="px-2 py-1 text-[10px] text-muted-foreground border-b bg-muted/30 shrink-0 flex items-center gap-2">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span>Large response — virtualized ({lineCount} lines, {size} bytes)</span>
      </div>
      <div className={findOpen ? "h-[calc(100%-56px)]" : "h-[calc(100%-28px)]"}>
        <Virtuoso
          ref={virtuosoRef}
          totalCount={lineCount}
          itemContent={itemContent}
          className="h-full"
          increaseViewportBy={2000}
          overscan={50}
        />
      </div>
    </div>
  );
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
  const [findOpen, setFindOpen] = useState(false);
  const cmEditorRef = useRef<CodeMirrorEditorHandle | null>(null);

  if (!response) return null;

  const lang = detectLanguage(response.body, contentType);
  const displayBody = viewMode === "pretty" ? tryFormat(response.body, lang) : response.body;
  const isLargeBody = displayBody.length > LARGE_BODY_THRESHOLD;
  const isTextMode = viewMode !== "preview";

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
      await navigator.clipboard.writeText(response.body_base64);
    } else {
      await navigator.clipboard.writeText(response.body);
    }
  };

  const handleSave = () => {
    if (isBinary && response.body_base64) {
      const dataUrl = `data:${contentType};base64,${response.body_base64}`;
      const a = document.createElement("a");
      a.href = dataUrl;
      const ext = previewType === "image" ? contentType.split("/")[1] || "png" : "pdf";
      a.download = `response.${ext}`;
      a.click();
    }
  };

  const handleFind = () => {
    if (isTextMode && !isLargeBody && cmEditorRef.current) {
      // CodeMirror mode: open built-in search panel
      cmEditorRef.current.openSearch();
    } else {
      // Large body or text mode: toggle custom FindBar
      setFindOpen(!findOpen);
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
        {/* Find button */}
        {isTextMode && (
          <button
            onClick={handleFind}
            className={cn(
              "px-2 py-0.5 text-xs rounded flex items-center gap-1",
              findOpen
                ? "bg-primary/10 text-primary"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
            title={isLargeBody ? "Find in page (Ctrl+F)" : "Find (Ctrl+F)"}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Find
          </button>
        )}
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
        ) : isLargeBody && viewMode !== "preview" ? (
          <LargeBodyViewer
            body={displayBody}
            language={viewMode === "pretty" ? lang : "text"}
            size={response.size}
            findOpen={findOpen}
            onFindClose={() => setFindOpen(false)}
          />
        ) : (
          <CodeMirrorEditor
            value={displayBody}
            language={viewMode === "pretty" ? lang : "text"}
            readOnly
            editorRef={cmEditorRef}
          />
        )}
      </div>
    </div>
  );
}
