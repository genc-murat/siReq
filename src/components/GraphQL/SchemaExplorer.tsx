import { useState, useMemo } from "react";
import type { GraphQLSchema, GraphQLNamedType, GraphQLField, GraphQLArgument } from "graphql";
import { isObjectType, isScalarType, isEnumType, isInterfaceType, isUnionType, isInputObjectType } from "graphql";
import { cn } from "@/lib/utils";

interface SchemaExplorerProps {
  schema: GraphQLSchema | null;
  onSelectField?: (typeName: string, fieldName: string) => void;
}

function formatType(type: { toString(): string }): string {
  return type.toString();
}

function ArgList({ args }: { args: readonly GraphQLArgument[] }) {
  if (args.length === 0) return null;
  return (
    <span className="text-muted-foreground/60">
      {"("}
      {args.map((a, i) => (
        <span key={a.name}>
          <span className="text-primary/70">{a.name}</span>
          <span className="text-muted-foreground/40">: </span>
          <span className="text-amber-500/80">{formatType(a.type)}</span>
          {i < args.length - 1 && <span className="text-muted-foreground/40">, </span>}
        </span>
      ))}
      {")"}
    </span>
  );
}

function FieldRow({
  field,
  typeName,
  onSelectField,
}: {
  field: GraphQLField<unknown, unknown>;
  typeName: string;
  onSelectField?: (typeName: string, fieldName: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDescription = !!field.description;

  return (
    <div className="group">
      <button
        className="w-full flex items-start gap-1.5 px-2 py-1 rounded hover:bg-accent/40 transition-colors text-left"
        onClick={() => {
          setExpanded((p) => !p);
          onSelectField?.(typeName, field.name);
        }}
      >
        <span className="text-[10px] text-primary/50 mt-0.5 font-mono shrink-0">→</span>
        <span className="text-[11px] font-mono text-foreground/85">{field.name}</span>
        <ArgList args={field.args} />
        <span className="text-muted-foreground/40 text-[10px] ml-1">: </span>
        <span className="text-amber-500/80 text-[10px] font-mono">{formatType(field.type)}</span>
      </button>
      {expanded && hasDescription && (
        <div className="ml-7 mb-1 text-[10px] text-muted-foreground/60 italic px-1">
          {field.description}
        </div>
      )}
    </div>
  );
}

function TypeSection({
  label,
  type,
  defaultExpanded = false,
  onSelectField,
}: {
  label: string;
  type: GraphQLNamedType | null | undefined;
  defaultExpanded?: boolean;
  onSelectField?: (typeName: string, fieldName: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!type || !isObjectType(type)) return null;

  const fields = Object.values(type.getFields());

  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-accent/30 transition-colors text-left"
      >
        <svg
          className={cn("h-2.5 w-2.5 text-primary shrink-0 transition-transform", expanded && "rotate-90")}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        <span className="text-[11px] font-semibold text-primary">{label}</span>
        <span className="ml-auto text-[10px] text-muted-foreground/40 tabular-nums">{fields.length}</span>
      </button>
      {expanded && (
        <div className="ml-3 border-l border-border/40 pb-1">
          {fields.map((f) => (
            <FieldRow key={f.name} field={f} typeName={type.name} onSelectField={onSelectField} />
          ))}
        </div>
      )}
    </div>
  );
}

function OtherTypesSection({
  types,
  searchQuery,
}: {
  types: GraphQLNamedType[];
  searchQuery: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => {
    if (!searchQuery) return types;
    const q = searchQuery.toLowerCase();
    return types.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (isObjectType(t) &&
          Object.keys(t.getFields()).some((f) => f.toLowerCase().includes(q)))
    );
  }, [types, searchQuery]);

  if (filtered.length === 0) return null;

  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-accent/30 transition-colors text-left"
      >
        <svg
          className={cn("h-2.5 w-2.5 text-muted-foreground shrink-0 transition-transform", expanded && "rotate-90")}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        <span className="text-[11px] font-semibold text-muted-foreground">Types</span>
        <span className="ml-auto text-[10px] text-muted-foreground/40 tabular-nums">{filtered.length}</span>
      </button>
      {expanded && (
        <div className="ml-3 pb-1">
          {filtered.map((t) => (
            <IndividualType key={t.name} type={t} searchQuery={searchQuery} />
          ))}
        </div>
      )}
    </div>
  );
}

