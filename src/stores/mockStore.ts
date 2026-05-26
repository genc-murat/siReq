import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  getMockConfigs,
  createMockConfig,
  updateMockConfig,
  deleteMockConfig,
  startMockServer,
  stopMockServer,
  getMockServerStatus,
  getMockServerLogs,
  getMockServerStats,
  importOpenApiMock,
  importCollectionMock
} from "@/lib/invoke";
import type {
  MockServerConfig,
  MockLogEntry,
  MockStats,
  MockServerStatus
} from "@/lib/invoke";

interface MockState {
  configs: MockServerConfig[];
  selectedConfigId: string | null;
  serverStatuses: Record<string, "running" | "stopped" | "error">;
  serverErrors: Record<string, string | null>;
  serverLogs: Record<string, MockLogEntry[]>;
  serverStats: Record<string, MockStats>;
  loading: boolean;

  // Actions
  setSelectedConfigId: (id: string | null) => void;
  loadConfigs: () => Promise<void>;
  createConfig: (name: string, port: number) => Promise<void>;
  updateConfig: (config: MockServerConfig) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
  startServer: (config: MockServerConfig) => Promise<void>;
  stopServer: (id: string) => Promise<void>;
  importOpenApi: (spec: string, name: string, port: number) => Promise<MockServerConfig>;
  importCollection: (collectionId: string, name: string, port: number) => Promise<MockServerConfig>;
  clearLogs: (serverId: string) => void;
  subscribeToEvents: () => Promise<() => void>;
}

export const useMockStore = create<MockState>((set, get) => ({
  configs: [],
  selectedConfigId: null,
  serverStatuses: {},
  serverErrors: {},
  serverLogs: {},
  serverStats: {},
  loading: false,

  setSelectedConfigId: (id) => set({ selectedConfigId: id }),

  loadConfigs: async () => {
    set({ loading: true });
    try {
      const configs = await getMockConfigs();
      const statuses: Record<string, "running" | "stopped" | "error"> = {};
      const errors: Record<string, string | null> = {};
      const stats: Record<string, MockStats> = {};
      const logs: Record<string, MockLogEntry[]> = {};

      for (const config of configs) {
        try {
          const status = await getMockServerStatus(config.id);
          statuses[config.id] = status as "running" | "stopped" | "error";
          
          if (status === "running") {
            try {
              stats[config.id] = await getMockServerStats(config.id);
              logs[config.id] = await getMockServerLogs(config.id);
            } catch (_) {}
          }
        } catch (_) {
          statuses[config.id] = "stopped";
        }
      }

      set({
        configs,
        serverStatuses: statuses,
        serverErrors: errors,
        serverStats: stats,
        serverLogs: logs,
        loading: false,
      });

      if (configs.length > 0 && !get().selectedConfigId) {
        set({ selectedConfigId: configs[0].id });
      }
    } catch (e) {
      console.error("Failed to load mock configs", e);
      set({ loading: false });
    }
  },

  createConfig: async (name, port) => {
    const newConfig: MockServerConfig = {
      id: crypto.randomUUID(),
      name,
      port,
      endpoints: [],
      cors_enabled: false,
      cors_config: {
        allow_origin: "*",
        allow_methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers: ["Content-Type", "Authorization"],
        allow_credentials: false,
      },
      headers: {},
    };

    await createMockConfig(newConfig);
    await get().loadConfigs();
    set({ selectedConfigId: newConfig.id });
  },

  updateConfig: async (config) => {
    await updateMockConfig(config);
    set((state) => ({
      configs: state.configs.map((c) => (c.id === config.id ? config : c)),
    }));
  },

  deleteConfig: async (id) => {
    await deleteMockConfig(id);
    const nextConfigs = get().configs.filter((c) => c.id !== id);
    set((state) => {
      const statuses = { ...state.serverStatuses };
      const errors = { ...state.serverErrors };
      const logs = { ...state.serverLogs };
      const stats = { ...state.serverStats };
      
      delete statuses[id];
      delete errors[id];
      delete logs[id];
      delete stats[id];

      return {
        configs: nextConfigs,
        serverStatuses: statuses,
        serverErrors: errors,
        serverLogs: logs,
        serverStats: stats,
        selectedConfigId: state.selectedConfigId === id
          ? nextConfigs[0]?.id || null
          : state.selectedConfigId,
      };
    });
  },

  startServer: async (config) => {
    // Optimistic status update
    set((state) => ({
      serverStatuses: { ...state.serverStatuses, [config.id]: "running" },
      serverErrors: { ...state.serverErrors, [config.id]: null },
    }));

    try {
      await startMockServer(config);
    } catch (e) {
      set((state) => ({
        serverStatuses: { ...state.serverStatuses, [config.id]: "error" },
        serverErrors: { ...state.serverErrors, [config.id]: String(e) },
      }));
      throw e;
    }
  },

  stopServer: async (id) => {
    try {
      await stopMockServer(id);
      set((state) => ({
        serverStatuses: { ...state.serverStatuses, [id]: "stopped" },
      }));
    } catch (e) {
      console.error(`Failed to stop server ${id}`, e);
      throw e;
    }
  },

  importOpenApi: async (spec, name, port) => {
    const config = await importOpenApiMock(spec, name, port);
    await get().loadConfigs();
    set({ selectedConfigId: config.id });
    return config;
  },

  importCollection: async (collectionId, name, port) => {
    const config = await importCollectionMock(collectionId, name, port);
    await get().loadConfigs();
    set({ selectedConfigId: config.id });
    return config;
  },

  clearLogs: (serverId) => {
    set((state) => ({
      serverLogs: {
        ...state.serverLogs,
        [serverId]: [],
      },
    }));
  },

  subscribeToEvents: async () => {
    const unlisteners: (() => void)[] = [];

    try {
      const unlistenStatus = await listen<MockServerStatus>("mock-status", (event) => {
        const payload = event.payload;
        set((state) => ({
          serverStatuses: {
            ...state.serverStatuses,
            [payload.id]: payload.status,
          },
          serverErrors: {
            ...state.serverErrors,
            [payload.id]: payload.error_message || null,
          },
        }));
      });
      unlisteners.push(unlistenStatus);

      const unlistenLog = await listen<{ serverId: string; log: MockLogEntry }>("mock-log", (event) => {
        const { serverId, log } = event.payload;
        set((state) => {
          const currentLogs = state.serverLogs[serverId] || [];
          const nextLogs = [log, ...currentLogs].slice(0, 500);
          return {
            serverLogs: {
              ...state.serverLogs,
              [serverId]: nextLogs,
            },
          };
        });
      });
      unlisteners.push(unlistenLog);

      const unlistenStats = await listen<{ serverId: string; stats: MockStats }>("mock-stats", (event) => {
        const { serverId, stats } = event.payload;
        set((state) => ({
          serverStats: {
            ...state.serverStats,
            [serverId]: stats,
          },
        }));
      });
      unlisteners.push(unlistenStats);
    } catch (e) {
      console.error("Failed to subscribe to mock events", e);
    }

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  },
}));
