import { Panel, Group, Separator } from "react-resizable-panels";
import { RequestBuilder } from "@/components/Request/RequestBuilder";
import { ResponseViewer } from "@/components/Response/ResponseViewer";
import { BenchmarkResults } from "@/components/Response/BenchmarkResults";
import { WebSocketPanel } from "@/components/WebSocketPanel";
import { GrpcPanel } from "@/components/GrpcPanel";
import { GraphQLPanel } from "@/components/GraphQL/GraphQLPanel";
import { RunnerPanel } from "@/components/RunnerPanel";
import { IntelligenceDashboard } from "@/components/Intelligence/IntelligenceDashboard";
import MockPanel from "@/components/MockServer/MockPanel";
import { FlowPanel } from "@/components/Flow/FlowPanel";
import { ReplayPanel } from "@/components/Replay/ReplayPanel";
import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";

export function MainPanel() {
  const loading = useRequestStore((s) => s.loading);
  const benchmarkLoading = useRequestStore((s) => s.benchmarkLoading);
  const benchmarkResult = useRequestStore((s) => s.benchmarkResult);
  const error = useRequestStore((s) => s.error);
  const toolMode = useUIStore((s) => s.toolMode);
  const showRunner = useUIStore((s) => s.showRunner);
  const showIntelligence = useUIStore((s) => s.showIntelligence);

  if (showIntelligence) {
    return (
      <div className="h-full flex flex-col">
        <IntelligenceDashboard />
      </div>
    );
  }

  if (showRunner) {
    return (
      <div className="h-full flex flex-col">
        <RunnerPanel />
      </div>
    );
  }

  if (toolMode === "websocket") {
    return (
      <div className="h-full flex flex-col">
        <WebSocketPanel />
      </div>
    );
  }

  if (toolMode === "grpc") {
    return (
      <div className="h-full flex flex-col">
        <GrpcPanel />
      </div>
    );
  }

  if (toolMode === "graphql") {
    return (
      <div className="h-full flex flex-col">
        <GraphQLPanel />
      </div>
    );
  }

  if (toolMode === "mock") {
    return (
      <div className="h-full flex flex-col">
        <MockPanel />
      </div>
    );
  }

  if (toolMode === "flow") {
    return (
      <div className="h-full flex flex-col">
        <FlowPanel />
      </div>
    );
  }

  if (toolMode === "replay") {
    return (
      <div className="h-full flex flex-col">
        <ReplayPanel />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Group orientation="horizontal">
        <Panel defaultSize="45%" minSize="20%">
          <RequestBuilder />
        </Panel>
        <Separator
          style={{ width: 4, cursor: "col-resize" }}
          className="bg-border hover:bg-primary/50 active:bg-primary/70 transition-all duration-150"
        />
        <Panel minSize="20%">
          <div className="h-full flex flex-col">
            {error && (
              <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20 shrink-0">
                <div className="flex items-start gap-2">
                  <svg className="h-4 w-4 text-destructive shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-destructive mb-0.5">Request Failed</div>
                    <p className="text-xs text-destructive/80 break-all">{error}</p>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(error)}
                    className="shrink-0 text-destructive/60 hover:text-destructive transition-all duration-150 p-0.5"
                    title="Copy error"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            {(loading || benchmarkLoading) && !benchmarkResult && (
              <div className="px-3 py-1.5 bg-primary/10 text-primary text-xs border-b border-primary/20 shrink-0 flex items-center gap-2">
                <div className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>{loading ? "Request in progress..." : "Benchmark in progress..."}</span>
              </div>
            )}
            {benchmarkResult ? <BenchmarkResults /> : <ResponseViewer />}
          </div>
        </Panel>
      </Group>
    </div>
  );
}
