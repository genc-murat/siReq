import { CodeMirrorEditor } from "@/components/CodeMirrorEditor";
import { cn } from "@/lib/utils";

function isValidJson(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "{}") return true;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

interface VariablesEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Variables editor for GraphQL — wraps CodeMirrorEditor with JSON validation.
 * Shows a red border when JSON is invalid (Property 6).
 */
export function VariablesEditor({ value, onChange }: VariablesEditorProps) {
  // Derive validity from value directly to avoid setState-in-effect lint warning
  const isValid = isValidJson(value);

  return (
    <div
      className={cn(
        "h-full w-full border rounded overflow-hidden transition-colors duration-150",
        !isValid ? "border-destructive ring-1 ring-destructive/30" : "border-border"
      )}
    >
      <CodeMirrorEditor
        value={value}
        onChange={onChange}
        language="json"
      />
    </div>
  );
}

/**
 * Export for tests: check if variables JSON is valid.
 */
// eslint-disable-next-line react-refresh/only-export-components
export { isValidJson as isValidVariablesJson };
