import type { SchemaVersionInfo } from "@/lib/invoke";

interface Props {
  versions: SchemaVersionInfo[];
}

function getStatusColor(index: number, total: number): string {
  if (index === 0) return "bg-primary";
  if (index === total - 1) return "bg-destructive";
  return "bg-yellow-500";
}

function getStatusLabel(index: number, total: number): string {
  if (total <= 1) return "Stable";
  if (index === 0) return "Original";
  if (index === total - 1) return "Current";
  return `v${index + 1}`;
}

export function SchemaEvolutionTimeline({ versions }: Props) {
  if (versions.length === 0) {
    return (
      <div className="flex items-center justify-center h-[120px] text-muted-foreground text-xs">
        No schema changes detected
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Timeline */}
      <div className="relative pl-6 space-y-0">
        {versions.map((v, i) => {
          const isLast = i === versions.length - 1;
          const color = getStatusColor(i, versions.length);
          const label = getStatusLabel(i, versions.length);

          return (
            <div key={v.fingerprint} className="relative pb-4 last:pb-0">
              {/* Connection line */}
              {!isLast && (
                <div className="absolute left-[7px] top-[14px] bottom-0 w-px bg-border" />
              )}
              {/* Dot */}
              <div className="absolute left-[2px] top-[5px]">
                <div className={`h-3 w-3 rounded-full ${color} ring-2 ring-background`} />
              </div>
              {/* Content */}
              <div className="ml-3">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md text-white ${color}`}>
                    {label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {v.seen_at.length > 10 ? v.seen_at.slice(0, 10) : v.seen_at}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {v.field_count} fields
                </div>
                {v.fields.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {v.fields.slice(0, 8).map((field, fi) => (
                      <span
                        key={fi}
                        className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {field}
                      </span>
                    ))}
                    {v.fields.length > 8 && (
                      <span className="text-[9px] px-1 py-0.5 text-muted-foreground">
                        +{v.fields.length - 8} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
