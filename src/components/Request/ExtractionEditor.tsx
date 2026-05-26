import { useState } from "react";
import type { VariableExtraction } from "@/lib/invoke";
import { cn } from "@/lib/utils";

function generateId(): string {
  return crypto.randomUUID();
}

interface ExtractionEditorProps {
  extractions: VariableExtraction[];
  onChange: (extractions: VariableExtraction[]) => void;
}

const jsonPathExamples = [
  { label: "$.data.id", description: "Extract top-level field" },
  { label: "$.data.items[0].id", description: "Extract from array" },
  { label: "$..access_token", description: "Recursive search" },
  { label: "$.results[0].name", description: "First array element property" },
];

export function ExtractionEditor({ extractions, onChange }: ExtractionEditorProps) {
  const [showHelp, setShowHelp] = useState(false);

  const addExtraction = () => {
    const newExt: VariableExtraction = {
      id: generateId(),
      name: "",
      expression: "$.",
      target_variable: "",
      enabled: true,
    };
    onChange([...extractions, newExt]);
  };

  const removeExtraction = (id: string) => {
    onChange(extractions.filter((e) => e.id !== id));
  };

  const updateExtraction = (id: string, field: keyof VariableExtraction, value: string | boolean) => {
    onChange(
      extractions.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Variable Extractions
          </h3>
          <span className="text-[10px] text-muted-foreground">
            ({extractions.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
            title="JSONPath help"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={addExtraction}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium border rounded-lg hover:bg-accent transition-all duration-150"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Extraction
          </button>
        </div>
      </div>

      {/* Help panel */}
      {showHelp && (
        <div className="border rounded-lg bg-muted/30 p-3 space-y-2">
          <div className="text-[11px] font-medium text-foreground">JSONPath Examples</div>
          <div className="grid grid-cols-2 gap-2">
            {jsonPathExamples.map((ex, i) => (
              <div
                key={i}
                className="text-[10px] bg-background border rounded-lg p-2 cursor-pointer hover:border-primary/50 transition-all duration-150"
                onClick={() => {
                  // Insert example into a new extraction
                  const newExt: VariableExtraction = {
                    id: generateId(),
                    name: "",
                    expression: ex.label,
                    target_variable: "",
                    enabled: true,
                  };
                  onChange([...extractions, newExt]);
                }}
              >
                <code className="text-primary font-medium">{ex.label}</code>
                <div className="text-muted-foreground mt-0.5">{ex.description}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground pt-1 border-t border-border">
            <strong>Syntax:</strong> <code className="text-primary">$.property</code> — access property,{" "}
            <code className="text-primary">$[0]</code> — array index,{" "}
            <code className="text-primary">$..key</code> — recursive search
          </div>
        </div>
      )}

      {/* Extraction list */}
      {extractions.length === 0 ? (
        <div className="text-[11px] text-muted-foreground text-center py-6 border rounded-lg bg-muted/20">
          <svg className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          <p>No extractions defined</p>
          <p className="text-[10px] mt-1">Extract values from JSON responses and store as variables</p>
        </div>
      ) : (
        <div className="space-y-2">
          {extractions.map((ext) => (
            <div
              key={ext.id}
              className={cn(
                "border rounded-lg p-3 space-y-2 transition-all duration-150",
                !ext.enabled && "opacity-50"
              )}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ext.enabled}
                  onChange={(e) => updateExtraction(ext.id, "enabled", e.target.checked)}
                  className="rounded border-input"
                />
                <input
                  type="text"
                  value={ext.name}
                  onChange={(e) => updateExtraction(ext.id, "name", e.target.value)}
                  placeholder="Extraction name..."
                  className="flex-1 bg-transparent text-xs font-medium border-none outline-none placeholder:text-muted-foreground/40"
                />
                <button
                  onClick={() => removeExtraction(ext.id)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium">JSONPath Expression</label>
                  <input
                    type="text"
                    value={ext.expression}
                    onChange={(e) => updateExtraction(ext.id, "expression", e.target.value)}
                    placeholder="$.data.id"
                    className="w-full bg-background text-xs font-mono px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium">Target Variable</label>
                  <input
                    type="text"
                    value={ext.target_variable}
                    onChange={(e) => updateExtraction(ext.id, "target_variable", e.target.value)}
                    placeholder="my_variable"
                    className="w-full bg-background text-xs font-mono px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
                  />
                </div>
              </div>
              {ext.expression && ext.target_variable && (
                <div className="text-[10px] text-muted-foreground bg-muted/20 rounded px-2 py-1">
                  <span className="text-primary font-medium">{ext.expression}</span>
                  {" → "}
                  <span className="text-green-500 font-medium">{ext.target_variable}</span>
                  <span className="ml-1">(extracted value stored as variable)</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quick info */}
      <div className="text-[10px] text-muted-foreground border rounded-lg p-2 space-y-0.5">
        <div className="flex items-center gap-1">
          <svg className="h-3 w-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Extractions run automatically after each response. Use <code className="text-primary font-mono">{`{{target_variable}}`}</code> in subsequent requests.</span>
        </div>
      </div>
    </div>
  );
}
