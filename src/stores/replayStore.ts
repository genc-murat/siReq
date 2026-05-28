import { create } from "zustand";
import {
  replayCreateSession,
  replayGetSessions,
  replayUpdateSession,
  replayDeleteSession,
  replayGetEntries,
  replayAddEntries,
  replayRemoveEntry,
  replayClearEntries,
  replayExecuteRun,
  replayStepEntry,
  replayGetRuns,
  replayGetRunDetail,
  replayDeleteRun,
  replayCompareRuns,
} from "@/lib/invoke";
import type {
  ReplaySession,
  ReplayEntry,
  ReplayRun,
  ReplayRunDetail,
  ReplayEntryResult,
  ReplayRunComparison,
  RemapRule,
  ReplayAssertion,
  ChaosConfig,
  HarEntry,
} from "@/lib/invoke";
import type { HttpRequest, HttpResponse } from "@/lib/invoke";

interface ReplayState {
  sessions: ReplaySession[];
  activeSessionId: string | null;
  entries: ReplayEntry[];
  activeEntryId: string | null;
  runs: ReplayRun[];
  activeRunDetail: ReplayRunDetail | null;
  runComparison: ReplayRunComparison | null;
  selectedRunIds: [string, string] | null;
  playbackState: "idle" | "playing" | "paused" | "stopped";
  currentEntryIndex: number;
  currentRunEntryResults: Map<string, ReplayEntryResult>;
  loading: boolean;
  error: string | null;

  loadSessions: () => Promise<void>;
  createSession: (name: string, description?: string) => Promise<string>;
  deleteSession: (id: string) => Promise<void>;
  setActiveSessionId: (id: string | null) => Promise<void>;

  loadEntries: () => Promise<void>;
  addEntriesFromHistory: (historyEntries: { request: HttpRequest; response: HttpResponse }[]) => Promise<void>;
  removeEntry: (entryId: string) => Promise<void>;
  clearEntries: () => Promise<void>;
  setActiveEntryId: (id: string | null) => void;

  addRemapRule: (pattern: string, replacement: string) => Promise<void>;
  updateRemapRule: (ruleId: string, updates: Partial<RemapRule>) => Promise<void>;
  deleteRemapRule: (ruleId: string) => Promise<void>;

  addAssertion: (assertion: Omit<ReplayAssertion, "id">) => Promise<void>;
  updateAssertion: (assertionId: string, updates: Partial<ReplayAssertion>) => Promise<void>;
  deleteAssertion: (assertionId: string) => Promise<void>;

  updateChaosConfig: (config: ChaosConfig) => Promise<void>;

  startReplay: (environmentId?: string | null) => Promise<ReplayRunDetail | null>;
  stepReplay: (entryId: string, environmentId?: string | null) => Promise<ReplayEntryResult | null>;
  resetReplay: () => void;
  setActiveEntryIdFromIndex: (index: number) => void;

  loadRuns: () => Promise<void>;
  loadRunDetail: (runId: string) => Promise<void>;
  deleteRun: (runId: string) => Promise<void>;
  compareSelectedRuns: () => Promise<void>;
  setSelectedRunIds: (ids: [string, string] | null) => void;

