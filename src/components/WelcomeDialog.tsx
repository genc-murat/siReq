import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Globe, Workflow, Play, Server, Zap, Braces, Plus, Keyboard } from "lucide-react";

const WELCOME_STORAGE_KEY = "sireq-welcome-shown";

const quickSteps = [
  {
    icon: Plus,
    title: "Create a Request",
    description: "Press Ctrl+T or click New to create a new tab. Enter a URL, select a method, and click Send to fire your first HTTP request.",
  },
  {
    icon: Globe,
    title: "HTTP, GraphQL, gRPC & WebSocket",
    description: "Switch between HTTP, GraphQL, gRPC, and WebSocket modes using the toolbar at the top of the window.",
  },
  {
    icon: Workflow,
    title: "Visual Chaining Flow Editor",
    description: "Model complex request workflows visually. Add Set Variable, Script, Assertion, and Condition nodes to automate API testing.",
  },
  {
    icon: Server,
    title: "Smart Mock Server",
    description: "Spin up local mock servers with dynamic faker responses, latency profiles, and CORS configuration — no external dependencies needed.",
  },
  {
    icon: Play,
    title: "Collection Runner",
    description: "Run entire collections sequentially with data-driven CSV/JSON datasets. Use Smoke, Regression, or Load test modes.",
  },
  {
    icon: Keyboard,
    title: "Keyboard Shortcuts",
    description: "Press ? to view all keyboard shortcuts. Ctrl+Enter to send, Ctrl+K for command palette, Ctrl+B to toggle sidebar.",
  },
];

export function WelcomeDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const shown = localStorage.getItem(WELCOME_STORAGE_KEY);
    if (!shown) {
      setOpen(true);
      localStorage.setItem(WELCOME_STORAGE_KEY, "true");
    }
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-[90vw] max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border bg-background p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>

          <div className="space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  S
                </div>
                <span className="text-2xl font-bold tracking-tight">siReq</span>
              </div>
              <h2 className="text-lg font-semibold">Welcome to siReq v1.0.0</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                A modern, high-performance desktop API client built with Rust and React 19.
                Local-first, no cloud bloat, just pure native speed.
              </p>
            </div>

            {/* Quick Start Steps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {quickSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.title}
                    className="flex gap-3 p-3 rounded-lg border bg-card/50 hover:bg-accent/30 transition-colors"
                  >
                    <div className="shrink-0 h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <h4 className="text-sm font-medium leading-tight">{step.title}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Need help? Visit{" "}
                <a
                  href="https://github.com/genc-murat/siReq"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  GitHub
                </a>
              </p>
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm">
                  Get Started
                </button>
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
