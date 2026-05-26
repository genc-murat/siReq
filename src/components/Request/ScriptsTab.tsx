import { useRequestStore } from "@/stores/requestStore";
import { CodeMirrorEditor, countJSSyntaxErrors } from "@/components/CodeMirrorEditor";
import { Tabs, type Tab } from "@/components/Tabs";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect, useMemo } from "react";
import { useUIStore } from "@/stores/uiStore";
import { getEnvironments } from "@/lib/invoke";
import type { Environment, VariableExtraction } from "@/lib/invoke";
import { ExtractionEditor } from "./ExtractionEditor";

interface Template {
  label: string;
  description: string;
  code: string;
}

const preRequestTemplates: Template[] = [
  {
    label: "Set timestamp variable",
    description: "Store current timestamp in a variable",
    code: `// Store current timestamp for later use
pm.variables.set("timestamp", Date.now());
console.log("Timestamp set:", Date.now());`,
  },
  {
    label: "Add Bearer token from variable",
    description: "Set Authorization header from a stored token",
    code: `// Add Bearer token from environment variable
const token = pm.environment.get("auth_token");
if (token) {
  request.headers.push({
    key: "Authorization",
    value: "Bearer " + token,
    enabled: true,
  });
  console.log("Added Bearer token");
} else {
  console.warn("No auth_token variable found");
}`,
  },
  {
    label: "Log request info",
    description: "Log method, URL, and header count before sending",
    code: `// Log request details
console.log("Method:", request.method);
console.log("URL:", request.url);
console.log("Headers:", request.headers.length);
console.log("Body type:", request.body_type);`,
  },
  {
    label: "Randomize query param",
    description: "Add a cache-busting query parameter",
    code: `// Add a random query param to bust cache
request.query_params.push({
  key: "_t",
  value: String(Date.now()),
  enabled: true,
});
console.log("Added cache-busting param");`,
  },
  {
    label: "Set Content-Type header",
    description: "Ensure a specific Content-Type header is present",
    code: `// Ensure Content-Type header is set
const hasContentType = request.headers.some(h =>
  h.key.toLowerCase() === "content-type"
);
if (!hasContentType && request.body) {
  request.headers.push({
    key: "Content-Type",
    value: "application/json",
    enabled: true,
  });
  console.log("Added Content-Type: application/json");
}`,
  },
];

const postResponseTemplates: Template[] = [
  {
    label: "Status code is 200",
    description: "Verify response status is 200 OK",
    code: `pm.test("Status code is 200", () => {
  pm.expect(response.status).to.equal(200);
});`,
  },
  {
    label: "Status code is 2xx",
    description: "Verify response status is in 200-299 range",
    code: `pm.test("Status code is 2xx", () => {
  pm.expect(response.status >= 200 && response.status < 300).to.equal(true);
});`,
  },
  {
    label: "Response time < 500ms",
    description: "Verify response completes within 500ms",
    code: `pm.test("Response time is acceptable", () => {
  pm.expect(response.time_ms).to.be.below(500);
});`,
  },
  {
    label: "Body contains string",
    description: "Verify response body includes expected text",
    code: `pm.test("Body contains expected text", () => {
  pm.expect(response.body).to.include("expected_value");
});`,
  },
  {
    label: "Response is valid JSON",
    description: "Verify response body can be parsed as JSON",
    code: `pm.test("Response is valid JSON", () => {
  try {
    JSON.parse(response.body);
  } catch (e) {
    throw new Error("Response is not valid JSON: " + e.message);
  }
});`,
  },
  {
    label: "Set auth token from response",
    description: "Extract token from JSON response and store as variable",
    code: `// Extract token from response body and store it
pm.test("Response has access token", () => {
  const body = JSON.parse(response.body);
  const token = body.access_token || body.token || body.data?.token;
  if (token) {
    pm.variables.set("auth_token", token);
    console.log("Auth token saved:", token.substring(0, 20) + "...");
  } else {
    throw new Error("No token found in response");
  }
});`,
  },
  {
    label: "Check Content-Type header",
    description: "Verify response has expected Content-Type",
    code: `pm.test("Content-Type is application/json", () => {
  const ct = response.headers.find(h =>
    h[0].toLowerCase() === "content-type"
  );
  pm.expect(ct?.[1] || "").to.include("application/json");
});`,
  },
  {
    label: "Log full response summary",
    description: "Log status, time, size, and headers",
    code: `// Response summary
console.log("Status:", response.status, response.status_text);
console.log("Time:", response.time_ms + "ms");
console.log("Size:", response.size + " bytes");
console.log("Headers:", response.headers.length);
response.headers.forEach(([k, v]) => {
  console.log("  " + k + ": " + v);
});`,
  },
];

