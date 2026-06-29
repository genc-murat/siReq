import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSafeInvoke = vi.fn();
vi.mock("./safe-invoke", () => ({
  safeInvoke: mockSafeInvoke,
}));

const {
  grpcParseProto,
  grpcCallUnary,
  grpcCallClientStreaming,
  grpcCallBidiStreaming,
  grpcCallServerStreaming,
  getGrpcHistory,
  deleteGrpcHistory,
  clearGrpcHistory,
  grpcReflectListServices,
  grpcReflectGetProto,
} = await import("./grpc-api");

describe("gRPC API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grpcParseProto should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ proto_id: "p1", services: [] });
    await grpcParseProto("syntax = 'proto3';");
    expect(mockSafeInvoke).toHaveBeenCalledWith("grpc_parse_proto", { content: "syntax = 'proto3';" });
  });

  it("grpcCallUnary should call safeInvoke with all args", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ status_code: "200" });
    await grpcCallUnary("localhost:50051", true, "p1", "Svc", "Method", '{"name":"test"}', "env-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("grpc_call_unary", {
      address: "localhost:50051",
      tls: true,
      protoId: "p1",
      serviceName: "Svc",
      methodName: "Method",
      inputJson: '{"name":"test"}',
      environmentId: "env-1",
    });
  });

  it("grpcCallUnary should use null environmentId when not provided", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ status_code: "200" });
    await grpcCallUnary("localhost:50051", false, "p1", "Svc", "Method", "{}");
    expect(mockSafeInvoke).toHaveBeenCalledWith("grpc_call_unary", {
      address: "localhost:50051", tls: false, protoId: "p1",
      serviceName: "Svc", methodName: "Method", inputJson: "{}",
      environmentId: null,
    });
  });

  it("grpcCallClientStreaming should call safeInvoke with input array", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ status_code: "200" });
    await grpcCallClientStreaming("addr", false, "p1", "Svc", "Method", ['{"a":1}']);
    expect(mockSafeInvoke).toHaveBeenCalledWith("grpc_call_client_streaming", {
      address: "addr", tls: false, protoId: "p1",
      serviceName: "Svc", methodName: "Method",
      inputJsons: ['{"a":1}'], environmentId: null,
    });
  });

  it("grpcCallBidiStreaming should use default maxMessages", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await grpcCallBidiStreaming("addr", false, "p1", "Svc", "Method", ['{"a":1}']);
    expect(mockSafeInvoke).toHaveBeenCalledWith("grpc_call_bidi_streaming", {
      address: "addr", tls: false, protoId: "p1",
      serviceName: "Svc", methodName: "Method",
      inputJsons: ['{"a":1}'], maxMessages: 100, environmentId: null,
    });
  });

  it("grpcCallServerStreaming should use default maxMessages", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await grpcCallServerStreaming("addr", false, "p1", "Svc", "Method", "{}");
    expect(mockSafeInvoke).toHaveBeenCalledWith("grpc_call_server_streaming", {
      address: "addr", tls: false, protoId: "p1",
      serviceName: "Svc", methodName: "Method",
      inputJson: "{}", maxMessages: 100, environmentId: null,
    });
  });

  it("getGrpcHistory should use default limit/offset", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await getGrpcHistory();
    expect(mockSafeInvoke).toHaveBeenCalledWith("get_grpc_history", { limit: 50, offset: 0 });
  });

  it("deleteGrpcHistory should call safeInvoke with id", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await deleteGrpcHistory("g-1");
    expect(mockSafeInvoke).toHaveBeenCalledWith("delete_grpc_history", { id: "g-1" });
  });

  it("clearGrpcHistory should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce(undefined);
    await clearGrpcHistory();
    expect(mockSafeInvoke).toHaveBeenCalledWith("clear_grpc_history");
  });

  it("grpcReflectListServices should call safeInvoke", async () => {
    mockSafeInvoke.mockResolvedValueOnce([]);
    await grpcReflectListServices("addr:50051", true);
    expect(mockSafeInvoke).toHaveBeenCalledWith("grpc_reflect_list_services", {
      address: "addr:50051", tls: true,
    });
  });

  it("grpcReflectGetProto should call safeInvoke with symbol", async () => {
    mockSafeInvoke.mockResolvedValueOnce({ proto_id: "p1", services: [] });
    await grpcReflectGetProto("addr:50051", true, "my.package.MyService");
    expect(mockSafeInvoke).toHaveBeenCalledWith("grpc_reflect_get_proto", {
      address: "addr:50051", tls: true, symbol: "my.package.MyService",
    });
  });
});
