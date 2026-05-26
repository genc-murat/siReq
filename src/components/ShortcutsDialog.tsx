import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface ShortcutGroup {
  category: string;
  shortcuts: { keys: string; description: string }[];
}

const groups: ShortcutGroup[] = [
  {
    category: "Request",
    shortcuts: [
      { keys: "Ctrl+Enter", description: "Send request" },
      { keys: "Ctrl+L", description: "Focus URL bar" },
      { keys: "Ctrl+N", description: "New request" },
      { keys: "Ctrl+Shift+C", description: "Copy as cURL" },
    ],
  },
  {
    category: "Tabs",
    shortcuts: [
      { keys: "Ctrl+T", description: "New tab" },
      { keys: "Ctrl+W", description: "Close current tab" },
      { keys: "Ctrl+Tab", description: "Switch to next tab" },
      { keys: "Ctrl+Shift+Tab", description: "Switch to previous tab" },
    ],
  },
  {
    category: "View",
    shortcuts: [
      { keys: "Ctrl+B", description: "Toggle sidebar" },
      { keys: "Ctrl+K", description: "Command palette" },
      { keys: "?", description: "Keyboard shortcuts (this)" },
    ],
  },
  {
    category: "Tools",
    shortcuts: [
      { keys: "Ctrl+Alt+H", description: "Switch to HTTP mode" },
      { keys: "Ctrl+Alt+W", description: "Switch to WebSocket mode" },
    ],
  },
  {
    category: "Sidebar",
    shortcuts: [
      { keys: "Ctrl+Shift+H", description: "Show history tab" },
      { keys: "Ctrl+Shift+S", description: "Show collections tab" },
    ],
  },
];

export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        // Allow ? in inputs too
        if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setOpen((prev) => !prev);
        }
        return;
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50 rounded-xl border bg-popover shadow-xl overflow-hidden focus:outline-none max-h-[80vh] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <Dialog.Title className="text-sm font-semibold flex items-center gap-2">
              <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Keyboard Shortcuts
            </Dialog.Title>
            <Dialog.Close className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto p-3 space-y-4">
            {groups.map((group) => (
              <div key={group.category}>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  {group.category}
                </h3>
                <div className="space-y-0.5">
                  {group.shortcuts.map((item) => (
                    <div
                      key={item.keys + item.description}
                      className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-accent transition-all duration-150"
                    >
                      <span className="text-sm text-foreground">{item.description}</span>
                      <kbd className="px-1.5 py-0.5 text-[11px] font-mono bg-secondary text-secondary-foreground rounded-lg border border-border shadow-sm shrink-0 ml-4">
                        {item.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Press <kbd className="px-1 py-0.5 text-[10px] font-mono bg-secondary rounded-lg border border-border shadow-sm">?</kbd> again to close</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
