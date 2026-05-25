import { useRequestStore } from "@/stores/requestStore";
import { CodeMirrorEditor } from "@/components/CodeMirrorEditor";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export function SchemaTab() {
  const jsonSchema = useRequestStore((s) => s.request.json_schema);
  const setJsonSchema = useRequestStore((s) => s.setJsonSchema);

  const isValid = useMemo(() => {
    if (!jsonSchema?.trim()) return null;
    try {
      JSON.parse(jsonSchema);
      return true;
    } catch {
      return false;
    }
  }, [jsonSchema]);

  return (
    <div className="h-full flex flex-col gap-3 p-1">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
        <div className="p-1 rounded-lg bg-muted/30 ring-1 ring-border/30">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <span>Paste a JSON Schema to validate response bodies against it.</span>
        {jsonSchema?.trim() && (
          <span className={cn(
            "ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-lg",
            isValid ? "bg-green-500/10 text-green-500 ring-1 ring-green-500/20" : "bg-red-500/10 text-red-500 ring-1 ring-red-500/20"
          )}>
            {isValid ? "Valid JSON" : "Invalid JSON"}
          </span>
        )}
      </div>

      {/* Quick templates */}
      <div className="flex flex-wrap gap-1 shrink-0">
        <button
          onClick={() => {
            setJsonSchema(`{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "name"],
  "properties": {
    "id": { "type": "integer" },
    "name": { "type": "string" },
    "email": { "type": "string", "format": "email" }
  }
}`);
          }}
          className="text-[9px] px-2 py-1 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent hover:border-border transition-all duration-150"
        >
          Basic object
        </button>
        <button
          onClick={() => {
            setJsonSchema(`{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id"],
    "properties": {
      "id": { "type": "integer" },
      "name": { "type": "string" }
    }
  }
}`);
          }}
          className="text-[9px] px-2 py-1 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent hover:border-border transition-all duration-150"
        >
          Array of objects
        </button>
        <button
          onClick={() => {
            setJsonSchema(`{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "items": {
          "type": "array",
          "items": { "type": "object" }
        },
        "total": { "type": "integer" },
        "page": { "type": "integer" }
      },
      "required": ["items"]
    },
    "error": { "type": "string" }
  }
}`);
          }}
          className="text-[9px] px-2 py-1 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent hover:border-border transition-all duration-150"
        >
          Paginated API
        </button>
        <button
          onClick={() => setJsonSchema("")}
          className="text-[9px] px-2 py-1 rounded-lg border border-border/50 text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-all duration-150"
        >
          Clear
        </button>
      </div>

      {/* Schema editor */}
      <div className="flex-1 min-h-0 border rounded-lg overflow-hidden">
        <CodeMirrorEditor
          value={jsonSchema}
          onChange={setJsonSchema}
          language="json"
          placeholder={`{\n  "$schema": "http://json-schema.org/draft-07/schema#",\n  "type": "object",\n  "properties": {\n    "id": { "type": "integer" },\n    "name": { "type": "string" }\n  },\n  "required": ["id", "name"]\n}`}
        />
      </div>
    </div>
  );
}
