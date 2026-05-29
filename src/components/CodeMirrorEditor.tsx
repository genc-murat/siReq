import { useEffect, useRef, useMemo, useImperativeHandle } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { closeBrackets, closeBracketsKeymap, autocompletion, CompletionContext, type Completion } from "@codemirror/autocomplete";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { searchKeymap, highlightSelectionMatches, openSearchPanel } from "@codemirror/search";
import { foldKeymap } from "@codemirror/language";
import * as acorn from "acorn";
import { useUIStore } from "@/stores/uiStore";

export interface CodeMirrorEditorHandle {
  openSearch: () => void;
}

interface CompletionOption {
  label: string;
  detail?: string;
  type?: string;
  boost?: number;
}

interface CodeMirrorEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: "json" | "xml" | "html" | "javascript" | "css" | "text";
  readOnly?: boolean;
  placeholder?: string;
  completions?: CompletionOption[];
}

function getLanguageExtension(lang?: string) {
  switch (lang) {
    case "json": return json();
    case "xml": return xml();
    case "html": return html();
    case "css": return css();
    case "javascript": return javascript();
    default: return [];
  }
}

/**
 * CSS-based dark mode detection: reads the computed --color-background
 * lightness from CSS variables. If lightness is below 40%, treat as dark.
 * This works automatically with ALL themes without hardcoding theme names.
 */
