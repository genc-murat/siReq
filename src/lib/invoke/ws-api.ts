import { safeInvoke } from "./safe-invoke";

export async function wsConnect(url: string, environmentId?: string | null): Promise<string> {
  return safeInvoke("ws_connect", { url, environmentId: environmentId ?? null });
}

export async function wsSend(connectionId: string, message: string, environmentId?: string | null): Promise<void> {
  return safeInvoke("ws_send", { connectionId, message, environmentId: environmentId ?? null });
}

export async function wsDisconnect(connectionId: string): Promise<void> {
  return safeInvoke("ws_disconnect", { connectionId });
}
