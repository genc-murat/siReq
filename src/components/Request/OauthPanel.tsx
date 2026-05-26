import { useState, useEffect } from "react";
import type { OauthGrantType } from "@/stores/oauthStore";
import { useOauthStore } from "@/stores/oauthStore";
import { useRequestStore } from "@/stores/requestStore";
import { useToastStore } from "@/stores/toastStore";
import { cn } from "@/lib/utils";
import {
  Key,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Lock,
  Clock,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Code
} from "lucide-react";

export function OauthPanel() {
  const requestId = useRequestStore((s) => s.request.id);
  const requestAuth = useRequestStore((s) => s.request.auth);
  const setAuth = useRequestStore((s) => s.setAuth);

  const { getConfig, saveConfig, clearToken, fetchTokenClientCredentials, generateAuthUrl, exchangeCodeForToken } = useOauthStore();
  const config = getConfig(requestId);

  const { addToast } = useToastStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [callbackUrlInput, setCallbackUrlInput] = useState("");
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);

  // Expose updates back to oauthStore
  const updateConfig = (fields: Partial<typeof config>) => {
    saveConfig(requestId, fields);
  };

  // Sync state if auth token was cleared elsewhere
  useEffect(() => {
    if (!requestAuth.token && config.tokenData) {
      clearToken(requestId);
    }
  }, [requestAuth.token, config.tokenData, requestId, clearToken]);

  // Expiry countdown timer
  useEffect(() => {
    if (!config.tokenData || !config.tokenData.expiresIn) {
      setTimeRemaining(null);
      return;
    }

    const calculateTime = () => {
      const expiresAt = (config.tokenData!.fetchedAt) + (config.tokenData!.expiresIn! * 1000);
      const diff = expiresAt - Date.now();

      if (diff <= 0) {
        setTimeRemaining("Expired");
        // Clear token from requestStore if expired
        if (requestAuth.token) {
          setAuth({ ...requestAuth, token: "" });
        }
        return;
      }

      const totalSecs = Math.floor(diff / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      const hours = Math.floor(mins / 60);
      const minsLeft = mins % 60;

      if (hours > 0) {
        setTimeRemaining(`${hours}h ${minsLeft}m ${secs}s`);
      } else {
        setTimeRemaining(`${minsLeft}m ${secs}s`);
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [config.tokenData, requestAuth, setAuth]);

  // Auto-parse pasted callback URL
  useEffect(() => {
    if (!callbackUrlInput) return;

    try {
      // Handle either the full URL or just the code parameter
      let code = "";
      if (callbackUrlInput.includes("code=")) {
        const urlObj = new URL(callbackUrlInput);
        code = urlObj.searchParams.get("code") || "";
      } else if (!callbackUrlInput.includes("/") && callbackUrlInput.length > 5) {
        code = callbackUrlInput;
      }

      if (code) {
        setCallbackUrlInput(""); // Reset input
        handleExchangeCode(code);
      }
    } catch {
      // Not a valid URL, ignore and let manual trigger handle it
    }
  }, [callbackUrlInput]);

  const handleFetchClientCredentials = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await fetchTokenClientCredentials(requestId);
      addToast("Successfully acquired Client Credentials token", "success");
    } catch (err: any) {
      setError(err?.message || "Token retrieval failed");
      addToast(err?.message || "Token retrieval failed", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthorizeCodeFlow = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const authUrl = await generateAuthUrl(requestId);
      // Open in browser
      window.open(authUrl, "_blank");
      addToast("Sign in in your browser to complete authorization", "info");
    } catch (err: any) {
      setError(err?.message || "Failed to generate authorization URL");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExchangeCode = async (code: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await exchangeCodeForToken(requestId, code);
      addToast("Successfully exchanged authorization code for token", "success");
    } catch (err: any) {
      setError(err?.message || "Code exchange failed");
      addToast(err?.message || "Code exchange failed", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearToken = () => {
    clearToken(requestId);
    setAuth({ ...requestAuth, token: "" });
    addToast("OAuth token cleared successfully", "info");
  };

  const handleCopyToken = () => {
    if (config.tokenData?.accessToken) {
      navigator.clipboard.writeText(config.tokenData.accessToken);
      addToast("Access token copied to clipboard", "success");
    }
  };

  const grantTypes: { value: OauthGrantType; label: string }[] = [
    { value: "client_credentials", label: "Client Credentials" },
    { value: "authorization_code", label: "Authorization Code" },
    { value: "authorization_code_pkce", label: "Auth Code + PKCE" },
  ];

  return (
    <div className="flex flex-col gap-4 bg-card/40 border border-border/60 rounded-xl p-4 shadow-xl backdrop-blur-md transition-all duration-200">
      {/* Header Selector */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Grant Type
        </label>
        <div className="flex gap-1.5 p-1 bg-secondary/40 border border-border/30 rounded-lg w-fit">
          {grantTypes.map((gt) => (
            <button
              key={gt.value}
              onClick={() => updateConfig({ grantType: gt.value })}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 cursor-pointer",
                config.grantType === gt.value
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              )}
            >
              {gt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Client ID */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1">
            <Key className="w-3 h-3 text-cyan-400" /> Client ID
          </label>
          <input
            type="text"
            value={config.clientId}
            onChange={(e) => updateConfig({ clientId: e.target.value })}
            placeholder="e.g. your-client-id"
            className="bg-background border border-border/80 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Client Secret - Only show for CC or standard Auth Code */}
        {config.grantType !== "authorization_code_pkce" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-cyan-400" /> Client Secret
              </span>
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="text-muted-foreground hover:text-foreground transition cursor-pointer"
              >
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </label>
            <input
              type={showSecret ? "text" : "password"}
              value={config.clientSecret}
              onChange={(e) => updateConfig({ clientSecret: e.target.value })}
              placeholder="••••••••••••••••"
              className="bg-background border border-border/80 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/50"
            />
          </div>
        )}

        {/* Token URL */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Access Token URL
          </label>
          <input
            type="text"
            value={config.tokenUrl}
            onChange={(e) => updateConfig({ tokenUrl: e.target.value })}
            placeholder="https://oauth.example.com/oauth/token"
            className="bg-background border border-border/80 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Auth URL - Only for code flows */}
        {config.grantType !== "client_credentials" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Authorization URL
            </label>
            <input
              type="text"
              value={config.authUrl}
              onChange={(e) => updateConfig({ authUrl: e.target.value })}
              placeholder="https://oauth.example.com/oauth/authorize"
              className="bg-background border border-border/80 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/50"
            />
          </div>
        )}

        {/* Redirect URI - Only for code flows */}
        {config.grantType !== "client_credentials" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Redirect URI
            </label>
            <input
              type="text"
              value={config.redirectUri}
              onChange={(e) => updateConfig({ redirectUri: e.target.value })}
              placeholder="http://localhost:3456/callback"
              className="bg-background border border-border/80 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/50"
            />
          </div>
        )}

        {/* Scope */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Scope
          </label>
          <input
            type="text"
            value={config.scope}
            onChange={(e) => updateConfig({ scope: e.target.value })}
            placeholder="e.g. read write offline_access"
            className="bg-background border border-border/80 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Action triggers */}
      <div className="flex flex-col gap-3 border-t border-border/40 pt-4 mt-1">
        {config.grantType === "client_credentials" ? (
          <button
            onClick={handleFetchClientCredentials}
            disabled={isLoading || !config.tokenUrl || !config.clientId}
            className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground font-medium py-2 px-4 rounded-lg text-xs hover:bg-primary/95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition shadow-md shadow-primary/10"
          >
            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Get Access Token
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleAuthorizeCodeFlow}
                disabled={isLoading || !config.authUrl || !config.clientId}
                className="flex items-center justify-center gap-2 flex-1 bg-primary text-primary-foreground font-medium py-2 px-4 rounded-lg text-xs hover:bg-primary/95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition shadow-md shadow-primary/10"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Step 1: Authorize in Browser
              </button>
            </div>

            {/* Paste Redirect URI Area */}
            <div className="flex flex-col gap-2 bg-secondary/35 border border-border/40 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/90">
                <Code className="w-3.5 h-3.5 text-cyan-400" />
                Step 2: Paste Callback Redirect URL
              </div>
              <p className="text-[10px] text-muted-foreground">
                Paste the final redirect browser address (containing code=...) to complete token retrieval.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={callbackUrlInput}
                  onChange={(e) => setCallbackUrlInput(e.target.value)}
                  placeholder="Paste URL here (e.g. http://localhost:3456/callback?code=xxx)"
                  className="bg-background border border-border/80 rounded-lg px-3 py-1.5 text-xs text-foreground flex-1 focus:outline-none focus:border-cyan-500/80 transition-all placeholder:text-muted-foreground/40"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error alert */}
      {error && (
        <div className="flex items-start gap-2 bg-destructive/15 border border-destructive/30 text-destructive text-xs p-3 rounded-lg animate-in fade-in slide-in-from-top-1">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 select-text">{error}</div>
        </div>
      )}

      {/* Active Token Display HUD */}
      {config.tokenData && (
        <div className="mt-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3.5 shadow-md flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Token Active
            </span>
            {timeRemaining && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                <Clock className="w-3.5 h-3.5" />
                {timeRemaining}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-xs">
            <code className="font-mono text-muted-foreground/80 break-all select-all flex-1 pr-2">
              {config.tokenData.accessToken.substring(0, 16)}••••••••{config.tokenData.accessToken.substring(config.tokenData.accessToken.length - 12)}
            </code>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopyToken}
                className="p-1.5 hover:bg-secondary rounded cursor-pointer transition-all text-muted-foreground hover:text-foreground"
                title="Copy full token"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleClearToken}
                className="p-1.5 hover:bg-destructive/15 rounded cursor-pointer transition-all text-muted-foreground hover:text-destructive"
                title="Clear token"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
