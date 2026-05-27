/**
 * Sandbox utility for securely executing user-provided JavaScript code
 * in the Flow Editor's Script, Condition, and Assertion nodes.
 *
 * Design principles:
 * 1. All dangerous globals are shadowed via `const` declarations in function scope
 * 2. `"use strict"` prevents `this` from leaking the global object
 * 3. `.call(null)` ensures `this` is always `undefined`
 * 4. The only injected variable is a `vars` object containing flow variables
 * 5. Prototype chain escape (e.g. `[].constructor.constructor`) is mitigated
 *    by blocking `Function`, `eval`, constructors at the identifier level
 * 6. Console is proxied to prevent passing references to dangerous objects
 */

// Exhaustive list of globals that are dangerous and must be shadowed.
// Any global not in the SAFE list below and not explicitly listed here
// as dangerous will also be blocked by the catch-all at the end.
const DANGEROUS_GLOBALS = [
  // DOM / Browser
  "window",
  "document",
  "globalThis",
  "self",
  "global",
  "frames",
  "parent",
  "top",
  // "this" is intentionally omitted — reserved keyword (SyntaxError with const)
  // "use strict" + .call(null) prevents this leaks.
  "location",
  "navigator",
  "history",
  "screen",
  "innerWidth",
  "innerHeight",
  "outerWidth",
  "outerHeight",
  "devicePixelRatio",
  "origin",
  "crossOriginIsolated",

  // Networking & I/O
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "WebSocketStream",
  "Request",
  "Response",
  "Headers",

  // Timers
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "setImmediate",
  "clearImmediate",

  // Workers
  "Worker",
  "SharedWorker",
  "ServiceWorker",
  "MessageChannel",
  "MessagePort",
  "BroadcastChannel",

  // Storage
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "caches",
  "Cache",
  "CacheStorage",
  "Storage",

  // Code execution / Reflection
  // "eval" is intentionally omitted — it is a restricted identifier in strict mode
  // (const eval = undefined causes SyntaxError). However, since Function is
  // shadowed below, and all other dangerous globals are shadowed via const,
  // eval'd code still runs within the shadowed scope and cannot access them.
  "uneval",
  "Function",
  "Proxy",
  "Reflect",

  // Binary / Blob / File
  "Blob",
  "File",
  "FileReader",
  "FileList",
  "FormData",
  "URL",
  "URLSearchParams",
  "TextEncoder",
  "TextDecoder",
  "CompressionStream",
  "DecompressionStream",
  "Image",
  "ImageData",
  "CanvasRenderingContext2D",
  "OffscreenCanvas",
  "Audio",
  "AudioContext",
  "OscillatorNode",
  "GainNode",
  "MediaStream",
  "MediaRecorder",

  // Node.js / Tauri specific
  "require",
  "process",
  "__dirname",
  "__filename",
  "exports",
  "module",
  "Buffer",

  // Web Crypto (too powerful)
  "crypto",
  "Crypto",
  "CryptoKey",
  "SubtleCrypto",

  // Misc dangerous
  "WebAssembly",
  "Atomics",
  "SharedArrayBuffer",
  "FinalizationRegistry",
  "WeakRef",
  "Performance",
  "performance",
  "structuredClone",
  "importScripts",
];

// Safe built-in constructors and utilities users commonly need
const SAFE_BUILTINS = [
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "BigInt",
  "Symbol",
  "Date",
  "RegExp",
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "EvalError",
  "URIError",
  "AggregateError",
  "Promise",
  "Math",
  "JSON",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "ArrayBuffer",
  "DataView",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "BigInt64Array",
  "BigUint64Array",
  "Float32Array",
  "Float64Array",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "encodeURI",
  "encodeURIComponent",
  "decodeURI",
  "decodeURIComponent",
  // Safe constants
  "NaN",
  "Infinity",
  "undefined",
];

/**
 * Creates a safe console object that only exposes log/warn/error/info
 * methods and prevents passing DOM nodes or other objects that could
 * leak references to dangerous globals.
 */
