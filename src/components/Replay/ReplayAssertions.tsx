import { useState } from "react";
import { useReplayStore } from "@/stores/replayStore";
import type { ReplayAssertion } from "@/lib/invoke";

export function ReplayAssertions() {
  const { sessions, activeSessionId, addAssertion, updateAssertion, deleteAssertion } = useReplayStore();
  const [type, setType] = useState<ReplayAssertion["type"]>("status_code");
  const [expression, setExpression] = useState("");
  const [expected, setExpected] = useState("");

  const session = sessions.find((s) => s.id === activeSessionId);

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <span className="text-sm">No session active. Select or create a session to manage assertions.</span>
      </div>
    );
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expected.trim()) return;

    let finalExpr = expression.trim();
    if (type === "status_code" && !finalExpr) {
      finalExpr = "Status Code";
    } else if (type === "response_time" && !finalExpr) {
      finalExpr = "Response Time";
    } else if (type === "body_contains" && !finalExpr) {
      finalExpr = "Body Contains";
    }

    addAssertion({
      type,
      expression: finalExpr,
      expected: expected.trim(),
      enabled: true,
    });

    setExpression("");
    setExpected("");
  };

  const getPlaceholder = () => {
    switch (type) {
      case "status_code":
        return "e.g. 200";
      case "response_time":
        return "e.g. < 500 or 500";
      case "body_contains":
        return "e.g. token or success";
      case "json_path":
        return "e.g. admin";
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-auto">
      <div className="max-w-4xl w-full mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-foreground tracking-tight">Replay Assertions</h2>
          <p className="text-xs text-muted-foreground">
            Define testing requirements that every replayed request must pass. Requests failing assertions will show as failed on the timeline.
          </p>
        </div>

        {/* Add Assertion Form */}
        <form onSubmit={handleAdd} className="bg-card/50 ring-1 ring-border rounded-xl p-4 flex flex-col md:flex-row items-end gap-3.5 shadow-sm">
          <div className="flex-[0.8] flex flex-col gap-1.5 w-full">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Type</label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as ReplayAssertion["type"]);
                setExpression("");
              }}
              className="w-full text-xs bg-background rounded-lg border border-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-all duration-150"
            >
              <option value="status_code">Status Code Match</option>
              <option value="response_time">Response Latency</option>
              <option value="body_contains">Response Body Substring</option>
              <option value="json_path">JSON Path Value</option>
            </select>
          </div>

          {type === "json_path" && (
            <div className="flex-1 flex flex-col gap-1.5 w-full">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">JSON Path</label>
              <input
                type="text"
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                placeholder="e.g. $.data.user.id"
                required
                className="w-full text-xs bg-background rounded-lg border border-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60 transition-all duration-150"
              />
            </div>
          )}

          <div className="flex-1 flex flex-col gap-1.5 w-full">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Expected Value</label>
            <input
              type="text"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder={getPlaceholder()}
              required
              className="w-full text-xs bg-background rounded-lg border border-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60 transition-all duration-150"
            />
          </div>

          <button
            type="submit"
            className="shrink-0 w-full md:w-auto bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-lg hover:bg-primary/95 transition-all duration-150 shadow-sm"
          >
            Add Rule
          </button>
        </form>

        {/* Assertions List */}
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Session Assertions ({session.assertions.length})</span>
          
          {session.assertions.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground text-xs">
              No assertions defined. Replay requests will run without validation.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {session.assertions.map((assertion) => (
                <div
                  key={assertion.id}
                  className="bg-card border border-border rounded-xl p-3.5 flex items-center justify-between gap-4 group hover:border-primary/25 hover:shadow-sm transition-all duration-150"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={assertion.enabled}
                      onChange={(e) => updateAssertion(assertion.id, { enabled: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-primary accent-primary cursor-pointer shrink-0"
                    />
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-semibold text-foreground/90 capitalize">
                        {assertion.type.replace("_", " ")}:
                      </span>
                      <span className="text-xs font-mono font-medium text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/10 truncate max-w-[280px]">
                        {assertion.type === "json_path" ? `${assertion.expression} == ` : ""}
                        {assertion.expected}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => deleteAssertion(assertion.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150 shrink-0"
                    title="Delete assertion"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
