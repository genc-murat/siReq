import { useRequestStore } from "@/stores/requestStore";
import { KeyValueEditor } from "./KeyValueEditor";

export function QueryTab() {
  const params = useRequestStore((s) => s.request.query_params);
  const setParams = useRequestStore((s) => s.setQueryParams);

  return (
    <div className="p-1">
      <KeyValueEditor
        pairs={params}
        onChange={setParams}
        keyPlaceholder="Parameter name"
        valuePlaceholder="Parameter value"
      />
    </div>
  );
}