  getActiveSession: () => ReplaySession | undefined;
  getActiveEntry: () => ReplayEntry | undefined;
  getEntryResult: (entryId: string) => ReplayEntryResult | undefined;
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export const useReplayStore = create<ReplayState>()((set, get) => ({
  sessions: [],
  activeSessionId: null,
  entries: [],
  activeEntryId: null,
  runs: [],
  activeRunDetail: null,
  runComparison: null,
  selectedRunIds: null,
  playbackState: "idle",
  currentEntryIndex: -1,
  currentRunEntryResults: new Map(),
  loading: false,
  error: null,

  loadSessions: async () => {
    try {
      const sessions = await replayGetSessions();
      set({ sessions });
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  createSession: async (name, description = "") => {
    try {
      const session = await replayCreateSession(name, description);
      set((s) => ({
        sessions: [session, ...s.sessions],
        activeSessionId: session.id,
        entries: [],
        activeEntryId: null,
        runs: [],
        activeRunDetail: null,
        playbackState: "idle",
        currentEntryIndex: -1,
        currentRunEntryResults: new Map(),
      }));
      return session.id;
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
      return "";
    }
  },

  deleteSession: async (id) => {
    try {
      await replayDeleteSession(id);
      set((s) => {
        const filtered = s.sessions.filter((sess) => sess.id !== id);
        return {
          sessions: filtered,
          activeSessionId: s.activeSessionId === id ? (filtered[0]?.id ?? null) : s.activeSessionId,
          entries: s.activeSessionId === id ? [] : s.entries,
          activeEntryId: s.activeSessionId === id ? null : s.activeEntryId,
          runs: s.activeSessionId === id ? [] : s.runs,
        };
      });
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  setActiveSessionId: async (id) => {
    set({
      activeSessionId: id,
      playbackState: "idle",
      currentEntryIndex: -1,
      activeEntryId: null,
      activeRunDetail: null,
      currentRunEntryResults: new Map(),
    });
    if (id) {
      try {
        const entries = await replayGetEntries(id);
        set({ entries, activeEntryId: entries[0]?.id ?? null });
        const runs = await replayGetRuns(id);
        set({ runs });
      } catch (e: unknown) {
        set({ error: getErrorMessage(e) });
      }
    } else {
      set({ entries: [], runs: [] });
    }
  },

  loadEntries: async () => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    try {
      const entries = await replayGetEntries(activeSessionId);
      set({ entries });
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  addEntriesFromHistory: async (historyEntries) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    try {
      const harEntries: HarEntry[] = historyEntries.map((h) => ({
        request: h.request,
        response: h.response,
      }));
      const newEntries = await replayAddEntries(activeSessionId, harEntries);
      set((s) => ({
        entries: [...s.entries, ...newEntries],
        activeEntryId: s.activeEntryId ?? newEntries[0]?.id ?? null,
      }));
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  removeEntry: async (entryId) => {
    try {
      await replayRemoveEntry(entryId);
      set((s) => ({
        entries: s.entries.filter((e) => e.id !== entryId),
        activeEntryId: s.activeEntryId === entryId ? null : s.activeEntryId,
      }));
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  clearEntries: async () => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    try {
      await replayClearEntries(activeSessionId);
      set({ entries: [], activeEntryId: null, currentEntryIndex: -1, playbackState: "idle" });
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  setActiveEntryId: (id) => {
    set({ activeEntryId: id });
  },

  addRemapRule: async (pattern, replacement) => {
    const { activeSessionId, sessions } = get();
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const newRule: RemapRule = {
      id: crypto.randomUUID(),
      pattern,
      replacement,
      enabled: true,
    };
    const updated = { ...session, remap_rules: [...session.remap_rules, newRule] };
    try {
      await replayUpdateSession(updated);
      set((s) => ({
        sessions: s.sessions.map((sess) => (sess.id === activeSessionId ? updated : sess)),
      }));
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  updateRemapRule: async (ruleId, updates) => {
    const { activeSessionId, sessions } = get();
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const updated = {
      ...session,
      remap_rules: session.remap_rules.map((r) => (r.id === ruleId ? { ...r, ...updates } : r)),
    };
    try {
      await replayUpdateSession(updated);
      set((s) => ({
        sessions: s.sessions.map((sess) => (sess.id === activeSessionId ? updated : sess)),
      }));
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  deleteRemapRule: async (ruleId) => {
    const { activeSessionId, sessions } = get();
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const updated = { ...session, remap_rules: session.remap_rules.filter((r) => r.id !== ruleId) };
    try {
      await replayUpdateSession(updated);
      set((s) => ({
        sessions: s.sessions.map((sess) => (sess.id === activeSessionId ? updated : sess)),
      }));
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  addAssertion: async (assertion) => {
    const { activeSessionId, sessions } = get();
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const newAssertion: ReplayAssertion = { ...assertion, id: crypto.randomUUID() };
    const updated = { ...session, assertions: [...session.assertions, newAssertion] };
    try {
      await replayUpdateSession(updated);
      set((s) => ({
        sessions: s.sessions.map((sess) => (sess.id === activeSessionId ? updated : sess)),
      }));
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  updateAssertion: async (assertionId, updates) => {
    const { activeSessionId, sessions } = get();
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const updated = {
      ...session,
      assertions: session.assertions.map((a) => (a.id === assertionId ? { ...a, ...updates } : a)),
    };
    try {
      await replayUpdateSession(updated);
      set((s) => ({
        sessions: s.sessions.map((sess) => (sess.id === activeSessionId ? updated : sess)),
      }));
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  deleteAssertion: async (assertionId) => {
    const { activeSessionId, sessions } = get();
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const updated = { ...session, assertions: session.assertions.filter((a) => a.id !== assertionId) };
    try {
      await replayUpdateSession(updated);
      set((s) => ({
        sessions: s.sessions.map((sess) => (sess.id === activeSessionId ? updated : sess)),
      }));
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  updateChaosConfig: async (config) => {
    const { activeSessionId, sessions } = get();
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session) return;
    const updated = { ...session, chaos_config: config };
    try {
      await replayUpdateSession(updated);
      set((s) => ({
        sessions: s.sessions.map((sess) => (sess.id === activeSessionId ? updated : sess)),
      }));
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  startReplay: async (environmentId = null) => {
    const { activeSessionId, entries } = get();
    if (!activeSessionId || entries.length === 0) return null;
    set({ loading: true, error: null, playbackState: "playing" });
    try {
      const detail = await replayExecuteRun(activeSessionId, environmentId);
      const resultMap = new Map<string, ReplayEntryResult>();
      for (const er of detail.entry_results) {
        resultMap.set(er.entry_id, er);
      }
      set({
        currentRunEntryResults: resultMap,
        playbackState: "idle",
        loading: false,
      });
      await get().loadRuns();
      return detail;
    } catch (e: unknown) {
      set({ error: getErrorMessage(e), loading: false, playbackState: "idle" });
      return null;
    }
  },

  stepReplay: async (entryId, environmentId = null) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return null;
    set({ activeEntryId: entryId });
    try {
      const result = await replayStepEntry(activeSessionId, entryId, environmentId);
      set((s) => {
        const newMap = new Map(s.currentRunEntryResults);
        newMap.set(entryId, result);
        return { currentRunEntryResults: newMap };
      });
      return result;
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
      return null;
    }
  },

  resetReplay: () => {
    set({
      playbackState: "idle",
      currentEntryIndex: -1,
      currentRunEntryResults: new Map(),
    });
  },

  setActiveEntryIdFromIndex: (index) => {
    const { entries } = get();
    if (index >= 0 && index < entries.length) {
      set({ activeEntryId: entries[index].id, currentEntryIndex: index });
    }
  },

  loadRuns: async () => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    try {
      const runs = await replayGetRuns(activeSessionId);
      set({ runs });
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  loadRunDetail: async (runId) => {
    try {
      const detail = await replayGetRunDetail(runId);
      set({ activeRunDetail: detail });
      if (detail) {
        const resultMap = new Map<string, ReplayEntryResult>();
        for (const er of detail.entry_results) {
          resultMap.set(er.entry_id, er);
        }
        set({ currentRunEntryResults: resultMap });
      }
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  deleteRun: async (runId) => {
    try {
      await replayDeleteRun(runId);
      set((s) => ({
        runs: s.runs.filter((r) => r.id !== runId),
        activeRunDetail: s.activeRunDetail?.run.id === runId ? null : s.activeRunDetail,
      }));
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  compareSelectedRuns: async () => {
    const { selectedRunIds } = get();
    if (!selectedRunIds) return;
    try {
      const comparison = await replayCompareRuns(selectedRunIds[0], selectedRunIds[1]);
      set({ runComparison: comparison });
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    }
  },

  setSelectedRunIds: (ids) => {
    set({ selectedRunIds: ids });
  },

  getActiveSession: () => {
    const { sessions, activeSessionId } = get();
    return sessions.find((s) => s.id === activeSessionId);
  },

  getActiveEntry: () => {
    const { entries, activeEntryId } = get();
    return entries.find((e) => e.id === activeEntryId);
  },

  getEntryResult: (entryId) => {
    const { currentRunEntryResults } = get();
    return currentRunEntryResults.get(entryId);
  },
}));
