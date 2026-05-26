import { useCallback, useMemo } from "react";
import type { GrpcFieldInfo } from "@/lib/invoke";

// ─── Helper: build default values from field definitions ──────────────────

function buildFieldDefault(field: GrpcFieldInfo): unknown {
  if (field.is_map) return {};
  if (field.label === "repeated") return [];

  switch (field.field_type) {
    case "string":
    case "bytes":
      return "";
    case "bool":
      return false;
    case "int32":
    case "int64":
    case "uint32":
    case "uint64":
    case "sint32":
    case "sint64":
    case "fixed32":
    case "fixed64":
    case "sfixed32":
    case "sfixed64":
      return 0;
    case "double":
    case "float":
      return 0.0;
    default:
      // Message or enum type
      if (field.sub_fields.length > 0) {
        return buildDefaultValues(field.sub_fields);
      }
      if (field.enum_values.length > 0) {
        return field.enum_values[0];
      }
      return "";
  }
}

export function buildDefaultValues(fields: GrpcFieldInfo[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const f of fields) {
    obj[f.name] = buildFieldDefault(f);
  }
  return obj;
}

// ─── Field Editors ────────────────────────────────────────────────────────

function isNumericType(t: string) {
  return [
    "int32", "int64", "uint32", "uint64", "sint32", "sint64",
    "fixed32", "fixed64", "sfixed32", "sfixed64",
    "double", "float",
  ].includes(t);
}

function ScalarField({
  field,
  value,
  onChange,
}: {
  field: GrpcFieldInfo;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.field_type === "bool") {
    return (
      <label className="flex items-center gap-2 cursor-pointer select-none py-0.5">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-border h-3.5 w-3.5 accent-primary"
        />
        <span className="text-xs text-foreground/80">{field.name}</span>
      </label>
    );
  }

  if (field.field_type === "bytes") {
    return (
      <input
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder="base64-encoded bytes"
        className="w-full bg-transparent text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 border border-border/40 rounded px-2 py-1 focus:outline-none focus:border-primary/50 transition-colors"
        spellCheck={false}
      />
    );
  }

  if (isNumericType(field.field_type)) {
    const isFloat = field.field_type === "double" || field.field_type === "float";
    return (
      <input
        type="number"
        value={value as number}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(isFloat ? 0.0 : 0);
          } else {
            onChange(isFloat ? parseFloat(raw) : parseInt(raw, 10));
          }
        }}
        step={isFloat ? "0.1" : "1"}
        className="w-full bg-transparent text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 border border-border/40 rounded px-2 py-1 focus:outline-none focus:border-primary/50 transition-colors"
      />
    );
  }

  // Default: string / text
  return (
    <input
      type="text"
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`Enter ${field.name}...`}
      className="w-full bg-transparent text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 border border-border/40 rounded px-2 py-1 focus:outline-none focus:border-primary/50 transition-colors"
      spellCheck={false}
    />
  );
}

function EnumField({
  field,
  value,
  onChange,
}: {
  field: GrpcFieldInfo;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const current = String(value ?? field.enum_values[0] ?? "");
  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-transparent text-[12px] font-mono text-foreground border border-border/40 rounded px-2 py-1 focus:outline-none focus:border-primary/50 transition-colors"
    >
      {field.enum_values.map((ev) => (
        <option key={ev} value={ev} className="bg-background">
          {ev}
        </option>
      ))}
    </select>
  );
}

// ─── Repeated Field Editor ────────────────────────────────────────────────

