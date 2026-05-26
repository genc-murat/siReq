import { useMemo, useState } from "react";
import { useIntelligenceStore } from "@/stores/intelligenceStore";
import { cn } from "@/lib/utils";
import type { EndpointInsight } from "@/lib/invoke";

type SortKey = "method" | "endpoint_key" | "request_count" | "avg_time_ms" | "p95_time_ms" | "last_seen" | "status_200_count" | "schema_version_count";

export function EndpointList() {
  const endpoints = useIntelligenceStore((s) => s.endpoints);
  const loading = useIntelligenceStore((s) => s.loading);
  const selectEndpoint = useIntelligenceStore((s) => s.selectEndpoint);
  const [sortKey, setSortKey] = useState<SortKey>("request_count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let result = [...endpoints];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.endpoint_key.toLowerCase().includes(q) || e.method.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "method": cmp = a.method.localeCompare(b.method); break;
        case "endpoint_key": cmp = a.endpoint_key.localeCompare(b.endpoint_key); break;
        case "request_count": cmp = a.request_count - b.request_count; break;
        case "avg_time_ms": cmp = a.avg_time_ms - b.avg_time_ms; break;
        case "p95_time_ms": cmp = a.p95_time_ms - b.p95_time_ms; break;
        case "last_seen": cmp = a.last_seen.localeCompare(b.last_seen); break;
        case "status_200_count": cmp = a.status_200_count - b.status_200_count; break;
        case "schema_version_count": cmp = a.schema_version_count - b.schema_version_count; break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return result;
  }, [endpoints, sortKey, sortDir, search]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const renderSortHeader = (label: string, sort: SortKey) => (
    <button
      onClick={() => toggleSort(sort)}
      className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors duration-150 flex items-center gap-1 whitespace-nowrap"
    >
      {label}
      {sortKey === sort && (
        <svg className={cn("h-2.5 w-2.5 transition-transform duration-150", sortDir === "asc" && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      )}
    </button>
  );

  if (loading && endpoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading endpoints...</span>
        </div>
      </div>
    );
  }

  if (endpoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        No endpoints found. Run an analysis first.
      </div>
    );
  }

  const getStatusBadge = (e: EndpointInsight) => {
    const total = e.status_200_count + e.status_400_count + e.status_500_count + e.status_other_count;
    if (total === 0) return { label: "No data", color: "bg-muted text-muted-foreground" };
    const successPct = total > 0 ? (e.status_200_count / total) * 100 : 0;
    if (successPct >= 95) return { label: `${successPct.toFixed(0)}%`, color: "bg-green-500/20 text-green-600" };
    if (successPct >= 80) return { label: `${successPct.toFixed(0)}%`, color: "bg-yellow-500/20 text-yellow-600" };
    return { label: `${successPct.toFixed(0)}%`, color: "bg-red-500/20 text-red-600" };
  };

  return (
    <div className="p-3">
      {/* Search bar */}
      <div className="relative mb-3">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search endpoints..."
          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-muted border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Count */}
      <div className="text-[10px] text-muted-foreground mb-2">{filtered.length} endpoint{filtered.length !== 1 ? "s" : ""}</div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-3 py-2 text-left">{renderSortHeader("Method", "method")}</th>
                <th className="px-3 py-2 text-left">{renderSortHeader("Endpoint", "endpoint_key")}</th>
                <th className="px-3 py-2 text-right">{renderSortHeader("Requests", "request_count")}</th>
                <th className="px-3 py-2 text-right">{renderSortHeader("Avg (ms)", "avg_time_ms")}</th>
                <th className="px-3 py-2 text-right">{renderSortHeader("P95 (ms)", "p95_time_ms")}</th>
                <th className="px-3 py-2 text-right">{renderSortHeader("Success", "status_200_count")}</th>
                <th className="px-3 py-2 text-center">{renderSortHeader("Schema", "schema_version_count")}</th>
                <th className="px-3 py-2 text-right">{renderSortHeader("Last Seen", "last_seen")}</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ep) => {
                const badge = getStatusBadge(ep);
                return (
                  <tr key={ep.endpoint_key}>
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        "font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded",
                        ep.method === "GET" && "text-green-600 bg-green-500/10",
                        ep.method === "POST" && "text-blue-600 bg-blue-500/10",
                        ep.method === "PUT" && "text-orange-600 bg-orange-500/10",
                        ep.method === "PATCH" && "text-purple-600 bg-purple-500/10",
                        ep.method === "DELETE" && "text-red-600 bg-red-500/10",
                        !["GET","POST","PUT","PATCH","DELETE"].includes(ep.method) && "text-muted-foreground bg-muted"
                      )}>
                        {ep.method}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] max-w-[250px] truncate" title={ep.endpoint_key}>
                      {ep.endpoint_key}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">{ep.request_count.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{ep.avg_time_ms.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{ep.p95_time_ms.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {ep.schema_version_count > 1 ? (
                        <span className="inline-flex items-center gap-1 text-yellow-500 text-[10px] font-medium">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {ep.schema_version_count}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">{ep.schema_version_count}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground text-[10px]">
                      {ep.last_seen.length > 10 ? ep.last_seen.slice(0, 10) : ep.last_seen}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => selectEndpoint(ep.endpoint_key)}
                        className="text-primary hover:text-primary/80 text-[10px] font-medium transition-colors duration-150"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