function IndividualType({
  type,
  searchQuery,
}: {
  type: GraphQLNamedType;
  searchQuery: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const fields = useMemo(() => {
    if (isObjectType(type) || isInterfaceType(type) || isInputObjectType(type)) {
      const all = Object.values(type.getFields());
      if (!searchQuery) return all;
      const q = searchQuery.toLowerCase();
      return all.filter((f) => f.name.toLowerCase().includes(q));
    }
    return [];
  }, [type, searchQuery]);

  const typeKind = isScalarType(type)
    ? "scalar"
    : isEnumType(type)
    ? "enum"
    : isUnionType(type)
    ? "union"
    : isInterfaceType(type)
    ? "interface"
    : isInputObjectType(type)
    ? "input"
    : "type";

  const kindColor: Record<string, string> = {
    scalar: "text-blue-500/70",
    enum: "text-purple-500/70",
    union: "text-orange-500/70",
    interface: "text-cyan-500/70",
    input: "text-green-500/70",
    type: "text-foreground/60",
  };

  return (
    <div className="border-l border-border/40 ml-1">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-accent/20 transition-colors text-left"
      >
        <svg
          className={cn("h-2.5 w-2.5 text-muted-foreground/40 shrink-0 transition-transform", expanded && "rotate-90")}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        <span className="text-[10px] font-mono text-foreground/70">{type.name}</span>
        <span className={cn("ml-1 text-[9px]", kindColor[typeKind])}>{typeKind}</span>
      </button>
      {expanded && fields.length > 0 && (
        <div className="ml-4 border-l border-border/30 pb-1">
          {fields.map((f) => (
            <div key={f.name} className="flex items-center gap-1 px-2 py-0.5">
              <span className="text-[10px] font-mono text-foreground/70">{f.name}</span>
              <span className="text-muted-foreground/30 text-[10px]">:</span>
              <span className="text-amber-500/70 text-[10px] font-mono">{formatType(f.type)}</span>
            </div>
          ))}
        </div>
      )}
      {expanded && isEnumType(type) && (
        <div className="ml-4 border-l border-border/30 pb-1">
          {type.getValues().map((v) => (
            <div key={v.name} className="px-2 py-0.5">
              <span className="text-[10px] font-mono text-purple-400/80">{v.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Schema Explorer — displays Query, Mutation, Subscription root types and all
 * other named types in a collapsible tree with search/filter.
 *
 * Requirements 4.3, 4.7, 4.8
 */
export function SchemaExplorer({ schema, onSelectField }: SchemaExplorerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const otherTypes = useMemo(() => {
    if (!schema) return [];
    const queryType = schema.getQueryType();
    const mutationType = schema.getMutationType();
    const subscriptionType = schema.getSubscriptionType();

    const rootNames = new Set([
      queryType?.name,
      mutationType?.name,
      subscriptionType?.name,
    ].filter(Boolean));

    return Object.values(schema.getTypeMap()).filter(
      (t) =>
        !t.name.startsWith("__") &&
        !rootNames.has(t.name) &&
        !["String", "Int", "Float", "Boolean", "ID"].includes(t.name)
    );
  }, [schema]);

  if (!schema) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
        <svg className="h-10 w-10 text-muted-foreground/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        <p className="text-[11px] text-muted-foreground/50 text-center">
          Click <span className="font-semibold text-foreground/50">Introspect</span> to load schema,<br />
          or paste SDL manually.
        </p>
      </div>
    );
  }

  const filteredOther = searchQuery
    ? otherTypes.filter(
        (t) =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (isObjectType(t) &&
            Object.keys(t.getFields()).some((f) =>
              f.toLowerCase().includes(searchQuery.toLowerCase())
            ))
      )
    : otherTypes;

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="shrink-0 px-3 py-1.5 border-b border-border/40">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter types & fields…"
            className="w-full bg-accent/40 text-[11px] text-foreground placeholder:text-muted-foreground/30 pl-7 pr-2 py-1.5 rounded border border-border/40 focus:outline-none focus:border-primary/50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-foreground/60"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
        <TypeSection
          label="Query"
          type={schema.getQueryType()}
          defaultExpanded={true}
          onSelectField={onSelectField}
        />
        <TypeSection
          label="Mutation"
          type={schema.getMutationType()}
          onSelectField={onSelectField}
        />
        <TypeSection
          label="Subscription"
          type={schema.getSubscriptionType()}
          onSelectField={onSelectField}
        />
        <OtherTypesSection types={filteredOther} searchQuery={searchQuery} />
      </div>
    </div>
  );
}
