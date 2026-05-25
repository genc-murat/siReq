import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface FindBarProps {
  text: string;
  onClose: () => void;
  onResultCount?: (current: number, total: number) => void;
  onQueryChange?: (query: string) => void;
  readOnly?: boolean;
}

export function FindBar({ text, onClose, onResultCount, onQueryChange, readOnly = true }: FindBarProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [replaceMode, setReplaceMode] = useState(false);
  const [replaceText, setReplaceText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Notify parent of query changes
  useEffect(() => {
    onQueryChange?.(query);
  }, [query, onQueryChange]);

  // Find all match positions
  const matches = useMemo(() => {
    if (!query.trim() || !text) return [];
    const results: number[] = [];
    const lowerQuery = query.toLowerCase();
    const lowerText = text.toLowerCase();
    let idx = 0;
    while (true) {
      const pos = lowerText.indexOf(lowerQuery, idx);
      if (pos === -1) break;
      results.push(pos);
      idx = pos + query.length;
    }
    return results;
  }, [query, text]);

  const matchCount = matches.length;
  const safeActive = Math.min(Math.max(activeIndex, 0), Math.max(matchCount - 1, 0));
  const hasResults = matchCount > 0;

  // Focus input on mount and when replace mode toggles
  useEffect(() => {
    if (replaceMode && replaceInputRef.current) {
      replaceInputRef.current.focus();
    } else if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [replaceMode]);

  // Callback for result count
  useEffect(() => {
    onResultCount?.(hasResults ? safeActive + 1 : 0, matchCount);
  }, [safeActive, matchCount, hasResults, onResultCount]);

  const goTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, matchCount - 1));
    setActiveIndex(clamped);
    // Scroll a hidden anchor into view so the parent can scroll there
    const pos = matches[clamped];
    if (pos !== undefined) {
      window.dispatchEvent(new CustomEvent("findbar-goto", { detail: { pos, len: query.length } }));
    }
  }, [matches, matchCount, query.length]);

  const handleReplace = useCallback(() => {
    if (!hasResults || !replaceText) return;
    const pos = matches[safeActive];
    if (pos === undefined) return;
    const before = text.slice(0, pos);
    const after = text.slice(pos + query.length);
    const newText = before + replaceText + after;
    window.dispatchEvent(new CustomEvent("findbar-replace", { detail: { newText, pos, oldLen: query.length, newLen: replaceText.length } }));
    // After replace, re-search from the same position
    setActiveIndex(Math.min(safeActive, matchCount - 2));
  }, [hasResults, matches, safeActive, text, query, replaceText, matchCount]);

  const handleReplaceAll = useCallback(() => {
    if (!hasResults || !replaceText) return;
    let result = text;
    let count = 0;
    const lowerQuery = query.toLowerCase();
    let idx = 0;
    while (true) {
      const lowerResult = result.toLowerCase();
      const pos = lowerResult.indexOf(lowerQuery, idx);
      if (pos === -1) break;
      result = result.slice(0, pos) + replaceText + result.slice(pos + query.length);
      idx = pos + replaceText.length;
      count++;
    }
    if (count > 0) {
      window.dispatchEvent(new CustomEvent("findbar-replace-all", { detail: { newText: result, count } }));
      setActiveIndex(0);
    }
  }, [hasResults, query, replaceText, text]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        goTo(safeActive - 1);
      } else {
        goTo(safeActive + 1);
      }
    }
    if (e.key === "Escape") {
      onClose();
    }
  }, [goTo, safeActive, onClose]);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-muted/30 shrink-0 text-xs">
      {/* Search input */}
      <div className="relative flex-1 max-w-[200px]">
        <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
          onKeyDown={handleKeyDown}
          placeholder="Find..."
          className="w-full pl-7 pr-2 py-1 rounded border bg-background text-[11px] focus:outline-none focus:border-primary"
        />
      </div>

      {/* Match counter */}
      <span className={cn(
        "text-[10px] min-w-[3ch] text-center tabular-nums",
        hasResults ? "text-muted-foreground" : "text-muted-foreground/40"
      )}>
        {hasResults ? `${safeActive + 1}/${matchCount}` : "0/0"}
      </span>

      {/* Navigation */}
      <button
        onClick={() => goTo(safeActive - 1)}
        disabled={!hasResults}
        className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        onClick={() => goTo(safeActive + 1)}
        disabled={!hasResults}
        className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {!readOnly && (
        <>
          <div className="w-px h-4 bg-border mx-0.5" />
          {/* Replace toggle */}
          <button
            onClick={() => setReplaceMode(!replaceMode)}
            className={cn(
              "p-0.5 rounded transition-colors",
              replaceMode ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
            )}
            title="Replace"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {/* Replace input */}
          {replaceMode && (
            <>
              <input
                ref={replaceInputRef}
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleReplace(); }
                  if (e.key === "Escape") onClose();
                }}
                placeholder="Replace..."
                className="w-24 px-2 py-1 rounded border bg-background text-[11px] focus:outline-none focus:border-primary"
              />
              <button
                onClick={handleReplace}
                disabled={!hasResults}
                className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Replace
              </button>
              <button
                onClick={handleReplaceAll}
                disabled={!hasResults}
                className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                All
              </button>
            </>
          )}
        </>
      )}

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Case-sensitive / whole word toggles (placeholder - could add later) */}
      <div className="flex-1" />

      {/* Close */}
      <button
        onClick={onClose}
        className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
