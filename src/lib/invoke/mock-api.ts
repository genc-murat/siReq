import { safeInvoke } from "./safe-invoke";
import type { MockServerConfig, MockLogEntry, MockStats } from "./types";

export async function getMockConfigs(): Promise<MockServerConfig[]> {
  return safeInvoke("get_mock_configs");
}

export async function createMockConfig(config: MockServerConfig): Promise<void> {
  return safeInvoke("create_mock_config", { config });
}

export async function updateMockConfig(config: MockServerConfig): Promise<void> {
  return safeInvoke("update_mock_config_cmd", { config });
}

export async function deleteMockConfig(id: string): Promise<void> {
  return safeInvoke("delete_mock_config_cmd", { id });
}

export async function startMockServer(config: MockServerConfig): Promise<void> {
  return safeInvoke("start_mock_server_cmd", { config });
}

export async function stopMockServer(id: string): Promise<void> {
  return safeInvoke("stop_mock_server_cmd", { id });
}

export async function getMockServerStatus(id: string): Promise<string> {
  return safeInvoke("get_mock_server_status", { id });
}

export async function getMockServerLogs(id: string): Promise<MockLogEntry[]> {
  return safeInvoke("get_mock_server_logs", { id });
}

export async function getMockServerStats(id: string): Promise<MockStats> {
  return safeInvoke("get_mock_server_stats", { id });
}

export async function importOpenApiMock(spec: string, name: string, port: number): Promise<MockServerConfig> {
  return safeInvoke("import_openapi_mock", { spec, name, port });
}

export async function importCollectionMock(collectionId: string, name: string, port: number): Promise<MockServerConfig> {
  return safeInvoke("import_collection_mock", { collectionId, name, port });
}
