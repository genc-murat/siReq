import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HttpResponse } from "@/lib/invoke";

interface UIState {
  theme: "light" | "dark" | "system" | "nordic" | "sunset" | "midnight" | "monochrome" | "terminal" | "true-dark" | "matrix" | "solarized" | "nord";
  toolMode: "http" | "websocket" | "grpc" | "mock";
  sidebarOpen: boolean;
  settingsOpen: boolean;
  activeTab: string;
  responseTab: string;
  activeHistoryId: string | null;
  activeCollectionId: string | null;
  activeEnvironmentId: string | null;
  showRunner: boolean;
  runnerCollectionId: string | null;
  showIntelligence: boolean;
  compareResponse: HttpResponse | null;
  setTheme: (theme: "light" | "dark" | "system" | "nordic" | "sunset" | "midnight" | "monochrome" | "terminal" | "true-dark" | "matrix" | "solarized" | "nord") => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveTab: (tab: string) => void;
  setResponseTab: (tab: string) => void;
  setToolMode: (mode: "http" | "websocket" | "grpc" | "mock") => void;
  setActiveHistoryId: (id: string | null) => void;
  setActiveCollectionId: (id: string | null) => void;
  setActiveEnvironmentId: (id: string | null) => void;
  setCompareResponse: (response: HttpResponse | null) => void;
  setShowRunner: (show: boolean, collectionId?: string | null) => void;
  setShowIntelligence: (show: boolean) => void;
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
      setToolMode: (mode: "http" | "websocket" | "grpc" | "mock") => set({ toolMode: mode }),
  setResponseTab: (tab) => set({ responseTab: tab }),
      compareResponse: null,
      showRunner: false,
  runnerCollectionId: null,
  setShowRunner: (show, collectionId) => set({ showRunner: show, runnerCollectionId: collectionId ?? null }),
  showIntelligence: false,
  setShowIntelligence: (show) => set({ showIntelligence: show, showRunner: false }),
  setCompareResponse: (response) => set({ compareResponse: response, responseTab: response ? "diff" : "body" }),
      setActiveHistoryId: (id) => set({ activeHistoryId: id }),
      setActiveCollectionId: (id) => set({ activeCollectionId: id }),
      setActiveEnvironmentId: (id) => set({ activeEnvironmentId: id }),
    }),
    { name: "sireq-ui" }
  )
);
