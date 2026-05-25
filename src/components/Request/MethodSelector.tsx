import { useRequestStore } from "@/stores/requestStore";
import type { HttpMethod } from "@/lib/invoke";

const methods: { value: HttpMethod; color: string }[] = [
  { value: "GET", color: "text-green-500" },
  { value: "POST", color: "text-yellow-500" },
  { value: "PUT", color: "text-blue-500" },
  { value: "PATCH", color: "text-orange-500" },
  { value: "DELETE", color: "text-red-500" },
  { value: "HEAD", color: "text-purple-500" },
  { value: "OPTIONS", color: "text-teal-500" },
  { value: "TRACE", color: "text-gray-500" },
];

interface MethodSelectorProps {
  integrated?: boolean;
}

export function MethodSelector({ integrated }: MethodSelectorProps = {}) {
  const method = useRequestStore((s) => s.request.method);
  const setMethod = useRequestStore((s) => s.setMethod);
  const currentColor = methods.find((m) => m.value === method)?.color ?? "text-foreground";

  if (integrated) {
    return (
      <div className="relative">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as HttpMethod)}
          className={`appearance-none bg-muted/50 text-foreground text-xs font-bold tracking-wide px-2.5 py-2 pr-6 rounded-l-lg border border-r-0 border-border focus:outline-none focus:ring-1 focus:ring-ring focus:z-10 cursor-pointer hover:bg-muted/80 transition-all duration-150 ${currentColor}`}
        >
          {methods.map((m) => (
            <option key={m.value} value={m.value}>
              {m.value}
            </option>
          ))}
        </select>
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className="h-2.5 w-2.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <select
        value={method}
        onChange={(e) => setMethod(e.target.value as HttpMethod)}
        className={`appearance-none bg-secondary text-foreground text-sm font-bold px-3 py-1.5 pr-7 rounded-lg border border-input cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150 ${currentColor}`}
      >
        {methods.map((m) => (
          <option key={m.value} value={m.value}>
            {m.value}
          </option>
        ))}
      </select>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}
