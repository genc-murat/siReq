import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSafeInvoke = vi.fn();
vi.mock("./safe-invoke", () => ({
  safeInvoke: mockSafeInvoke,
}));

const {
  replayCreateSession,
  replayGetSessions,
  replayUpdateSession,
  replayDeleteSession,
  replayGetEntries,
  replayAddEntries,
  replayImportHar,
  replayRemoveEntry,
  replayReorderEntries,
  replayUpdateEntry,
  replayClearEntries,
  replayExecuteRun,
  replayStepEntry,
  replayGetRuns,
  replayGetRunDetail,
  replayDeleteRun,
  replayCompareRuns,
  replayStartStreaming,
  replayPauseRun,
  replayResumeRun,
  replayCancelRun,
} = await import("./replay-api");

describe("replayLab API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("replayCreateSession should use default empty description", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ id: "sess-1", name: "test" });
    await replayCreateSession("test");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_create_session", {
      name: "test", description: "",
    });
  });

  it("replayCreateSession should pass description when provided", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ id: "sess-1", name: "test" });
    await replayCreateSession("test", "my desc");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_create_session", {
      name: "test", description: "my desc",
    });
  });

  it("replayGetSessions should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await replayGetSessions();
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_get_sessions", {});
  });

  it("replayUpdateSession should call safeInvoke with session", async () => {
    const sess = { id: "sess-1", name: "test", description: "", remap_rules: [], assertions: [], chaos_config: { enabled: false, timeout_probability: 0, timeout_min_ms: 0, timeout_max_ms: 0, delay_probability: 0, delay_min_ms: 0, delay_max_ms: 0, error_probability: 0, error_status_codes: [] }, created_at: "", updated_at: "" };
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await replayUpdateSession(sess);
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_update_session", { session: sess });
  });

  it("replayDeleteSession should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await replayDeleteSession("sess-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_delete_session", { id: "sess-1" });
  });

  it("replayGetEntries should call safeInvoke with sessionId", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await replayGetEntries("sess-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_get_entries", { sessionId: "sess-1" });
  });

  it("replayAddEntries should call safeInvoke with sessionId and entries", async () => {
    const entries = [{ request: {} as never, response: {} as never }];
    mockSafeInvoke.mockResolvedValueOnce([]);
    await replayAddEntries("sess-1", entries);
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_add_entries", {
      sessionId: "sess-1", entries,
    });
  });

  it("replayImportHar should call safeInvoke with sessionId and harJson", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await replayImportHar("sess-1", '{"log":{"entries":[]}}');
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_import_har", {
      sessionId: "sess-1", harJson: '{"log":{"entries":[]}}',
    });
  });

  it("replayRemoveEntry should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await replayRemoveEntry("entry-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_remove_entry", { id: "entry-1" });
  });

  it("replayReorderEntries should call safeInvoke with sessionId and entryIds", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await replayReorderEntries("sess-1", ["e1", "e2"]);
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_reorder_entries", {
      sessionId: "sess-1", entryIds: ["e1", "e2"],
    });
  });

  it("replayUpdateEntry should call safeInvoke with entry", async () => {
    const entry = { id: "e1", session_id: "sess-1", position: 0 } as never;
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await replayUpdateEntry(entry);
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_update_entry", { entry });
  });

  it("replayClearEntries should call safeInvoke with sessionId", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await replayClearEntries("sess-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_clear_entries", { sessionId: "sess-1" });
  });

  it("replayExecuteRun should use null environmentId when not provided", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ run: {} as never, entry_results: [] });
    await replayExecuteRun("sess-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_execute_run", {
      sessionId: "sess-1", environmentId: null,
    });
  });

  it("replayStepEntry should call safeInvoke with sessionId, entryId, environmentId", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ id: "r1" });
    await replayStepEntry("sess-1", "e1", "env-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_step_entry", {
      sessionId: "sess-1", entryId: "e1", environmentId: "env-1",
    });
  });

  it("replayGetRuns should use default limit/offset", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await replayGetRuns("sess-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_get_runs", {
      sessionId: "sess-1", limit: 50, offset: 0,
    });
  });

  it("replayGetRunDetail should call safeInvoke with runId", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ run: {} as never, entry_results: [] });
    await replayGetRunDetail("run-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_get_run_detail", { runId: "run-1" });
  });

  it("replayDeleteRun should call safeInvoke with runId", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await replayDeleteRun("run-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_delete_run", { runId: "run-1" });
  });

  it("replayCompareRuns should call safeInvoke with two run IDs", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ run_a: {} as never, run_b: {} as never, comparisons: [] });
    await replayCompareRuns("run-a", "run-b");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_compare_runs", {
      runIdA: "run-a", runIdB: "run-b",
    });
  });

  it("replayStartStreaming should use null environmentId when not provided", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ run: {} as never, entry_results: [] });
    await replayStartStreaming("sess-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_start_streaming", {
      sessionId: "sess-1", environmentId: null,
    });
  });

  it("replayPauseRun should call safeInvoke with runId", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await replayPauseRun("run-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_pause_run", { runId: "run-1" });
  });

  it("replayResumeRun should call safeInvoke with runId", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await replayResumeRun("run-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_resume_run", { runId: "run-1" });
  });

  it("replayCancelRun should call safeInvoke with runId", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await replayCancelRun("run-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("replay_cancel_run", { runId: "run-1" });
  });
});
