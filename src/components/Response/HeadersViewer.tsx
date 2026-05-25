import { useRequestStore } from "@/stores/requestStore";

export function HeadersViewer() {
  const response = useRequestStore((s) => s.response);
  if (!response) return null;

  return (
    <div className="p-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="pb-1 font-medium">Name</th>
            <th className="pb-1 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {response.headers.map(([key, value], i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-1 pr-4 text-primary font-medium">{key}</td>
              <td className="py-1 text-foreground break-all">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
