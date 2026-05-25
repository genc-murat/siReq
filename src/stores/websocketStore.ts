import { create } from "zustand";
import type { WsMessageEvent } from "@/lib/invoke";

export interface WsLogEntry {
  id: string;
  direction: "sent" | "received" | "system";
  data: string;
  timestamp: string;
  is_binary: boolean;
}

interface WebSocketStore {
  connectionId: string | null;
  status: "disconnected" | "connecting" | "connected";
  url: string;
  messages: WsLogEntry[];
  setConnectionId: (id: string | null) => void;
  setStatus: (status: "disconnected" | "connecting" | "connected") => void;
  setUrl: (url: string) => void;
  addMessage: (event: WsMessageEvent) => void;
  clearMessages: () => void;
  reset: () => void;
}

function generateId(): string {
  return crypto.randomUUID();
}

export const useWebSocketStore = create<WebSocketStore>((set) => ({
  connectionId: null,
  status: "disconnected",
  url: "wss://echo.websocket.org",
  messages: [],

  setConnectionId: (id) => set({ connectionId: id }),
  setStatus: (status) => set({ status }),
  setUrl: (url) => set({ url }),

  addMessage: (event) => {
    const entry: WsLogEntry = {
      id: generateId(),
      direction: event.direction,
      data: event.data,
      timestamp: new Date().toLocaleTimeString(),
      is_binary: event.is_binary,
    };
    set((s) => ({ messages: [...s.messages, entry] }));
  },

  clearMessages: () => set({ messages: [] }),
  reset: () =>
    set({
      connectionId: null,
      status: "disconnected",
      messages: [],
    }),
}));
