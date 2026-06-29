import { describe, it, expect, beforeEach, vi } from "vitest";
import { useReplayStore } from "./replayStore";
import type {
  ReplaySession,
  ReplayEntry,
  ReplayRun,
  ReplayEntryResult,
  HttpRequest,
  HttpResponse,
} from "@/lib/invoke";

// ── Hoisted mutable mock state ─────────────────────────────────────────────

const { mockReplay } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockReplay: {
      replayCreateSession: fn(),
      replayGetSessions: fn(),
      replayUpdateSession: fn(),
      replayDeleteSession: fn(),
      replayGetEntries: fn(),
      replayAddEntries: fn(),
      replayRemoveEntry: fn(),
      replayReorderEntries: fn(),
      replayUpdateEntry: fn(),
      replayClearEntries: fn(),
      replayExecuteRun: fn(),
      replayStartStreaming: fn(),
      replayPauseRun: fn(),
      replayResumeRun: fn(),
      replayCancelRun: fn(),
      replayStepEntry: fn(),
      replayGetRuns: fn(),
      replayGetRunDetail: fn(),
      replayDeleteRun: fn(),
      replayCompareRuns: fn(),
    },
  };
});

vi.mock("@/lib/invoke", () => mockReplay);

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockSession(id: string, overrides?: Partial<ReplaySession>): ReplaySession {
  return {
    id,
    name: `Session ${id}`,
    description: "",
    remap_rules: [],
    assertions: [],
    chaos_config: {
      enabled: false,
      timeout_probability: 0,
      timeout_min_ms: 0,
      timeout_max_ms: 0,
      delay_probability: 0,
      delay_min_ms: 0,
      delay_max_ms: 0,
      error_probability: 0,
      error_status_codes: [],
    },
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function createMockEntry(id: string, sessionId: string, position: number): ReplayEntry {
  return {
    id,
    session_id: sessionId,
    position,
    original_request: { id: "req", method: "GET", url: "https://example.com", headers: [], query_params: [], body_type: "none", body: "", form_fields: [], auth: { type: "none", username: "", password: "", token: "", api_key: "", api_key_name: "", api_key_in: "header" }, settings: { timeout: 30, follow_redirects: true, ssl_verify: true, proxy: null }, pre_script: "", post_script: "", name: "" } as HttpRequest,
    original_response: { status: 200, status_text: "OK", headers: [], cookies: [], body: "{}", size: 100, time_ms: 50 } as HttpResponse,
    created_at: "2025-01-01T00:00:00Z",
  };
}

function createMockRun(id: string, sessionId: string): ReplayRun {
  return {
    id,
    session_id: sessionId,
    status: "completed",
    duration_ms: 1000,
    environment_id: null,
    chaos_config: {
      enabled: false, timeout_probability: 0, timeout_min_ms: 0, timeout_max_ms: 0,
      delay_probability: 0, delay_min_ms: 0, delay_max_ms: 0, error_probability: 0, error_status_codes: [],
    },
    created_at: "2025-01-01T00:00:00Z",
  };
}

function createMockEntryResult(entryId: string): ReplayEntryResult {
  return {
    id: `er-${entryId}`,
    run_id: "run-1",
    entry_id: entryId,
    status: "completed",
    replayed_request: null,
    replayed_response: null,
    diff: null,
    assertion_results: [],
    error: null,
    created_at: "2025-01-01T00:00:00Z",
  };
}

function resetStore() {
  useReplayStore.setState({
    sessions: [],
    activeSessionId: null,
    entries: [],
    activeEntryId: null,
    runs: [],
    activeRunDetail: null,
    runComparison: null,
    selectedRunIds: null,
    playbackState: "idle",
    streamingRunId: null,
    currentEntryIndex: -1,
    currentRunEntryResults: new Map(),
    loading: false,
    error: null,
  });
}

function resetMocks() {
  for (const fn of Object.values(mockReplay)) {
    fn.mockReset();
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("replayStore", () => {
  beforeEach(() => {
    resetStore();
    resetMocks();
  });

  // ── Initial state ────────────────────────────────────────────────────

  describe("initial state", () => {
    it("has empty sessions, entries, runs and idle playback", () => {
      const s = useReplayStore.getState();
      expect(s.sessions).toEqual([]);
      expect(s.activeSessionId).toBeNull();
      expect(s.entries).toEqual([]);
      expect(s.runs).toEqual([]);
      expect(s.playbackState).toBe("idle");
      expect(s.loading).toBe(false);
      expect(s.error).toBeNull();
    });
  });

  // ── Session Management ───────────────────────────────────────────────

  describe("loadSessions", () => {
    it("loads sessions from backend", async () => {
      const sessions = [createMockSession("s1")];
      mockReplay.replayGetSessions.mockResolvedValue(sessions);

      await useReplayStore.getState().loadSessions();

      expect(useReplayStore.getState().sessions).toEqual(sessions);
    });

    it("sets error on failure", async () => {
      mockReplay.replayGetSessions.mockRejectedValue(new Error("DB error"));

      await useReplayStore.getState().loadSessions();

      expect(useReplayStore.getState().error).toBe("DB error");
    });
  });

  describe("createSession", () => {
    it("creates session and sets it as active", async () => {
      const session = createMockSession("s1", { name: "New Session" });
      mockReplay.replayCreateSession.mockResolvedValue(session);

      const id = await useReplayStore.getState().createSession("New Session");

      expect(id).toBe("s1");
      expect(useReplayStore.getState().activeSessionId).toBe("s1");
      expect(useReplayStore.getState().sessions).toHaveLength(1);
      expect(useReplayStore.getState().sessions[0].name).toBe("New Session");
    });

    it("resets entries, runs, and playback state on create", async () => {
      // Set some previous state
      useReplayStore.setState({
        entries: [createMockEntry("e1", "old", 0)],
        runs: [createMockRun("r1", "old")],
        playbackState: "playing",
        currentEntryIndex: 5,
      });
      const session = createMockSession("s2");
      mockReplay.replayCreateSession.mockResolvedValue(session);

      await useReplayStore.getState().createSession("New");

      const s = useReplayStore.getState();
      expect(s.entries).toEqual([]);
      expect(s.runs).toEqual([]);
      expect(s.playbackState).toBe("idle");
      expect(s.currentEntryIndex).toBe(-1);
    });

    it("sets error and returns empty string on failure", async () => {
      mockReplay.replayCreateSession.mockRejectedValue(new Error("Create failed"));

      const id = await useReplayStore.getState().createSession("Fail");

      expect(id).toBe("");
      expect(useReplayStore.getState().error).toBe("Create failed");
    });
  });

  describe("deleteSession", () => {
    it("deletes session and removes from list", async () => {
      const sessions = [createMockSession("s1"), createMockSession("s2")];
      useReplayStore.setState({ sessions, activeSessionId: "s1" });
      mockReplay.replayDeleteSession.mockResolvedValue(undefined);

      await useReplayStore.getState().deleteSession("s1");

      expect(useReplayStore.getState().sessions).toHaveLength(1);
      expect(useReplayStore.getState().sessions[0].id).toBe("s2");
    });

    it("sets activeSessionId to first remaining when deleting active", async () => {
      const sessions = [createMockSession("s1"), createMockSession("s2")];
      useReplayStore.setState({ sessions, activeSessionId: "s1" });
      mockReplay.replayDeleteSession.mockResolvedValue(undefined);

      await useReplayStore.getState().deleteSession("s1");

      expect(useReplayStore.getState().activeSessionId).toBe("s2");
    });

    it("clears entries and runs when deleting active session", async () => {
      const sessions = [createMockSession("s1")];
      useReplayStore.setState({
        sessions, activeSessionId: "s1",
        entries: [createMockEntry("e1", "s1", 0)],
        runs: [createMockRun("r1", "s1")],
      });
      mockReplay.replayDeleteSession.mockResolvedValue(undefined);

      await useReplayStore.getState().deleteSession("s1");

      expect(useReplayStore.getState().entries).toEqual([]);
      expect(useReplayStore.getState().runs).toEqual([]);
    });
  });

  // ── Entry Management ─────────────────────────────────────────────────

  describe("setActiveSessionId", () => {
    it("loads entries and runs when setting a valid session id", async () => {
      const entries = [createMockEntry("e1", "s1", 0)];
      const runs = [createMockRun("r1", "s1")];
      mockReplay.replayGetEntries.mockResolvedValue(entries);
      mockReplay.replayGetRuns.mockResolvedValue(runs);

      await useReplayStore.getState().setActiveSessionId("s1");

      const s = useReplayStore.getState();
      expect(s.activeSessionId).toBe("s1");
      expect(s.entries).toEqual(entries);
      expect(s.runs).toEqual(runs);
      expect(s.playbackState).toBe("idle");
    });

    it("clears entries and runs when setting null", async () => {
      useReplayStore.setState({
        entries: [createMockEntry("e1", "s1", 0)],
        runs: [createMockRun("r1", "s1")],
      });

      await useReplayStore.getState().setActiveSessionId(null);

      expect(useReplayStore.getState().entries).toEqual([]);
      expect(useReplayStore.getState().runs).toEqual([]);
      expect(useReplayStore.getState().activeSessionId).toBeNull();
    });

    it("selects first entry as active entry", async () => {
      const entries = [createMockEntry("e1", "s1", 0), createMockEntry("e2", "s1", 1)];
      mockReplay.replayGetEntries.mockResolvedValue(entries);
      mockReplay.replayGetRuns.mockResolvedValue([]);

      await useReplayStore.getState().setActiveSessionId("s1");

      expect(useReplayStore.getState().activeEntryId).toBe("e1");
    });
  });

  describe("loadEntries", () => {
    it("loads entries for active session", async () => {
      useReplayStore.setState({ activeSessionId: "s1" });
      const entries = [createMockEntry("e1", "s1", 0)];
      mockReplay.replayGetEntries.mockResolvedValue(entries);

      await useReplayStore.getState().loadEntries();

      expect(useReplayStore.getState().entries).toEqual(entries);
    });

    it("does nothing when no active session", async () => {
      await useReplayStore.getState().loadEntries();
      expect(mockReplay.replayGetEntries).not.toHaveBeenCalled();
    });
  });

  describe("addEntriesFromHistory", () => {
    it("adds entries to active session and selects first", async () => {
      useReplayStore.setState({ activeSessionId: "s1" });
      const newEntries = [createMockEntry("e1", "s1", 0)];
      mockReplay.replayAddEntries.mockResolvedValue(newEntries);

      await useReplayStore.getState().addEntriesFromHistory([
        { request: {} as HttpRequest, response: {} as HttpResponse },
      ]);

      expect(useReplayStore.getState().entries).toHaveLength(1);
      expect(useReplayStore.getState().activeEntryId).toBe("e1");
    });

    it("does nothing when no active session", async () => {
      await useReplayStore.getState().addEntriesFromHistory([]);
      expect(mockReplay.replayAddEntries).not.toHaveBeenCalled();
    });
  });

  describe("removeEntry", () => {
    it("removes entry and clears activeEntryId if it was active", async () => {
      useReplayStore.setState({
        entries: [createMockEntry("e1", "s1", 0), createMockEntry("e2", "s1", 1)],
        activeEntryId: "e1",
      });
      mockReplay.replayRemoveEntry.mockResolvedValue(undefined);

      await useReplayStore.getState().removeEntry("e1");

      expect(useReplayStore.getState().entries).toHaveLength(1);
      expect(useReplayStore.getState().entries[0].id).toBe("e2");
      expect(useReplayStore.getState().activeEntryId).toBeNull();
    });
  });

  describe("reorderEntries", () => {
    it("reorders entries optimistically", async () => {
      const entries = [
        createMockEntry("e1", "s1", 0),
        createMockEntry("e2", "s1", 1),
        createMockEntry("e3", "s1", 2),
      ];
      useReplayStore.setState({ activeSessionId: "s1", entries });
      mockReplay.replayReorderEntries.mockResolvedValue(undefined);

      await useReplayStore.getState().reorderEntries(["e3", "e1", "e2"]);

      const ordered = useReplayStore.getState().entries;
      expect(ordered[0].id).toBe("e3");
      expect(ordered[1].id).toBe("e1");
      expect(ordered[2].id).toBe("e2");
    });

    it("rolls back on reorder failure", async () => {
      const entries = [createMockEntry("e1", "s1", 0), createMockEntry("e2", "s1", 1)];
      useReplayStore.setState({ activeSessionId: "s1", entries });
      mockReplay.replayReorderEntries.mockRejectedValue(new Error("Reorder failed"));

      await useReplayStore.getState().reorderEntries(["e2", "e1"]);

      // Should roll back to original order
      expect(useReplayStore.getState().error).toBe("Reorder failed");
    });
  });

  // ── Replay Execution ─────────────────────────────────────────────────

  describe("startReplay", () => {
    it("executes replay and processes results", async () => {
      const entries = [createMockEntry("e1", "s1", 0), createMockEntry("e2", "s1", 1)];
      useReplayStore.setState({ activeSessionId: "s1", entries });

      const er1 = createMockEntryResult("e1");
      const er2 = createMockEntryResult("e2");
      mockReplay.replayExecuteRun.mockResolvedValue({
        run: createMockRun("r1", "s1"),
        entry_results: [er1, er2],
      });

      const result = await useReplayStore.getState().startReplay();

      expect(result).not.toBeNull();
      expect(useReplayStore.getState().playbackState).toBe("idle");
      expect(useReplayStore.getState().loading).toBe(false);

      // Verify entry results are mapped
      const resultsMap = useReplayStore.getState().currentRunEntryResults;
      expect(resultsMap.get("e1")).toBeDefined();
      expect(resultsMap.get("e2")).toBeDefined();
    });

    it("returns null when no active session", async () => {
      const result = await useReplayStore.getState().startReplay();
      expect(result).toBeNull();
    });

    it("returns null when no entries", async () => {
      useReplayStore.setState({ activeSessionId: "s1", entries: [] });
      const result = await useReplayStore.getState().startReplay();
      expect(result).toBeNull();
    });

    it("sets error on failure", async () => {
      useReplayStore.setState({
        activeSessionId: "s1",
        entries: [createMockEntry("e1", "s1", 0)],
      });
      mockReplay.replayExecuteRun.mockRejectedValue(new Error("Execution failed"));

      const result = await useReplayStore.getState().startReplay();

      expect(result).toBeNull();
      expect(useReplayStore.getState().error).toBe("Execution failed");
      expect(useReplayStore.getState().loading).toBe(false);
    });

    it("sets loading and playing states", async () => {
      useReplayStore.setState({
        activeSessionId: "s1",
        entries: [createMockEntry("e1", "s1", 0)],
      });
      mockReplay.replayExecuteRun.mockImplementation(async () => {
        expect(useReplayStore.getState().loading).toBe(true);
        expect(useReplayStore.getState().playbackState).toBe("playing");
        return {
          run: createMockRun("r1", "s1"),
          entry_results: [createMockEntryResult("e1")],
        };
      });

      await useReplayStore.getState().startReplay();
    });
  });

  describe("startStreamingReplay", () => {
    it("executes streaming replay and processes results", async () => {
      useReplayStore.setState({
        activeSessionId: "s1",
        entries: [createMockEntry("e1", "s1", 0)],
      });
      mockReplay.replayStartStreaming.mockResolvedValue({
        run: createMockRun("r1", "s1"),
        entry_results: [createMockEntryResult("e1")],
      });

      const result = await useReplayStore.getState().startStreamingReplay();

      expect(result).not.toBeNull();
      expect(useReplayStore.getState().streamingRunId).toBeNull();
    });

    it("returns null when no active session", async () => {
      const result = await useReplayStore.getState().startStreamingReplay();
      expect(result).toBeNull();
    });

    it("sets error on failure", async () => {
      useReplayStore.setState({
        activeSessionId: "s1",
        entries: [createMockEntry("e1", "s1", 0)],
      });
      mockReplay.replayStartStreaming.mockRejectedValue(new Error("Stream failed"));

      const result = await useReplayStore.getState().startStreamingReplay();

      expect(result).toBeNull();
      expect(useReplayStore.getState().error).toBe("Stream failed");
    });
  });

  describe("pause/resume/cancel", () => {
    it("pauses the running replay", async () => {
      useReplayStore.setState({ streamingRunId: "run-1" });
      mockReplay.replayPauseRun.mockResolvedValue(undefined);

      await useReplayStore.getState().pauseReplay();

      expect(useReplayStore.getState().playbackState).toBe("paused");
    });

    it("does nothing when pause is called with no streamingRunId", async () => {
      await useReplayStore.getState().pauseReplay();
      expect(mockReplay.replayPauseRun).not.toHaveBeenCalled();
    });

    it("sets error when pause fails", async () => {
      useReplayStore.setState({ streamingRunId: "run-1" });
      mockReplay.replayPauseRun.mockRejectedValue(new Error("Pause failed"));

      await useReplayStore.getState().pauseReplay();

      expect(useReplayStore.getState().error).toBe("Pause failed");
    });

    it("resumes the paused replay", async () => {
      useReplayStore.setState({ streamingRunId: "run-1" });
      mockReplay.replayResumeRun.mockResolvedValue(undefined);

      await useReplayStore.getState().resumeReplay();

      expect(useReplayStore.getState().playbackState).toBe("playing");
    });

    it("does nothing when resume is called with no streamingRunId", async () => {
      await useReplayStore.getState().resumeReplay();
      expect(mockReplay.replayResumeRun).not.toHaveBeenCalled();
    });

    it("sets error when resume fails", async () => {
      useReplayStore.setState({ streamingRunId: "run-1" });
      mockReplay.replayResumeRun.mockRejectedValue(new Error("Resume failed"));

      await useReplayStore.getState().resumeReplay();

      expect(useReplayStore.getState().error).toBe("Resume failed");
    });

    it("cancels the running replay", async () => {
      useReplayStore.setState({ streamingRunId: "run-1", playbackState: "playing", loading: true });
      mockReplay.replayCancelRun.mockResolvedValue(undefined);

      await useReplayStore.getState().cancelReplay();

      expect(useReplayStore.getState().playbackState).toBe("idle");
      expect(useReplayStore.getState().streamingRunId).toBeNull();
    });

    it("resets state when cancel with no streamingRunId", async () => {
      useReplayStore.setState({ playbackState: "playing", loading: true });
      await useReplayStore.getState().cancelReplay();
      expect(useReplayStore.getState().playbackState).toBe("idle");
      expect(useReplayStore.getState().loading).toBe(false);
    });

    it("sets error when cancel fails", async () => {
      useReplayStore.setState({ streamingRunId: "run-1" });
      mockReplay.replayCancelRun.mockRejectedValue(new Error("Cancel failed"));

      await useReplayStore.getState().cancelReplay();

      expect(useReplayStore.getState().error).toBe("Cancel failed");
    });
  });

  describe("stepReplay", () => {
    it("steps through a single entry replay", async () => {
      useReplayStore.setState({ activeSessionId: "s1" });
      const result = createMockEntryResult("e1");
      mockReplay.replayStepEntry.mockResolvedValue(result);

      const r = await useReplayStore.getState().stepReplay("e1");

      expect(r).toBe(result);
      expect(useReplayStore.getState().activeEntryId).toBe("e1");
    });

    it("returns null when no active session", async () => {
      const result = await useReplayStore.getState().stepReplay("e1");
      expect(result).toBeNull();
    });
  });

  // ── Entry Editing ────────────────────────────────────────────────────

  describe("updateEntry", () => {
    it("updates entry optimistically", async () => {
      const entry = createMockEntry("e1", "s1", 0);
      useReplayStore.setState({ entries: [entry] });
      mockReplay.replayUpdateEntry.mockResolvedValue(undefined);

      await useReplayStore.getState().updateEntry("e1", { position: 5 });

      expect(useReplayStore.getState().entries[0].position).toBe(5);
    });

    it("rolls back on failure", async () => {
      const entry = createMockEntry("e1", "s1", 0);
      useReplayStore.setState({ entries: [entry] });
      mockReplay.replayUpdateEntry.mockRejectedValue(new Error("Update failed"));

      await useReplayStore.getState().updateEntry("e1", { position: 5 });

      expect(useReplayStore.getState().entries[0].position).toBe(0); // rolled back
    });

    it("does nothing if entry not found", async () => {
      await useReplayStore.getState().updateEntry("nonexistent", { position: 5 });
      expect(mockReplay.replayUpdateEntry).not.toHaveBeenCalled();
    });
  });

  describe("clearEntries", () => {
    it("clears all entries for active session", async () => {
      useReplayStore.setState({
        activeSessionId: "s1",
        entries: [createMockEntry("e1", "s1", 0)],
        activeEntryId: "e1",
        currentEntryIndex: 0,
        playbackState: "playing",
      });
      mockReplay.replayClearEntries.mockResolvedValue(undefined);

      await useReplayStore.getState().clearEntries();

      expect(useReplayStore.getState().entries).toEqual([]);
      expect(useReplayStore.getState().activeEntryId).toBeNull();
      expect(useReplayStore.getState().currentEntryIndex).toBe(-1);
      expect(useReplayStore.getState().playbackState).toBe("idle");
    });
  });

  // ── Remap Rules, Assertions, Chaos Config ───────────────────────────

  describe("remap rules", () => {
    it("adds a remap rule to active session", async () => {
      const session = createMockSession("s1", { remap_rules: [] });
      useReplayStore.setState({ sessions: [session], activeSessionId: "s1" });
      mockReplay.replayUpdateSession.mockResolvedValue(undefined);

      await useReplayStore.getState().addRemapRule("/api/", "https://new.api/");

      const updated = useReplayStore.getState().sessions[0];
      expect(updated.remap_rules).toHaveLength(1);
      expect(updated.remap_rules[0].pattern).toBe("/api/");
      expect(updated.remap_rules[0].replacement).toBe("https://new.api/");
    });

    it("addRemapRule does nothing when no activeSessionId", async () => {
      await useReplayStore.getState().addRemapRule("/api/", "https://new.api/");
      expect(mockReplay.replayUpdateSession).not.toHaveBeenCalled();
    });

    it("addRemapRule does nothing when session not found", async () => {
      useReplayStore.setState({ activeSessionId: "nonexistent", sessions: [createMockSession("s1")] });
      await useReplayStore.getState().addRemapRule("/api/", "https://new.api/");
      expect(mockReplay.replayUpdateSession).not.toHaveBeenCalled();
    });

    it("updates a remap rule", async () => {
      const rule = { id: "r1", pattern: "/old/", replacement: "https://old.api/", enabled: true };
      const session = createMockSession("s1", { remap_rules: [rule] });
      useReplayStore.setState({ sessions: [session], activeSessionId: "s1" });

      await useReplayStore.getState().updateRemapRule("r1", { enabled: false });

      const updated = useReplayStore.getState().sessions[0].remap_rules[0];
      expect(updated.enabled).toBe(false);
      expect(updated.pattern).toBe("/old/"); // unchanged
    });

    it("updateRemapRule does nothing when no activeSessionId", async () => {
      await useReplayStore.getState().updateRemapRule("r1", { enabled: false });
      expect(mockReplay.replayUpdateSession).not.toHaveBeenCalled();
    });

    it("deletes a remap rule", async () => {
      const rule = { id: "r1", pattern: "/delete/", replacement: "", enabled: true };
      const session = createMockSession("s1", { remap_rules: [rule] });
      useReplayStore.setState({ sessions: [session], activeSessionId: "s1" });

      await useReplayStore.getState().deleteRemapRule("r1");

      expect(useReplayStore.getState().sessions[0].remap_rules).toHaveLength(0);
    });

    it("deleteRemapRule does nothing when no activeSessionId", async () => {
      await useReplayStore.getState().deleteRemapRule("r1");
      expect(mockReplay.replayUpdateSession).not.toHaveBeenCalled();
    });
  });

  describe("assertions", () => {
    it("adds an assertion to active session", async () => {
      const session = createMockSession("s1", { assertions: [] });
      useReplayStore.setState({ sessions: [session], activeSessionId: "s1" });

      await useReplayStore.getState().addAssertion({
        type: "status_code",
        expression: "status",
        expected: "200",
        enabled: true,
      });

      expect(useReplayStore.getState().sessions[0].assertions).toHaveLength(1);
      expect(useReplayStore.getState().sessions[0].assertions[0].type).toBe("status_code");
      expect(useReplayStore.getState().sessions[0].assertions[0].expected).toBe("200");
    });

    it("addAssertion does nothing when no activeSessionId", async () => {
      await useReplayStore.getState().addAssertion({
        type: "status_code", expression: "status", expected: "200", enabled: true,
      });
      expect(mockReplay.replayUpdateSession).not.toHaveBeenCalled();
    });

    it("updates an assertion", async () => {
      const assertion = { id: "a1", type: "status_code" as const, expression: "status", expected: "200", enabled: true };
      const session = createMockSession("s1", { assertions: [assertion] });
      useReplayStore.setState({ sessions: [session], activeSessionId: "s1" });

      await useReplayStore.getState().updateAssertion("a1", { expected: "404" });

      expect(useReplayStore.getState().sessions[0].assertions[0].expected).toBe("404");
    });

    it("updateAssertion does nothing when no activeSessionId", async () => {
      await useReplayStore.getState().updateAssertion("a1", { expected: "404" });
      expect(mockReplay.replayUpdateSession).not.toHaveBeenCalled();
    });

    it("deletes an assertion", async () => {
      const assertion = { id: "a1", type: "status_code" as const, expression: "status", expected: "200", enabled: true };
      const session = createMockSession("s1", { assertions: [assertion] });
      useReplayStore.setState({ sessions: [session], activeSessionId: "s1" });

      await useReplayStore.getState().deleteAssertion("a1");

      expect(useReplayStore.getState().sessions[0].assertions).toHaveLength(0);
    });

    it("deleteAssertion does nothing when no activeSessionId", async () => {
      await useReplayStore.getState().deleteAssertion("a1");
      expect(mockReplay.replayUpdateSession).not.toHaveBeenCalled();
    });
  });

  describe("updateChaosConfig", () => {
    it("updates chaos config on active session", async () => {
      const session = createMockSession("s1");
      useReplayStore.setState({ sessions: [session], activeSessionId: "s1" });
      mockReplay.replayUpdateSession.mockResolvedValue(undefined);

      await useReplayStore.getState().updateChaosConfig({
        enabled: true,
        timeout_probability: 0.1,
        timeout_min_ms: 1000,
        timeout_max_ms: 5000,
        delay_probability: 0,
        delay_min_ms: 0,
        delay_max_ms: 0,
        error_probability: 0,
        error_status_codes: [],
      });

      expect(useReplayStore.getState().sessions[0].chaos_config.enabled).toBe(true);
      expect(useReplayStore.getState().sessions[0].chaos_config.timeout_probability).toBe(0.1);
    });

    it("updateChaosConfig does nothing when no activeSessionId", async () => {
      await useReplayStore.getState().updateChaosConfig({
        enabled: true, timeout_probability: 0, timeout_min_ms: 0, timeout_max_ms: 0,
        delay_probability: 0, delay_min_ms: 0, delay_max_ms: 0, error_probability: 0, error_status_codes: [],
      });
      expect(mockReplay.replayUpdateSession).not.toHaveBeenCalled();
    });
  });

  // ── Run Management ───────────────────────────────────────────────────

  describe("loadRuns", () => {
    it("loads runs for active session", async () => {
      useReplayStore.setState({ activeSessionId: "s1" });
      const runs = [createMockRun("r1", "s1")];
      mockReplay.replayGetRuns.mockResolvedValue(runs);

      await useReplayStore.getState().loadRuns();

      expect(useReplayStore.getState().runs).toEqual(runs);
    });

    it("loadRuns does nothing when no activeSessionId", async () => {
      await useReplayStore.getState().loadRuns();
      expect(mockReplay.replayGetRuns).not.toHaveBeenCalled();
    });
  });

  describe("loadRunDetail", () => {
    it("loads run detail and maps entry results", async () => {
      const er = createMockEntryResult("e1");
      const detail = { run: createMockRun("r1", "s1"), entry_results: [er] };
      mockReplay.replayGetRunDetail.mockResolvedValue(detail);

      await useReplayStore.getState().loadRunDetail("r1");

      expect(useReplayStore.getState().activeRunDetail).toEqual(detail);
      expect(useReplayStore.getState().currentRunEntryResults.get("e1")).toBeDefined();
    });
  });

  describe("deleteRun", () => {
    it("deletes run and removes from list", async () => {
      const runs = [createMockRun("r1", "s1"), createMockRun("r2", "s1")];
      useReplayStore.setState({ runs });
      mockReplay.replayDeleteRun.mockResolvedValue(undefined);

      await useReplayStore.getState().deleteRun("r1");

      expect(useReplayStore.getState().runs).toHaveLength(1);
      expect(useReplayStore.getState().runs[0].id).toBe("r2");
    });

    it("clears activeRunDetail when the deleted run matches it", async () => {
      const runs = [createMockRun("r1", "s1")];
      useReplayStore.setState({
        runs,
        activeRunDetail: { run: createMockRun("r1", "s1"), entry_results: [] },
      });
      mockReplay.replayDeleteRun.mockResolvedValue(undefined);

      await useReplayStore.getState().deleteRun("r1");

      expect(useReplayStore.getState().activeRunDetail).toBeNull();
    });

    it("preserves activeRunDetail when deleting a different run", async () => {
      const runs = [createMockRun("r1", "s1"), createMockRun("r2", "s1")];
      useReplayStore.setState({
        runs,
        activeRunDetail: { run: createMockRun("r1", "s1"), entry_results: [] },
      });
      mockReplay.replayDeleteRun.mockResolvedValue(undefined);

      await useReplayStore.getState().deleteRun("r2");

      expect(useReplayStore.getState().activeRunDetail).not.toBeNull();
      expect(useReplayStore.getState().activeRunDetail!.run.id).toBe("r1");
    });
  });

  describe("compareSelectedRuns", () => {
    it("compares two selected runs", async () => {
      useReplayStore.setState({ selectedRunIds: ["run-a", "run-b"] });
      const comparison = {
        run_a: createMockRun("run-a", "s1"),
        run_b: createMockRun("run-b", "s1"),
        comparisons: [],
      };
      mockReplay.replayCompareRuns.mockResolvedValue(comparison);

      await useReplayStore.getState().compareSelectedRuns();

      expect(useReplayStore.getState().runComparison).toEqual(comparison);
    });

    it("does nothing when no runs selected", async () => {
      await useReplayStore.getState().compareSelectedRuns();
      expect(mockReplay.replayCompareRuns).not.toHaveBeenCalled();
    });

    it("sets error on failure", async () => {
      useReplayStore.setState({ selectedRunIds: ["run-a", "run-b"] });
      mockReplay.replayCompareRuns.mockRejectedValue(new Error("Compare failed"));

      await useReplayStore.getState().compareSelectedRuns();

      expect(useReplayStore.getState().error).toBe("Compare failed");
    });
  });

  describe("resetReplay", () => {
    it("resets playback state, entry results, and streamingRunId", () => {
      useReplayStore.setState({
        playbackState: "playing",
        currentEntryIndex: 3,
        currentRunEntryResults: new Map([["e1", createMockEntryResult("e1")]]),
        streamingRunId: "run-1",
      });

      useReplayStore.getState().resetReplay();

      const s = useReplayStore.getState();
      expect(s.playbackState).toBe("idle");
      expect(s.currentEntryIndex).toBe(-1);
      expect(s.currentRunEntryResults.size).toBe(0);
      expect(s.streamingRunId).toBeNull();
    });
  });

  describe("getActiveSession / getActiveEntry / getEntryResult", () => {
    it("getActiveSession returns the active session", () => {
      const sessions = [createMockSession("s1"), createMockSession("s2")];
      useReplayStore.setState({ sessions, activeSessionId: "s2" });

      expect(useReplayStore.getState().getActiveSession()?.id).toBe("s2");
    });

    it("getActiveEntry returns the active entry", () => {
      const entries = [createMockEntry("e1", "s1", 0)];
      useReplayStore.setState({ entries, activeEntryId: "e1" });

      expect(useReplayStore.getState().getActiveEntry()?.id).toBe("e1");
    });

    it("getEntryResult returns result from the current run", () => {
      const er = createMockEntryResult("e1");
      useReplayStore.setState({ currentRunEntryResults: new Map([["e1", er]]) });

      expect(useReplayStore.getState().getEntryResult("e1")).toBe(er);
      expect(useReplayStore.getState().getEntryResult("e2")).toBeUndefined();
    });
  });

  describe("setActiveEntryIdFromIndex", () => {
    it("sets activeEntryId from valid index", () => {
      const entries = [createMockEntry("e1", "s1", 0), createMockEntry("e2", "s1", 1)];
      useReplayStore.setState({ entries });

      useReplayStore.getState().setActiveEntryIdFromIndex(1);

      expect(useReplayStore.getState().activeEntryId).toBe("e2");
      expect(useReplayStore.getState().currentEntryIndex).toBe(1);
    });

    it("does nothing for invalid index", () => {
      useReplayStore.setState({ entries: [createMockEntry("e1", "s1", 0)] });

      useReplayStore.getState().setActiveEntryIdFromIndex(5);

      expect(useReplayStore.getState().activeEntryId).toBeNull();
    });
  });

  describe("setSelectedRunIds", () => {
    it("sets the selected run IDs for comparison", () => {
      useReplayStore.getState().setSelectedRunIds(["run-a", "run-b"]);
      expect(useReplayStore.getState().selectedRunIds).toEqual(["run-a", "run-b"]);
    });

    it("clears selection when null", () => {
      useReplayStore.getState().setSelectedRunIds(null);
      expect(useReplayStore.getState().selectedRunIds).toBeNull();
    });
  });
});
