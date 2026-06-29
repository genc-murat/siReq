import { invoke as tauriInvoke } from "@tauri-apps/api/core";

/// Safe invoke wrapper — handles browser-only (non-Tauri) environments gracefully.
/// In browser-only Vite dev mode, `tauriInvoke` is undefined, so we catch and
/// return a clear error instead of crashing the app.
export async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof tauriInvoke !== "function") {
    throw new Error(`Tauri backend not available: command '${cmd}' cannot be executed. Run 'cargo tauri dev' to start the full app.`);
  }
  return tauriInvoke(cmd, args ?? {}) as Promise<T>;
}
