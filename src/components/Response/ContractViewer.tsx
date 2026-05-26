import React, { useMemo } from "react";
import { useContractStore, getResponseSchemaFromSpec, dereferenceSchema } from "@/stores/contractStore";
import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { cn } from "@/lib/utils";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

interface AssertionResult {
  name: string;
  passed: boolean;
  message: string;
  details?: { label: string; value: string; passed: boolean }[];
  errors?: { path: string; message: string }[];
}

export function ContractViewer() {
  const request = useRequestStore((s) => s.request);
  const response = useRequestStore((s) => s.response);
  const contract = useContractStore((s) => s.getContract(request.id));
  const setActiveTab = useUIStore((s) => s.setActiveTab);

  // Pact-style Compliance Audit Engine
  const auditReport = useMemo(() => {
    if (!contract || !response) return null;

    const assertions: AssertionResult[] = [];
    let isFullyCompliant = true;

    // --- Assertion 1: Status Code Check ---
    const returnedStatus = response.status;
    const expectedStatus = contract.statusCode;
    
    // Parse spec to see if returned code is documented at all
    let isDocumented = false;
    let spec: any = null;
    try {
      spec = JSON.parse(contract.specContent);
      const pathObj = spec.paths?.[contract.path];
      const methodObj = pathObj?.[contract.method.toLowerCase()];
      if (methodObj && methodObj.responses && methodObj.responses[String(returnedStatus)]) {
        isDocumented = true;
      }
    } catch {}

    const statusDetails = [
      { label: "Bound Expected Status", value: String(expectedStatus), passed: returnedStatus === expectedStatus },
      { label: "Actual Returned Status", value: `${returnedStatus} ${response.status_text}`, passed: returnedStatus === expectedStatus },
      { label: "Documented in OpenAPI Spec", value: isDocumented ? "Yes" : "No", passed: isDocumented },
    ];

    let statusPassed = returnedStatus === expectedStatus;
    let statusMsg = `HTTP status code is ${returnedStatus} (expected ${expectedStatus}).`;
    if (returnedStatus !== expectedStatus) {
      if (isDocumented) {
        statusPassed = true; // Still compatible under openapi contract paths
        statusMsg = `Status is ${returnedStatus}. Differs from bound expected status (${expectedStatus}) but is documented in spec.`;
      } else {
        isFullyCompliant = false;
        statusMsg = `Status ${returnedStatus} is NOT documented under contract path: ${contract.method} ${contract.path}`;
      }
    }

    assertions.push({
      name: "HTTP Status Code Compliance",
      passed: statusPassed,
      message: statusMsg,
      details: statusDetails,
    });

    // --- Assertion 2: Header Compliance Check ---
    const returnedHeaders = response.headers;
    const headerDetails: { label: string; value: string; passed: boolean }[] = [];
    let headersPassed = true;

    // Check Content-Type (standard contract expectation for JSON APIs)
    const contentTypeHeader = returnedHeaders.find(([k]) => k.toLowerCase() === "content-type");
    const contentType = contentTypeHeader?.[1] ?? "none";
    const isJson = contentType.toLowerCase().includes("application/json");

    headerDetails.push({
      label: "Content-Type is JSON",
      value: contentType,
      passed: isJson,
    });

    if (!isJson) {
      headersPassed = false;
      isFullyCompliant = false;
    }

    // Inspect spec to find required response headers
    let expectedHeadersList: string[] = [];
    try {
      const pathObj = spec.paths?.[contract.path];
      const methodObj = pathObj?.[contract.method.toLowerCase()];
      const responseObj = methodObj?.responses?.[String(returnedStatus)];
      if (responseObj && responseObj.headers) {
        expectedHeadersList = Object.keys(responseObj.headers);
      }
    } catch {}

    for (const expHeader of expectedHeadersList) {
      const actualHeader = returnedHeaders.find(([k]) => k.toLowerCase() === expHeader.toLowerCase());
      const hasHeader = !!actualHeader;
      headerDetails.push({
        label: `Header "${expHeader}" present`,
        value: hasHeader ? actualHeader[1] : "(missing)",
        passed: hasHeader,
      });

      if (!hasHeader) {
        headersPassed = false;
        isFullyCompliant = false;
      }
    }

    assertions.push({
      name: "HTTP Response Headers Compliance",
      passed: headersPassed,
      message: headersPassed
        ? "All expected headers and Content-Type are fully compliant."
        : `Header contract breaches found. Expected JSON payload and missing spec headers.`,
      details: headerDetails,
    });

    // --- Assertion 3: Response Body JSON Schema Check ---
    let bodyPassed = true;
    let bodyMsg = "Response body is fully compliant with the contract schema.";
    let bodyErrors: { path: string; message: string }[] = [];

    // Parse response body
    let responseData: any = null;
    try {
      responseData = JSON.parse(response.body);
    } catch {
      bodyPassed = false;
      isFullyCompliant = false;
      bodyMsg = "Failed to parse response body: Payload is not valid JSON.";
    }

    if (bodyPassed && responseData !== null) {
      try {
        // Resolve the schema for the returned status code dynamically
        const rawSchema = getResponseSchemaFromSpec(spec, contract.path, contract.method, returnedStatus);
        const resolvedSchema = rawSchema ? dereferenceSchema(rawSchema, spec) : null;

        if (resolvedSchema) {
          const validate = ajv.compile(resolvedSchema);
          const valid = validate(responseData);

          if (!valid) {
            bodyPassed = false;
            isFullyCompliant = false;
            bodyMsg = "Response payload violates contract JSON Schema requirements.";
            bodyErrors = (validate.errors ?? []).map((err) => {
              let path = err.instancePath || "(root)";
              if (err.params && "missingProperty" in err.params) {
                path = err.instancePath
                  ? `${err.instancePath}/${err.params.missingProperty}`
                  : `/${String(err.params.missingProperty)}`;
              }
              return {
                path,
                message: err.message ?? "Validation error",
              };
            });
          }
        } else {
          // No schema defined for this status code
          bodyMsg = `No schema contract defined in OpenAPI spec for status code ${returnedStatus}. Skipping schema validate.`;
        }
      } catch (err: any) {
        bodyPassed = false;
        isFullyCompliant = false;
        bodyMsg = `AJV schema validation engine error: ${err.message}`;
      }
    }

    assertions.push({
      name: "Response Body JSON Schema Compliance",
      passed: bodyPassed,
      message: bodyMsg,
      errors: bodyErrors,
    });

    return {
      isFullyCompliant,
      assertions,
    };
  }, [contract, response]);

  // If no contract configured, show wizard suggestion
  if (!contract) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6 py-8 border rounded-2xl bg-card shadow-sm">
          <div className="p-3.5 rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">API Contract Validation</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Verify if this API is compliant under your OpenAPI specification contract (Pact-style testing).
            </p>
          </div>
          <button
            onClick={() => setActiveTab("contract")}
            className="w-full mt-1.5 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/95 shadow transition-all duration-150"
          >
            Configure Request Contract
          </button>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center text-xs text-muted-foreground select-none">
          Send request to run OpenAPI contract validation tests.
        </div>
      </div>
    );
  }

  const report = auditReport!;

  return (
    <div className="h-full flex flex-col min-h-0 bg-background select-text">
      
      {/* Overall Verification Status Banner */}
      <div className="p-4 border-b shrink-0">
        <div className={cn(
          "p-4 rounded-xl shadow-sm border flex items-center justify-between",
          report.isFullyCompliant
            ? "border-green-500/35 bg-green-950/10 shadow-green-500/5 text-green-400"
            : "border-red-500/35 bg-red-950/10 shadow-red-500/5 text-red-400"
        )}>
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-mono tracking-wider font-bold">API Compliance Status</div>
            <h2 className="text-base font-extrabold flex items-center gap-1.5">
              {report.isFullyCompliant ? (
                <>
                  <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>CONTRACT COMPLIANT ✓</span>
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>CONTRACT BREACHED ✗</span>
                </>
              )}
            </h2>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground bg-muted border rounded px-2 py-0.5">
            OAS Spec Test
          </div>
        </div>
      </div>

      {/* Assertion list cards */}
      <div className="flex-1 overflow-auto p-4 space-y-4 min-h-0">
        {report.assertions.map((assertion, idx) => (
          <div key={idx} className="border rounded-xl bg-card overflow-hidden shadow-sm">
            {/* Header */}
            <div className={cn(
              "px-3.5 py-2 border-b flex items-center justify-between select-none bg-muted/20",
              assertion.passed ? "border-b-green-500/10" : "border-b-red-500/10"
            )}>
              <div className="flex items-center gap-2">
                {assertion.passed ? (
                  <span className="h-4 w-4 bg-green-500/15 border border-green-500/35 text-green-400 rounded-full flex items-center justify-center text-[10px] font-bold">✓</span>
                ) : (
                  <span className="h-4 w-4 bg-red-500/15 border border-red-500/35 text-red-400 rounded-full flex items-center justify-center text-[10px] font-bold">✗</span>
                )}
                <span className="text-xs font-bold text-foreground">{assertion.name}</span>
              </div>
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-wider font-mono",
                assertion.passed ? "text-green-500" : "text-red-500"
              )}>
                {assertion.passed ? "Pass" : "Fail"}
              </span>
            </div>

            {/* Body Info */}
            <div className="p-3.5 space-y-3">
              <p className={cn(
                "text-xs leading-relaxed font-medium",
                assertion.passed ? "text-muted-foreground" : "text-foreground"
              )}>
                {assertion.message}
              </p>

              {/* Status details metadata list */}
              {assertion.details && assertion.details.length > 0 && (
                <div className="border rounded-lg overflow-hidden bg-muted/10">
                  <table className="w-full text-left font-mono text-[10px] divide-y divide-border/40">
                    <thead>
                      <tr className="bg-muted/30 text-muted-foreground">
                        <th className="px-3 py-1.5 font-semibold">Parameter</th>
                        <th className="px-3 py-1.5 font-semibold">Value</th>
                        <th className="px-3 py-1.5 font-semibold text-right">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {assertion.details.map((det, dIdx) => (
                        <tr key={dIdx} className="hover:bg-accent/10">
                          <td className="px-3 py-1.5 text-muted-foreground">{det.label}</td>
                          <td className="px-3 py-1.5 text-foreground truncate max-w-[200px]" title={det.value}>{det.value}</td>
                          <td className="px-3 py-1.5 text-right">
                            <span className={det.passed ? "text-green-500 font-bold" : "text-red-500 font-bold"}>
                              {det.passed ? "✓ OK" : "✗ MISMATCH"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Validation Errors detail cards (AJV body validate) */}
              {assertion.errors && assertion.errors.length > 0 && (
                <div className="space-y-2 pt-1 font-mono">
                  <div className="text-[9px] uppercase font-mono tracking-wider font-bold text-red-400">
                    Detailed schema violations ({assertion.errors.length}):
                  </div>
                  <div className="divide-y border rounded-lg bg-red-950/10 border-red-500/20 overflow-hidden text-[10px]">
                    {assertion.errors.map((err, eIdx) => (
                      <div key={eIdx} className="p-2.5 flex items-start gap-2 hover:bg-red-500/[0.02]">
                        <span className="text-red-400 shrink-0 select-none font-bold">•</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-foreground bg-muted border border-border/40 px-1 py-0.2 rounded font-mono select-all">
                            {err.path}
                          </span>
                          <span className="text-foreground/90 ml-1.5 leading-relaxed block mt-1">
                            {err.message}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