function RepeatedField({
  field,
  value,
  onChange,
}: {
  field: GrpcFieldInfo;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const arr = (value as unknown[]) ?? [];

  const addItem = useCallback(() => {
    // Override label to "optional" so buildFieldDefault doesn't hit the repeated guard and return []
    onChange([...arr, buildFieldDefault({ ...field, label: "optional" })]);
  }, [arr, field, onChange]);

  const removeItem = useCallback((idx: number) => {
    onChange(arr.filter((_, i) => i !== idx));
  }, [arr, onChange]);

  const updateItem = useCallback((idx: number, val: unknown) => {
    onChange(arr.map((v, i) => (i === idx ? val : v)));
  }, [arr, onChange]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {field.name} <span className="text-muted-foreground/50">[{arr.length}]</span>
        </span>
        <button
          onClick={addItem}
          className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-all font-medium ml-auto"
        >
          + Add
        </button>
      </div>
      {arr.length === 0 && (
        <div className="text-[11px] text-muted-foreground/40 italic px-1">Empty list</div>
      )}
      {arr.map((item, idx) => (
        <div key={idx} className="flex items-start gap-1.5 pl-2 border-l-2 border-border/30">
          <div className="flex-1 min-w-0">
            <ProtoFieldInner
              field={{ ...field, label: "optional" }}
              value={item}
              onChange={(v) => updateItem(idx, v)}
            />
          </div>
          <button
            onClick={() => removeItem(idx)}
            className="shrink-0 mt-1 text-muted-foreground/30 hover:text-destructive transition-colors text-[10px]"
            title={`Remove item ${idx + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Map Field Editor ─────────────────────────────────────────────────────

function MapField({
  field,
  value,
  onChange,
}: {
  field: GrpcFieldInfo;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const map = (value as Record<string, unknown>) ?? {};

  // Map entries are stored as a repeated message with "key" and "value" fields
  const entries = useMemo(() => Object.entries(map), [map]);

  const addEntry = useCallback(() => {
    onChange({ ...map, "": "" });
  }, [map, onChange]);

  const updateEntry = useCallback((oldKey: string, newKey: string, val: unknown) => {
    const next = { ...map };
    delete next[oldKey];
    next[newKey] = val;
    onChange(next);
  }, [map, onChange]);

  const removeEntry = useCallback((key: string) => {
    const next = { ...map };
    delete next[key];
    onChange(next);
  }, [map, onChange]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {field.name} <span className="text-muted-foreground/50">[{entries.length}]</span>
        </span>
        <button
          onClick={addEntry}
          className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-all font-medium ml-auto"
        >
          + Add Entry
        </button>
      </div>
      {entries.length === 0 && (
        <div className="text-[11px] text-muted-foreground/40 italic px-1">Empty map</div>
      )}
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-start gap-1.5 pl-2 border-l-2 border-border/30">
          <div className="flex-1 grid grid-cols-[1fr_2fr] gap-1.5">
            <input
              type="text"
              value={k}
              onChange={(e) => updateEntry(k, e.target.value, v)}
              placeholder="key"
              className="w-full bg-transparent text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 border border-border/40 rounded px-2 py-1 focus:outline-none focus:border-primary/50 transition-colors"
              spellCheck={false}
            />
            <input
              type="text"
              value={String(v ?? "")}
              onChange={(e) => updateEntry(k, k, e.target.value)}
              placeholder="value"
              className="w-full bg-transparent text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 border border-border/40 rounded px-2 py-1 focus:outline-none focus:border-primary/50 transition-colors"
              spellCheck={false}
            />
          </div>
          <button
            onClick={() => removeEntry(k)}
            className="shrink-0 mt-1 text-muted-foreground/30 hover:text-destructive transition-colors text-[10px]"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Inner field editor (dispatches by type) ──────────────────────────────

function ProtoFieldInner({
  field,
  value,
  onChange,
}: {
  field: GrpcFieldInfo;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  // Map fields
  if (field.is_map) {
    return <MapField field={field} value={value} onChange={onChange} />;
  }

  // Repeated fields
  if (field.label === "repeated") {
    return <RepeatedField field={field} value={value} onChange={onChange} />;
  }

  // Enum fields
  if (field.enum_values.length > 0) {
    return <EnumField field={field} value={value} onChange={onChange} />;
  }

  // Nested message fields
  if (field.sub_fields.length > 0) {
    return (
      <div className="border border-border/30 rounded overflow-hidden">
        <ProtoFormBuilder
          fields={field.sub_fields}
          values={value as Record<string, unknown>}
          onChange={onChange}
        />
      </div>
    );
  }

  // Scalar fields
  return <ScalarField field={field} value={value} onChange={onChange} />;
}

// ─── Form Builder (top-level per message) ─────────────────────────────────

export function ProtoFormBuilder({
  fields,
  values,
  onChange,
}: {
  fields: GrpcFieldInfo[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}) {
  const handleFieldChange = useCallback((fieldName: string, fieldValue: unknown) => {
    onChange({ ...values, [fieldName]: fieldValue });
  }, [values, onChange]);

  return (
    <div className="flex flex-col gap-1.5">
      {fields.map((field) => {
        const isBool = field.field_type === "bool";

        // For bool fields, show the checkbox inline (no separate label row)
        if (isBool) {
          return (
            <div key={field.name} className="px-2 py-1.5 rounded hover:bg-accent/20 transition-colors">
              <ScalarField
                field={field}
                value={values[field.name]}
                onChange={(v) => handleFieldChange(field.name, v)}
              />
            </div>
          );
        }

        return (
          <div key={field.name} className="px-2 py-1.5 rounded hover:bg-accent/20 transition-colors">
            {!isBool && (
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[11px] font-medium text-foreground/80 font-mono">
                  {field.name}
                </span>
                <span className="text-[9px] text-muted-foreground/40 font-mono">
                  {field.label === "repeated" ? "repeated " : ""}
                  {field.field_type}
                  {field.label === "repeated" ? "[]" : ""}
                  {field.is_map ? "{…}" : ""}
                </span>
              </div>
            )}
            <ProtoFieldInner
              field={field}
              value={values[field.name]}
              onChange={(v) => handleFieldChange(field.name, v)}
            />
          </div>
        );
      })}
    </div>
  );
}
