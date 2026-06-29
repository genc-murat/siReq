import { safeInvoke } from "./safe-invoke";
import type {
  ApiIntelligenceOverview,
  EndpointInsight,
  EndpointDetail,
  PerformancePoint,
  SchemaVersionInfo,
  PerformanceRegression,
} from "./types";

export async function analyzeApiBehavior(): Promise<ApiIntelligenceOverview> {
  return safeInvoke("analyze_api_behavior_cmd");
}

export async function getApiIntelligenceOverview(): Promise<ApiIntelligenceOverview> {
  return safeInvoke("get_api_intelligence_overview");
}

export async function getAllEndpointInsights(): Promise<EndpointInsight[]> {
  return safeInvoke("get_all_endpoint_insights");
}

export async function getEndpointDetail(endpointKey: string): Promise<EndpointDetail> {
  return safeInvoke("get_endpoint_detail_cmd", { endpointKey });
}

export async function getPerformanceTimeline(endpointKey: string): Promise<PerformancePoint[]> {
  return safeInvoke("get_performance_timeline_cmd", { endpointKey });
}

export async function getSchemaEvolution(endpointKey: string): Promise<SchemaVersionInfo[]> {
  return safeInvoke("get_schema_evolution_cmd", { endpointKey });
}

export async function getPerformanceRegressions(): Promise<PerformanceRegression[]> {
  return safeInvoke("get_performance_regressions");
}
