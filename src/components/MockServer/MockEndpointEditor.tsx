import { useState } from "react";
import type { MockServerConfig, MockEndpoint, ResponseScenario } from "@/lib/invoke";
import { MockScenarioEditor } from "./MockScenarioEditor";
import { MockCorsEditor } from "./MockCorsEditor";
import { useMockStore } from "@/stores/mockStore";
import { useToastStore } from "@/stores/toastStore";
import {
  Plus,
  Trash2,
  Settings,
  Globe,
  FolderOpen,
  Sliders,
  X
} from "lucide-react";

interface MockEndpointEditorProps {
  config: MockServerConfig;
}

export function MockEndpointEditor({ config }: MockEndpointEditorProps) {
  const updateConfig = useMockStore((s) => s.updateConfig);
  const statuses = useMockStore((s) => s.serverStatuses);
  const addToast = useToastStore((s) => s.addToast);

  const [activeTab, setActiveTab] = useState<"endpoints" | "settings">("endpoints");
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);

  // New endpoint inputs
  const [newPath, setNewPath] = useState("");
  const [newMethod, setNewMethod] = useState("GET");

  const serverStatus = statuses[config.id] || "stopped";
  const isRunning = serverStatus === "running";

  const selectedEndpoint = config.endpoints.find((e) => e.id === selectedEndpointId);
  const selectedScenario = selectedEndpoint?.scenarios.find((s) => s.id === selectedScenarioId);

  const handleSaveConfig = async (nextConfig: MockServerConfig) => {
    try {
      await updateConfig(nextConfig);
    } catch (err) {
      addToast(`Failed to save: ${err}`, "error");
    }
  };

  // Endpoints CRUD
  const handleAddEndpoint = () => {
    if (!newPath.trim()) return;
    
    // Ensure leading slash
    let cleanPath = newPath.trim();
    if (!cleanPath.startsWith("/")) {
      cleanPath = `/${cleanPath}`;
    }

    // Check duplicate path + method
    const duplicate = config.endpoints.find(
      (e) => e.method === newMethod && e.path.toLowerCase() === cleanPath.toLowerCase()
    );
    if (duplicate) {
      addToast("This HTTP method and path combination is already defined.", "error");
      return;
    }

    const endpointId = crypto.randomUUID();
    const scenarioId = crypto.randomUUID();

    const newEndpoint: MockEndpoint = {
      id: endpointId,
      path: cleanPath,
      method: newMethod,
      scenarios: [
        {
          id: scenarioId,
          name: "Default Response",
          is_default: true,
          status_code: 200,
          headers: {
            "Content-Type": "application/json",
          },
          body: '{\n  "status": "success"\n}',
          latency: null,
          rules: [],
        },
      ],
    };

    const nextConfig = {
      ...config,
      endpoints: [...config.endpoints, newEndpoint],
    };

    handleSaveConfig(nextConfig);
    setSelectedEndpointId(endpointId);
    setSelectedScenarioId(scenarioId);
    setNewPath("");
    addToast("Endpoint added!", "success");
  };

  const handleDeleteEndpoint = (endpointId: string) => {
    const nextEndpoints = config.endpoints.filter((e) => e.id !== endpointId);
    handleSaveConfig({ ...config, endpoints: nextEndpoints });
    if (selectedEndpointId === endpointId) {
      setSelectedEndpointId(null);
      setSelectedScenarioId(null);
    }
    addToast("Endpoint deleted.", "info");
  };

  const handleAddScenario = () => {
    if (!selectedEndpoint) return;
    const scenarioId = crypto.randomUUID();
    const newScenario: ResponseScenario = {
      id: scenarioId,
      name: `Scenario ${selectedEndpoint.scenarios.length + 1}`,
      is_default: false,
      status_code: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: '{\n  "error": "Custom state"\n}',
      latency: null,
      rules: [
        {
          source: "query",
          key: "debug",
          operator: "equals",
          value: "true",
        },
      ],
    };

    const nextEndpoints = config.endpoints.map((e) => {
      if (e.id === selectedEndpoint.id) {
        return {
          ...e,
          scenarios: [...e.scenarios, newScenario],
        };
      }
      return e;
    });

    handleSaveConfig({ ...config, endpoints: nextEndpoints });
    setSelectedScenarioId(scenarioId);
    addToast("Scenario rule added!", "success");
  };

  const handleDeleteScenario = (scenarioId: string) => {
    if (!selectedEndpoint) return;
    const targetScenario = selectedEndpoint.scenarios.find((s) => s.id === scenarioId);
    if (targetScenario?.is_default) {
      addToast("Default scenario cannot be deleted.", "error");
      return;
    }

    const nextScenarios = selectedEndpoint.scenarios.filter((s) => s.id !== scenarioId);
    const nextEndpoints = config.endpoints.map((e) => {
      if (e.id === selectedEndpoint.id) {
        return { ...e, scenarios: nextScenarios };
      }
      return e;
    });

    handleSaveConfig({ ...config, endpoints: nextEndpoints });
    if (selectedScenarioId === scenarioId) {
      setSelectedScenarioId(selectedEndpoint.scenarios.find((s) => s.is_default)?.id || null);
    }
    addToast("Scenario deleted.", "info");
  };

  const handleScenarioChange = (nextScenario: ResponseScenario) => {
    if (!selectedEndpoint) return;
    const nextScenarios = selectedEndpoint.scenarios.map((s) =>
      s.id === nextScenario.id ? nextScenario : s
    );
    const nextEndpoints = config.endpoints.map((e) => {
      if (e.id === selectedEndpoint.id) {
        return { ...e, scenarios: nextScenarios };
      }
      return e;
    });
    handleSaveConfig({ ...config, endpoints: nextEndpoints });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background/20">
      {/* Top Header Tab Selector */}
      <div className="flex items-center justify-between border-b px-5 py-2.5 bg-card shrink-0 select-none">
        <div className="flex items-center gap-1 bg-accent/40 p-0.5 rounded-lg border">
          <button
            onClick={() => setActiveTab("endpoints")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150 ${
              activeTab === "endpoints"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Endpoint List</span>
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150 ${
              activeTab === "settings"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>General Settings</span>
          </button>
        </div>

        {isRunning && (
          <span className="text-[10px] text-emerald-400/90 flex items-center gap-1 font-semibold tracking-wider uppercase bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full animate-pulse">
            <Globe className="w-3 h-3" />
            <span>Live Editing Enabled</span>
          </span>
        )}
      </div>

      {/* Main Tab Views */}
      <div className="flex-1 overflow-hidden flex min-h-0">
        {activeTab === "settings" ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Global Settings & CORS */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-foreground/80 uppercase tracking-wider">Mock Server Settings</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Mock Server Name</label>
                  <input
                    type="text"
                    value={config.name}
                    onChange={(e) => handleSaveConfig({ ...config, name: e.target.value })}
                    className="w-full h-9 bg-background border border-border rounded-lg px-3 text-xs focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Port</label>
                  <input
                    type="number"
                    value={config.port}
                    disabled={isRunning}
                    onChange={(e) => handleSaveConfig({ ...config, port: parseInt(e.target.value) || 8080 })}
                    className="w-full h-9 bg-background border border-border rounded-lg px-3 text-xs focus:outline-none focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {isRunning && (
                    <span className="text-[9px] text-muted-foreground/60 italic block">
                      (You must stop the server to change the port)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <MockCorsEditor
              enabled={config.cors_enabled}
              onEnabledChange={(enabled) => handleSaveConfig({ ...config, cors_enabled: enabled })}
              config={config.cors_config}
              onConfigChange={(cors_config) => handleSaveConfig({ ...config, cors_config })}
            />
          </div>
        ) : (
          /* Endpoints Layout splitting into: Left Subsidebar endpoints, Right Main Scenario Editor */
          <div className="flex-1 flex min-h-0">
            {/* Endpoint sub list */}
            <div className="w-64 border-r bg-card/15 shrink-0 flex flex-col h-full min-h-0 select-none">
              
              {/* Add New Endpoint Input */}
              <div className="p-3 border-b space-y-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <select
                    value={newMethod}
                    onChange={(e) => setNewMethod(e.target.value)}
                    className="h-8 bg-background border border-border rounded-lg px-1.5 text-[10px] font-bold text-foreground focus:outline-none cursor-pointer shrink-0"
                  >
                    {["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD", "TRACE"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder="/api/v1/users"
                    className="h-8 bg-background border border-border rounded-lg px-2 text-xs focus:outline-none focus:border-primary transition-colors flex-1 min-w-0"
                  />
                </div>
                <button
                  onClick={handleAddEndpoint}
                  disabled={!newPath.trim()}
                  className="w-full h-7 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-bold rounded-lg transition-all duration-150 flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Endpoint</span>
                </button>
              </div>

              {/* Endpoints List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {config.endpoints.length === 0 ? (
                  <div className="text-center py-12 text-[10px] text-muted-foreground italic">
                    No endpoints defined.
                  </div>
                ) : (
                  config.endpoints.map((ep) => {
                    const isEpSelected = ep.id === selectedEndpointId;
                    
                    return (
                      <div
                        key={ep.id}
                        onClick={() => {
                          setSelectedEndpointId(ep.id);
                          setSelectedScenarioId(ep.scenarios.find((s) => s.is_default)?.id || ep.scenarios[0]?.id || null);
                        }}
                        className={`group p-2 rounded-lg border text-left cursor-pointer transition-all duration-150 flex items-center justify-between ${
                          isEpSelected
                            ? "bg-primary/5 border-primary/30"
                            : "bg-background/40 hover:bg-accent/40 border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1 pr-1.5">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 select-none ${
                              ep.method === "GET" && "bg-emerald-500/10 text-emerald-400"
                            } ${
                              ep.method === "POST" && "bg-blue-500/10 text-blue-400"
                            } ${
                              ep.method === "PUT" && "bg-amber-500/10 text-amber-400"
                            } ${
                              ep.method === "DELETE" && "bg-rose-500/10 text-rose-400"
                            } ${
                              !["GET", "POST", "PUT", "DELETE"].includes(ep.method) && "bg-zinc-500/10 text-zinc-400"
                            }`}
                          >
                            {ep.method}
                          </span>
                          <span className="text-[11px] font-medium text-foreground/90 truncate font-mono">
                            {ep.path}
                          </span>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEndpoint(ep.id);
                          }}
                          className="p-1 rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0"
                          title="Delete Endpoint"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Active Endpoint Scenarios and Detail Form */}
            <div className="flex-1 overflow-y-auto p-5 min-w-0">
              {selectedEndpoint ? (
                <div className="space-y-4">
                  {/* Headline & Scenario Tabs */}
                  <div className="border-b pb-4 border-border/80 flex flex-col gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-foreground/50 font-mono uppercase tracking-wider shrink-0">Editing:</span>
                      <span className="text-xs font-bold bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded uppercase shrink-0 font-mono">
                        {selectedEndpoint.method}
                      </span>
                      <span className="font-semibold text-sm text-foreground truncate font-mono">
                        {selectedEndpoint.path}
                      </span>
                    </div>

                    {/* Scenario Tabs Row */}
                    <div className="flex flex-wrap items-center gap-1.5 select-none pt-1">
                      {selectedEndpoint.scenarios.map((sc) => {
                        const isScSelected = sc.id === selectedScenarioId;
                        return (
                          <div
                            key={sc.id}
                            className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-all duration-150 ${
                              isScSelected
                                ? "bg-primary/10 border-primary/30 text-primary font-bold shadow-sm"
                                : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                            }`}
                            onClick={() => setSelectedScenarioId(sc.id)}
                          >
                            <span>{sc.name}</span>
                            {sc.is_default && (
                              <span className="text-[9px] bg-primary/20 text-primary px-1 rounded uppercase font-bold tracking-wider">
                                Def
                              </span>
                            )}
                            {!sc.is_default && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteScenario(sc.id);
                                }}
                                className="p-0.5 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all"
                                title="Delete Scenario"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}

                      <button
                        onClick={handleAddScenario}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs border border-dashed border-primary/30 hover:border-primary/50 text-primary bg-primary/[0.02] hover:bg-primary/[0.05] rounded-lg font-semibold transition-all duration-150"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Scenario Rule</span>
                      </button>
                    </div>
                  </div>

                  {/* Active Scenario Detail Form */}
                  {selectedScenario ? (
                    <div className="animate-fadeIn">
                      <MockScenarioEditor
                        scenario={selectedScenario}
                        onChange={handleScenarioChange}
                      />
                    </div>
                  ) : (
                    <div className="text-center py-20 text-xs text-muted-foreground select-none">
                      Please select a scenario to edit.
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-20 text-muted-foreground select-none space-y-3">
                  <Sliders className="w-12 h-12 text-muted-foreground/30 animate-pulse" />
                  <span className="text-xs text-muted-foreground/80 font-medium">
                    Select an endpoint from the left menu to edit, or add a new one.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
