import { useRequestStore } from "@/stores/requestStore";
import { useOauthStore } from "@/stores/oauthStore";
import { OauthPanel } from "./OauthPanel";
import type { AuthType } from "@/lib/invoke";
import { cn } from "@/lib/utils";

const authTypes = [
  { value: "none", label: "None" },
  { value: "basic", label: "Basic Auth" },
  { value: "bearer", label: "Bearer Token" },
  { value: "oauth2", label: "OAuth 2.0" },
  { value: "api_key", label: "API Key" },
];

export function AuthTab() {
  const requestId = useRequestStore((s) => s.request.id);
  const auth = useRequestStore((s) => s.request.auth);
  const setAuth = useRequestStore((s) => s.setAuth);

  const oauthEnabledRequests = useOauthStore((s) => s.oauthEnabledRequests);
  const setOauthEnabled = useOauthStore((s) => s.setOauthEnabled);
  const isOauth = !!oauthEnabledRequests[requestId];

  const update = (field: string, value: string) =>
    setAuth({ ...auth, [field]: value });

  const isActive = (val: string) => {
    if (val === "oauth2") return isOauth;
    if (val === "bearer") return auth.type === "bearer" && !isOauth;
    return auth.type === val;
  };

  const handleSelect = (val: string) => {
    if (val === "oauth2") {
      setOauthEnabled(requestId, true);
      setAuth({ ...auth, type: "bearer" });
    } else {
      setOauthEnabled(requestId, false);
      setAuth({ ...auth, type: val as AuthType });
    }
  };

  return (
    <div className="flex flex-col gap-3 p-1">
      <div className="flex gap-1.5 flex-wrap">
        {authTypes.map((at) => (
          <button
            key={at.value}
            onClick={() => handleSelect(at.value)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer",
              isActive(at.value)
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {at.label}
          </button>
        ))}
      </div>
      {isOauth ? (
        <OauthPanel />
      ) : (
        <>
          {auth.type === "basic" && (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={auth.username}
                onChange={(e) => update("username", e.target.value)}
                placeholder="Username"
                className="bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
              />
              <input
                type="password"
                value={auth.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder="Password"
                className="bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
              />
            </div>
          )}
          {auth.type === "bearer" && (
            <input
              type="text"
              value={auth.token}
              onChange={(e) => update("token", e.target.value)}
              placeholder="Token"
              className="bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
            />
          )}
          {auth.type === "api_key" && (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={auth.api_key_name}
                onChange={(e) => update("api_key_name", e.target.value)}
                placeholder="Key name"
                className="bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
              />
              <input
                type="text"
                value={auth.api_key}
                onChange={(e) => update("api_key", e.target.value)}
                placeholder="Key value"
                className="bg-background text-foreground text-sm px-3 py-1.5 rounded-lg border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-all duration-150"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setAuth({ ...auth, api_key_in: "header" })}
                  className={cn(
                    "px-2 py-0.5 text-xs rounded-lg transition-all duration-150 cursor-pointer",
                    auth.api_key_in === "header" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                  )}
                >
                  Header
                </button>
                <button
                  onClick={() => setAuth({ ...auth, api_key_in: "query" })}
                  className={cn(
                    "px-2 py-0.5 text-xs rounded-lg transition-all duration-150 cursor-pointer",
                    auth.api_key_in === "query" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                  )}
                >
                  Query
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
