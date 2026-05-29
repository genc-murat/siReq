import type { CollectionRunResult, RunRequestResult } from "./invoke";

// ─── Types ───────────────────────────────────────────────────────────────

export interface ExtractionGroup {
  index: number;
  requestName: string;
  requestMethod: string;
  statusCode: number;
  hasError: boolean;
  variables: [string, string][];
}

export interface ChainFlowItem {
  fromIndex: number;
  toIndex: number;
  varName: string;
  varValue: string;
}

// ─── Pure utility functions ──────────────────────────────────────────────

/**
 * Groups extracted variables per-request, filtering out results with no extractions.
 * Accepts an optional results array (from `CollectionRunResult.results`).
 */
export function buildExtractionGroups(results: RunRequestResult[]): ExtractionGroup[] {
  return results
    .map((r, i) => ({
      index: i,
      requestName: r.request_name,
      requestMethod: r.request_method,
      statusCode: r.status_code,
      hasError: !!r.error,
      variables: r.extracted_variables ?? [],
    }))
    .filter((g) => g.variables.length > 0);
}

/**
 * Builds a chain flow from extraction groups: detects which variables
 * first appeared in which request and flowed to subsequent requests.
 *
 * Returns an array of flow items describing each variable chain.
 */
export function buildChainFlow(groups: ExtractionGroup[]): ChainFlowItem[] {
  if (groups.length === 0) return [];

  const allVarNames = new Set<string>();
  const seenInRequest: Record<string, number> = {};
  const flow: ChainFlowItem[] = [];

  for (const group of groups) {
    for (const [key, value] of group.variables) {
      if (!allVarNames.has(key)) {
        allVarNames.add(key);
        seenInRequest[key] = group.index;
      } else {
        const fromIdx = seenInRequest[key] ?? 0;
        if (fromIdx < group.index) {
          flow.push({
            fromIndex: fromIdx,
            toIndex: group.index,
            varName: key,
            varValue: value,
          });
        }
      }
    }
  }
  return flow;
}

/**
 * Convenience helper: given a run result, builds both extraction groups
 * and chain flow in one call.
 */
export function buildRunnerChainData(runResult: CollectionRunResult | null): {
  extractionGroups: ExtractionGroup[];
  chainFlow: ChainFlowItem[];
  totalExtractions: number;
} {
  const results = runResult?.results ?? [];
  const extractionGroups = buildExtractionGroups(results);
  const chainFlow = buildChainFlow(extractionGroups);
  const totalExtractions = extractionGroups.reduce((s, g) => s + g.variables.length, 0);
  return { extractionGroups, chainFlow, totalExtractions };
}
