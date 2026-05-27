import { useState } from "react";
import type { ResponseScenario } from "@/lib/invoke";
import { CodeMirrorEditor } from "@/components/CodeMirrorEditor";
import { MockLatencyEditor } from "./MockLatencyEditor";
import { MockMatcherEditor } from "./MockMatcherEditor";
import { Plus, Trash, AlertCircle, Sparkles, FileCode, Check } from "lucide-react";

interface MockScenarioEditorProps {
  scenario: ResponseScenario;
  onChange: (scenario: ResponseScenario) => void;
}

export function MockScenarioEditor({ scenario, onChange }: MockScenarioEditorProps) {
  const [headerKey, setHeaderKey] = useState("");
  const [headerVal, setHeaderVal] = useState("");

  const handleFieldChange = (field: keyof ResponseScenario, value: unknown) => {
    onChange({
      ...scenario,
      [field]: value,
    });
  };

  const handleStatusChange = (val: string) => {
    const num = parseInt(val) || 0;
    handleFieldChange("status_code", num);
  };

  const isStatusInvalid = scenario.status_code < 100 || scenario.status_code > 599;

  const handleAddHeader = () => {
    if (!headerKey.trim()) return;
    const nextHeaders = { ...scenario.headers };
    nextHeaders[headerKey.trim()] = headerVal;
    handleFieldChange("headers", nextHeaders);
    setHeaderKey("");
    setHeaderVal("");
  };

  const handleRemoveHeader = (key: string) => {
    const nextHeaders = { ...scenario.headers };
    delete nextHeaders[key];
    handleFieldChange("headers", nextHeaders);
  };

  const handleHeaderValueChange = (key: string, val: string) => {
    const nextHeaders = { ...scenario.headers };
    nextHeaders[key] = val;
    handleFieldChange("headers", nextHeaders);
  };

  // Determine language for CodeMirror
  const contentType = Object.keys(scenario.headers)
    .find((k) => k.toLowerCase() === "content-type");
  const contentTypeVal = contentType ? scenario.headers[contentType].toLowerCase() : "";
  
  let language: "json" | "xml" | "html" | "text" = "text";
  if (contentTypeVal.includes("json")) {
    language = "json";
  } else if (contentTypeVal.includes("xml")) {
    language = "xml";
  } else if (contentTypeVal.includes("html")) {
    language = "html";
  }

  const insertFakerSnippet = (snippet: string) => {
    handleFieldChange("body", scenario.body + snippet);
  };

  return (
    <div className="space-y-5">
      {/* Basic Settings: Name & Status Code */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-1.5">
          <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Scenario Name</label>
          <input
            type="text"
            value={scenario.name}
            onChange={(e) => handleFieldChange("name", e.target.value)}
            placeholder="e.g. Success 200, Bad Request 400"
            className="w-full h-9 bg-background border border-border rounded-lg px-3 text-xs focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Response Code (Status)</label>
          <div className="relative">
            <input
              type="number"
              min="100"
              max="599"
              value={scenario.status_code || ""}
              onChange={(e) => handleStatusChange(e.target.value)}
              placeholder="200"
              className={`w-full h-9 bg-background border rounded-lg px-3 pr-8 text-xs focus:outline-none focus:border-primary transition-colors ${
                isStatusInvalid ? "border-rose-500/50 focus:border-rose-500" : "border-border"
              }`}
            />
            {isStatusInvalid && (
              <span title="Status code must be in the range 100-599!" className="absolute right-2.5 top-2.5">
                <AlertCircle className="w-4.5 h-4.5 text-rose-500 animate-bounce" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Rules Matcher Editor */}
      {!scenario.is_default && (
        <MockMatcherEditor
          rules={scenario.rules}
          onChange={(rules) => handleFieldChange("rules", rules)}
        />
      )}
      {scenario.is_default && (
        <div className="p-3 bg-primary/[0.03] border border-primary/20 rounded-xl flex items-start gap-2.5">
          <Check className="w-4.5 h-4.5 text-primary shrink-0 mt-0.5" />
          <div className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground/90 block mb-0.5">Default Response Scenario</span>
            This scenario is executed when none of the other rule-based scenarios match the incoming request.
          </div>
        </div>
      )}

      {/* Latency Simulation */}
      <MockLatencyEditor
        latency={scenario.latency}
        onChange={(latency) => handleFieldChange("latency", latency)}
      />

      {/* Response Headers */}
      <div className="space-y-3 p-4 rounded-xl border bg-card/40 backdrop-blur-sm shadow-inner">
        <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Response Headers</label>
        
        {/* Header Grid */}
        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
          {Object.entries(scenario.headers).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <div className="bg-background border px-3 h-8 flex items-center rounded-lg text-xs font-semibold text-foreground/80 w-1/3 truncate select-all">
                {key}
              </div>
              <input
                type="text"
                value={val}
                onChange={(e) => handleHeaderValueChange(key, e.target.value)}
                placeholder="Header value..."
                className="h-8 bg-background border border-border rounded-lg px-3 text-xs focus:outline-none focus:border-primary transition-colors flex-1 min-w-0"
              />
              <button
                type="button"
                onClick={() => handleRemoveHeader(key)}
                className="p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all duration-150 shrink-0"
              >
                <Trash className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add Header Inputs */}
        <div className="flex items-center gap-2 border-t border-border/50 pt-3 mt-1">
          <input
            type="text"
            value={headerKey}
            onChange={(e) => setHeaderKey(e.target.value)}
            placeholder="Header name (e.g. Content-Type)"
            className="h-8 bg-background border border-border rounded-lg px-2.5 text-xs focus:outline-none focus:border-primary transition-colors w-1/3"
          />
          <input
            type="text"
            value={headerVal}
            onChange={(e) => setHeaderVal(e.target.value)}
            placeholder="Header value (e.g. application/json)"
            className="h-8 bg-background border border-border rounded-lg px-2.5 text-xs focus:outline-none focus:border-primary transition-colors flex-1"
          />
          <button
            type="button"
            onClick={handleAddHeader}
            className="flex items-center justify-center h-8 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 px-3.5 rounded-lg text-xs font-semibold transition-all duration-150 shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Response Body */}
      <div className="space-y-2 flex flex-col h-72">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1.5">
            <FileCode className="w-4 h-4 text-primary" />
            <span>Response Body</span>
          </label>

          {/* Snippet inserter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
              <Sparkles className="w-3 h-3" />
              Add Template:
            </span>
            <button
              onClick={() => insertFakerSnippet("{{faker.uuid}}")}
              className="text-[9px] font-semibold bg-background hover:bg-accent border px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-all"
              title="Generates a random UUID"
            >
              UUID
            </button>
            <button
              onClick={() => insertFakerSnippet("{{faker.name}}")}
              className="text-[9px] font-semibold bg-background hover:bg-accent border px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-all"
              title="Generates a random Name"
            >
              Name
            </button>
            <button
              onClick={() => insertFakerSnippet("{{faker.email}}")}
              className="text-[9px] font-semibold bg-background hover:bg-accent border px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-all"
              title="Generates a random Email"
            >
              Email
            </button>
            <button
              onClick={() => insertFakerSnippet("{{request.query.id}}")}
              className="text-[9px] font-semibold bg-background hover:bg-accent border px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground transition-all"
              title="Inserts query ID from the incoming request"
            >
              Req Param
            </button>
          </div>
        </div>

        <div className="flex-1 rounded-xl border border-border bg-background overflow-hidden relative shadow-inner">
          <CodeMirrorEditor
            value={scenario.body}
            onChange={(val) => handleFieldChange("body", val)}
            language={language}
            placeholder='{"status": "ok"}'
          />
        </div>
      </div>
    </div>
  );
}
