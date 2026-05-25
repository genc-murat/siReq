import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";

export function UrlBar({ inputRef }: { inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const url = useRequestStore((s) => s.request.url);
  const setUrl = useRequestStore((s) => s.setUrl);
  const send = useRequestStore((s) => s.send);
  const timeout = useUIStore((s) => s.timeout);
  const environmentId = useUIStore((s) => s.activeEnvironmentId);

  return (
    <input
      ref={inputRef}
      type="text"
      value={url}
      onChange={(e) => setUrl(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") send(timeout, environmentId);
      }}
      placeholder="Enter request URL..."
      className="flex-1 bg-background text-foreground text-sm px-3 py-1.5 rounded-md border border-input focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
    />
  );
}
