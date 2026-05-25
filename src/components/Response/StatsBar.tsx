import { useRequestStore } from "@/stores/requestStore";
import { cn } from "@/lib/utils";

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return "text-green-500";
  if (status >= 300 && status < 400) return "text-yellow-500";
  if (status >= 400 && status < 500) return "text-orange-500";
  return "text-red-500";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StatsBar() {
  const response = useRequestStore((s) => s.response);
  if (!response) return null;

  return (
    <div className="flex items-center gap-4 px-3 py-1.5 text-xs border-b bg-card shrink-0">
      <span className={cn("font-semibold", statusColor(response.status))}>
        {response.status} {response.status_text}
      </span>
      <span className="text-muted-foreground">
        {response.time_ms} ms
      </span>
      <span className="text-muted-foreground">
        {formatSize(response.size)}
      </span>
    </div>
  );
}
