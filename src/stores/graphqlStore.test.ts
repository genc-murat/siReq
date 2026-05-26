import { describe, it, expect, beforeEach } from "vitest";
import { useGraphQLStore } from "@/stores/graphqlStore";
import type { GraphQLHistoryEntry, GraphQLSubscriptionMessage } from "@/stores/graphqlStore";
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
  });

  // ─── Unit: addHistory ───────────────────────────────────────────────────────

  it("addHistory inserts at head (most recent first)", () => {
    const store = useGraphQLStore.getState();
    const e1 = makeEntry({ createdAt: "2024-01-01T00:00:00Z" });
    const e2 = makeEntry({ createdAt: "2024-01-02T00:00:00Z" });
    store.addHistory(e1);
    store.addHistory(e2);
    const history = useGraphQLStore.getState().history;
    expect(history[0].id).toBe(e2.id); // newest first
    expect(history[1].id).toBe(e1.id);
  });

  it("addHistory enforces max 100 records", () => {
    const store = useGraphQLStore.getState();
    for (let i = 0; i < 110; i++) {
      store.addHistory(makeEntry({ id: `id-${i}` }));
    }
    const history = useGraphQLStore.getState().history;
    expect(history.length).toBe(100);
  });

  it("deleteHistory removes the correct entry", () => {
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

  it("clearHistory empties the list", () => {
    const store = useGraphQLStore.getState();
    store.addHistory(makeEntry());
    store.addHistory(makeEntry());
    store.clearHistory();
    expect(useGraphQLStore.getState().history.length).toBe(0);
  });

  // ─── Unit: addSubscriptionMessage ──────────────────────────────────────────

  it("addSubscriptionMessage appends messages", () => {
    const store = useGraphQLStore.getState();
    const m = makeMessage();
    store.addSubscriptionMessage(m);
    expect(useGraphQLStore.getState().subscriptionMessages.length).toBe(1);
  });

  it("addSubscriptionMessage enforces max 500 messages (FIFO)", () => {
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

  // ─── Property 10: History Ekleme Round-Trip ─────────────────────────────────

  it("Property 10: addHistory round-trip — url, query, operationType are preserved", () => {
    // Feature: graphql-support, Property 10: Geçmiş Ekleme Round-Trip
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

  // ─── Property 11: Geçmiş Sıralama Invariantı ────────────────────────────────

  it("Property 11: history is always in descending insertion order (newest first)", () => {
    // Feature: graphql-support, Property 11: Geçmiş Sıralama Invariantı
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
});
