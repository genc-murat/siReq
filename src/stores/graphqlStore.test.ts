import { describe, it, expect, beforeEach } from "vitest";
import { useGraphQLStore, type GraphQLHistoryEntry, type GraphQLSubscriptionMessage } from "@/stores/graphqlStore";
import fc from "fast-check";

// Helper to create a minimal valid history entry
function makeEntry(overrides: Partial<GraphQLHistoryEntry> = {}): GraphQLHistoryEntry {
  return {
    id: crypto.randomUUID(),
    url: "https://example.com/graphql",
    query: "query { users { id } }",
    variables: "{}",
    operationName: "",
    operationType: "query",
    response: "{}",
    statusCode: 200,
    timeMs: 100,
    sizeBytes: 42,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<GraphQLSubscriptionMessage> = {}): GraphQLSubscriptionMessage {
  return {
    id: crypto.randomUUID(),
    data: "{}",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("graphqlStore", () => {
  beforeEach(() => {
    // Reset store state between tests
    const state = useGraphQLStore.getState();
    state.clearHistory();
    state.clearSubscriptionMessages();
    localStorage.removeItem("sireq-graphql");
  });

  // ─── Initial state ────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("has correct default values", () => {
      const s = useGraphQLStore.getState();
      expect(s.schema).toBeNull();
      expect(s.schemaSDL).toBe("");
      expect(s.schemaUrl).toBe("");
      expect(s.schemaError).toBeNull();
      expect(s.introspecting).toBe(false);
      expect(s.history).toEqual([]);
      expect(s.subscriptionStatus).toBe("idle");
      expect(s.subscriptionMessages).toEqual([]);
      expect(s.subscriptionError).toBeNull();
    });
  });

  // ─── setSchema — branch: sdl ?? "" ─────────────────────────────────────────

  describe("setSchema", () => {
    it("sets schema and clears schemaError", () => {
      const store = useGraphQLStore.getState();
      store.setSchema(null as never, "");
      const s = useGraphQLStore.getState();
      expect(s.schema).toBeNull();
      expect(s.schemaSDL).toBe("");
      expect(s.schemaError).toBeNull();
    });

    it("stores the provided SDL when passed", () => {
      const store = useGraphQLStore.getState();
      const fakeSchema = { __schema: true } as never;
      store.setSchema(fakeSchema, "type Query { hello: String }");
      const s = useGraphQLStore.getState();
      expect(s.schema).toBe(fakeSchema);
      expect(s.schemaSDL).toBe("type Query { hello: String }");
      expect(s.schemaError).toBeNull();
    });

    it("defaults SDL to empty string when not provided (branch: sdl ?? \"\")", () => {
      const store = useGraphQLStore.getState();
      const fakeSchema = { __schema: true } as never;
      store.setSchema(fakeSchema);
      const s = useGraphQLStore.getState();
      expect(s.schemaSDL).toBe("");
      expect(s.schemaError).toBeNull();
    });

    it("clears any previous schemaError", () => {
      useGraphQLStore.setState({ schemaError: "Previous error" });
      const store = useGraphQLStore.getState();
      store.setSchema(null as never, "");
      expect(useGraphQLStore.getState().schemaError).toBeNull();
    });
  });

  // ─── Schema setters ────────────────────────────────────────────────────────

  describe("setSchemaError", () => {
    it("sets schema error", () => {
      useGraphQLStore.getState().setSchemaError("Introspection failed");
      expect(useGraphQLStore.getState().schemaError).toBe("Introspection failed");
    });

    it("clears schema error with null", () => {
      useGraphQLStore.setState({ schemaError: "Some error" });
      useGraphQLStore.getState().setSchemaError(null);
      expect(useGraphQLStore.getState().schemaError).toBeNull();
    });
  });

  describe("setIntrospecting", () => {
    it("sets introspecting to true", () => {
      useGraphQLStore.getState().setIntrospecting(true);
      expect(useGraphQLStore.getState().introspecting).toBe(true);
    });

    it("sets introspecting to false", () => {
      useGraphQLStore.getState().setIntrospecting(false);
      expect(useGraphQLStore.getState().introspecting).toBe(false);
    });
  });

  describe("setSchemaUrl", () => {
    it("sets schema URL", () => {
      useGraphQLStore.getState().setSchemaUrl("https://api.example.com/graphql");
      expect(useGraphQLStore.getState().schemaUrl).toBe("https://api.example.com/graphql");
    });

    it("sets empty schema URL", () => {
      useGraphQLStore.getState().setSchemaUrl("");
      expect(useGraphQLStore.getState().schemaUrl).toBe("");
    });
  });

  // ─── History ───────────────────────────────────────────────────────────────

  describe("addHistory", () => {
    it("inserts at head (most recent first)", () => {
      const store = useGraphQLStore.getState();
      const e1 = makeEntry({ createdAt: "2024-01-01T00:00:00Z" });
      const e2 = makeEntry({ createdAt: "2024-01-02T00:00:00Z" });
      store.addHistory(e1);
      store.addHistory(e2);
      const history = useGraphQLStore.getState().history;
      expect(history[0].id).toBe(e2.id); // newest first
      expect(history[1].id).toBe(e1.id);
    });

    it("enforces max 100 records", () => {
      const store = useGraphQLStore.getState();
      for (let i = 0; i < 110; i++) {
        store.addHistory(makeEntry({ id: `id-${i}` }));
      }
      const history = useGraphQLStore.getState().history;
      expect(history.length).toBe(100);
    });
  });

  describe("deleteHistory", () => {
    it("removes the correct entry", () => {
      const store = useGraphQLStore.getState();
      const e1 = makeEntry({ id: "del-1" });
      const e2 = makeEntry({ id: "del-2" });
      store.addHistory(e1);
      store.addHistory(e2);
      store.deleteHistory("del-1");
      const history = useGraphQLStore.getState().history;
      expect(history.find((h) => h.id === "del-1")).toBeUndefined();
      expect(history.find((h) => h.id === "del-2")).toBeDefined();
    });

    it("removing non-existent id does nothing (branch: filter id match)", () => {
      const store = useGraphQLStore.getState();
      store.addHistory(makeEntry({ id: "existing" }));
      store.deleteHistory("non-existent");
      const history = useGraphQLStore.getState().history;
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe("existing");
    });

    it("works on empty history without error", () => {
      useGraphQLStore.getState().deleteHistory("anything");
      expect(useGraphQLStore.getState().history).toHaveLength(0);
    });
  });

  describe("clearHistory", () => {
    it("empties the list", () => {
      const store = useGraphQLStore.getState();
      store.addHistory(makeEntry());
      store.addHistory(makeEntry());
      store.clearHistory();
      expect(useGraphQLStore.getState().history.length).toBe(0);
    });

    it("works on already empty history", () => {
      useGraphQLStore.getState().clearHistory();
      expect(useGraphQLStore.getState().history).toEqual([]);
    });
  });

  // ─── Subscription messages ─────────────────────────────────────────────────

  describe("addSubscriptionMessage", () => {
    it("appends messages", () => {
      const store = useGraphQLStore.getState();
      const m = makeMessage();
      store.addSubscriptionMessage(m);
      expect(useGraphQLStore.getState().subscriptionMessages.length).toBe(1);
    });

    it("enforces max 500 messages (FIFO)", () => {
      const store = useGraphQLStore.getState();
      for (let i = 0; i < 510; i++) {
        store.addSubscriptionMessage(makeMessage({ id: `msg-${i}` }));
      }
      const msgs = useGraphQLStore.getState().subscriptionMessages;
      expect(msgs.length).toBe(500);
      // Oldest dropped — first 10 (msg-0 to msg-9) should be gone
      expect(msgs.find((m) => m.id === "msg-0")).toBeUndefined();
      expect(msgs[msgs.length - 1].id).toBe("msg-509");
    });

    it("triggers shift at exactly 501 messages (branch: > 500)", () => {
      const store = useGraphQLStore.getState();
      for (let i = 0; i < 501; i++) {
        store.addSubscriptionMessage(makeMessage({ id: `msg-${i}` }));
      }
      const msgs = useGraphQLStore.getState().subscriptionMessages;
      expect(msgs.length).toBe(500);
      // msg-0 should be shifted out
      expect(msgs.find((m) => m.id === "msg-0")).toBeUndefined();
      // msg-1 is now first
      expect(msgs[0].id).toBe("msg-1");
      expect(msgs[msgs.length - 1].id).toBe("msg-500");
    });

    it("keeps all messages when under 500 limit", () => {
      const store = useGraphQLStore.getState();
      for (let i = 0; i < 3; i++) {
        store.addSubscriptionMessage(makeMessage({ id: `msg-${i}` }));
      }
      const msgs = useGraphQLStore.getState().subscriptionMessages;
      expect(msgs.length).toBe(3);
    });
  });

  describe("clearSubscriptionMessages", () => {
    it("clears non-empty messages", () => {
      const store = useGraphQLStore.getState();
      store.addSubscriptionMessage(makeMessage());
      store.addSubscriptionMessage(makeMessage());
      store.clearSubscriptionMessages();
      expect(useGraphQLStore.getState().subscriptionMessages).toEqual([]);
    });

    it("works on already empty messages", () => {
      useGraphQLStore.getState().clearSubscriptionMessages();
      expect(useGraphQLStore.getState().subscriptionMessages).toEqual([]);
    });
  });

  // ─── Subscription status & error ───────────────────────────────────────────

  describe("setSubscriptionStatus", () => {
    it("sets status to connecting", () => {
      useGraphQLStore.getState().setSubscriptionStatus("connecting");
      expect(useGraphQLStore.getState().subscriptionStatus).toBe("connecting");
    });

    it("sets status to connected", () => {
      useGraphQLStore.getState().setSubscriptionStatus("connected");
      expect(useGraphQLStore.getState().subscriptionStatus).toBe("connected");
    });

    it("sets status to disconnected", () => {
      useGraphQLStore.getState().setSubscriptionStatus("disconnected");
      expect(useGraphQLStore.getState().subscriptionStatus).toBe("disconnected");
    });

    it("sets status to error", () => {
      useGraphQLStore.getState().setSubscriptionStatus("error");
      expect(useGraphQLStore.getState().subscriptionStatus).toBe("error");
    });

    it("sets status to idle", () => {
      useGraphQLStore.getState().setSubscriptionStatus("idle");
      expect(useGraphQLStore.getState().subscriptionStatus).toBe("idle");
    });
  });

  describe("setSubscriptionError", () => {
    it("sets subscription error", () => {
      useGraphQLStore.getState().setSubscriptionError("Connection lost");
      expect(useGraphQLStore.getState().subscriptionError).toBe("Connection lost");
    });

    it("sets subscription error to null", () => {
      useGraphQLStore.setState({ subscriptionError: "Previous error" });
      useGraphQLStore.getState().setSubscriptionError(null);
      expect(useGraphQLStore.getState().subscriptionError).toBeNull();
    });
  });

  // ─── Persist middleware — partialize ───────────────────────────────────────

  describe("persist middleware", () => {
    it("partialize excludes schema, subscriptionStatus, subscriptionMessages, subscriptionError from persistence", () => {
      // The persist middleware's partialize function runs internally.
      // We can verify it works by checking that schema-related non-serializable
      // state is excluded from the persisted output.

      // Set all state values
      useGraphQLStore.setState({
        schema: { __schema: true } as never,
        schemaSDL: "type Query { test: String }",
        schemaUrl: "https://api.example.com/graphql",
        schemaError: "test error",
        introspecting: true,
        history: [makeEntry({ id: "persist-test" })],
        subscriptionStatus: "connected",
        subscriptionMessages: [makeMessage({ id: "persist-msg" })],
        subscriptionError: "test sub error",
      });

      // Get persisted state snapshot from localStorage
      const persistedRaw = localStorage.getItem("sireq-graphql");
      expect(persistedRaw).not.toBeNull();

      const persisted = JSON.parse(persistedRaw!);
      const state = persisted?.state || persisted;

      // Schema (class instance) should be excluded
      expect(state.schema).toBeUndefined();
      expect(state.schemaError).toBeUndefined();
      expect(state.introspecting).toBeUndefined();
      expect(state.subscriptionStatus).toBeUndefined();
      expect(state.subscriptionMessages).toBeUndefined();
      expect(state.subscriptionError).toBeUndefined();

      // These should be persisted
      expect(state.schemaSDL).toBe("type Query { test: String }");
      expect(state.schemaUrl).toBe("https://api.example.com/graphql");
      expect(state.history).toHaveLength(1);
      expect(state.history[0].id).toBe("persist-test");
    });
  });

  // ─── Property-based tests ─────────────────────────────────────────────────

  it("Property 10: addHistory round-trip — url, query, operationType are preserved", () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.constantFrom("query", "mutation", "subscription" as const),
        (url, query, operationType) => {
          const store = useGraphQLStore.getState();
          store.clearHistory();
          const entry = makeEntry({ url, query, operationType });
          store.addHistory(entry);
          const history = useGraphQLStore.getState().history;
          const found = history.find((h) => h.id === entry.id);
          expect(found).toBeDefined();
          expect(found!.url).toBe(url);
          expect(found!.query).toBe(query);
          expect(found!.operationType).toBe(operationType);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("Property 11: history is always in descending insertion order (newest first)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 2, maxLength: 20 }),
        (ids) => {
          const store = useGraphQLStore.getState();
          store.clearHistory();
          for (const id of ids) {
            store.addHistory(makeEntry({ id }));
          }
          const history = useGraphQLStore.getState().history;
          // The last inserted id should be at position 0
          const lastId = ids[ids.length - 1];
          expect(history[0].id).toBe(lastId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("addHistory never exceeds 100 entries (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 50, maxLength: 200 }),
        (ids) => {
          const store = useGraphQLStore.getState();
          store.clearHistory();
          for (const id of ids) {
            store.addHistory(makeEntry({ id }));
          }
          const history = useGraphQLStore.getState().history;
          expect(history.length).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 30 }
    );
  });
});
