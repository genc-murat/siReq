import { safeInvoke } from "./safe-invoke";
import type { HttpRequest, HttpResponse, BenchmarkResult, BenchmarkHistoryEntry } from "./types";

export async function sendRequest(request: HttpRequest, environmentId?: string | null): Promise<HttpResponse> {
  return safeInvoke("send_request", { request, environmentId: environmentId ?? null });
}

export async function cancelRequest(requestId: string): Promise<void> {
  return safeInvoke("cancel_request", { requestId });
}

export async function benchmarkRequest(
  request: HttpRequest,
  count: number,
  environmentId?: string | null,
): Promise<BenchmarkResult> {
  return safeInvoke("benchmark_request", { request, count, environmentId: environmentId ?? null });
}

export async function getBenchmarkHistory(limit?: number, offset?: number): Promise<BenchmarkHistoryEntry[]> {
  return safeInvoke("get_benchmark_history", { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function deleteBenchmarkHistory(id: string): Promise<void> {
  return safeInvoke("delete_benchmark_history", { id });
}

export async function clearBenchmarkHistory(): Promise<void> {
  return safeInvoke("clear_benchmark_history");
}

export async function importCurl(curlCommand: string): Promise<HttpRequest> {
  return safeInvoke("import_curl", { curlCommand });
}
