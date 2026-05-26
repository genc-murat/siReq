import React from "react";
import type { RequestMatcher } from "@/lib/invoke";
import { Plus, Trash, ShieldAlert } from "lucide-react";

interface MockMatcherEditorProps {
  rules: RequestMatcher[];
  onChange: (rules: RequestMatcher[]) => void;
}

export function MockMatcherEditor({ rules, onChange }: MockMatcherEditorProps) {
  const handleAddRule = () => {
    const newRule: RequestMatcher = {
      source: "query",
      key: "",
      operator: "equals",
      value: "",
    };
    onChange([...rules, newRule]);
  };

  const handleRemoveRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  const handleRuleChange = (index: number, field: keyof RequestMatcher, val: string) => {
    const nextRules = [...rules];
    nextRules[index] = {
      ...nextRules[index],
      [field]: val,
    };
    onChange(nextRules);
  };

  return (
    <div className="space-y-3 p-4 rounded-xl border bg-card/40 backdrop-blur-sm shadow-inner">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground/80">
          <ShieldAlert className="w-4 h-4 text-primary" />
          <span>Request Matchers</span>
        </div>
        <button
          type="button"
          onClick={handleAddRule}
          className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 px-2 py-1 rounded-lg font-medium transition-all duration-150"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Rule</span>
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-6 text-[11px] text-muted-foreground bg-background/30 rounded-lg border border-dashed border-border">
          No match rules defined. This scenario will be triggered as a fallback if no other rules match.
        </div>
      ) : (
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {rules.map((rule, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-background/50 p-2 rounded-lg border border-border/60 animate-fadeIn">
              
              {/* Source Selection */}
              <select
                value={rule.source}
                onChange={(e) => handleRuleChange(idx, "source", e.target.value)}
                className="h-8 bg-background border border-border rounded-md px-2 text-[11px] font-medium text-foreground focus:outline-none focus:border-primary transition-colors cursor-pointer w-28 shrink-0"
              >
                <option value="query">Query Param</option>
                <option value="header">Header</option>
                <option value="body">Full Body</option>
                <option value="jsonpath">JSONPath</option>
              </select>

              {/* Key/Expression Input */}
              {rule.source !== "body" && (
                <input
                  type="text"
                  value={rule.key}
                  onChange={(e) => handleRuleChange(idx, "key", e.target.value)}
                  placeholder={
                    rule.source === "jsonpath"
                      ? "$.user.id"
                      : rule.source === "header"
                      ? "Authorization"
                      : "userId"
                  }
                  className="h-8 bg-background border border-border rounded-md px-2 text-xs focus:outline-none focus:border-primary transition-colors flex-1 min-w-0"
                />
              )}
              {rule.source === "body" && (
                <div className="flex-1 text-[10px] text-muted-foreground/80 px-2 italic font-mono truncate select-none">
                  Request body
                </div>
              )}

              {/* Operator Selection */}
              <select
                value={rule.operator}
                onChange={(e) => handleRuleChange(idx, "operator", e.target.value)}
                className="h-8 bg-background border border-border rounded-md px-2 text-[11px] font-medium text-foreground focus:outline-none focus:border-primary transition-colors cursor-pointer w-24 shrink-0"
              >
                <option value="equals">Equals</option>
                <option value="contains">Contains</option>
                <option value="regex">Regex</option>
                <option value="exists">Exists</option>
              </select>

              {/* Expected Value Input */}
              {rule.operator !== "exists" ? (
                <input
                  type="text"
                  value={rule.value}
                  onChange={(e) => handleRuleChange(idx, "value", e.target.value)}
                  placeholder="Value / Expected"
                  className="h-8 bg-background border border-border rounded-md px-2 text-xs focus:outline-none focus:border-primary transition-colors flex-1 min-w-0"
                />
              ) : (
                <div className="flex-1 text-[10px] text-muted-foreground/80 px-2 italic select-none">
                  (Presence checked)
                </div>
              )}

              {/* Delete Button */}
              <button
                type="button"
                onClick={() => handleRemoveRule(idx)}
                className="p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all duration-150 shrink-0"
              >
                <Trash className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