function isDarkMode(): boolean {
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-background").trim();
  const match = bg.match(/hsl\(\s*[\d.]+\s+[\d.]+%\s+([\d.]+)%/);
  if (match) {
    return parseFloat(match[1]) < 40;
  }
  // Fallback: check for .dark class
  return document.documentElement.classList.contains("dark");
}

/**
 * Create a CodeMirror linter that validates JavaScript syntax using acorn parser.
 * Provides precise error line/column positioning in the editor.
 */
function jsSyntaxLinter() {
  return linter((view) => {
    const code = view.state.doc.toString();
    if (!code.trim()) return [];
    try {
      acorn.parse(code, { ecmaVersion: "latest", locations: true });
      return [];
    } catch (err: unknown) {
      const e = err as { loc?: { line?: number; column?: number }; pos?: number; message?: string };
      const diagnostics: Diagnostic[] = [];
      // Acorn provides precise loc (1-based line, 0-based column) and pos (character offset)
      const line = e.loc?.line;
      const col = e.loc?.column;
      const pos = e.pos;

      if (line != null && line > 0 && line <= view.state.doc.lines) {
        const docLine = view.state.doc.line(line);
        // Highlight from error position to end of line for precise visual cue
        const from = col != null ? docLine.from + col : docLine.from;
        const to = docLine.to;
        diagnostics.push({
          from,
          to,
          severity: "error",
          message: e.message || "Syntax error",
        });
      } else if (pos != null && pos >= 0 && pos <= view.state.doc.length) {
        // Fallback to character offset if line info unavailable
        diagnostics.push({
          from: pos,
          to: Math.min(pos + 1, view.state.doc.length),
          severity: "error",
          message: e.message || "Syntax error",
        });
      } else {
        // Last resort: highlight the entire document
        diagnostics.push({
          from: 0,
          to: view.state.doc.length,
          severity: "error",
          message: e.message || "Syntax error",
        });
      }
      return diagnostics;
    }
  });
}

/**
 * Check JavaScript code for syntax errors using acorn parser.
 * Used by parent components to display error badges.
 */
/* eslint-disable-next-line react-refresh/only-export-components */
export function countJSSyntaxErrors(code: string | undefined | null): number {
  if (!code?.trim()) return 0;
  try {
    acorn.parse(code, { ecmaVersion: "latest" });
    return 0;
  } catch {
    return 1;
  }
}

const pmApiCompletions: Completion[] = [
  { label: "pm.test", detail: "pm.test(name, fn)", type: "function", boost: 99 },
  { label: "pm.expect", detail: "pm.expect(value)", type: "function", boost: 99 },
  { label: "pm.variables.get", detail: "pm.variables.get(key)", type: "function", boost: 99 },
  { label: "pm.variables.set", detail: "pm.variables.set(key, value)", type: "function", boost: 99 },
  { label: "pm.environment.get", detail: "pm.environment.get(key)", type: "function", boost: 99 },
  { label: "pm.environment.set", detail: "pm.environment.set(key, value)", type: "function", boost: 99 },
  { label: "to.equal", type: "function", detail: "to.equal(value)", boost: 80 },
  { label: "to.include", type: "function", detail: "to.include(value)", boost: 80 },
  { label: "to.be.below", type: "function", detail: "to.be.below(limit)", boost: 80 },
  { label: "to.be.above", type: "function", detail: "to.be.above(limit)", boost: 80 },
  { label: "console.log", type: "function", detail: "console.log(...args)", boost: 95 },
  { label: "console.warn", type: "function", detail: "console.warn(...args)", boost: 95 },
  { label: "console.error", type: "function", detail: "console.error(...args)", boost: 95 },
  { label: "request.url", type: "property", detail: "string", boost: 90 },
  { label: "request.method", type: "property", detail: "string", boost: 90 },
  { label: "request.headers", type: "property", detail: "KeyValue[]", boost: 90 },
  { label: "request.query_params", type: "property", detail: "KeyValue[]", boost: 90 },
  { label: "request.body", type: "property", detail: "string", boost: 90 },
  { label: "request.body_type", type: "property", detail: "string", boost: 90 },
  { label: "response.status", type: "property", detail: "number", boost: 90 },
  { label: "response.status_text", type: "property", detail: "string", boost: 90 },
  { label: "response.body", type: "property", detail: "string", boost: 90 },
  { label: "response.headers", type: "property", detail: "[string,string][]", boost: 90 },
  { label: "response.time_ms", type: "property", detail: "number", boost: 90 },
  { label: "response.size", type: "property", detail: "number", boost: 90 },
  { label: "JSON.parse", type: "function", detail: "JSON.parse(text)", boost: 85 },
  { label: "JSON.stringify", type: "function", detail: "JSON.stringify(value)", boost: 85 },
  { label: "Date.now", type: "function", detail: "Date.now()", boost: 85 },
];

export function CodeMirrorEditor({
  value,
  onChange,
  language = "text",
  readOnly = false,
  completions,
  editorRef,
}: CodeMirrorEditorProps & { editorRef?: React.RefObject<CodeMirrorEditorHandle | null> }) {
  const theme = useUIStore((s) => s.theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extraCompletions = useMemo(() => {
    if (!completions || completions.length === 0) return [] as Completion[];
    return completions.map((c) => ({
      label: c.label,
      type: c.type || "variable",
      detail: c.detail || "Environment Variable",
      boost: c.boost ?? 70,
    }));
  }, [completions]);

  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = getLanguageExtension(language);

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      isDarkMode() ? oneDark : [],
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
      ]),
      langExt,
      EditorView.lineWrapping,
      EditorState.readOnly.of(readOnly),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChangeRef.current) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    // Add JavaScript linting (syntax validation with red underlines)
    if (language === "javascript") {
      extensions.push(lintGutter(), jsSyntaxLinter());
    }

    // Add autocompletion if custom completions or PM API completions are relevant
    const allCompletions = [...pmApiCompletions, ...extraCompletions];
    if (allCompletions.length > 0 && language === "javascript") {
      extensions.push(
        autocompletion({
          override: [
            (context: CompletionContext) => {
              const word = context.matchBefore(/[\w.]+$/);
              if (!word) return null;
              if (word.from === word.to && !context.explicit) return null;
              const prefix = word.text.toLowerCase();
              const options = allCompletions.filter((c) =>
                c.label.toLowerCase().startsWith(prefix)
              );
              if (options.length === 0) return null;
              return {
                from: word.from,
                options,
                validFor: /^[\w.]+$/,
              };
            },
          ],
          activateOnTyping: true,
          maxRenderedOptions: 20,
        })
      );
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    // Expose openSearch via the editorRef
    // (Handled cleanly by useImperativeHandle)

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly, extraCompletions, theme]);

  useImperativeHandle(editorRef, () => ({
    openSearch: () => {
      if (viewRef.current) {
        openSearchPanel(viewRef.current);
      }
    },
  }));

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      view.dispatch({
        changes: { from: 0, to: currentValue.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} className="h-full w-full" />;
}
