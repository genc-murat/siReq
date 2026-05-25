import { useTabStore, type TabData } from "@/stores/tabStore";
import { cn } from "@/lib/utils";

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const createTab = useTabStore((s) => s.createTab);
  const duplicateTab = useTabStore((s) => s.duplicateTab);

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center bg-card border-b shrink-0 h-9 select-none px-1">
      <div className="flex items-center flex-1 overflow-x-auto min-w-0 gap-0.5">
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            onDuplicate={() => duplicateTab(tab.id)}
          />
        ))}
      </div>
      <button
        onClick={() => createTab()}
        className="shrink-0 ml-1 h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all duration-150"
        title="New tab (Ctrl+T)"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}

function TabItem({
  tab,
  isActive,
  onSelect,
  onClose,
  onDuplicate,
}: {
  tab: TabData;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onDuplicate: () => void;
}) {
  const label = tab.request.name || tab.request.url || "New Request";

  return (
    <div
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onDuplicate();
      }}
      className={cn(
        "group relative flex items-center gap-1.5 pl-2 pr-1 h-7 text-xs cursor-pointer shrink-0 max-w-[200px] rounded-md transition-all duration-150",
        isActive
          ? "bg-background text-foreground shadow-sm border"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      )}
      title={`${tab.request.method} ${tab.request.url || "No URL"}\nRight-click to duplicate`}
    >
      <span className={cn(
        "font-semibold shrink-0 text-[10px]",
        methodColor(tab.request.method)
      )}>
        {tab.request.method}
      </span>
      <span className="truncate flex-1 min-w-0">{label}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="shrink-0 opacity-0 group-hover:opacity-100 hover:bg-accent rounded-sm p-0.5 transition-all duration-150"
        title="Close tab"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

const methodColors: Record<string, string> = {
  GET: "text-green-500",
  POST: "text-yellow-500",
  PUT: "text-blue-500",
  PATCH: "text-orange-500",
  DELETE: "text-red-500",
  HEAD: "text-purple-500",
  OPTIONS: "text-teal-500",
  TRACE: "text-gray-500",
};

function methodColor(method: string): string {
  return methodColors[method] ?? "";
}
