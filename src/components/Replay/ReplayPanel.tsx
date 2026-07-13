import { useState, useEffect, useMemo } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { useReplayStore } from "@/stores/replayStore";
import { ReplayTimeline } from "./ReplayTimeline";
import { ReplayInspector } from "./ReplayInspector";
import { ReplayEnvironmentMap } from "./ReplayEnvironmentMap";
import { ReplayAssertions } from "./ReplayAssertions";
import { ReplayWaterfall } from "./ReplayWaterfall";
import { ReplayRuns } from "./ReplayRuns";
import { ReplayChaos } from "./ReplayChaos";
import { getHistory, getEnvironments, replayImportHar } from "@/lib/invoke";
import type { HistoryEntry, Environment } from "@/lib/invoke";

export function ReplayPanel() {
  const {
    sessions,
    activeSessionId,
    createSession,
    deleteSession,
    setActiveSessionId,
    addEntriesFromHistory,
    clearEntries,
    entries,
    activeEntryId,
    getEntryResult,
    playbackState,
    loading,
    startStreamingReplay,
    pauseReplay,
    resumeReplay,
    cancelReplay,
    stepReplay,
    resetReplay,
    loadSessions,
    loadEntries,
    loadRuns,
    getActiveEntry,
  } = useReplayStore();

  const [activeSubTab, setActiveSubTab] = useState<"timeline" | "waterfall" | "remapping" | "assertions" | "chaos" | "runs">("timeline");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importTab, setImportTab] = useState<"history" | "har">("history");
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
  const [historySearch, setHistorySearch] = useState("");
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [harFileContent, setHarFileContent] = useState<string>("");
  const [harFileName, setHarFileName] = useState<string>("");
  const [harImporting, setHarImporting] = useState(false);

  useEffect(() => {
    loadSessions();
    getEnvironments().then(setEnvironments);
  }, [loadSessions]);

  useEffect(() => {
    if (activeSessionId) {
      loadEntries();
      loadRuns();
    }
  }, [activeSessionId, loadEntries, loadRuns]);

  useEffect(() => {
    if (importDialogOpen && importTab === "history") {
      getHistory(100).then(setHistoryEntries);
    }
  }, [importDialogOpen, importTab]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const selectedEntry = getActiveEntry();
  const selectedEntryResult = activeEntryId ? getEntryResult(activeEntryId) : null;

  const handleCreateSession = async () => {
    const name = `Session #${sessions.length + 1}`;
    await createSession(name, "A captured request replay session");
  };

  const handleImportSelect = (id: string) => {
    setSelectedHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImportSubmit = async () => {
    if (!activeSessionId || selectedHistoryIds.size === 0) return;
    const selected = historyEntries.filter((h) => selectedHistoryIds.has(h.id));
    await addEntriesFromHistory(selected);
    setImportDialogOpen(false);
  };

  const handleHarImport = async () => {
    if (!activeSessionId || !harFileContent) return;
    setHarImporting(true);
    try {
      await replayImportHar(activeSessionId, harFileContent);
      await loadEntries();
      setImportDialogOpen(false);
      setHarFileContent("");
      setHarFileName("");
    } catch (e: unknown) {
      console.error("HAR import failed:", e);
    } finally {
      setHarImporting(false);
    }
  };

  const handleHarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHarFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setHarFileContent(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return historyEntries;
    const q = historySearch.toLowerCase();
    return historyEntries.filter(
      (h) =>
        h.request.url.toLowerCase().includes(q) ||
        h.request.method.toLowerCase().includes(q) ||
        String(h.response.status).includes(q) ||
        (h.request.name && h.request.name.toLowerCase().includes(q))
    );
  }, [historyEntries, historySearch]);

  const progressPercent = useMemo(() => {
    if (!activeSession || entries.length === 0) return 0;
    let completed = 0;
    for (const entry of entries) {
      const result = getEntryResult(entry.id);
      if (result) completed++;
    }
    return Math.round((completed / entries.length) * 100);
  }, [activeSession, entries, getEntryResult]);

  const subTabs = [
    { key: "timeline" as const, label: "Timeline", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" },
    { key: "waterfall" as const, label: "Waterfall", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" },
    { key: "remapping" as const, label: "URL Remap", icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" },
    { key: "assertions" as const, label: "Assertions", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
    { key: "chaos" as const, label: "Chaos", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
    { key: "runs" as const, label: "Runs", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  ];

  return (
    <div className="flex-1 flex bg-background text-foreground h-full overflow-hidden select-none">
      <Group orientation="horizontal" className="h-full w-full">
        <Panel defaultSize="240px" minSize="200px" maxSize="360px">
          <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
            <div className="p-3 border-b border-sidebar-border flex items-center justify-between shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-sidebar-foreground/80">Replay Sessions</span>
              <button
                onClick={handleCreateSession}
                className="p-1 rounded-lg text-primary hover:bg-primary/10 transition-all duration-150"
                title="Create a new replay session"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-2 flex flex-col gap-1.5 min-h-0">
              {sessions.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground/60 flex flex-col gap-2">
                  <span>No sessions created</span>
                  <button onClick={handleCreateSession} className="text-[10px] font-bold text-primary hover:underline">
                    + Create Session
                  </button>
                </div>
              ) : (
                sessions.map((sess) => (
                  <div
                    key={sess.id}
                    onClick={() => setActiveSessionId(sess.id)}
                    className={`group flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all duration-150 ${
                      activeSessionId === sess.id
                        ? "bg-sidebar-accent border-sidebar-border ring-1 ring-primary/10"
                        : "bg-transparent border-transparent hover:bg-sidebar-accent/50"
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold truncate text-foreground">{sess.name}</span>
                      <span className="text-[9px] text-muted-foreground/75 mt-0.5">{new Date(sess.created_at).toLocaleDateString()}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(sess.id); }}
                      className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150 shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </Panel>

        <Separator
          style={{ width: 4, cursor: "col-resize" }}
          className="bg-border hover:bg-primary/50 active:bg-primary/70 transition-all duration-150"
        />

        <Panel>
          {!activeSession ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground/70 p-8 text-center bg-card/25 gap-3.5">
              <div className="p-4 rounded-xl bg-card border border-border/80 shadow-sm flex items-center justify-center">
                <svg className="h-8 w-8 text-primary animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-foreground">Welcome to ReplayLab Studio</span>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Record HTTP histories, import HAR files, customize environment URL remappings, inject chaos, and assert responses.
                </p>
              </div>
              <button
                onClick={handleCreateSession}
                className="bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-xl hover:bg-primary/95 transition-all duration-150 shadow-sm"
              >
                Create Replay Session
              </button>
            </div>
          ) : (
            <div className="h-full flex flex-col min-h-0 bg-background">
              <div className="bg-card border-b border-border px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-foreground tracking-tight">{activeSession.name}</span>
                    <span className="text-[10px] text-muted-foreground/75 leading-none mt-1">ReplayLab Studio</span>
                  </div>
                  {entries.length > 0 && (
                    <div className="flex items-center gap-2 bg-background/55 ring-1 ring-border rounded-lg px-2 py-1 shrink-0 select-none">
                      <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                        <div style={{ width: `${progressPercent}%` }} className="h-full bg-primary rounded-full transition-all duration-200" />
                      </div>
                      <span className="text-[9px] font-bold font-mono text-muted-foreground">{progressPercent}%</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 bg-background ring-1 ring-border p-1 rounded-xl shrink-0 shadow-sm">
                  <button
                    onClick={() => startStreamingReplay(selectedEnvId)}
                    disabled={playbackState === "playing" || playbackState === "paused" || entries.length === 0}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 ${
                      playbackState === "playing" || playbackState === "paused" || loading
                        ? "text-muted-foreground bg-transparent"
                        : "text-green-500 hover:bg-green-500/10"
                    }`}
                    title="Start streaming replay run"
                  >
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    <span>{loading ? "Running..." : "Replay"}</span>
                  </button>

                  {playbackState === "playing" && (
                    <button
                      onClick={pauseReplay}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-yellow-500 hover:bg-yellow-500/10 transition-all duration-150 flex items-center gap-1.5"
                      title="Pause replay"
                    >
                      <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                      <span>Pause</span>
                    </button>
                  )}

                  {playbackState === "paused" && (
                    <button
                      onClick={resumeReplay}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 transition-all duration-150 flex items-center gap-1.5"
                      title="Resume replay"
                    >
                      <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      <span>Resume</span>
                    </button>
                  )}

                  {(playbackState === "playing" || playbackState === "paused") && (
                    <button
                      onClick={cancelReplay}
                      className="px-2 py-1.5 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 transition-all duration-150 flex items-center gap-1"
                      title="Cancel replay"
                    >
                      <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
                      <span>Stop</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (entries.length > 0 && activeEntryId) {
                        stepReplay(activeEntryId, selectedEnvId);
                      }
                    }}
                    disabled={playbackState === "playing" || playbackState === "paused" || entries.length === 0 || !activeEntryId}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 disabled:text-muted-foreground disabled:hover:bg-transparent transition-all duration-150 flex items-center gap-1.5"
                    title="Step execute selected request"
                  >
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                    <span>Step</span>
                  </button>

                  <button
                    onClick={resetReplay}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all duration-150 flex items-center gap-1.5"
                    title="Reset run reports"
                  >
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
                    <span>Reset</span>
                  </button>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <select
                    value={selectedEnvId || ""}
                    onChange={(e) => setSelectedEnvId(e.target.value || null)}
                    className="text-xs bg-background rounded-lg border border-input px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer select-none font-semibold shadow-sm"
                  >
                    <option value="">No Environment</option>
                    {environments.map((env) => (
                      <option key={env.id} value={env.id}>{env.name}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => { setSelectedHistoryIds(new Set()); setHistorySearch(""); setHarFileContent(""); setHarFileName(""); setImportTab("history"); setImportDialogOpen(true); }}
                    className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-primary/95 transition-all duration-150 shadow-sm flex items-center gap-1.5"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span>Add Requests</span>
                  </button>

                  {entries.length > 0 && (
                    <button
                      onClick={() => clearEntries()}
                      className="text-xs font-semibold text-destructive hover:bg-destructive/10 px-2.5 py-1.5 rounded-lg transition-all duration-150"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="flex border-b border-border bg-muted/20 shrink-0 px-4 py-1.5 gap-1.5 select-none overflow-x-auto">
                {subTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveSubTab(tab.key)}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all duration-150 flex items-center gap-1.5 whitespace-nowrap ${
                      activeSubTab === tab.key ? "bg-card border border-border shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent"
                    }`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                    </svg>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-hidden min-h-0 flex">
                {(activeSubTab === "timeline" || activeSubTab === "waterfall") && (
                  <Group orientation="horizontal" className="h-full w-full overflow-hidden">
                    <Panel defaultSize="320px" minSize="240px" maxSize="500px">
                      <div className="h-full flex flex-col p-4 overflow-auto min-h-0">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 px-1 block shrink-0">
                          {activeSubTab === "timeline" ? "Traffic Timeline" : "Waterfall View"}
                        </span>
                        {activeSubTab === "timeline" ? <ReplayTimeline /> : <ReplayWaterfall />}
                      </div>
                    </Panel>

                    <Separator
                      style={{ width: 4, cursor: "col-resize" }}
                      className="bg-border hover:bg-primary/50 active:bg-primary/70 transition-all duration-150"
                    />

                    <Panel>
                      <div className="h-full flex flex-col p-4 overflow-auto min-h-0">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 px-1 block shrink-0">Studio Inspector</span>
                        <ReplayInspector key={activeEntryId ?? "none"} entry={selectedEntry ?? null} entryResult={selectedEntryResult} />
                      </div>
                    </Panel>
                  </Group>
                )}

                {activeSubTab === "remapping" && <ReplayEnvironmentMap />}
                {activeSubTab === "assertions" && <ReplayAssertions />}
                {activeSubTab === "chaos" && <ReplayChaos />}
                {activeSubTab === "runs" && <ReplayRuns />}
              </div>
            </div>
          )}
        </Panel>
      </Group>

      {importDialogOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card ring-1 ring-border rounded-xl shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-foreground">Import Requests</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">Add requests from history or a HAR file to this session.</span>
              </div>
              <button
                onClick={() => setImportDialogOpen(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex border-b border-border/60 bg-muted/20 shrink-0 px-4 py-1.5 gap-1">
              <button
                onClick={() => setImportTab("history")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 ${
                  importTab === "history" ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                From History
              </button>
              <button
                onClick={() => setImportTab("har")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-150 ${
                  importTab === "har" ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                From HAR File
              </button>
            </div>

            {importTab === "history" ? (
              <>
                <div className="p-3 border-b border-border/60 bg-muted/20 shrink-0">
                  <div className="flex items-center bg-background rounded-lg border border-input px-3 py-1.5 ring-offset-background focus-within:ring-1 focus-within:ring-primary transition-all duration-150">
                    <svg className="h-4 w-4 text-muted-foreground/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search history by URL, method, status..."
                      className="flex-1 bg-transparent text-xs px-2 py-0.5 focus:outline-none placeholder:text-muted-foreground text-foreground"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-4 flex flex-col gap-2 min-h-0">
                  {filteredHistory.length === 0 ? (
                    <div className="text-center py-12 text-xs text-muted-foreground">No matching request history entries found.</div>
                  ) : (
                    filteredHistory.map((entry) => {
                      const isChecked = selectedHistoryIds.has(entry.id);
                      return (
                        <div
                          key={entry.id}
                          onClick={() => handleImportSelect(entry.id)}
                          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border cursor-pointer select-none transition-all duration-150 ${
                            isChecked ? "bg-primary/5 border-primary/45" : "bg-card border-border hover:border-foreground/20"
                          }`}
                        >
                          <input type="checkbox" checked={isChecked} onChange={() => {}} className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-primary cursor-pointer shrink-0 accent-primary" />
                          <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border bg-muted text-foreground/80 shrink-0">{entry.request.method}</span>
                          <div className="flex-1 min-w-0 flex flex-col">
                            <span className="text-xs font-semibold truncate text-foreground/90">{entry.request.url}</span>
                            <span className="text-[9px] text-muted-foreground/60 leading-none mt-1">{new Date(entry.created_at).toLocaleString()}</span>
                          </div>
                          <span className="text-[10px] font-bold font-mono text-muted-foreground shrink-0 bg-background border border-border px-1.5 py-0.5 rounded">{entry.response.status}</span>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="p-4 border-t border-border flex items-center justify-between shrink-0 bg-card/65">
                  <span className="text-xs text-muted-foreground">{selectedHistoryIds.size} of {filteredHistory.length} requests selected</span>
                  <div className="flex gap-2">
                    <button onClick={() => setImportDialogOpen(false)} className="bg-transparent hover:bg-muted text-muted-foreground text-xs font-semibold px-4 py-2 rounded-lg border border-border transition-all duration-150">Cancel</button>
                    <button onClick={handleImportSubmit} disabled={selectedHistoryIds.size === 0} className="bg-primary hover:bg-primary/95 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all duration-150">Import Selected</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 overflow-auto p-6 flex flex-col gap-4 min-h-0">
                  <div
                    className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all duration-150"
                    onClick={() => document.getElementById("har-file-input")?.click()}
                  >
                    <svg className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-sm font-semibold text-foreground block">Drop HAR file here or click to browse</span>
                    <span className="text-xs text-muted-foreground mt-1 block">Supports .har files exported from Chrome DevTools, Firefox, etc.</span>
                    <input
                      id="har-file-input"
                      type="file"
                      accept=".har,application/json"
                      className="hidden"
                      onChange={handleHarFileSelect}
                    />
                  </div>
                  {harFileName && (
                    <div className="bg-green-500/5 border border-green-500/15 rounded-lg p-3 flex items-center gap-2">
                      <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-xs font-semibold text-foreground">{harFileName}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{(harFileContent.length / 1024).toFixed(1)} KB</span>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-border flex items-center justify-end shrink-0 bg-card/65">
                  <div className="flex gap-2">
                    <button onClick={() => setImportDialogOpen(false)} className="bg-transparent hover:bg-muted text-muted-foreground text-xs font-semibold px-4 py-2 rounded-lg border border-border transition-all duration-150">Cancel</button>
                    <button onClick={handleHarImport} disabled={!harFileContent || harImporting} className="bg-primary hover:bg-primary/95 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all duration-150">
                      {harImporting ? "Importing..." : "Import HAR"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export default ReplayPanel;
