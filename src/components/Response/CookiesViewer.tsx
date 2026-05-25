import { useRequestStore } from "@/stores/requestStore";
import { useEffect, useState, useCallback } from "react";
import { getCookies, deleteCookie, clearCookies } from "@/lib/invoke";
import type { StoredCookie } from "@/lib/invoke";
import { cn } from "@/lib/utils";
import { Tabs } from "@/components/Tabs";
import type { Tab } from "@/components/Tabs";

type CookieTab = "response" | "stored";

export function CookiesViewer() {
  const response = useRequestStore((s) => s.response);
  const [tab, setTab] = useState<CookieTab>("response");
  const [stored, setStored] = useState<StoredCookie[]>([]);
  const [loading, setLoading] = useState(false);

  const loadStored = useCallback(async () => {
    setLoading(true);
    try {
      const cookies = await getCookies();
      setStored(cookies);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "stored") {
      loadStored();
    }
  }, [tab, loadStored]);

  const handleDelete = async (id: string) => {
    try {
      await deleteCookie(id);
      setStored((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // ignore
    }
  };

  const handleClearAll = async () => {
    try {
      await clearCookies();
      setStored([]);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <Tabs
        tabs={[
          { id: "response", label: "Response Cookies" },
          { id: "stored", label: "Stored Cookies", badge: stored.length > 0 ? stored.length : undefined },
        ]}
        activeTab={tab}
        onChange={(id) => setTab(id as CookieTab)}
        size="sm"
      />

      <div className="flex-1 overflow-auto min-h-0">
        {tab === "response" && <ResponseCookies />}
        {tab === "stored" && (
          <StoredCookiesPanel
            cookies={stored}
            loading={loading}
            onDelete={handleDelete}
            onClearAll={handleClearAll}
            onRefresh={loadStored}
          />
        )}
      </div>
    </div>
  );
}

function ResponseCookies() {
  const response = useRequestStore((s) => s.response);
  if (!response) return null;

  if (response.cookies.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No cookies in response
      </div>
    );
  }

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
          {response.cookies.map(([key, value], i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-1 pr-4 text-primary font-medium max-w-[200px] truncate">{key}</td>
              <td className="py-1 text-foreground break-all">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface StoredCookiesPanelProps {
  cookies: StoredCookie[];
  loading: boolean;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onRefresh: () => void;
}

function StoredCookiesPanel({ cookies, loading, onDelete, onClearAll, onRefresh }: StoredCookiesPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Loading cookies...
      </div>
    );
  }

  if (cookies.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No stored cookies
      </div>
    );
  }

  // Group cookies by domain
  const grouped = cookies.reduce<Record<string, StoredCookie[]>>((acc, c) => {
    if (!acc[c.domain]) acc[c.domain] = [];
    acc[c.domain].push(c);
    return acc;
  }, {});

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">
          {cookies.length} cookie{cookies.length !== 1 ? "s" : ""} stored
        </span>
        <div className="flex gap-1">
          <button
            onClick={onRefresh}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 border rounded transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={onClearAll}
            className="text-xs text-destructive hover:text-destructive/80 px-2 py-0.5 border border-destructive/30 rounded transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {Object.entries(grouped).map(([domain, domainCookies]) => (
        <div key={domain} className="mb-4">
          <div className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1">
            <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {domain}
          </div>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground bg-muted/50">
                  <th className="px-2 py-1 font-medium">Name</th>
                  <th className="px-2 py-1 font-medium">Value</th>
                  <th className="px-2 py-1 font-medium">Path</th>
                  <th className="px-2 py-1 font-medium">Expires</th>
                  <th className="px-2 py-1 font-medium">Flags</th>
                  <th className="px-2 py-1 w-8" />
                </tr>
              </thead>
              <tbody>
                {domainCookies.map((cookie) => (
                  <tr key={cookie.id} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-1 font-medium text-primary max-w-[140px] truncate" title={cookie.name}>
                      {cookie.name}
                    </td>
                    <td className="px-2 py-1 text-foreground max-w-[200px] truncate" title={cookie.value}>
                      {cookie.value}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">{cookie.path}</td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {cookie.expires ? (
                        cookie.expires.startsWith("max-age=") ? (
                          <span title={cookie.expires}>Session</span>
                        ) : (
                          <span title={cookie.expires}>{formatExpiry(cookie.expires)}</span>
                        )
                      ) : (
                        <span className="italic">Session</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex gap-1">
                        {cookie.secure && (
                          <span className="text-[10px] bg-green-500/10 text-green-500 rounded px-1" title="Secure">S</span>
                        )}
                        {cookie.http_only && (
                          <span className="text-[10px] bg-blue-500/10 text-blue-500 rounded px-1" title="HttpOnly">H</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <button
                        onClick={() => onDelete(cookie.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete cookie"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatExpiry(expires: string): string {
  try {
    const date = new Date(expires);
    if (isNaN(date.getTime())) return expires;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return expires;
  }
}
