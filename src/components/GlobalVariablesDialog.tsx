import { useEffect, useState } from "react";
import { getGlobalVariables, saveGlobalVariables, encryptSecretValue, decryptSecretValue } from "@/lib/invoke";
import type { KeyValue, GlobalVariables } from "@/lib/invoke";
import { KeyValueEditor } from "@/components/Request/KeyValueEditor";
import { useToastStore } from "@/stores/toastStore";

interface GlobalVariablesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalVariablesDialog({ open, onClose }: GlobalVariablesDialogProps) {
  const [globalVars, setGlobalVars] = useState<KeyValue[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [originalState, setOriginalState] = useState<GlobalVariables | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getGlobalVariables()
      .then(async (gv) => {
        // Decrypt any secret values that were stored encrypted
        const decrypted = await Promise.all(
          gv.variables.map(async (v) => {
            if (v.is_secret && v.value.startsWith("$enc$")) {
              try {
                const decrypted = await decryptSecretValue(v.value.slice(5));
                return { ...v, value: decrypted };
              } catch {
                return v; // Keep as-is if decryption fails
              }
            }
            return v;
          })
        );
        setGlobalVars(decrypted);
        setOriginalState(gv);
        setLoading(false);
      })
      .catch((e) => {
        addToast(`Failed to load global variables: ${e}`, "error");
        setLoading(false);
      });
  }, [open, addToast]);

  const handleSave = async () => {
    if (!originalState) return;
    setSaving(true);
    try {
      // Encrypt any new secret values before saving
      const encryptedVars = await Promise.all(
        globalVars.map(async (v) => {
          if (v.is_secret && v.value && !v.value.startsWith("$enc$")) {
            const encrypted = await encryptSecretValue(v.value);
            return { ...v, value: `$enc$${encrypted}` };
          }
          return v;
        })
      );

      await saveGlobalVariables({
        ...originalState,
        variables: encryptedVars,
        updated_at: new Date().toISOString(),
      });
      addToast("Global variables saved", "success");
      onClose();
    } catch (e) {
      addToast(`Failed to save global variables: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (vars: KeyValue[]) => {
    setGlobalVars(vars);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-popover border rounded-xl shadow-xl w-[520px] max-h-[80vh] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            <h2 className="text-sm font-semibold text-foreground">Global Variables</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition-all duration-150"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="h-5 w-5 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Global variables are available to all requests. Use {"{{variableName}}"} to reference them.
                Variables are resolved in this order: <span className="font-medium text-foreground">dynamic &gt; global &gt; collection &gt; environment &gt; script</span>.
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p><span className="font-mono text-primary">{"{{$timestamp}}"}</span> — Current Unix timestamp (ms)</p>
                <p><span className="font-mono text-primary">{"{{$uuid}}"}</span> — Random UUID v4</p>
                <p><span className="font-mono text-primary">{"{{$randomInt}}"}</span> — Random integer 0–1000</p>
                <p><span className="font-mono text-primary">{"{{$randomInt N,M}}"}</span> — Random integer in range</p>
                <p><span className="font-mono text-primary">{"{{$randomString}}"}</span> — Random 8-char alphanumeric</p>
                <p><span className="font-mono text-primary">{"{{$randomEmail}}"}</span> — Random email</p>
              </div>
              <div className="border-t pt-3">
                <KeyValueEditor
                  pairs={globalVars}
                  onChange={handleChange}
                  keyPlaceholder="Variable name"
                  valuePlaceholder="Value"
                  showSecretToggle={true}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-150 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
