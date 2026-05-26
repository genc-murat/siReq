import React, { useState } from "react";
import { useMockStore } from "@/stores/mockStore";
import { useToastStore } from "@/stores/toastStore";
import type { MockServerConfig } from "@/lib/invoke";
import { MockStatusBadge } from "./MockStatusBadge";
import {
  Plus,
  Play,
  Square,
  Copy,
  Trash2,
  Search,
  Server,
  AlertTriangle
} from "lucide-react";
import { createMockConfig } from "@/lib/invoke";

interface MockConfigListProps {
  onImportClick: () => void;
}

export function MockConfigList({ onImportClick }: MockConfigListProps) {
  const configs = useMockStore((s) => s.configs);
  const selectedId = useMockStore((s) => s.selectedConfigId);
  const selectConfig = useMockStore((s) => s.setSelectedConfigId);
  const statuses = useMockStore((s) => s.serverStatuses);
  const errors = useMockStore((s) => s.serverErrors);
  const loadConfigs = useMockStore((s) => s.loadConfigs);
  const deleteConfig = useMockStore((s) => s.deleteConfig);
  const startServer = useMockStore((s) => s.startServer);
  const stopServer = useMockStore((s) => s.stopServer);
  const createConfig = useMockStore((s) => s.createConfig);
  
  const addToast = useToastStore((s) => s.addToast);

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPort, setNewPort] = useState(8080);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const filtered = configs.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (newPort < 1024 || newPort > 65535) {
      addToast("Port must be in the range 1024-65535.", "error");
      return;
    }

    try {
      await createConfig(newName, newPort);
      addToast("Mock server created successfully!", "success");
      setNewName("");
      setShowCreate(false);
    } catch (err) {
      addToast(`Error: ${err}`, "error");
    }
  };

  const handleToggleServer = async (e: React.MouseEvent, config: MockServerConfig) => {
    e.stopPropagation();
    const id = config.id;
    const isRunning = statuses[id] === "running";
    
    setPending((prev) => ({ ...prev, [id]: true }));
    try {
      if (isRunning) {
        await stopServer(id);
        addToast(`'${config.name}' server stopped.`, "info");
      } else {
        await startServer(config);
        addToast(`'${config.name}' server started (Port: ${config.port}).`, "success");
      }
    } catch (err) {
      console.error(err);
      addToast(`Action failed: ${err}`, "error");
    } finally {
      setPending((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleDuplicate = async (e: React.MouseEvent, config: MockServerConfig) => {
    e.stopPropagation();
    try {
      const copy: MockServerConfig = {
        ...config,
        id: crypto.randomUUID(),
        name: `${config.name} (Copy)`,
      };
      await createMockConfig(copy);
      await loadConfigs();
      addToast("Server duplicated successfully!", "success");
    } catch (err) {
      addToast(`Duplication failed: ${err}`, "error");
    }
  };

  const handleDelete = async (e: React.MouseEvent, config: MockServerConfig) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete mock server '${config.name}'?`)) {
      try {
        await deleteConfig(config.id);
        addToast("Server deleted.", "info");
      } catch (err) {
        addToast(`Error: ${err}`, "error");
      }
    }
  };

  return (
    <div className="w-80 border-r bg-card/60 backdrop-blur-sm shrink-0 flex flex-col h-full">
      {/* Top Header */}
      <div className="p-4 border-b space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4.5 h-4.5 text-primary" />
            <h2 className="font-semibold text-sm text-foreground">Mock Servers</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="p-1.5 rounded-lg text-primary hover:bg-primary/10 border border-primary/20 transition-all duration-150"
              title="New Mock Server"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={onImportClick}
              className="text-[10px] text-muted-foreground hover:text-foreground font-semibold px-2 py-1.5 border border-border hover:bg-accent rounded-lg transition-all duration-150"
            >
              Import
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search servers..."
            className="w-full h-8 bg-background border border-border/80 rounded-lg pl-8 pr-3 text-xs focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Creation Dropdown */}
      {showCreate && (
        <form onSubmit={handleCreate} className="p-4 border-b bg-accent/20 space-y-3 animate-slideDown shrink-0">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Server Name</label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Test API"
              className="w-full h-8 bg-background border rounded-lg px-2.5 text-xs focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Port</label>
            <input
              type="number"
              required
              min="1024"
              max="65535"
              value={newPort}
              onChange={(e) => setNewPort(parseInt(e.target.value) || 8080)}
              className="w-full h-8 bg-background border rounded-lg px-2.5 text-xs focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 bg-primary text-white text-[11px] font-semibold rounded-lg shadow-sm hover:bg-primary/95 transition-all duration-150"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {/* Mock Config List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-xs text-muted-foreground select-none">
            No servers found.
          </div>
        ) : (
          filtered.map((config) => {
            const isSelected = config.id === selectedId;
            const status = statuses[config.id] || "stopped";
            const isPending = pending[config.id];
            const error = errors[config.id];

            return (
              <div
                key={config.id}
                onClick={() => selectConfig(config.id)}
                className={`group p-3 rounded-xl border select-none cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? "bg-primary/[0.04] border-primary/40 shadow-sm"
                    : "bg-background/40 hover:bg-accent/40 border-border/80"
                }`}
              >
                <div className="flex flex-col gap-2">
                  {/* Title & Badge */}
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-semibold text-xs text-foreground truncate max-w-[120px]">
                      {config.name}
                    </span>
                    <MockStatusBadge status={status} />
                  </div>

                  {/* Port Info & Warning Icons */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span>Port:</span>
                      <span className="font-semibold text-foreground/80">{config.port}</span>
                    </div>

                    {error && (
                      <span
                        className="text-rose-400 flex items-center gap-0.5"
                        title={error}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 animate-bounce" />
                        <span>Error</span>
                      </span>
                    )}
                  </div>

                  {/* Actions (visible on hover) */}
                  <div className="flex items-center justify-between border-t border-border/60 pt-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={(e) => handleToggleServer(e, config)}
                      disabled={isPending}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border transition-all duration-150 ${
                        status === "running"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                      }`}
                    >
                      {isPending ? (
                        <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                      ) : status === "running" ? (
                        <>
                          <Square className="w-2.5 h-2.5 fill-current" />
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>Start</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleDuplicate(e, config)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border transition-all duration-150"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, config)}
                        className="p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all duration-150"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
