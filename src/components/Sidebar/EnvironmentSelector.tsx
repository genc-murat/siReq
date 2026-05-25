import { useEffect, useState } from "react";
import { getEnvironments, createEnvironment, deleteEnvironment, updateEnvironment } from "@/lib/invoke";
import type { Environment, KeyValue } from "@/lib/invoke";
import { useUIStore } from "@/stores/uiStore";
import { KeyValueEditor } from "@/components/Request/KeyValueEditor";
import { cn } from "@/lib/utils";

export function EnvironmentSelector() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const activeEnvironmentId = useUIStore((s) => s.activeEnvironmentId);
  const setActiveEnvironmentId = useUIStore((s) => s.setActiveEnvironmentId);

  useEffect(() => {
    getEnvironments().then(setEnvironments);
  }, []);

  const create = async () => {
    if (!newName.trim()) return;
    const env = await createEnvironment(newName.trim());
    setEnvironments((prev) => [...prev, env]);
    setNewName("");
  };

  const remove = async (id: string) => {
    await deleteEnvironment(id);
    setEnvironments((prev) => prev.filter((e) => e.id !== id));
    if (activeEnvironmentId === id) setActiveEnvironmentId(null);
    if (editingId === id) setEditingId(null);
  };

  const updateVars = async (env: Environment, variables: KeyValue[]) => {
    const updated = { ...env, variables };
    await updateEnvironment(updated);
    setEnvironments((prev) => prev.map((e) => (e.id === env.id ? updated : e)));
  };

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <select
          value={activeEnvironmentId ?? ""}
          onChange={(e) => setActiveEnvironmentId(e.target.value || null)}
          className="flex-1 bg-background text-foreground text-xs px-2 py-1 rounded-lg border border-input focus:outline-none focus-within:ring-1 focus-within:ring-ring transition-all duration-150"
        >
          <option value="">No Environment</option>
          {environments.map((env) => (
            <option key={env.id} value={env.id}>{env.name}</option>
          ))}
        </select>
        <button
          onClick={() => {
            if (activeEnv) setEditingId(editingId === activeEnv.id ? null : activeEnv.id);
          }}
          className={cn(
            "p-1.5 rounded-lg transition-all duration-150",
            editingId ? "text-primary bg-primary/10 ring-1 ring-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
          title="Edit environment"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>
      {editingId && activeEnv && activeEnv.id === editingId && (
        <div className="flex flex-col gap-1 pt-1">
          <div className="flex gap-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="New environment..."
              className="flex-1 bg-background text-foreground text-xs px-2 py-1 rounded-lg border border-input focus:outline-none focus-within:ring-1 focus-within:ring-ring transition-all duration-150"
            />
            <button onClick={create} className="px-2 py-1 text-xs font-medium rounded-lg text-primary hover:bg-primary/10 transition-all duration-150">Add</button>
            <button onClick={() => remove(activeEnv.id)} className="px-2 py-1 text-xs font-medium rounded-lg text-destructive hover:bg-destructive/10 transition-all duration-150">Del</button>
          </div>
          <KeyValueEditor
            pairs={activeEnv.variables}
            onChange={(vars) => updateVars(activeEnv, vars)}
            keyPlaceholder="Variable name"
            valuePlaceholder="Variable value"
          />
        </div>
      )}
      {!editingId && (
        <div className="flex gap-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="New environment..."
            className="flex-1 bg-background text-foreground text-xs px-2 py-1 rounded-lg border border-input focus:outline-none focus-within:ring-1 focus-within:ring-ring transition-all duration-150"
          />
          <button onClick={create} className="px-2 py-1 text-xs font-medium rounded-lg text-primary hover:bg-primary/10 transition-all duration-150">Add</button>
        </div>
      )}
    </div>
  );
}
