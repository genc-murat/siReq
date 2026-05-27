import React, { useState, useMemo } from "react";
import { useContractStore } from "@/stores/contractStore";
import { useRequestStore } from "@/stores/requestStore";
import { useToastStore } from "@/stores/toastStore";
import { CodeMirrorEditor } from "@/components/CodeMirrorEditor";


export function ContractTab() {
  const request = useRequestStore((s) => s.request);
  const addToast = useToastStore((s) => s.addToast);

  const contract = useContractStore((s) => s.getContract(request.id));
  const bindContract = useContractStore((s) => s.bindContract);
  const unbindContract = useContractStore((s) => s.unbindContract);

  // Form states for creating a new binding
  const [specContent, setSpecContent] = useState("");
  const [specName, setSpecName] = useState("");
  
  // Parsed specification details
  const parsedSpec = useMemo(() => {
    if (!specContent.trim()) return null;
    try {
      const parsed = JSON.parse(specContent);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }, [specContent]);

  // Dynamically extract paths from parsed OpenAPI spec
  const availablePaths = useMemo(() => {
    if (!parsedSpec || !parsedSpec.paths) return [];
    return Object.keys(parsedSpec.paths);
  }, [parsedSpec]);

  const [selectedPath, setSelectedPath] = useState("");

  // Dynamically extract methods for the selected path
  const availableMethods = useMemo(() => {
    if (!parsedSpec || !selectedPath) return [];
    const pathObj = parsedSpec.paths[selectedPath];
    if (!pathObj) return [];
    return Object.keys(pathObj).filter(
      (m) => ["get", "post", "put", "patch", "delete", "head", "options"].includes(m.toLowerCase())
    );
  }, [parsedSpec, selectedPath]);

  const [selectedMethod, setSelectedMethod] = useState("");

  // Dynamically extract status codes for the selected path + method
  const availableStatusCodes = useMemo(() => {
    if (!parsedSpec || !selectedPath || !selectedMethod) return [];
    const pathObj = parsedSpec.paths[selectedPath];
    if (!pathObj) return [];
    const methodObj = pathObj[selectedMethod.toLowerCase()];
    if (!methodObj || !methodObj.responses) return [];
    return Object.keys(methodObj.responses).map(Number).filter((n) => !isNaN(n));
  }, [parsedSpec, selectedPath, selectedMethod]);

  const [selectedStatusCode, setSelectedStatusCode] = useState<number>(200);

  const handleBind = () => {
    if (!specContent.trim() || !selectedPath || !selectedMethod || !selectedStatusCode) {
      addToast("Please fill out all contract parameters", "error");
      return;
    }

    try {
      const name = specName.trim() || parsedSpec?.info?.title || "Imported OpenAPI Specification";
      bindContract(request.id, {
        specContent,
        specName: name,
        path: selectedPath,
        method: selectedMethod.toUpperCase(),
        statusCode: selectedStatusCode,
      });
      addToast("API Contract successfully bound!", "success");
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "Failed to bind contract", "error");
    }
  };

  const handleUnbind = () => {
    unbindContract(request.id);
    addToast("API Contract unbound", "info");
    // Clear form states
    setSpecContent("");
    setSpecName("");
    setSelectedPath("");
    setSelectedMethod("");
    setSelectedStatusCode(200);
  };

  // Render bound contract information
  if (contract) {
    return (
      <div className="h-full flex flex-col p-1 gap-3 overflow-hidden">
        {/* Glowing Bound Info Card */}
        <div className="border border-green-500/35 bg-green-950/10 p-3.5 rounded-xl shadow-md flex items-start justify-between shrink-0">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider font-mono">
                API Contract Active
              </span>
            </div>
            <h3 className="text-sm font-bold text-foreground truncate">{contract.specName}</h3>
            <div className="flex flex-wrap gap-2 text-[10px] font-mono font-medium text-muted-foreground pt-0.5">
              <span className="px-1.5 py-0.5 rounded bg-muted border border-border/40 text-primary font-bold">
                {contract.method}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-muted border border-border/40 text-foreground break-all">
                {contract.path}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-green-950/20 border border-green-500/25 text-green-400 font-bold">
                Expect Status {contract.statusCode}
              </span>
            </div>
          </div>
          <button
            onClick={handleUnbind}
            className="px-2.5 py-1 text-[11px] font-semibold text-red-500 border border-red-500/20 hover:border-red-500/50 hover:bg-red-500/10 rounded-lg transition-all duration-150 shrink-0 nodrag ml-3"
          >
            Unbind Spec
          </button>
        </div>

        {/* Schema Information */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold mb-1.5 px-1 flex items-center justify-between">
            <span>Linked Contract JSON Schema (Dereferenced)</span>
            <span className="text-green-500 font-mono">Ready</span>
          </div>
          <div className="flex-1 min-h-0 border rounded-xl overflow-hidden bg-card">
            <CodeMirrorEditor
              value={request.json_schema || ""}
              language="json"
              readOnly
            />
          </div>
        </div>
      </div>
    );
  }

  // Render binding wizard form
  return (
    <div className="h-full flex flex-col gap-4 p-1 overflow-auto">
      <div className="flex items-start gap-2.5 text-[11px] text-muted-foreground shrink-0 border-b pb-3">
        <div className="p-1.5 rounded-lg bg-primary/10 ring-1 ring-primary/20 shrink-0 mt-0.5">
          <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div className="space-y-0.5">
          <span className="font-semibold text-foreground block">Bind OpenAPI Contract Specifications</span>
          <span className="leading-relaxed block text-[10px]">
            Link this HTTP request directly to an OpenAPI spec path. The response body schema will automatically dereference and validate on every send.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-[300px]">
        {/* Left Side: OpenAPI Spec JSON Editor */}
        <div className="flex flex-col gap-2 min-h-[250px]">
          <div className="flex items-center justify-between shrink-0 px-1">
            <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">
              Step 1: Paste OpenAPI Spec (JSON)
            </label>
            {parsedSpec ? (
              <span className="text-[9px] bg-green-500/10 text-green-500 border border-green-500/25 px-1.5 py-0.2 rounded font-bold">
                Parsed title: {parsedSpec.info?.title || "OpenAPI"}
              </span>
            ) : specContent.trim() ? (
              <span className="text-[9px] bg-red-500/10 text-red-500 border border-red-500/25 px-1.5 py-0.2 rounded font-bold">
                Syntax Error
              </span>
            ) : null}
          </div>

          <input
            type="text"
            placeholder="Spec Friendly Name (e.g. User Service Spec)"
            value={specName}
            onChange={(e) => setSpecName(e.target.value)}
            className="bg-background text-foreground text-xs px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring shrink-0 font-medium transition-all duration-150"
          />

          <div className="flex-1 min-h-0 border rounded-xl overflow-hidden bg-card shadow-sm">
            <CodeMirrorEditor
              value={specContent}
              onChange={setSpecContent}
              language="json"
              placeholder={`{\n  "openapi": "3.0.0",\n  "info": {\n    "title": "User API Spec",\n    "version": "1.0"\n  },\n  "paths": {\n    "/users": {\n      "get": {\n        "responses": {\n          "200": {\n            "content": {\n              "application/json": {\n                "schema": { "type": "array" }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n}`}
            />
          </div>
        </div>

        {/* Right Side: Binding Selectors */}
        <div className="flex flex-col gap-4 border p-4 bg-muted/10 rounded-xl justify-center">
          <div className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold border-b pb-1">
            Step 2: Configure Endpoint Binding
          </div>

          {/* Paths Dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground font-semibold">API Path</label>
            <select
              value={selectedPath}
              disabled={!parsedSpec}
              onChange={(e) => {
                setSelectedPath(e.target.value);
                setSelectedMethod("");
              }}
              className="w-full bg-background border px-2.5 py-2 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 truncate font-mono"
            >
              <option value="">-- Choose Spec Path --</option>
              {availablePaths.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Methods Dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground font-semibold">HTTP Method</label>
            <select
              value={selectedMethod}
              disabled={!selectedPath}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="w-full bg-background border px-2.5 py-2 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 font-mono uppercase"
            >
              <option value="">-- Choose HTTP Method --</option>
              {availableMethods.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Status Code Dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground font-semibold">Expected Response Code</label>
            <select
              value={selectedStatusCode}
              disabled={!selectedMethod}
              onChange={(e) => setSelectedStatusCode(Number(e.target.value))}
              className="w-full bg-background border px-2.5 py-2 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 font-mono"
            >
              {availableStatusCodes.length === 0 ? (
                <option value="200">200</option>
              ) : (
                availableStatusCodes.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))
              )}
            </select>
          </div>

          <div className="h-px bg-border/50 my-1" />

          {/* Bind Button */}
          <button
            onClick={handleBind}
            disabled={!parsedSpec || !selectedPath || !selectedMethod}
            className="w-full py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold rounded-lg shadow transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Bind OpenAPI Contract
          </button>
        </div>
      </div>
    </div>
  );
}
