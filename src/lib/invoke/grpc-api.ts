import { safeInvoke } from "./safe-invoke";
import type { GrpcDescriptorSet, GrpcResponse, GrpcHistoryEntry } from "./types";

// ─── Proto Parsing ──────────────────────────────────────────────────────────

export async function grpcParseProto(content: string): Promise<GrpcDescriptorSet> {
  return safeInvoke("grpc_parse_proto", { content });
}

// ─── Unary Call ─────────────────────────────────────────────────────────────

export async function grpcCallUnary(
  address: string,
  tls: boolean,
  protoId: string,
  serviceName: string,
  methodName: string,
  inputJson: string,
  environmentId?: string | null,
): Promise<GrpcResponse> {
  return safeInvoke("grpc_call_unary", {
    address,
    tls,
    protoId,
    serviceName,
    methodName,
    inputJson,
    environmentId: environmentId ?? null,
  });
}

// ─── Client Streaming ───────────────────────────────────────────────────────

export async function grpcCallClientStreaming(
  address: string,
  tls: boolean,
  protoId: string,
  serviceName: string,
  methodName: string,
  inputJsons: string[],
  environmentId?: string | null,
): Promise<GrpcResponse> {
  return safeInvoke("grpc_call_client_streaming", {
    address,
    tls,
    protoId,
    serviceName,
    methodName,
    inputJsons,
    environmentId: environmentId ?? null,
  });
}

// ─── Bidirectional Streaming ────────────────────────────────────────────────

export async function grpcCallBidiStreaming(
  address: string,
  tls: boolean,
  protoId: string,
  serviceName: string,
  methodName: string,
  inputJsons: string[],
  maxMessages?: number,
  environmentId?: string | null,
): Promise<GrpcResponse[]> {
  return safeInvoke("grpc_call_bidi_streaming", {
    address,
    tls,
    protoId,
    serviceName,
    methodName,
    inputJsons,
    maxMessages: maxMessages ?? 100,
    environmentId: environmentId ?? null,
  });
}

// ─── Server Streaming ───────────────────────────────────────────────────────

export async function grpcCallServerStreaming(
  address: string,
  tls: boolean,
  protoId: string,
  serviceName: string,
  methodName: string,
  inputJson: string,
  maxMessages?: number,
  environmentId?: string | null,
): Promise<GrpcResponse[]> {
  return safeInvoke("grpc_call_server_streaming", {
    address,
    tls,
    protoId,
    serviceName,
    methodName,
    inputJson,
    maxMessages: maxMessages ?? 100,
    environmentId: environmentId ?? null,
  });
}

// ─── History ────────────────────────────────────────────────────────────────

export async function getGrpcHistory(limit?: number, offset?: number): Promise<GrpcHistoryEntry[]> {
  return safeInvoke("get_grpc_history", { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function deleteGrpcHistory(id: string): Promise<void> {
  return safeInvoke("delete_grpc_history", { id });
}

export async function clearGrpcHistory(): Promise<void> {
  return safeInvoke("clear_grpc_history");
}

// ─── Reflection ─────────────────────────────────────────────────────────────

export async function grpcReflectListServices(address: string, tls: boolean): Promise<string[]> {
  return safeInvoke("grpc_reflect_list_services", { address, tls });
}

export async function grpcReflectGetProto(
  address: string,
  tls: boolean,
  symbol: string,
): Promise<GrpcDescriptorSet> {
  return safeInvoke("grpc_reflect_get_proto", { address, tls, symbol });
}
