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

export function MethodSelector() {
  const method = useRequestStore((s) => s.request.method);
  const setMethod = useRequestStore((s) => s.setMethod);
  const currentColor = methods.find((m) => m.value === method)?.color ?? "text-foreground";

  return (
    <div className="relative">
      <select
        value={method}
        onChange={(e) => setMethod(e.target.value as HttpMethod)}
        className={`appearance-none bg-secondary text-foreground text-sm font-bold px-3 py-1.5 pr-7 rounded-md border border-input cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring ${currentColor}`}
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
