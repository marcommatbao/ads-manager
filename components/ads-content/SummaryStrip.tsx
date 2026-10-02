"use client";

import { cn, formatNumber } from "@/lib/utils";
import type { CreativeItem } from "@/types/creative-content.types";

interface SummaryTileProps {
  label: string;
  value: string;
  isLoading?: boolean;
}

function SummaryTile({ label, value, isLoading }: SummaryTileProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm flex flex-col gap-1 min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 truncate">{label}</p>
      {isLoading ? (
        <div className="h-5 w-16 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="text-base font-bold leading-tight tabular-nums text-slate-800 truncate">{value}</p>
      )}
    </div>
  );
}

export function SummaryStrip({ items, isLoading }: { items: CreativeItem[]; isLoading?: boolean }) {
  const activeCampaigns = new Set(items.map((i) => i.campaignId)).size;
  const totalCreatives = items.length;
  const facebookCount = items.filter((i) => i.platform === "facebook").length;
  const googleCount = items.filter((i) => i.platform === "google_search" || i.platform === "google_pmax").length;
  const mbcCount = items.filter((i) => i.company === "MBC").length;
  const mbiCount = items.filter((i) => i.company === "MBI").length;

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6")}>
      <SummaryTile label="Campaign có creative chạy" value={formatNumber(activeCampaigns)} isLoading={isLoading} />
      <SummaryTile label="Tổng creative có spend" value={formatNumber(totalCreatives)} isLoading={isLoading} />
      <SummaryTile label="Facebook" value={formatNumber(facebookCount)} isLoading={isLoading} />
      <SummaryTile label="Google (Search + PMax)" value={formatNumber(googleCount)} isLoading={isLoading} />
      <SummaryTile label="MBC" value={formatNumber(mbcCount)} isLoading={isLoading} />
      <SummaryTile label="MBI" value={formatNumber(mbiCount)} isLoading={isLoading} />
    </div>
  );
}
