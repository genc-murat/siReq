import { useState } from "react";
import type { KeyValue } from "@/lib/invoke";

interface KeyValueEditorProps {
  pairs: KeyValue[];
  onChange: (pairs: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  showSecretToggle?: boolean;
}

export function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  showSecretToggle = false,
}: KeyValueEditorProps) {
  const [hiddenSecrets, setHiddenSecrets] = useState<Record<number, boolean>>({});

  const add = () =>
    onChange([...pairs, { key: "", value: "", enabled: true }]);

  const remove = (index: number) => onChange(pairs.filter((_, i) => i !== index));

  const update = (index: number, field: keyof KeyValue, value: string | boolean) =>
    onChange(pairs.map((p, i) => (i === index ? { ...p, [field]: value } : p)));

  const toggleSecret = (index: number) => {
    const newHidden = { ...hiddenSecrets };
    newHidden[index] = !newHidden[index];
    setHiddenSecrets(newHidden);
  };

  const isSecretHidden = (index: number, pair: KeyValue) => {
    if (!pair.is_secret) return false;
    return hiddenSecrets[index] !== false; // Default hidden for secrets
  };

  return (
    <div className="flex flex-col gap-1">
      {pairs.map((pair, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={pair.enabled}
            onChange={(e) => update(i, "enabled", e.target.checked)}
            className="shrink-0 accent-primary"
          />
          <input
            type="text"
            value={pair.key}
            onChange={(e) => update(i, "key", e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 bg-background text-foreground text-xs px-2 py-1 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
          />
          <div className="flex-1 flex items-center gap-1">
            <input
              type={isSecretHidden(i, pair) ? "password" : "text"}
              value={pair.value}
              onChange={(e) => update(i, "value", e.target.value)}
              placeholder={valuePlaceholder}
              className="w-full bg-background text-foreground text-xs px-2 py-1 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
            />
            {showSecretToggle && (
              <button
                onClick={() => toggleSecret(i)}
                className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
                title={pair.is_secret ? "Mark as plain text" : "Mark as secret"}
              >
                {pair.is_secret ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            )}
            {isSecretHidden(i, pair) && (
              <button
                onClick={() => {
                  const newHidden = { ...hiddenSecrets };
                  newHidden[i] = false;
                  setHiddenSecrets(newHidden);
                }}
                className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
                title="Reveal secret"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={() => remove(i)}
            className="text-muted-foreground hover:text-destructive shrink-0 p-1 rounded-lg hover:bg-destructive/10 transition-all duration-150"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="text-xs font-medium px-2 py-1 rounded-lg text-primary hover:bg-primary/10 transition-all duration-150 self-start mt-1"
      >
        + Add
      </button>
    </div>
  );
}
