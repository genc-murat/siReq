import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  theme: "light" | "dark" | "system";
  sidebarOpen: boolean;
  activeTab: string;
  responseTab: string;
  activeHistoryId: string | null;
  activeCollectionId: string | null;
  activeEnvironmentId: string | null;
  timeout: number;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setActiveTab: (tab: string) => void;
  setResponseTab: (tab: string) => void;
  setActiveHistoryId: (id: string | null) => void;
  setActiveCollectionId: (id: string | null) => void;
  setActiveEnvironmentId: (id: string | null) => void;
  setTimeout: (timeout: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "dark",
      sidebarOpen: true,
      activeTab: "params",
      responseTab: "body",
      activeHistoryId: null,
      activeCollectionId: null,
      activeEnvironmentId: null,
      timeout: 30,
      setTheme: (theme) => set({ theme }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setResponseTab: (tab) => set({ responseTab: tab }),
      setActiveHistoryId: (id) => set({ activeHistoryId: id }),
      setActiveCollectionId: (id) => set({ activeCollectionId: id }),
      setActiveEnvironmentId: (id) => set({ activeEnvironmentId: id }),
      setTimeout: (timeout) => set({ timeout }),
    }),
    { name: "sireq-ui" }
  )
);
