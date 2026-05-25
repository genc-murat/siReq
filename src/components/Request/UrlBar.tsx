import { useRequestStore } from "@/stores/requestStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

interface UrlBarProps {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  integrated?: boolean;
}

export function UrlBar({ inputRef, integrated }: UrlBarProps) {
  const url = useRequestStore((s) => s.request.url);
  const setUrl = useRequestStore((s) => s.setUrl);
  const send = useRequestStore((s) => s.send);
  const environmentId = useUIStore((s) => s.activeEnvironmentId);

  return (
    <div className="relative flex-1 min-w-0">
      {/* URL icon */}
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground/40">
        <svg className={cn("transition-all", integrated ? "h-3.5 w-3.5" : "h-4 w-4")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") send(environmentId);
        }}
        placeholder="https://api.example.com/endpoint"
        className={cn(
          integrated
            ? "w-full bg-muted/30 text-foreground text-xs pl-8 pr-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background transition-all duration-150 placeholder:text-muted-foreground/40 font-mono"
            : "flex-1 bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150 placeholder:text-muted-foreground",
          integrated && "rounded-none"
        )}
      />
    </div>
  );
}
