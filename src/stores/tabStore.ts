import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HttpRequest, HttpResponse } from "@/lib/invoke";
import { useRequestStore } from "./requestStore";
import { useUIStore } from "./uiStore";

function generateId(): string {
  return crypto.randomUUID();
}

export interface TabData {
  id: string;
  request: HttpRequest;
  response: HttpResponse | null;
  loading: boolean;
  error: string | null;
  uiState: {
    activeTab: string;
    responseTab: string;
  };
}

interface TabState {
  tabs: TabData[];
  activeTabId: string | null;
  createTab: (request?: HttpRequest) => string;
  closeTab: (id: string) => void;
  duplicateTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  syncCurrentToTab: () => void;
  updateActiveTab: () => void;
}



export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      createTab: (request?: HttpRequest) => {
        const { syncCurrentToTab } = get();
        syncCurrentToTab();

        const id = generateId();
        const defaultReq = useRequestStore.getState().request;
        const newTab: TabData = {
          id,
          request: request
            ? { ...request, id }
            : { ...defaultReq, id, name: "" },
          response: null,
          loading: false,
          error: null,
          uiState: {
            activeTab: "params",
            responseTab: "body",
          },
        };

        set((s) => ({ tabs: [...s.tabs, newTab], activeTabId: id }));

        // Load this tab's state into the global stores
        useRequestStore.setState({
          request: newTab.request,
          response: null,
          loading: false,
          error: null,
        });
        useUIStore.setState({
          activeTab: newTab.uiState.activeTab,
          responseTab: newTab.uiState.responseTab,
        });

        return id;
      },

      closeTab: (id: string) => {
        const { tabs, activeTabId, syncCurrentToTab } = get();
        if (tabs.length <= 1) return; // Don't close the last tab

        syncCurrentToTab();

        const newTabs = tabs.filter((t) => t.id !== id);
        let newActiveId = activeTabId;

        if (activeTabId === id) {
          const closedIndex = tabs.findIndex((t) => t.id === id);
          const nextIndex = Math.min(closedIndex, newTabs.length - 1);
          newActiveId = newTabs[nextIndex]?.id ?? null;
        }

        set({ tabs: newTabs, activeTabId: newActiveId });

        if (newActiveId) {
          const tab = newTabs.find((t) => t.id === newActiveId);
          if (tab) {
            useRequestStore.setState({
              request: tab.request,
              response: tab.response,
              loading: tab.loading,
              error: tab.error,
            });
            useUIStore.setState({
              activeTab: tab.uiState.activeTab,
              responseTab: tab.uiState.responseTab,
            });
          }
        }
      },

      duplicateTab: (id: string) => {
        const { tabs, syncCurrentToTab } = get();
        syncCurrentToTab();
        const source = tabs.find((t) => t.id === id);
        if (!source) return;

        const newId = generateId();
        const newTab: TabData = {
          ...source,
          id: newId,
          request: { ...source.request, id: newId },
          response: null,
          loading: false,
          error: null,
        };

        set((s) => ({
          tabs: [...s.tabs, newTab],
          activeTabId: newId,
        }));

        useRequestStore.setState({
          request: newTab.request,
          response: null,
          loading: false,
          error: null,
        });
      },

      setActiveTab: (id: string) => {
        const { syncCurrentToTab } = get();
        syncCurrentToTab();

        const tab = get().tabs.find((t) => t.id === id);
        if (!tab) return;

        set({ activeTabId: id });

        useRequestStore.setState({
          request: tab.request,
          response: tab.response,
          loading: tab.loading,
          error: tab.error,
        });
        useUIStore.setState({
          activeTab: tab.uiState.activeTab,
          responseTab: tab.uiState.responseTab,
        });
      },

      syncCurrentToTab: () => {
        const { tabs, activeTabId } = get();
        if (!activeTabId) return;

        const reqState = useRequestStore.getState();
        const uiState = useUIStore.getState();

        set({
          tabs: tabs.map((t) =>
            t.id === activeTabId
              ? {
                  ...t,
                  request: { ...reqState.request },
                  response: reqState.response,
                  loading: reqState.loading,
                  error: reqState.error,
                  uiState: {
                    activeTab: uiState.activeTab,
                    responseTab: uiState.responseTab,
                  },
                }
              : t
          ),
        });
      },

      updateActiveTab: () => {
        get().syncCurrentToTab();
      },
    }),
    {
      name: "sireq-tabs",
      partialize: (state) => ({
        tabs: state.tabs.map((t) => ({
          ...t,
          response: null,
          loading: false,
          error: null,
        })),
        activeTabId: state.activeTabId,
      }),
    }
  )
);
