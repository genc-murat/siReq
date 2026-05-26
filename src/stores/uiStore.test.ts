import { describe, it, expect } from "vitest";
import { useUIStore } from "@/stores/uiStore";
import fc from "fast-check";

describe("uiStore — toolMode", () => {
  // ─── Property 1: ToolMode Round-Trip ────────────────────────────────────────

  it("Property 1: setToolMode round-trip for all valid modes", () => {
    // Feature: graphql-support, Property 1: ToolMode Round-Trip
    const validModes = ["http", "websocket", "grpc", "mock", "graphql"] as const;
    fc.assert(
      fc.property(
        fc.constantFrom(...validModes),
        (mode) => {
          useUIStore.getState().setToolMode(mode);
          expect(useUIStore.getState().toolMode).toBe(mode);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("setToolMode('graphql') updates toolMode to graphql", () => {
    useUIStore.getState().setToolMode("http");
    useUIStore.getState().setToolMode("graphql");
    expect(useUIStore.getState().toolMode).toBe("graphql");
  });

  it("setToolMode switches back from graphql to other modes", () => {
    useUIStore.getState().setToolMode("graphql");
    useUIStore.getState().setToolMode("http");
    expect(useUIStore.getState().toolMode).toBe("http");
  });

  // ─── Property 2: GraphQL Dışı Modlarda Panel Gizleme (store-level check) ───

  it("Property 2: toolMode is not graphql for all non-graphql modes", () => {
    // Feature: graphql-support, Property 2: GraphQL Dışı Modlarda Panel Gizleme
    const nonGraphqlModes = ["http", "websocket", "grpc", "mock"] as const;
    fc.assert(
      fc.property(
        fc.constantFrom(...nonGraphqlModes),
        (mode) => {
          useUIStore.getState().setToolMode(mode);
          expect(useUIStore.getState().toolMode).not.toBe("graphql");
        }
      ),
      { numRuns: 50 }
    );
  });
});
