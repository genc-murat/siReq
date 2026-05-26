import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GraphQLSchema } from "graphql";

export type GraphQLOperationType = "query" | "mutation" | "subscription";

export interface GraphQLHistoryEntry {
  id: string;
  url: string;
  query: string;
  variables: string;       // JSON string
  operationName: string;
  operationType: GraphQLOperationType;
  response: string;        // JSON string (raw response body)
  statusCode: number;
  timeMs: number;
  sizeBytes: number;
  createdAt: string;       // ISO 8601
}

export interface GraphQLSubscriptionMessage {
  id: string;
  data: string;            // JSON string
  timestamp: string;       // ISO 8601
}

interface GraphQLState {
  // Schema (not persisted — rebuilt from SDL on load)
  schema: GraphQLSchema | null;
  schemaSDL: string;
  schemaUrl: string;
  schemaError: string | null;
  introspecting: boolean;

  // History (max 100 records, descending createdAt)
  history: GraphQLHistoryEntry[];

  // Subscription state
  subscriptionStatus: "idle" | "connecting" | "connected" | "disconnected" | "error";
  subscriptionMessages: GraphQLSubscriptionMessage[]; // max 500
  subscriptionError: string | null;

  // Actions
  setSchema: (schema: GraphQLSchema | null, sdl?: string) => void;
  setSchemaError: (error: string | null) => void;
  setIntrospecting: (v: boolean) => void;
  setSchemaUrl: (url: string) => void;
  addHistory: (entry: GraphQLHistoryEntry) => void;
  deleteHistory: (id: string) => void;
  clearHistory: () => void;
  setSubscriptionStatus: (status: GraphQLState["subscriptionStatus"]) => void;
  addSubscriptionMessage: (msg: GraphQLSubscriptionMessage) => void;
  clearSubscriptionMessages: () => void;
  setSubscriptionError: (error: string | null) => void;
}

export const useGraphQLStore = create<GraphQLState>()(
  persist(
    (set) => ({
      // Non-persisted (schema is a class instance, not serializable)
      schema: null,
      schemaError: null,
      introspecting: false,

      // Persisted
      schemaSDL: "",
      schemaUrl: "",
      history: [],
      subscriptionStatus: "idle",
      subscriptionMessages: [],
      subscriptionError: null,

      setSchema: (schema, sdl) =>
        set({ schema, schemaSDL: sdl ?? "", schemaError: null }),

      setSchemaError: (error) => set({ schemaError: error }),

      setIntrospecting: (v) => set({ introspecting: v }),

      setSchemaUrl: (url) => set({ schemaUrl: url }),

      addHistory: (entry) =>
        set((state) => {
          // Insert new entry at head, keep max 100, maintain descending order
          const next = [entry, ...state.history].slice(0, 100);
          return { history: next };
        }),

      deleteHistory: (id) =>
        set((state) => ({ history: state.history.filter((h) => h.id !== id) })),

      clearHistory: () => set({ history: [] }),

      setSubscriptionStatus: (status) => set({ subscriptionStatus: status }),

      addSubscriptionMessage: (msg) =>
        set((state) => {
          const msgs = [...state.subscriptionMessages, msg];
          // FIFO: drop oldest if over 500
          if (msgs.length > 500) msgs.shift();
          return { subscriptionMessages: msgs };
        }),

      clearSubscriptionMessages: () => set({ subscriptionMessages: [] }),

      setSubscriptionError: (error) => set({ subscriptionError: error }),
    }),
    {
      name: "sireq-graphql",
      // Exclude schema (non-serializable class instance) from persistence
      partialize: (state) => ({
        schemaSDL: state.schemaSDL,
        schemaUrl: state.schemaUrl,
        history: state.history,
      }),
    }
  )
);
