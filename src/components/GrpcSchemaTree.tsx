import { useState, useMemo } from "react";
import type { GrpcFieldInfo } from "@/lib/invoke";

// ─── Color-coded scalar value display ──────────────────────────────────────

function ScalarValue({ value, type }: { value: unknown; type: string }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/40 italic text-[11px]">null</span>;
  }
  if (typeof value === "string") {
    return <span className="text-emerald-600 dark:text-emerald-400">"{value}"</span>;
  }
  if (typeof value === "number") {
    return <span className="text-blue-600 dark:text-blue-400">{value}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-purple-600 dark:text-purple-400">{value ? "true" : "false"}</span>;
  }
  return <span className="text-foreground/60">{String(value)}</span>;
}

// ─── Type badge for a field ────────────────────────────────────────────────

function TypeBadge({ field }: { field: GrpcFieldInfo }) {
  const colorMap: Record<string, string> = {
    string: "bg-emerald-500/10 text-emerald-600",
    int32: "bg-blue-500/10 text-blue-600",
    int64: "bg-blue-500/10 text-blue-600",
    uint32: "bg-blue-500/10 text-blue-600",
    uint64: "bg-blue-500/10 text-blue-600",
    sint32: "bg-blue-500/10 text-blue-600",
    sint64: "bg-blue-500/10 text-blue-600",
    fixed32: "bg-blue-500/10 text-blue-600",
    fixed64: "bg-blue-500/10 text-blue-600",
    sfixed32: "bg-blue-500/10 text-blue-600",
    sfixed64: "bg-blue-500/10 text-blue-600",
    double: "bg-cyan-500/10 text-cyan-600",
    float: "bg-cyan-500/10 text-cyan-600",
    bool: "bg-purple-500/10 text-purple-600",
    bytes: "bg-orange-500/10 text-orange-600",
  };
  const color = colorMap[field.field_type] || (field.sub_fields.length > 0 || field.enum_values.length > 0
    ? "bg-violet-500/10 text-violet-600"
    : "bg-muted text-muted-foreground");

  return (
    <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${color}`}>
      {field.field_type}
      {field.is_map ? "{k,v}" : field.label === "repeated" ? "[]" : ""}
    </span>
  );
}

// ─── Recursive schema tree node ────────────────────────────────────────────

function GrpcSchemaTreeNode({
  field,
  value,
  depth = 0,
  defaultOpen = false,
}: {
  field: GrpcFieldInfo;
  value: unknown;
  depth?: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(depth < 2 || defaultOpen);

  const isExpandable = field.sub_fields.length > 0;
  const isEnum = field.enum_values.length > 0;
  const isRepeated = field.label === "repeated";
  const isMap = field.is_map;

  const renderValue = () => {
    // Repeated field — show array
    if (isRepeated && Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-muted-foreground/40 text-[11px] italic">[]</span>;
      }
      return (
        <div className="space-y-0.5">
          {value.map((item, idx) => (
            <div key={idx} className="flex gap-2">
              <span className="text-[10px] text-muted-foreground/40 font-mono shrink-0 w-5 text-right">[{idx}]</span>
              {isExpandable && typeof item === "object" && item !== null ? (
                <div className="flex-1">
                  {field.sub_fields.map((sf) => (
                    <GrpcSchemaTreeNode
                      key={sf.name}
                      field={sf}
                      value={(item as Record<string, unknown>)[sf.name]}
                      depth={depth + 1}
                    />
                  ))}
                </div>
              ) : (
                <ScalarValue value={item} type={field.field_type} />
              )}
            </div>
          ))}
        </div>
      );
    }

    // Map field
    if (isMap && typeof value === "object" && value !== null && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        return <span className="text-muted-foreground/40 text-[11px] italic">{}</span>;
      }
      return (
        <div className="space-y-0.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-1.5 pl-4">
              <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">"{k}"</span>
              <span className="text-muted-foreground/30">→</span>
              <ScalarValue value={v} type={field.field_type} />
            </div>
          ))}
        </div>
      );
    }

    // Expandable message type
    if (isExpandable && typeof value === "object" && value !== null && !Array.isArray(value)) {
      return (
        <div className="pl-2 border-l border-border/40 ml-0.5 mt-0.5 space-y-0.5">
          {field.sub_fields.map((sf) => (
            <GrpcSchemaTreeNode
              key={sf.name}
              field={sf}
              value={(value as Record<string, unknown>)[sf.name]}
              depth={depth + 1}
            />
          ))}
        </div>
      );
    }

    // Null value for an expandable type
    if (isExpandable) {
      return <span className="text-muted-foreground/40 text-[11px] italic">null</span>;
    }

    // Enum — show value + available enum options
    if (isEnum) {
      return (
        <div className="flex items-center gap-1.5 flex-wrap">
          <ScalarValue value={value} type={field.field_type} />
          {field.enum_values.length > 0 && (
            <span className="text-[9px] text-muted-foreground/40" title={field.enum_values.join(", ")}>
              ({field.enum_values.join(" | ")})
            </span>
          )}
        </div>
      );
    }

    // Scalar
    return <ScalarValue value={value} type={field.field_type} />;
  };

  return (
    <div>
      <div
        className="flex items-start gap-1.5 py-0.5 px-1 rounded hover:bg-accent/30 transition-colors group cursor-default"
        onClick={isExpandable ? () => setOpen(!open) : undefined}
      >
        {/* Expand/collapse chevron for message types */}
        {isExpandable ? (
          <svg
            className={`h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/40 transition-transform ${open ? "rotate-90" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M6 4l8 6-8 6V4z" />
          </svg>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Field name */}
        <span className="text-[12px] font-mono font-medium text-foreground/90 shrink-0">
          {field.name}
        </span>

        {/* Type badge */}
        <TypeBadge field={field} />

        {/* Label badge (repeated/optional) */}
        {field.label === "repeated" && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 font-mono uppercase tracking-wider">
            repeated
          </span>
        )}
        {field.label === "optional" && !isMap && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono uppercase tracking-wider">
            optional
          </span>
        )}
        {field.is_map && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-600 font-mono uppercase tracking-wider">
            map
          </span>
        )}

        {/* Value — shown inline only for non-expandable */}
        {!isExpandable && <span className="flex-1 min-w-0 text-[11px] font-mono leading-snug break-all">{renderValue()}</span>}
      </div>

      {/* Children — shown when expanded */}
      {isExpandable && open && (
        <div className="ml-1">
          {renderValue()}
        </div>
      )}
    </div>
  );
}

// ─── Response Schema Tree View wrapper ─────────────────────────────────────

export function ResponseSchemaTreeView({
  fields,
  body,
}: {
  fields: GrpcFieldInfo[];
  body: string;
}) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }, [body]);

  // No body
  if (!body || body.trim() === "") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[11px] text-muted-foreground/40 italic">(empty response body)</span>
      </div>
    );
  }

  // Not valid JSON — can't render tree
  if (parsed === null) {
    return (
      <div className="flex-1 p-3">
        <span className="text-[11px] text-muted-foreground/60">Response is not valid JSON — switch to Raw view</span>
      </div>
    );
  }

  // No fields schema available
  if (!fields || fields.length === 0) {
    return (
      <div className="flex-1 p-3 overflow-y-auto">
        <GrpcSchemaTreeNode
          field={{
            name: "(root)",
            field_type: "message",
            label: "",
            is_map: false,
            sub_fields: [],
            enum_values: [],
          }}
          value={parsed}
          defaultOpen={true}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
      {fields.map((f) => (
        <GrpcSchemaTreeNode
          key={f.name}
          field={f}
          value={(parsed as Record<string, unknown>)[f.name]}
          defaultOpen={true}
        />
      ))}
    </div>
  );
}
