import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  highlightActiveLine,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  indentOnInput,
  StreamLanguage,
  LanguageSupport,
} from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { closeBrackets, closeBracketsKeymap, autocompletion } from "@codemirror/autocomplete";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { foldKeymap } from "@codemirror/language";
import type { GraphQLSchema } from "graphql";
import {
  parse as gqlParse,
  validate as gqlValidate,
  GraphQLError,
} from "graphql";

// ─── Minimal GraphQL tokenizer for StreamLanguage ────────────────────────────

const graphqlLanguage = StreamLanguage.define({
  name: "graphql",
  startState: () => ({ inString: false, depth: 0 }),
  token(stream, state) {
    if (state.inString) {
      if (stream.next() === '"') state.inString = false;
      return "string";
    }
    if (stream.eat("#")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.eat('"')) {
      state.inString = true;
      return "string";
    }
    if (stream.eat(/[{}()[\]]/)) return "bracket";

    if (stream.eat(":")) return "operator";
    if (stream.eat("!")) return "operator";
    if (stream.eat("$")) {
      stream.eatWhile(/\w/);
      return "variableName.special";
    }
    if (stream.eat("@")) {
      stream.eatWhile(/\w/);
      return "keyword";
    }
    if (stream.match(/\b(query|mutation|subscription|fragment|on|true|false|null)\b/)) {
      return "keyword";
    }
    if (stream.match(/\b(Int|Float|String|Boolean|ID)\b/)) {
      return "typeName";
    }
    if (stream.match(/-?\d+(\.\d+)?([eE][+-]?\d+)?/)) return "number";
    if (stream.eatWhile(/\w/)) return "variableName";
    stream.next();
    return null;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

// ─── GraphQL Linter ─────────────────────────────────────────────────────────

function makeGraphQLLinter(schema: GraphQLSchema | null) {
  return linter((view) => {
    const text = view.state.doc.toString();
    if (!text.trim()) return [];

    const diagnostics: Diagnostic[] = [];

    try {
      const doc = gqlParse(text);
      if (schema) {
        const errors = gqlValidate(schema, doc);
        for (const err of errors) {
          diagnostics.push(graphQLErrorToDiagnostic(view, err));
        }
      }
    } catch (e) {
      if (e instanceof GraphQLError) {
        diagnostics.push(graphQLErrorToDiagnostic(view, e));
      }
    }

    return diagnostics;
  });
}

function graphQLErrorToDiagnostic(view: EditorView, err: GraphQLError): Diagnostic {
  const loc = err.locations?.[0];
  if (loc) {
    const line = view.state.doc.line(Math.min(loc.line, view.state.doc.lines));
    const from = line.from + Math.min(loc.column - 1, line.length);
    return {
      from,
      to: Math.min(from + 1, view.state.doc.length),
      severity: "error",
      message: err.message,
    };
  }
  return {
    from: 0,
    to: Math.min(view.state.doc.length, 1),
    severity: "error",
    message: err.message,
  };
}

// ─── Schema-based autocompletion ─────────────────────────────────────────────

function makeGraphQLCompletions(schema: GraphQLSchema | null) {
  if (!schema) return [];

  const completions: { label: string; type: string; detail: string }[] = [];

  // Collect root type fields
  const queryType = schema.getQueryType();
  const mutationType = schema.getMutationType();
  const subscriptionType = schema.getSubscriptionType();

  for (const [rootType, typeName] of [
    [queryType, "Query"],
    [mutationType, "Mutation"],
    [subscriptionType, "Subscription"],
  ] as const) {
    if (!rootType) continue;
    const fields = rootType.getFields();
    for (const [name, field] of Object.entries(fields)) {
      completions.push({
        label: name,
        type: "function",
        detail: `${typeName}: ${field.type.toString()}`,
      });
    }
  }

  // Add keywords
  for (const kw of ["query", "mutation", "subscription", "fragment", "on"]) {
    completions.push({ label: kw, type: "keyword", detail: "GraphQL keyword" });
  }

  return completions;
}

// ─── isDarkMode helper ────────────────────────────────────────────────────────

function isDarkMode() {
  return document.documentElement.classList.contains("dark");
}

// ─── Component ────────────────────────────────────────────────────────────────

interface GraphQLQueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  schema: GraphQLSchema | null;
  readOnly?: boolean;
}

export function GraphQLQueryEditor({
  value,
  onChange,
  schema,
  readOnly = false,
}: GraphQLQueryEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = isDarkMode();

    const schemaCompletions = makeGraphQLCompletions(schema);

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
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
      ]),
      new LanguageSupport(graphqlLanguage),
      EditorView.lineWrapping,
      EditorState.readOnly.of(readOnly),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChangeRef.current) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      // Always-on linter
      lintGutter(),
      makeGraphQLLinter(schema),
    ];

    // Schema-based autocomplete
    if (schemaCompletions.length > 0) {
      extensions.push(
        autocompletion({
          override: [
            (context) => {
              const word = context.matchBefore(/\w+/);
              if (!word) return null;
              if (word.from === word.to && !context.explicit) return null;
              const prefix = word.text.toLowerCase();
              const options = schemaCompletions
                .filter((c) => c.label.toLowerCase().startsWith(prefix))
                .map((c) => ({ label: c.label, type: c.type, detail: c.detail }));
              if (!options.length) return null;
              return { from: word.from, options };
            },
          ],
          activateOnTyping: true,
          maxRenderedOptions: 20,
        })
      );
    }

    if (isDark) extensions.push(oneDark);

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Re-create editor when schema changes (affects linter + completions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, readOnly]);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={containerRef} className="h-full w-full" />;
}
