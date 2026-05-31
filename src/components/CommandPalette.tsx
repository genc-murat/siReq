import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useTabStore } from "@/stores/tabStore";
import { useUIStore } from "@/stores/uiStore";
import { useRequestStore } from "@/stores/requestStore";
import { useToastStore } from "@/stores/toastStore";
import { clearHistory } from "@/lib/invoke";
import { generateCurl } from "@/lib/curlGenerator";

interface Action {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

function buildActions(close: () => void): Action[] {
  return [
    {
      id: "new-tab",
      label: "New Tab",
      description: "Create a new request tab",
      shortcut: "⌘T",
      category: "Request",
      action: () => {
        useTabStore.getState().createTab();
        useToastStore.getState().addToast("New tab", "info");
        close();
      },
    },
    {
      id: "new-request",
      label: "New Request",
      description: "Reset the current request",
      shortcut: "⌘N",
      category: "Request",
      action: () => {
        useRequestStore.getState().reset();
        useToastStore.getState().addToast("New request", "info");
        close();
      },
    },
    {
      id: "send-request",
      label: "Send Request",
      description: "Send the current request",
      shortcut: "⌘⏎",
      category: "Request",
      action: () => {
        const environmentId = useUIStore.getState().activeEnvironmentId;
        useRequestStore.getState().send(environmentId);
        close();
      },
    },
    {
      id: "toggle-sidebar",
      label: "Toggle Sidebar",
      description: "Show or hide the sidebar",
      shortcut: "⌘B",
      category: "View",
      action: () => {
        useUIStore.getState().toggleSidebar();
        close();
      },
    },
    {
      id: "toggle-theme",
      label: "Toggle Theme",
      description: "Switch between light, dark, and system theme",
      category: "View",
      action: () => {
        const { theme, setTheme } = useUIStore.getState();
        const themes: ("light" | "dark" | "system" | "nordic" | "sunset" | "midnight" | "monochrome" | "terminal" | "true-dark" | "matrix" | "solarized" | "nord" | "aether")[] = [
          "light",
          "dark",
          "nordic",
          "sunset",
          "midnight",
          "monochrome",
          "terminal",
          "true-dark",
          "matrix",
          "solarized",
          "nord",
          "aether",
          "system"
        ];
        const idx = themes.indexOf(theme);
        setTheme(themes[(idx + 1) % themes.length]);
        close();
      },
    },
    {
      id: "copy-curl",
      label: "Copy as cURL",
      description: "Copy the current request as a cURL command",
      category: "Request",
      action: () => {
        const request = useRequestStore.getState().request;
        const curl = generateCurl(request);
        navigator.clipboard.writeText(curl);
        useToastStore.getState().addToast("Copied as cURL", "success");
        close();
      },
    },
    {
      id: "import-curl",
      label: "Import cURL",
      description: "Import a request from a cURL command",
      category: "Request",
      action: () => {
        useToastStore.getState().addToast("Open sidebar and use the cURL import button", "info");
        close();
      },
    },
    {
      id: "clear-history",
      label: "Clear History",
      description: "Clear all request history",
      category: "History",
      action: () => {
        clearHistory().then(() => {
          useToastStore.getState().addToast("History cleared", "info");
        });
        close();
      },
    },
    {
      id: "docs",
      label: "Help & Shortcuts",
      description: "View available keyboard shortcuts",
      category: "Help",
      action: () => {
        useToastStore.getState().addToast(
          "⌘⏎ Send | ⌘L URL | ⌘B Sidebar | ⌘N New | ⌘T Tab | ⌘W Close Tab | ⌘K Command Palette",
          "info"
        );
        close();
      },
    },
  ];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const closingRef = useRef(false);

  const [prevOpen, setPrevOpen] = useState(false);
  const [prevSearch, setPrevSearch] = useState("");

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSearch("");
      setSelectedIndex(0);
    }
  }

  if (search !== prevSearch) {
    setPrevSearch(search);
    setSelectedIndex(0);
  }

  const onClose = useCallback(() => {
    closingRef.current = true;
    setOpen(false);
  }, []);

  // eslint-disable-next-line react-hooks/refs
  const actions = useMemo(() => buildActions(onClose), [onClose]);

  const filtered = search.trim()
    ? actions.filter(
        (a) =>
          a.label.toLowerCase().includes(search.toLowerCase()) ||
          a.description.toLowerCase().includes(search.toLowerCase()) ||
          a.category.toLowerCase().includes(search.toLowerCase())
      )
    : actions;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      closingRef.current = false;
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
        setOpen(false);
      }
    },
    [filtered, selectedIndex]
  );

  // Global shortcuts: Ctrl+K for palette, Ctrl+T for new tab, Ctrl+W for close tab
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "t") {
        e.preventDefault();
        useTabStore.getState().createTab();
        useToastStore.getState().addToast("New tab", "info");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        const { tabs, activeTabId, closeTab } = useTabStore.getState();
        if (activeTabId && tabs.length > 1) {
          closeTab(activeTabId);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const grouped = filtered.reduce<Record<string, Action[]>>((acc, action) => {
    if (!acc[action.category]) acc[action.category] = [];
    acc[action.category].push(action);
    return acc;
  }, {});

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50 rounded-xl border bg-popover shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden focus:outline-none"
          onKeyDown={handleKeyDown}
        >
          <div className="flex items-center border-b px-3">
            <svg className="h-4 w-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type a command..."
              className="flex-1 bg-transparent text-sm px-2 py-3 focus:outline-none text-foreground placeholder:text-muted-foreground"
            />
            <span className="text-xs text-muted-foreground font-mono">esc</span>
          </div>
          <div className="max-h-80 overflow-y-auto p-1">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {category}
                </div>
                {items.map((item) => {
                  const globalIdx = filtered.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        item.action();
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-2 text-sm rounded-lg transition-all duration-150 text-left",
                        globalIdx === selectedIndex
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground hover:bg-accent/50"
                      )}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                    >
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.shortcut && (
                        <span className="text-xs text-muted-foreground shrink-0 font-mono">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-8 text-sm text-muted-foreground text-center">
                No results found
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
