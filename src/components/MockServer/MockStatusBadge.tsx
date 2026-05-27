import { cn } from "@/lib/utils";

interface MockStatusBadgeProps {
  status: "running" | "stopped" | "error";
  className?: string;
}

export function MockStatusBadge({ status, className }: MockStatusBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold select-none transition-all duration-300",
        status === "running" && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.15)] animate-pulse",
        status === "stopped" && "bg-zinc-500/10 text-zinc-400 border border-zinc-500/10",
        status === "error" && "bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_12px_rgba(244,63,94,0.15)]",
        className
      )}
    >
      <span className={cn(
        "w-2 h-2 rounded-full",
        status === "running" && "bg-emerald-400 shadow-[0_0_8px_#34d399]",
        status === "stopped" && "bg-zinc-500",
        status === "error" && "bg-rose-400 shadow-[0_0_8px_#f87171]"
      )} />
      <span className="capitalize tracking-wider text-[10px]">
        {status === "running" ? "Online" : status === "stopped" ? "Offline" : "Error"}
      </span>
    </div>
  );
}
