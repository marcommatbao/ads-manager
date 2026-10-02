"use client";

import { ExternalLink, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SeverityBadge, PolicyPlatformBadge, OfficialSourceBadge, ReviewStatusBadge } from "./badges";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/policy-radar/labels";
import type { PolicyRadarItem } from "@/lib/policy-radar/types";

function formatDate(iso: string | null): string {
  if (!iso) return "Chưa xác định ngày";
  return new Date(iso).toLocaleDateString("vi-VN", { year: "numeric", month: "short", day: "numeric" });
}

interface PolicyCardProps {
  item: PolicyRadarItem;
  onOpenDetail: (item: PolicyRadarItem) => void;
}

export function PolicyCard({ item, onOpenDetail }: PolicyCardProps) {
  return (
    <button
      onClick={() => onOpenDetail(item)}
      className={cn(
        "w-full text-left rounded-xl border bg-white p-4 transition-all hover:shadow-md hover:border-slate-300",
        item.status === "unread" ? "border-slate-200" : "border-slate-100 opacity-90"
      )}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <PolicyPlatformBadge platform={item.platform} />
        <SeverityBadge severity={item.severity} />
        <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
          {CATEGORY_LABELS[item.category]}
        </span>
        {item.official && item.verifiedFromSource && <OfficialSourceBadge />}
        {!item.official && (
          <span className="text-xs text-slate-400 border border-dashed border-slate-300 rounded-full px-2 py-0.5">
            Nguồn tham khảo
          </span>
        )}
        {!item.verifiedFromSource && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            <AlertTriangle className="h-3 w-3" /> Chưa xác minh trực tiếp
          </span>
        )}
        <ReviewStatusBadge status={item.status} label={STATUS_LABELS[item.status]} />
      </div>

      <h3 className="text-sm font-semibold text-slate-900 mb-1">{item.title}</h3>
      <p className="text-sm text-slate-600 mb-2 line-clamp-2">{item.summaryShort}</p>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{item.sourceLabel} · {formatDate(item.publishedAt)}</span>
        <span className="inline-flex items-center gap-1 text-slate-500">
          <ExternalLink className="h-3 w-3" /> Xem chi tiết
        </span>
      </div>
    </button>
  );
}
