import { useRef, useState, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
  /** Optional trailing element rendered after tabs */
  trailing?: ReactNode;
  /** Size variant */
  size?: "sm" | "md";
}

export function Tabs({ tabs, activeTab, onChange, className, trailing, size = "sm" }: TabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const activeEl = container.querySelector(`[data-tab-id="${activeTab}"]`) as HTMLElement | null;
    if (activeEl) {
      const parentRect = container.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      setIndicator({
        left: elRect.left - parentRect.left,
        width: elRect.width,
      });
    }
  }, [activeTab, tabs]);

  const sizeClasses = size === "sm"
    ? "h-8 text-xs"
    : "h-9 text-sm";

  return (
    <div className={cn("flex items-center relative", className)}>
      <div
        ref={containerRef}
        className={cn(
          "relative flex items-center bg-muted/60 rounded-lg p-0.5 gap-0",
          sizeClasses
        )}
      >
        {/* Animated pill indicator */}
        <div
          className="absolute top-0.5 bottom-0.5 rounded-md bg-background shadow-sm border transition-all duration-200 ease-out z-0"
          style={{
            left: indicator.left,
            width: indicator.width,
          }}
        />
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-tab-id={tab.id}
            onClick={() => !tab.disabled && onChange(tab.id)}
            disabled={tab.disabled}
            className={cn(
              "relative z-10 flex items-center gap-1.5 px-2.5 h-full rounded-md font-medium transition-all duration-150 shrink-0",
              activeTab === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
              tab.disabled && "opacity-40 cursor-not-allowed"
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge !== null && (
              <span className="shrink-0">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>
      {trailing && (
        <div className="ml-auto flex items-center gap-1">{trailing}</div>
      )}
    </div>
  );
}
