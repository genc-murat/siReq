import { useState } from "react";
import { useRequestStore } from "@/stores/requestStore";

export function HeadersViewer() {
  const response = useRequestStore((s) => s.response);
  const [search, setSearch] = useState("");

  if (!response) return null;

  const headers = search.trim()
    ? response.headers.filter(([key, value]) =>
        key.toLowerCase().includes(search.toLowerCase()) ||
        value.toLowerCase().includes(search.toLowerCase())
      )
    : response.headers;

  return (
    <div className="flex flex-col h-full">
      {response.headers.length > 0 && (
        <div className="px-3 pt-2 pb-1 shrink-0">
          <div className="flex items-center bg-background rounded border border-input px-2 py-1">
            <svg className="h-3 w-3 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search headers..."
              className="flex-1 bg-transparent text-xs px-1.5 py-0.5 focus:outline-none text-foreground placeholder:text-muted-foreground"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto min-h-0 p-3 pt-0">
        {headers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <svg className="h-6 w-6 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-xs text-muted-foreground">
              {search ? "No matching headers" : "No response headers"}
            </span>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="pb-1 font-medium">Name</th>
                <th className="pb-1 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {headers.map(([key, value], i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-1.5 pr-4 text-primary font-medium max-w-[240px] truncate" title={key}>{key}</td>
                  <td className="py-1.5 text-foreground break-all font-mono text-[11px]">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
