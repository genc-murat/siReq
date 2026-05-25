import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  theme: "light" | "dark" | "system";
  toolMode: "http" | "websocket";
  sidebarOpen: boolean;
  settingsOpen: boolean;
  activeTab: string;
  responseTab: string;
  activeHistoryId: string | null;
  activeCollectionId: string | null;
  activeEnvironmentId: string | null;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveTab: (tab: string) => void;
  setResponseTab: (tab: string) => void;
  setToolMode: (mode: "http" | "websocket") => void;
  setActiveHistoryId: (id: string | null) => void;
  setActiveCollectionId: (id: string | null) => void;
  setActiveEnvironmentId: (id: string | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "dark",
      toolMode: "http",
      sidebarOpen: true,
      settingsOpen: false,
      activeTab: "params",
      responseTab: "body",
      activeHistoryId: null,
      activeCollectionId: null,
      activeEnvironmentId: null,
      setTheme: (theme) => set({ theme }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setToolMode: (mode: "http" | "websocket") => set({ toolMode: mode }),
  setResponseTab: (tab) => set({ responseTab: tab }),
      setActiveHistoryId: (id) => set({ activeHistoryId: id }),
      setActiveCollectionId: (id) => set({ activeCollectionId: id }),
      setActiveEnvironmentId: (id) => set({ activeEnvironmentId: id }),
    }),
    { name: "sireq-ui" }
  )
);
