import { Panel, Group, Separator } from "react-resizable-panels";
import { RequestBuilder } from "@/components/Request/RequestBuilder";
import { ResponseViewer } from "@/components/Response/ResponseViewer";
import { WebSocketPanel } from "@/components/WebSocketPanel";
import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";

export function MainPanel() {
  const loading = useRequestStore((s) => s.loading);
  const error = useRequestStore((s) => s.error);
  const toolMode = useUIStore((s) => s.toolMode);

  if (toolMode === "websocket") {
    return (
      <div className="h-full flex flex-col">
        <WebSocketPanel />
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
          className="bg-border hover:bg-primary/50 active:bg-primary/70 transition-colors"
        />
        <Panel minSize="20%">
          <div className="h-full flex flex-col">
            {error && (
              <div className="px-3 py-2 bg-destructive/10 text-destructive text-sm">{error}</div>
            )}
            {loading && (
              <div className="px-3 py-1 bg-primary/10 text-primary text-xs">
                Sending request...
              </div>
            )}
            <ResponseViewer />
          </div>
        </Panel>
      </Group>
    </div>
  );
}
