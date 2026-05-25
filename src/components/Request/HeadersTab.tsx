import { useRequestStore } from "@/stores/requestStore";
import { KeyValueEditor } from "./KeyValueEditor";

export function HeadersTab() {
  const headers = useRequestStore((s) => s.request.headers);
  const setHeaders = useRequestStore((s) => s.setHeaders);

  return (
    <div className="p-1">
      <KeyValueEditor
        pairs={headers}
        onChange={setHeaders}
        keyPlaceholder="Header name"
        valuePlaceholder="Header value"
      />
    </div>
  );
}
