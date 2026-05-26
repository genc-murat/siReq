import { useRequestStore } from "@/stores/requestStore";
import { useMemo } from "react";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

interface ValidationError {
  path: string;
  message: string;
  schemaPath?: string;
}

function getPathFromSchemaPath(schemaPath: string): string {
  // "/properties/data/properties/items/type" -> "data.items"
  return schemaPath
    .split("/")
    .filter((s) => s && s !== "properties" && s !== "items" && s !== "additionalProperties" && s !== "definitions" && s !== "$defs")
    .join(".");
}

export function SchemaViewer() {
  const jsonSchema = useRequestStore((s) => s.request.json_schema);
  const response = useRequestStore((s) => s.response);

  const result = useMemo(() => {
    // No schema provided
    if (!jsonSchema.trim()) {
      return { state: "no-schema" as const };
    }

    // Try to parse schema
    let schema: object;
    try {
      schema = JSON.parse(jsonSchema);
    } catch {
      return { state: "invalid-schema" as const, error: "Schema is not valid JSON" };
    }

    // Check if response exists and is JSON
    if (!response) {
      return { state: "no-response" as const };
    }

    const contentTypeHeader = response.headers.find(
      ([k]) => k.toLowerCase() === "content-type"
    );
    const contentType = contentTypeHeader?.[1] ?? "";

    // Try to parse response body as JSON
    let data: unknown;
    try {
      data = JSON.parse(response.body);
    } catch {
      return {
        state: "not-json" as const,
        contentType,
        message: "Response body is not valid JSON. Schema validation requires a JSON response.",
      };
    }

    // Validate
    const validate = ajv.compile(schema);
    const valid = validate(data);

    if (valid) {
      return {
        state: "valid" as const,
      };
    }

    // Build detailed errors
    const errors: ValidationError[] = (validate.errors ?? []).map((err) => {
      let path = err.instancePath || "(root)";
      // Build a human-readable JSON path
      if (err.params && "missingProperty" in err.params) {
        path = err.instancePath
          ? `${err.instancePath}/${err.params.missingProperty}`
          : `/${String(err.params.missingProperty)}`;
      }
      return {
        path,
        message: err.message ?? "Unknown validation error",
        schemaPath: err.schemaPath,
      };
    });

    // Group errors by path for compact display
    const grouped: Record<string, ValidationError[]> = {};
    for (const err of errors) {
      if (!grouped[err.path]) grouped[err.path] = [];
      grouped[err.path].push(err);
    }

    return {
      state: "invalid" as const,
      errors,
      grouped,
      errorCount: errors.length,
    };
  }, [jsonSchema, response]);

  if (result.state === "no-schema") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4 text-center px-8">
          <div className="p-3 rounded-lg bg-muted/30 ring-1 ring-border/40">
            <svg className="h-8 w-8 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>No JSON Schema provided</p>
          </div>
          <p className="text-[10px] text-muted-foreground/60 max-w-xs">
            Go to the <span className="font-semibold text-foreground/60">Schema</span> tab in the request editor to paste a JSON Schema and validate responses.
          </p>
        </div>
      </div>
    );
  }

  if (result.state === "invalid-schema") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4 text-center px-8">
          <div className="p-3 rounded-lg bg-destructive/10 ring-1 ring-destructive/20">
            <svg className="h-8 w-8 text-destructive/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-destructive">Invalid JSON Schema</span>
          <span className="text-[10px] text-muted-foreground/60 max-w-xs">The schema could not be parsed. Check for syntax errors.</span>
        </div>
      </div>
    );
  }

  if (result.state === "no-response") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4 text-center px-8">
          <div className="p-3 rounded-lg bg-muted/30 ring-1 ring-border/40">
            <svg className="h-8 w-8 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-sm text-muted-foreground">No response to validate</span>
          <span className="text-[10px] text-muted-foreground/60 max-w-xs">Send a request to validate the response against the JSON Schema.</span>
        </div>
      </div>
    );
  }

  if (result.state === "not-json") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4 text-center px-8">
          <div className="p-3 rounded-lg bg-yellow-500/10 ring-1 ring-yellow-500/20">
            <svg className="h-8 w-8 text-yellow-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-yellow-500">Response is not JSON</span>
          <span className="text-[10px] text-muted-foreground/60 max-w-xs">
            Content-Type: {result.contentType || "none"}<br />
            Schema validation only works with JSON response bodies.
          </span>
        </div>
      </div>
    );
  }

  if (result.state === "valid") {
    return (
      <div className="flex items-center justify-center h-full animate-in fade-in duration-200">
        <div className="flex flex-col items-center gap-4 text-center px-8">
          <div className="p-3 rounded-lg bg-green-500/10 ring-1 ring-green-500/30">
            <svg className="h-7 w-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-base font-semibold text-green-500">Valid ✓</span>
          <span className="text-[11px] text-muted-foreground/70">
            Response matches the JSON Schema
          </span>
        </div>
      </div>
    );
  }

  // Invalid state
  const { grouped, errorCount } = result;

  return (
    <div className="h-full flex flex-col">
      {/* Summary header */}
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 border-b bg-destructive/5">
        <div className="p-1.5 rounded-lg bg-destructive/10 ring-1 ring-destructive/20">
          <svg className="h-4 w-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-destructive">
            {errorCount} validation error{errorCount !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            Response does not match the JSON Schema
          </span>
        </div>
      </div>

      {/* Error list */}
      <div className="flex-1 overflow-auto p-4 space-y-2.5">
        {Object.entries(grouped).map(([path, pathErrors]) => (
          <div
            key={path}
            className="border rounded-lg overflow-hidden"
          >
            <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/30 border-b text-xs font-mono text-muted-foreground">
              <div className="p-0.5 rounded bg-destructive/10">
                <svg className="h-3 w-3 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="font-semibold text-foreground">{path}</span>
              <span className="text-[9px] text-muted-foreground/50">
                {pathErrors.length} error{pathErrors.length !== 1 ? "s" : ""}
              </span>
            </div>
            {pathErrors.map((err, i) => (
              <div
                key={i}
                className="px-3 py-1.5 border-b last:border-0 hover:bg-accent/20 transition-all duration-150 text-xs flex items-start gap-2"
              >
                <span className="text-destructive/70 shrink-0 mt-0.5">•</span>
                <div className="flex-1 min-w-0">
                  <span className="text-foreground">{err.message}</span>
                  {err.schemaPath && (
                    <span className="block text-[9px] text-muted-foreground/50 mt-0.5 font-mono">
                      {getPathFromSchemaPath(err.schemaPath)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
