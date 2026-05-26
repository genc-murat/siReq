// ─── Connection Bar ─────────────────────────────────────────────────────────

export function ConnectionBar({
  address,
  tls,
  onAddressChange,
  onTlsChange,
  onDiscover,
  discovering,
  disabled,
}: {
  address: string;
  tls: boolean;
  onAddressChange: (v: string) => void;
  onTlsChange: (v: boolean) => void;
  onDiscover: () => void;
  discovering: boolean;
  disabled: boolean;
}) {
  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
      <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Server:</span>
      <span className="text-[11px] text-muted-foreground/50">{tls ? "https://" : "http://"}</span>
      <input
        value={address}
        onChange={(e) => onAddressChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && address.trim() && !disabled) {
            onDiscover();
          }
        }}
        placeholder="localhost:50051"
        disabled={disabled}
        className="flex-1 bg-transparent text-[13px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
      />
      <button
        onClick={onDiscover}
        disabled={discovering || !address.trim()}
        className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-1"
        title="Discover services via gRPC reflection (or press Enter)"
      >
        {discovering ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        ) : (
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        )}
        {discovering ? "Discovering..." : "Discover"}
      </button>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={tls}
          onChange={(e) => onTlsChange(e.target.checked)}
          disabled={disabled}
          className="rounded border-border"
        />
        TLS
      </label>
    </div>
  );
}
