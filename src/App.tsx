import { useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useTabStore } from "@/stores/tabStore";
import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";

function App() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const tabStore = useTabStore.getState();

    // Subscribe to response/error changes to sync back to active tab
    const unsub = useRequestStore.subscribe((state, prevState) => {
      if (
        (state.response !== prevState.response && state.response !== null) ||
        (state.error !== prevState.error && state.error !== null)
      ) {
        useTabStore.getState().syncCurrentToTab();
      }
    });

    // Initialize with first tab if none exist
    if (tabStore.tabs.length === 0) {
      tabStore.createTab();
    } else if (tabStore.activeTabId) {
      // Restore active tab state from persisted tabs
      const tab = tabStore.tabs.find((t) => t.id === tabStore.activeTabId);
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

    return () => unsub();
  }, []);

  // ── Auto-update check ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function checkUpdate() {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!update || cancelled) return;

        const toastStore = useToastStore.getState();
        toastStore.addToast(
          `Downloading siReq v${update.version}...`,
          "info"
        );

        await update.downloadAndInstall((event) => {
          if (event.event === "Finished") {
            toastStore.addToast(
              `Update v${update.version} installed. Restarting siReq to apply...`,
              "success"
            );
          }
        });

        if (!cancelled) {
          // Small delay so the user sees the success toast before relaunch
          await new Promise((r) => setTimeout(r, 1500));
          const { relaunch } = await import("@tauri-apps/plugin-process");
          await relaunch();
        }
      } catch {
        // Silently fail — user may be offline or running without the updater
      }
    }

    // Delay update check to avoid slowing down initial startup
    const timer = setTimeout(checkUpdate, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <Layout />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
