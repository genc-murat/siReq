import { safeInvoke } from "./safe-invoke";
import type { CollectionRunResult, RunMode, RunDataset, TestSuiteConfig } from "./types";

export async function runCollection(
  collectionId: string,
  environmentId?: string | null,
  delayMs?: number,
  stopOnFailure?: boolean,
): Promise<CollectionRunResult> {
  return safeInvoke("run_collection", {
    collectionId,
    environmentId: environmentId ?? null,
    delayMs: delayMs ?? 0,
    stopOnFailure: stopOnFailure ?? false,
  });
}

/// Unified test suite runner supporting Functional / Smoke / Regression / Load modes.
/// Backend currently implements Functional + Smoke; Regression and Load will be
/// added in subsequent phases (currently behave like Functional).
export async function runTestSuite(
  collectionId: string,
  mode: RunMode,
  environmentId: string | null,
  config: TestSuiteConfig,
): Promise<CollectionRunResult> {
  return safeInvoke("run_test_suite", { collectionId, mode, environmentId, config });
}

export async function runCollectionDataDriven(
  collectionId: string,
  environmentId: string | null,
  delayMs: number,
  stopOnFailure: boolean,
  dataset: RunDataset,
): Promise<CollectionRunResult> {
  return safeInvoke("run_collection_data_driven", {
    collectionId,
    environmentId,
    delayMs,
    stopOnFailure,
    dataset,
  });
}

export async function getRunHistory(limit?: number, offset?: number): Promise<CollectionRunResult[]> {
  return safeInvoke("get_run_history", { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function deleteRunHistory(id: string): Promise<void> {
  return safeInvoke("delete_run_history", { id });
}

export async function clearRunHistory(): Promise<void> {
  return safeInvoke("clear_run_history");
}