export function ScriptsTab() {
  const request = useRequestStore((s) => s.request);
  const response = useRequestStore((s) => s.response);
  const setPreScript = useRequestStore((s) => s.setPreScript);
  const setPostScript = useRequestStore((s) => s.setPostScript);
  const setRequest = useRequestStore((s) => s.setRequest);
  const activeEnvironmentId = useUIStore((s) => s.activeEnvironmentId);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEditor, setActiveEditor] = useState<"pre" | "post">("pre");
  const [showExtractions, setShowExtractions] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load environments for env var autocomplete
  useEffect(() => {
    getEnvironments().then(setEnvironments);
  }, []);

  const activeEnv = useMemo(
    () => environments.find((e) => e.id === activeEnvironmentId),
    [environments, activeEnvironmentId]
  );

  const envVarCompletions = useMemo(() => {
    if (!activeEnv) return [];
    return activeEnv.variables
      .filter((v) => v.enabled && v.key.trim())
      .map((v) => ({
        label: v.key,
        detail: v.value.length > 40 ? v.value.slice(0, 40) + "…" : v.value,
        type: "variable" as const,
      }));
  }, [activeEnv]);

  const preScriptErrors = useMemo(() => countJSSyntaxErrors(request.pre_script), [request.pre_script]);
  const postScriptErrors = useMemo(() => countJSSyntaxErrors(request.post_script), [request.post_script]);

  const scriptLogs = response?.script_logs ?? [];
  const testResults = response?.test_results ?? [];
  const modifiedVariables = response?.modified_variables ?? [];

  const passedTests = testResults.filter((t) => t.passed).length;
  const failedTests = testResults.filter((t) => !t.passed).length;

  const activeTemplates =
    activeEditor === "pre" ? preRequestTemplates : postResponseTemplates;

  const currentScript =
    activeEditor === "pre" ? request.pre_script : request.post_script;
  const setScript = activeEditor === "pre" ? setPreScript : setPostScript;

  function insertTemplate(template: Template) {
    const separator = currentScript.trim()
      ? "\n\n// ---\n\n"
      : "";
    setScript(currentScript + separator + template.code);
    setTemplatesOpen(false);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTemplatesOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const scriptTabs: Tab[] = useMemo(() => {
    function badge(errors: number, hasContent: boolean) {
      if (errors > 0) {
        return (
          <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-destructive/15 text-destructive text-[9px] font-semibold leading-none">
            {errors}
          </span>
        );
      }
      if (hasContent) {
        return (
          <svg className="h-3 w-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      }
      return undefined;
    }

    return [
      {
        id: "pre",
        label: "Pre-request",
        badge: badge(preScriptErrors, !!request.pre_script?.trim()),
      },
      {
        id: "post",
        label: "Post-response",
        badge: badge(postScriptErrors, !!request.post_script?.trim()),
      },
    ];
  }, [preScriptErrors, postScriptErrors, request.pre_script, request.post_script]);

  const extractions = request.extractions ?? [];
  const setExtractions = (extractions: VariableExtraction[]) => {
    setRequest({ ...request, extractions });
  };

  return (
    <div className="h-full flex flex-col gap-2 p-1">
      <Tabs
        tabs={scriptTabs}
        activeTab={activeEditor}
        onChange={(id) => setActiveEditor(id as "pre" | "post")}
        className="shrink-0"
        trailing={
          <div className="flex items-center gap-1 px-1">
            <button
              onClick={() => setShowExtractions(!showExtractions)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg transition-all duration-150",
                showExtractions
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
              Extractions
              {extractions.filter(e => e.enabled).length > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary-foreground/20 text-[8px] font-semibold">
                  {extractions.filter(e => e.enabled).length}
                </span>
              )}
            </button>
            {testResults.length > 0 && (
              <React.Fragment>
                {passedTests > 0 && (
                  <span className="text-green-500 text-xs">{passedTests}✓</span>
                )}
                {failedTests > 0 && (
                  <span className="text-red-500 text-xs">{failedTests}✗</span>
                )}
              </React.Fragment>
            )}
          </div>
        }
      />

      {showExtractions && (
        <div className="flex-1 min-h-0 overflow-auto">
          <ExtractionEditor
            extractions={extractions}
            onChange={setExtractions}
          />
        </div>
      )}

      {!showExtractions && (
        <div className="flex flex-col gap-2 min-h-0 flex-1">

      {/* Toolbar */}
      <div className="flex items-center gap-2 shrink-0">
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setTemplatesOpen(!templatesOpen)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium border rounded-lg hover:bg-accent transition-all duration-150"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Templates
            <svg
              className={cn(
                "h-2.5 w-2.5 transition-transform",
                templatesOpen && "rotate-180"
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {templatesOpen && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-popover border rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="text-[10px] font-medium text-muted-foreground px-2.5 py-1.5 border-b bg-muted/30">
                {activeEditor === "pre"
                  ? "Pre-request Templates"
                  : "Post-response Templates"}
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {activeTemplates.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => insertTemplate(t)}
                    className="w-full text-left px-2.5 py-2 hover:bg-accent transition-all duration-150 border-b border-border/30 last:border-0"
                  >
                    <div className="text-xs font-medium">{t.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {t.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">
          Click to insert a template into the editor
        </span>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 border rounded-lg overflow-hidden">
        {activeEditor === "pre" ? (
          <CodeMirrorEditor
            value={request.pre_script}
            onChange={setPreScript}
            language="javascript"
            completions={envVarCompletions}
            placeholder={`// Pre-request script\n// Modify request, set variables, or log info\nconsole.log("Sending request to:", request.url);\npm.variables.set("timestamp", Date.now());`}
          />
        ) : (
          <CodeMirrorEditor
            value={request.post_script}
            onChange={setPostScript}
            language="javascript"
            completions={envVarCompletions}
            placeholder={`// Post-response script\n// Test response values or log info\npm.test("Status is 200", () => {\n  pm.expect(response.status).to.equal(200);\n});\npm.test("Response time < 500ms", () => {\n  pm.expect(response.time_ms).to.be.below(500);\n});\nconsole.log("Response size:", response.size, "bytes");`}
          />
        )}
      </div>

      {/* Help text */}
        <div className="text-[10px] text-muted-foreground border rounded-lg p-2 space-y-1 shrink-0">
        <div className="font-medium text-[11px] text-foreground mb-1">Available APIs</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          <code className="text-[10px]">console.log(...)</code>
          <span>Print debug output</span>
          <code className="text-[10px]">pm.test(name, fn)</code>
          <span>Define a test</span>
          <code className="text-[10px]">pm.expect(value)</code>
          <span>Assertion (to.equal, to.include, to.be.below/above)</span>
          <code className="text-[10px]">pm.variables.get/set(key)</code>
          <span>Read/write variables</span>
          <code className="text-[10px]">pm.environment.get/set(key)</code>
          <span>Read/write env vars</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1 pt-1 border-t border-border">
          <code className="text-[10px]">request.url / method / headers</code>
          <span>Modifiable request (pre only)</span>
          <code className="text-[10px]">response.status / body / headers</code>
          <span>Response data (post only)</span>
          <code className="text-[10px]">response.time_ms / size</code>
          <span>Performance metrics</span>
        </div>
      </div>
      </div>
      )}

      {/* Script log output */}
      {scriptLogs.length > 0 && (
        <div className="shrink-0 max-h-32 overflow-auto border rounded-lg bg-background">
          <div className="text-[10px] font-medium text-muted-foreground px-2 py-1 border-b sticky top-0 bg-background">
            Script Output
          </div>
          {scriptLogs.map((log, i) => (
            <div
              key={i}
              className={cn(
                "text-[10px] font-mono px-2 py-0.5 border-b border-border/30 last:border-0",
                log.level === "error" ? "text-red-500" : log.level === "warn" ? "text-yellow-500" : "text-muted-foreground"
              )}
            >
              {log.message}
            </div>
          ))}
        </div>
      )}

      {/* Modified variables */}
      {modifiedVariables.length > 0 && (
        <div className="shrink-0 max-h-32 overflow-auto border rounded-lg bg-background">
          <div className="text-[10px] font-medium text-muted-foreground px-2 py-1 border-b sticky top-0 bg-background flex items-center gap-1.5">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            Modified Variables ({modifiedVariables.length})
          </div>
          {modifiedVariables.map((v, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-[10px] font-mono px-2 py-1 border-b border-border/30 last:border-0 hover:bg-accent/30 transition-all duration-150"
            >
              <span className="font-semibold text-foreground shrink-0">{v.key}</span>
              <span className="text-muted-foreground/40 shrink-0">=</span>
              <span className="text-primary truncate">{v.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
