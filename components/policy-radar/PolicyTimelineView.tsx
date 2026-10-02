"use client";

import { cn } from "@/lib/utils";
import type { PolicyRadarItem, PolicySeverity } from "@/lib/policy-radar/types";

const SEVERITY_DOT: Record<PolicySeverity, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-slate-400",
};

const SEVERITY_WORD: Record<PolicySeverity, string> = { high: "Cao", medium: "Trung bình", low: "Thấp" };

const PLATFORM_LABEL = { google_ads: "Google Ads", meta: "Meta" } as const;

const MONTH_FORMATTER = new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" });

function monthKey(publishedAt: string | null): string {
  if (!publishedAt) return "unknown";
  return publishedAt.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string): string {
  if (key === "unknown") return "Chưa xác định ngày";
  const [y, m] = key.split("-").map(Number);
  return MONTH_FORMATTER.format(new Date(y, m - 1, 1));
}

interface PolicyTimelineViewProps {
  items: PolicyRadarItem[];
  selectedId: string | null;
  onOpenDetail: (item: PolicyRadarItem) => void;
}

export function PolicyTimelineView({ items, selectedId, onOpenDetail }: PolicyTimelineViewProps) {
  const groups = new Map<string, PolicyRadarItem[]>();
  for (const item of items) {
    const key = monthKey(item.publishedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  // Newest month first, "unknown" always last.
  const orderedKeys = [...groups.keys()].sort((a, b) => {
    if (a === "unknown") return 1;
    if (b === "unknown") return -1;
    return b.localeCompare(a);
  });

  return (
    <div className="flex flex-col">
      {orderedKeys.map((key) => (
        <div key={key}>
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-1 py-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 capitalize">{monthLabel(key)}</span>
            <span className="text-[10px] text-slate-400">{groups.get(key)!.length} mục</span>
          </div>
          <div className="divide-y divide-slate-50">
            {groups.get(key)!.map((item) => (
              <button
                key={item.id}
                onClick={() => onOpenDetail(item)}
                className={cn(
                  "w-full flex items-center gap-2 px-1 py-2 text-left hover:bg-slate-50 transition-colors",
                  selectedId === item.id && "bg-blue-50/60"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full shrink-0", SEVERITY_DOT[item.severity])} />
                <span className="text-xs text-slate-400 shrink-0 w-20 truncate">{PLATFORM_LABEL[item.platform]}</span>
                <span className="text-xs text-slate-400 shrink-0 w-16 truncate">{SEVERITY_WORD[item.severity]}</span>
                <span className="text-sm text-slate-700 truncate">{item.title}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
