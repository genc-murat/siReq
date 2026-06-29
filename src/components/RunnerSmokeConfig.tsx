import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getCollections } from "@/lib/invoke";
import type { CollectionItem } from "@/lib/invoke";

function collectTags(items: CollectionItem[]): string[] {
  const tagSet = new Set<string>();
  function walk(list: CollectionItem[]) {
    for (const item of list) {
      if (item.type === "request") {
        for (const t of item.tags ?? []) {
          if (t.trim()) tagSet.add(t.trim());
        }
      } else {
        walk(item.items);
      }
    }
  }
  walk(items);
  return Array.from(tagSet).sort();
}

export function RunnerSmokeConfig({
  collectionId,
  selectedTags,
  onChange,
}: {
  collectionId: string | null;
  selectedTags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [availableTags, setAvailableTags] = useState<string[] | null>(null);

  useEffect(() => {
    if (!collectionId) return;
    let cancelled = false;
    getCollections()
      .then((cols) => {
        if (cancelled) return;
        const col = cols.find((c) => c.id === collectionId);
        if (col) {
          setAvailableTags(collectTags(col.requests));
        } else {
          setAvailableTags([]);
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableTags([]);
      });
    return () => { cancelled = true; };
  }, [collectionId]);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter((t) => t !== tag));
    } else {
      onChange([...selectedTags, tag]);
    }
  };

  if (availableTags === null) {
    return (
      <div className="border rounded-lg p-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Smoke Test Tags</div>
        <div className="text-[10px] text-muted-foreground">Loading tags...</div>
      </div>
    );
  }

  if (availableTags.length === 0) {
    return (
      <div className="border rounded-lg p-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Smoke Test Tags</div>
        <div className="text-[10px] text-muted-foreground">No tags found in collection. Add tags to requests to use smoke mode.</div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">Smoke Test Tags</div>
        {selectedTags.length > 0 && (
          <span className="text-[10px] text-primary font-medium">{selectedTags.length} selected</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {availableTags.map((tag) => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            className={cn(
              "px-2 py-0.5 text-[10px] font-medium rounded-full border transition-all duration-150",
              selectedTags.includes(tag)
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-background border-border text-muted-foreground hover:border-foreground/30"
            )}
          >
            {tag}
          </button>
        ))}
      </div>
      {selectedTags.length === 0 && (
        <div className="text-[10px] text-yellow-500">
          No tags selected — all requests will run (falls back to Functional).
        </div>
      )}
    </div>
  );
}
