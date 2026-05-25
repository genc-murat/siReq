import { useRequestStore } from "@/stores/requestStore";
import type { AuthType } from "@/lib/invoke";
import { cn } from "@/lib/utils";

const authTypes: { value: AuthType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "basic", label: "Basic Auth" },
  { value: "bearer", label: "Bearer Token" },
  { value: "api_key", label: "API Key" },
];

export function AuthTab() {
  const auth = useRequestStore((s) => s.request.auth);
  const setAuth = useRequestStore((s) => s.setAuth);

  const update = (field: string, value: string) =>
    setAuth({ ...auth, [field]: value });

  return (
    <div className="flex flex-col gap-3 p-1">
      <div className="flex gap-1">
        {authTypes.map((at) => (
          <button
            key={at.value}
            onClick={() => setAuth({ ...auth, type: at.value })}
            className={cn(
              "px-2 py-0.5 text-xs rounded-lg transition-all duration-150",
              auth.type === at.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {at.label}
          </button>
        ))}
      </div>
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
                "px-2 py-0.5 text-xs rounded-lg transition-all duration-150",
                auth.api_key_in === "header" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              )}
            >
              Header
            </button>
            <button
              onClick={() => setAuth({ ...auth, api_key_in: "query" })}
              className={cn(
                "px-2 py-0.5 text-xs rounded-lg transition-all duration-150",
                auth.api_key_in === "query" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              )}
            >
              Query
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