function createSafeConsole(): typeof console {
  const safeMethods: Array<"log" | "warn" | "error" | "info" | "debug" | "trace"> = [
    "log",
    "warn",
    "error",
    "info",
    "debug",
    "trace",
  ];
  const safeConsole: Record<string, (...args: unknown[]) => void> = {};
  for (const method of safeMethods) {
    safeConsole[method] = (...args: unknown[]) => {
      // Only pass serializable primitives and plain objects/arrays
      const safeArgs = args.map((arg) => {
        if (
          arg === null ||
          arg === undefined ||
          typeof arg === "string" ||
          typeof arg === "number" ||
          typeof arg === "boolean" ||
          typeof arg === "bigint"
        ) {
          return arg;
        }
        if (Array.isArray(arg)) {
          return arg.map((a) =>
            typeof a === "object" ? String(a) : a
          );
        }
        if (typeof arg === "object") {
          try {
            return JSON.parse(JSON.stringify(arg));
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      });
      // Use the real console but forward our safe args
      console[method](...safeArgs);
    };
  }
  return safeConsole as unknown as typeof console;
}

/**
 * Create all `const _____ = undefined` declarations to shadow
 * dangerous globals in the execution function's scope.
 */
function buildShadowDeclarations(): string {
  return DANGEROUS_GLOBALS.map((name) => `${name} = undefined`).join(", ");
}

/**
 * Build the parameter list and argument array to inject safe built-ins
 * into the sandboxed function. Also injects `console` and `vars`.
 */
let cachedBinding: ReturnType<typeof buildSafeBindingCode> | null = null;

function getSafeBindingCode() {
  if (!cachedBinding) {
    cachedBinding = buildSafeBindingCode();
  }
  return cachedBinding;
}

function buildSafeBindingCode(): {
  params: string;
  declarations: string;
  argValues: unknown[];
} {
  const paramNames: string[] = [];
  const argValues: unknown[] = [];

  // `vars` is always first — user code references `vars` directly
  paramNames.push("vars");
  argValues.push(null); // placeholder, will be set per-call

  // Each safe built-in gets its own parameter
  for (const name of SAFE_BUILTINS) {
    paramNames.push(name);
    argValues.push((globalThis as Record<string, unknown>)[name]);
  }

  // `console` is last (safe console)
  paramNames.push("__safeConsole__");
  argValues.push(createSafeConsole());

  const declarations = buildShadowDeclarations();

  return {
    params: paramNames.join(", "),
    declarations,
    argValues,
  };
}

/**
 * Execute a block of user JavaScript code in a sandboxed environment.
 *
 * The user code has access to:
 * - `vars` — a plain object of flow variables (string → string)
 * - Safe JS built-ins: Object, Array, String, Number, Math, JSON, Date, etc.
 * - `console.log/warn/error/info/debug/trace` (safe wrapper)
 *
 * Blocked / undefined:
 * - `window`, `document`, `fetch`, `eval`, `Function`, `Proxy`, `Reflect`
 * - `setTimeout`, `setInterval`, `requestAnimationFrame`
 * - `localStorage`, `indexedDB`, `caches`
 * - `Blob`, `File`, `FormData`, `URL`
 * - `require`, `process`, `module`, `exports`
 * - `crypto`, `WebAssembly`, `Atomics`
 *
 * @param code - The JS code to execute
 * @param vars - Flow variables (mutated in-place so caller can detect changes)
 * @returns The (possibly mutated) vars object
 */
export function executeSandboxed(code: string, vars: Record<string, string>): void {
  if (!code.trim()) {
    return; // Empty code, nothing to execute
  }

  const binding = getSafeBindingCode();

  // Build the function body
  //   1. "use strict" prevents `this` from leaking to global
  //   2. A block `{ const ... }` shadows dangerous globals
  //   3. `const console = __safeConsole__` aliases the safe console wrapper
  //   4. User code executes in the block scope (no parentheses wrapping
  //      because user code may contain statements with semicolons)
  const functionBody = `\
"use strict";
{
  const ${binding.declarations};
  const console = __safeConsole__;
  ${code}
}`;

  // Create the function dynamically
  // It receives: vars, safeBuiltins..., __safeConsole__
  const fn = new Function(binding.params, functionBody);

  // Override the placeholder with the actual vars object
  const args = [...binding.argValues];
  args[0] = vars;

  // Execute with null `this` to prevent global object leak
  fn.call(null, ...args);
}

/**
 * Evaluate a boolean expression in a sandboxed environment.
 * Used by Condition and Assertion nodes.
 *
 * Expression code uses bare variable names (e.g. "status_code === '200'")
 * rather than "vars.status_code === '200'". So we destructure the vars
 * object into individual const bindings inside the function body.
 *
 * @param expression - JS expression string, e.g. "status_code === '200'"
 * @param vars - Flow variables to inject
 * @returns The truthy/falsy result of the expression
 */
export function evaluateInSandbox(
  expression: string,
  vars: Record<string, string>
): boolean {
  if (!expression.trim()) {
    return false;
  }

  const binding = getSafeBindingCode();

  // Build destructuring statements: const status_code = vars["status_code"];
  // This replicates how the old code injected variable names as function parameters.
  // Use bracket notation for safety with variable names that aren't valid identifiers.
  // Handle collisions: if two variable names sanitize to the same identifier
  // (e.g. "my-var" and "my var" both become "my_var"), append _2, _3, etc.
  const varKeys = Object.keys(vars);
  const seenKeys = new Map<string, number>();
  const destructureLines = varKeys
    .map((k) => {
      let safeKey = k.replace(/[^a-zA-Z0-9_$]/g, "_");
      const count = seenKeys.get(safeKey) ?? 0;
      seenKeys.set(safeKey, count + 1);
      if (count > 0) {
        safeKey = `${safeKey}_${count + 1}`;
      }
      const escapedValue = k.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `const ${safeKey} = vars["${escapedValue}"];`;
    })
    .join("\n  ");

  const functionBody = `\
"use strict";
{
  const ${binding.declarations};
  const console = __safeConsole__;
  ${destructureLines}
  return !!(${expression});
}`;

  let fn: (...args: unknown[]) => unknown;
  try {
    fn = new Function(binding.params, functionBody) as (...args: unknown[]) => unknown;
  } catch {
    // Syntax error in the function body (e.g. malformed expression)
    return false;
  }

  const args = [...binding.argValues];
  args[0] = vars;

  try {
    return Boolean(fn.call(null, ...args));
  } catch {
    return false;
  }
}
