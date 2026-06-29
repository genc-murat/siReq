import { safeInvoke } from "./safe-invoke";
import type {
  ReplaySession,
  ReplayEntry,
  ReplayRun,
  ReplayRunDetail,
  ReplayEntryResult,
  ReplayRunComparison,
  HarEntry,
} from "./types";

export async function replayCreateSession(name: string, description?: string): Promise<ReplaySession> {
  return safeInvoke("replay_create_session", { name, description: description ?? "" });
}

export async function replayGetSessions(): Promise<ReplaySession[]> {
  return safeInvoke("replay_get_sessions", {});
}

export async function replayUpdateSession(session: ReplaySession): Promise<void> {
  return safeInvoke("replay_update_session", { session });
}

export async function replayDeleteSession(id: string): Promise<void> {
  return safeInvoke("replay_delete_session", { id });
}

export async function replayGetEntries(sessionId: string): Promise<ReplayEntry[]> {
  return safeInvoke("replay_get_entries", { sessionId });
}

export async function replayAddEntries(sessionId: string, entries: HarEntry[]): Promise<ReplayEntry[]> {
  return safeInvoke("replay_add_entries", { sessionId, entries });
}

export async function replayImportHar(sessionId: string, harJson: string): Promise<ReplayEntry[]> {
  return safeInvoke("replay_import_har", { sessionId, harJson });
}

export async function replayRemoveEntry(id: string): Promise<void> {
  return safeInvoke("replay_remove_entry", { id });
}

export async function replayReorderEntries(sessionId: string, entryIds: string[]): Promise<void> {
  return safeInvoke("replay_reorder_entries", { sessionId, entryIds });
}

export async function replayUpdateEntry(entry: ReplayEntry): Promise<void> {
  return safeInvoke("replay_update_entry", { entry });
}

export async function replayClearEntries(sessionId: string): Promise<void> {
  return safeInvoke("replay_clear_entries", { sessionId });
}

export async function replayExecuteRun(sessionId: string, environmentId?: string | null): Promise<ReplayRunDetail> {
  return safeInvoke("replay_execute_run", { sessionId, environmentId: environmentId ?? null });
}

export async function replayStepEntry(
  sessionId: string,
  entryId: string,
  environmentId?: string | null,
): Promise<ReplayEntryResult> {
  return safeInvoke("replay_step_entry", { sessionId, entryId, environmentId: environmentId ?? null });
}

export async function replayGetRuns(
  sessionId: string,
  limit?: number,
  offset?: number,
): Promise<ReplayRun[]> {
  return safeInvoke("replay_get_runs", { sessionId, limit: limit ?? 50, offset: offset ?? 0 });
}

export async function replayGetRunDetail(runId: string): Promise<ReplayRunDetail | null> {
  return safeInvoke("replay_get_run_detail", { runId });
}

export async function replayDeleteRun(runId: string): Promise<void> {
  return safeInvoke("replay_delete_run", { runId });
}

export async function replayCompareRuns(runIdA: string, runIdB: string): Promise<ReplayRunComparison> {
  return safeInvoke("replay_compare_runs", { runIdA, runIdB });
}

export async function replayStartStreaming(sessionId: string, environmentId?: string | null): Promise<ReplayRunDetail> {
  return safeInvoke("replay_start_streaming", { sessionId, environmentId: environmentId ?? null });
}

export async function replayPauseRun(runId: string): Promise<void> {
  return safeInvoke("replay_pause_run", { runId });
}

export async function replayResumeRun(runId: string): Promise<void> {
  return safeInvoke("replay_resume_run", { runId });
}

export async function replayCancelRun(runId: string): Promise<void> {
  return safeInvoke("replay_cancel_run", { runId });
}
