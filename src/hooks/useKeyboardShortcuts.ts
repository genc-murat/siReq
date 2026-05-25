import { useEffect } from "react";
import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";

export function useKeyboardShortcuts(urlInputRef?: React.RefObject<HTMLInputElement | null>) {
  const send = useRequestStore((s) => s.send);
  const reset = useRequestStore((s) => s.reset);
  const environmentId = useUIStore((s) => s.activeEnvironmentId);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (e.key !== "Enter" && e.key !== "b" && e.key !== "n") return;
      }

      switch (e.key) {
        case "Enter":
          e.preventDefault();
          send(environmentId);
          break;
        case "l":
          e.preventDefault();
          urlInputRef?.current?.focus();
          urlInputRef?.current?.select();
          break;
        case "b":
          e.preventDefault();
          toggleSidebar();
          break;
        case "n":
          e.preventDefault();
          reset();
          addToast("New request", "info");
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [send, reset, environmentId, toggleSidebar, urlInputRef, addToast]);
}
