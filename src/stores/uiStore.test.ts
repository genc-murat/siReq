import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "@/stores/uiStore";

function resetStore() {
  useUIStore.setState({
    theme: "dark",
    toolMode: "http",
    sidebarOpen: true,
    settingsOpen: false,
    activeTab: "params",
    responseTab: "body",
    activeHistoryId: null,
    activeCollectionId: null,
    activeEnvironmentId: null,
    compareResponse: null,
    showRunner: false,
    runnerCollectionId: null,
    showIntelligence: false,
  });
}

describe("uiStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // ── Initial state ────────────────────────────────────────────────────

  describe("initial state", () => {
    it("has correct default values", () => {
      const s = useUIStore.getState();
      expect(s.theme).toBe("dark");
      expect(s.toolMode).toBe("http");
      expect(s.sidebarOpen).toBe(true);
      expect(s.settingsOpen).toBe(false);
      expect(s.activeTab).toBe("params");
      expect(s.responseTab).toBe("body");
      expect(s.activeHistoryId).toBeNull();
      expect(s.activeCollectionId).toBeNull();
      expect(s.activeEnvironmentId).toBeNull();
      expect(s.compareResponse).toBeNull();
      expect(s.showRunner).toBe(false);
      expect(s.runnerCollectionId).toBeNull();
      expect(s.showIntelligence).toBe(false);
    });
  });

  // ── Theme ─────────────────────────────────────────────────────────────

  describe("theme", () => {
    it("setTheme updates the theme", () => {
      useUIStore.getState().setTheme("light");
      expect(useUIStore.getState().theme).toBe("light");
    });

    it("setTheme accepts all theme values", () => {
      const themes = ["light", "dark", "system", "nordic", "sunset", "midnight", "monochrome", "terminal", "true-dark", "matrix", "solarized", "nord", "aether", "ambertech"] as const;
      for (const t of themes) {
        useUIStore.getState().setTheme(t);
        expect(useUIStore.getState().theme).toBe(t);
      }
    });
  });

  // ── Sidebar ───────────────────────────────────────────────────────────

  describe("sidebar", () => {
    it("setSidebarOpen sets sidebar state", () => {
      useUIStore.getState().setSidebarOpen(false);
      expect(useUIStore.getState().sidebarOpen).toBe(false);

      useUIStore.getState().setSidebarOpen(true);
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it("toggleSidebar flips the sidebar state", () => {
      expect(useUIStore.getState().sidebarOpen).toBe(true);
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(false);
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });
  });

  // ── Settings ──────────────────────────────────────────────────────────

  describe("settings", () => {
    it("setSettingsOpen opens and closes settings", () => {
      useUIStore.getState().setSettingsOpen(true);
      expect(useUIStore.getState().settingsOpen).toBe(true);

      useUIStore.getState().setSettingsOpen(false);
      expect(useUIStore.getState().settingsOpen).toBe(false);
    });
  });

  // ── Tool Mode ─────────────────────────────────────────────────────────

  describe("toolMode", () => {
    it("setToolMode updates the tool mode", () => {
      useUIStore.getState().setToolMode("websocket");
      expect(useUIStore.getState().toolMode).toBe("websocket");
    });

    it("setToolMode accepts all valid modes", () => {
      const modes = ["http", "websocket", "grpc", "mock", "graphql", "flow", "replay"] as const;
      for (const m of modes) {
        useUIStore.getState().setToolMode(m);
        expect(useUIStore.getState().toolMode).toBe(m);
      }
    });

    it("setToolMode round-trip preserves value", () => {
      useUIStore.getState().setToolMode("graphql");
      useUIStore.getState().setToolMode("http");
      expect(useUIStore.getState().toolMode).toBe("http");
    });
  });

  // ── Active Tabs ───────────────────────────────────────────────────────

  describe("activeTab / responseTab", () => {
    it("setActiveTab updates the active tab", () => {
      useUIStore.getState().setActiveTab("auth");
      expect(useUIStore.getState().activeTab).toBe("auth");
    });

    it("setResponseTab updates the response tab", () => {
      useUIStore.getState().setResponseTab("headers");
      expect(useUIStore.getState().responseTab).toBe("headers");
    });
  });

  // ── History / Collection / Environment IDs ────────────────────────────

  describe("active IDs", () => {
    it("setActiveHistoryId sets and clears history id", () => {
      useUIStore.getState().setActiveHistoryId("hist-1");
      expect(useUIStore.getState().activeHistoryId).toBe("hist-1");

      useUIStore.getState().setActiveHistoryId(null);
      expect(useUIStore.getState().activeHistoryId).toBeNull();
    });

    it("setActiveCollectionId sets and clears collection id", () => {
      useUIStore.getState().setActiveCollectionId("col-1");
      expect(useUIStore.getState().activeCollectionId).toBe("col-1");

      useUIStore.getState().setActiveCollectionId(null);
      expect(useUIStore.getState().activeCollectionId).toBeNull();
    });

    it("setActiveEnvironmentId sets and clears environment id", () => {
      useUIStore.getState().setActiveEnvironmentId("env-1");
      expect(useUIStore.getState().activeEnvironmentId).toBe("env-1");

      useUIStore.getState().setActiveEnvironmentId(null);
      expect(useUIStore.getState().activeEnvironmentId).toBeNull();
    });
  });

  // ── Compare Response ──────────────────────────────────────────────────

  describe("compareResponse", () => {
    it("setCompareResponse stores response and switches to diff tab", () => {
      const response = { status: 200, status_text: "OK", headers: [], cookies: [], body: "{}", size: 100, time_ms: 50 };

      useUIStore.getState().setCompareResponse(response);

      expect(useUIStore.getState().compareResponse).toEqual(response);
      expect(useUIStore.getState().responseTab).toBe("diff");
    });

    it("setCompareResponse with null clears response and goes to body tab", () => {
      useUIStore.setState({ responseTab: "diff" });

      useUIStore.getState().setCompareResponse(null);

      expect(useUIStore.getState().compareResponse).toBeNull();
      expect(useUIStore.getState().responseTab).toBe("body");
    });
  });

  // ── Runner ────────────────────────────────────────────────────────────

  describe("showRunner", () => {
    it("setShowRunner shows runner with collectionId", () => {
      useUIStore.getState().setShowRunner(true, "col-1");

      expect(useUIStore.getState().showRunner).toBe(true);
      expect(useUIStore.getState().runnerCollectionId).toBe("col-1");
    });

    it("setShowRunner hides runner", () => {
      useUIStore.getState().setShowRunner(true, "col-1");
      useUIStore.getState().setShowRunner(false);

      expect(useUIStore.getState().showRunner).toBe(false);
      expect(useUIStore.getState().runnerCollectionId).toBeNull();
    });

    it("setShowRunner without collectionId defaults to null", () => {
      useUIStore.getState().setShowRunner(true);

      expect(useUIStore.getState().showRunner).toBe(true);
      expect(useUIStore.getState().runnerCollectionId).toBeNull();
    });
  });

  // ── Intelligence ──────────────────────────────────────────────────────

  describe("showIntelligence", () => {
    it("setShowIntelligence shows intelligence and hides runner", () => {
      useUIStore.setState({ showRunner: true });

      useUIStore.getState().setShowIntelligence(true);

      expect(useUIStore.getState().showIntelligence).toBe(true);
      expect(useUIStore.getState().showRunner).toBe(false);
    });

    it("setShowIntelligence hides intelligence", () => {
      useUIStore.getState().setShowIntelligence(true);
      useUIStore.getState().setShowIntelligence(false);

      expect(useUIStore.getState().showIntelligence).toBe(false);
    });
  });
});
