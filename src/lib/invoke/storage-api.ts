import { safeInvoke } from "./safe-invoke";
import type { HistoryEntry } from "./types";

export async function getHistory(limit?: number, offset?: number): Promise<HistoryEntry[]> {
  return safeInvoke("get_history", { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function deleteHistory(id: string): Promise<void> {
  return safeInvoke("delete_history", { id });
}

export async function clearHistory(): Promise<void> {
  return safeInvoke("clear_history");
}
