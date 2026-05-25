import { useEffect, useState, useRef } from "react";
import { getEnvironments, createEnvironment, deleteEnvironment, updateEnvironment } from "@/lib/invoke";
import type { Environment, KeyValue } from "@/lib/invoke";
import { useUIStore } from "@/stores/uiStore";
import { KeyValueEditor } from "@/components/Request/KeyValueEditor";
import { cn } from "@/lib/utils";

export function EnvironmentSelector() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const activeEnvironmentId = useUIStore((s) => s.activeEnvironmentId);
  const setActiveEnvironmentId = useUIStore((s) => s.setActiveEnvironmentId);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const newNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getEnvironments().then(setEnvironments);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    // Delay to avoid the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [dropdownOpen]);    // Close dropdown on Escape (first cancel creation, then close dropdown)
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (creating) {
          setCreating(false);
          setNewName("");
        } else {
          setDropdownOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dropdownOpen, creating]);

  // Auto-focus the new environment name input when creating
  useEffect(() => {
    if (creating) {
      newNameInputRef.current?.focus();
    }
  }, [creating]);

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId);
  const enabledCount = (vars: KeyValue[]) => vars.filter((v) => v.enabled).length;
  const disabledCount = (vars: KeyValue[]) => vars.filter((v) => !v.enabled).length;

  const create = async () => {
    if (!newName.trim()) return;
    const env = await createEnvironment(newName.trim());
    setEnvironments((prev) => [...prev, env]);
    setActiveEnvironmentId(env.id);
    setEditingId(env.id);
    setNewName("");
    setCreating(false);
  };

  const closeEditor = () => {
    setEditingId(null);
    setRenamingId(null);
    setEditingName("");
  };

  const remove = async (id: string) => {
    await deleteEnvironment(id);
    setEnvironments((prev) => prev.filter((e) => e.id !== id));
    if (activeEnvironmentId === id) setActiveEnvironmentId(null);
    if (editingId === id) closeEditor();
  };

  const updateVars = async (env: Environment, variables: KeyValue[]) => {
    const updated = { ...env, variables };
    await updateEnvironment(updated);
    setEnvironments((prev) => prev.map((e) => (e.id === env.id ? updated : e)));
  };

  const rename = async (env: Environment, name: string) => {
    if (!name.trim()) return;
    const updated = { ...env, name: name.trim() };
    await updateEnvironment(updated);
    setEnvironments((prev) => prev.map((e) => (e.id === env.id ? updated : e)));
    setRenamingId(null);
    setEditingName("");
  };

  const duplicate = async (env: Environment) => {
    const newEnv = await createEnvironment(`${env.name} (copy)`);
    const updated = { ...newEnv, variables: env.variables.map((v) => ({ ...v })) };
    await updateEnvironment(updated);
    setEnvironments((prev) => [...prev, updated]);
    setActiveEnvironmentId(updated.id);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* ── Dropdown activator ── */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={cn(
            "flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-left text-xs border transition-all duration-150",
            activeEnv
              ? "bg-sidebar border-primary/25 text-sidebar-foreground hover:border-primary/50"
              : "bg-sidebar border-sidebar-border text-sidebar-foreground/50 hover:text-sidebar-foreground hover:border-sidebar-border"
          )}
        >
          {/* Status dot */}
          <span
            className={cn(
              "w-2 h-2 rounded-full shrink-0 transition-colors duration-150",
              activeEnv ? "bg-primary" : "bg-sidebar-border"
            )}
          />

          {/* Label */}
          <span className="flex-1 truncate">
            {activeEnv ? activeEnv.name : "No Environment"}
          </span>

          {/* Variable badge */}
          {activeEnv && enabledCount(activeEnv.variables) > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium tabular-nums leading-none">
              {enabledCount(activeEnv.variables)}
            </span>
          )}

          {/* Chevron */}
          <svg
            className={cn(
              "h-3 w-3 shrink-0 text-sidebar-foreground/40 transition-transform duration-150",
              dropdownOpen && "rotate-180"
            )}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {/* ── Dropdown panel ── */}
        {dropdownOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-xl shadow-xl py-1 animate-in fade-in slide-in-from-top-1 duration-150 overflow-hidden">
            {/* Header */}
            <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50">
              Environments
            </div>

            {/* Empty state */}
            {environments.length === 0 && !creating && (
              <div className="px-3 py-5 text-center text-xs text-muted-foreground">
                <svg className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                </svg>
                No environments yet
              </div>
            )}

            {/* Environment list */}
            {environments.map((env) => {
              const isActive = activeEnvironmentId === env.id;
              const activeCount = enabledCount(env.variables);
              const totalCount = env.variables.length;
              return (
                <div
                  key={env.id}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 text-xs group cursor-pointer transition-all duration-150 border-b border-border/20 last:border-b-0",
                    isActive
                      ? "bg-primary/5 text-primary"
                      : "text-foreground hover:bg-accent"
                  )}
                  onClick={() => {
                    setActiveEnvironmentId(isActive ? null : env.id);
                    setDropdownOpen(false);
                  }}
                >
                  {/* Radio indicator */}
                  <span
                    className={cn(
                      "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-150",
                      isActive
                        ? "border-primary"
                        : "border-muted-foreground/30 group-hover:border-muted-foreground/50"
                    )}
                  >
                    {isActive && (
                      <span className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </span>

                  {/* Name */}
                  <span className="flex-1 truncate">{env.name}</span>

                  {/* Variable count */}
                  {totalCount > 0 && (
                    <span
                      className={cn(
                        "text-[10px] tabular-nums",
                        isActive ? "text-primary/60" : "text-muted-foreground"
                      )}
                    >
                      {activeCount}/{totalCount}
                    </span>
                  )}

                  {/* Hover actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(editingId === env.id ? null : env.id);
                        setDropdownOpen(false);
                      }}
                      className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-150"
                      title="Edit variables"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicate(env);
                        setDropdownOpen(false);
                      }}
                      className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-150"
                      title="Duplicate"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(env.id);
                      }}
                      className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all duration-150"
                      title="Delete"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* ── Create new environment ── */}
            {creating ? (
              <div className="px-3 py-2 border-t border-border/50">
                <div className="flex items-center gap-1.5">
                  <input
                    ref={newNameInputRef}
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") create();
                      if (e.key === "Escape") {
                        setCreating(false);
                        setNewName("");
                      }
                    }}
                    placeholder="Environment name..."
                    className="flex-1 bg-background text-foreground text-xs px-2 py-1.5 rounded-lg border border-input focus:outline-none focus-within:ring-1 focus-within:ring-ring transition-all duration-150"
                  />
                  <button
                    onClick={create}
                    disabled={!newName.trim()}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setCreating(false);
                      setNewName("");
                    }}
                    className="px-2 py-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150 border-t border-border/50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span className="font-medium">New Environment</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Variable editor panel (when editing) ── */}
      {editingId && activeEnv && activeEnv.id === editingId && (
        <div className="border border-border/40 rounded-xl bg-sidebar-accent/20 animate-in fade-in slide-in-from-top-1 duration-150 overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-sidebar-accent/30">
            {renamingId === activeEnv.id ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") rename(activeEnv, editingName);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onBlur={() => {
                  if (renamingId) rename(activeEnv, editingName || activeEnv.name);
                }}
                autoFocus
                className="flex-1 bg-background text-foreground text-xs px-2 py-0.5 rounded-lg border border-input focus:outline-none focus-within:ring-1 focus-within:ring-ring transition-all duration-150"
              />
            ) : (
              <button
                onClick={() => {
                  setRenamingId(activeEnv.id);
                  setEditingName(activeEnv.name);
                }}
                className="flex items-center gap-1.5 flex-1 text-xs font-medium text-foreground hover:text-primary transition-all duration-150 text-left group"
              >
                <svg
                  className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary transition-all duration-150 shrink-0"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
                <span className="truncate">{activeEnv.name}</span>
              </button>
            )}
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
              {enabledCount(activeEnv.variables)} active
            </span>              <button
              onClick={closeEditor}
              className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-150 shrink-0"
              title="Close"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Key-value editor */}
          <div className="p-2.5">
            <KeyValueEditor
              pairs={activeEnv.variables}
              onChange={(vars) => updateVars(activeEnv, vars)}
              keyPlaceholder="Variable name"
              valuePlaceholder="Variable value"
            />
          </div>
        </div>
      )}

      {/* ── Quick summary bar (active but not editing) ── */}
      {!editingId && activeEnv && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-sidebar-accent/30 border border-sidebar-border/50">
          <svg className="h-3 w-3 text-muted-foreground/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
          </svg>
          <span className="text-[10px] text-muted-foreground flex-1">
            {enabledCount(activeEnv.variables)} variable{enabledCount(activeEnv.variables) !== 1 ? "s" : ""} active
            {disabledCount(activeEnv.variables) > 0 && (
              <span className="text-muted-foreground/60">
                {" "}({disabledCount(activeEnv.variables)} disabled)
              </span>
            )}
          </span>
          <button
            onClick={() => setEditingId(activeEnv.id)}
            className="text-[10px] font-medium text-primary hover:text-primary/80 transition-all duration-150 shrink-0"
          >
            Edit vars
          </button>
        </div>
      )}
    </div>
  );
}
