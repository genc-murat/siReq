import React, { useEffect, useState } from "react";
import { useMockStore } from "@/stores/mockStore";
import { MockConfigList } from "./MockConfigList";
import { MockEndpointEditor } from "./MockEndpointEditor";
import { MockLogViewer } from "./MockLogViewer";
import { MockImportDialog } from "./MockImportDialog";
import { Server, Info, Zap } from "lucide-react";

export default function MockPanel() {
  const loadConfigs = useMockStore((s) => s.loadConfigs);
  const configs = useMockStore((s) => s.configs);
  const selectedId = useMockStore((s) => s.selectedConfigId);
  const subscribeToEvents = useMockStore((s) => s.subscribeToEvents);
  const loading = useMockStore((s) => s.loading);

  const [showImport, setShowImport] = useState(false);

  // Load configs on mount and subscribe to Tauri event channels
  useEffect(() => {
    loadConfigs();

    let unlistenFn: (() => void) | null = null;
    const setupSubscriptions = async () => {
      unlistenFn = await subscribeToEvents();
    };

    setupSubscriptions();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [loadConfigs, subscribeToEvents]);

  const activeConfig = configs.find((c) => c.id === selectedId);

  return (
    <div className="flex-1 flex min-h-0 bg-background overflow-hidden relative">
      {/* 3-Column Split Layout */}
      <MockConfigList onImportClick={() => setShowImport(true)} />

      {/* Center column: Editor */}
      <div className="flex-1 flex flex-col min-w-0 h-full border-r">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-3 select-none">
            <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <span className="text-xs text-muted-foreground font-semibold">Loading configurations...</span>
          </div>
        ) : activeConfig ? (
          <MockEndpointEditor config={activeConfig} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4 p-8 select-none text-center">
            <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl animate-pulse">
              <Server className="w-12 h-12 text-primary" />
            </div>
            <div className="max-w-md space-y-2">
              <h3 className="font-semibold text-sm text-foreground">No Mock Server Selected</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You haven't created a mock server configuration yet. Click the "+" button in the left sidebar to create one from scratch, or import from an OpenAPI spec or your existing collections.
              </p>
            </div>
            <button
              onClick={() => setShowImport(true)}
              className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg shadow-md hover:bg-primary/95 transition-all duration-150 flex items-center gap-1.5"
            >
              <Zap className="w-4 h-4" />
              <span>Create Mock Server from Content</span>
            </button>
          </div>
        )}
      </div>

      {/* Right Column: Real-time logs stream */}
      {activeConfig ? (
        <MockLogViewer serverId={activeConfig.id} />
      ) : (
        <div className="w-80 border-l bg-card/60 backdrop-blur-sm shrink-0 flex flex-col items-center justify-center p-4 text-center select-none text-muted-foreground/60 italic text-xs space-y-2">
          <Info className="w-8 h-8 text-muted-foreground/30" />
          <span>Select an active server to view logs and statistics.</span>
        </div>
      )}

      {/* Overlay Modal Dialogue for imports */}
      {showImport && (
        <MockImportDialog onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}
