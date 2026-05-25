import type { KeyValue } from "@/lib/invoke";

interface KeyValueEditorProps {
  pairs: KeyValue[];
  onChange: (pairs: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: KeyValueEditorProps) {
  const add = () =>
    onChange([...pairs, { key: "", value: "", enabled: true }]);

  const remove = (index: number) => onChange(pairs.filter((_, i) => i !== index));

  const update = (index: number, field: keyof KeyValue, value: string | boolean) =>
    onChange(pairs.map((p, i) => (i === index ? { ...p, [field]: value } : p)));

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
            className="flex-1 bg-background text-foreground text-xs px-2 py-1 rounded border border-input focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            type="text"
            value={pair.value}
            onChange={(e) => update(i, "value", e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-1 bg-background text-foreground text-xs px-2 py-1 rounded border border-input focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={() => remove(i)}
            className="text-muted-foreground hover:text-destructive shrink-0 p-1"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="text-xs text-primary hover:underline self-start mt-1"
      >
        + Add
      </button>
    </div>
  );
}
