"use client";

import { useCallback, useEffect, useState } from "react";
import { KeywordTable } from "@/components/KeywordTable";
import { cn } from "@/lib/utils";
import type { KeywordInsight, KeywordInsightsResponse, IntentMatch, KwMatchType } from "@/types/keyword-insight";

interface KeywordsViewProps {
  company: string | "all";
  showToast: (msg: string, type?: "success" | "error") => void;
}

// Real per-campaign monthly pacing — reuses the already-live
// /api/google/toolkit/budget-pacing endpoint (self-derives "monthly
// budget" from each campaign's real daily_budget × days-in-month, no
// dependency on the separate hand-maintained lib/budget-monitor.ts
// config file, which hasn't been updated since 2026-04 and would show
// nothing for the current month). expectedPct/actualPct come straight
// from that real endpoint; the on/over/under-pace label is derived here
// with a simple ±10 percentage-point band — a fresh, explicit choice
// since the endpoint itself only returns the raw two percentages.
interface CampaignPacing {
  id: string;
  name: string;
  spent: number;
  budget: number;
  expectedPct: number;
  actualPct: number;
  status: "over_pace" | "under_pace" | "on_track";
}

const PACING_STYLE: Record<CampaignPacing["status"], string> = {
  over_pace: "bg-red-100 text-red-700",
  under_pace: "bg-blue-100 text-blue-700",
  on_track: "bg-emerald-100 text-emerald-700",
};

const PACING_LABEL: Record<CampaignPacing["status"], string> = {
  over_pace: "Chi nhanh hơn dự kiến",
  under_pace: "Chi chậm hơn dự kiến",
  on_track: "Đúng nhịp",
};

const INTENT_OPTIONS: Array<{ value: IntentMatch | "ALL"; label: string }> = [
  { value: "ALL", label: "Tất cả ý định" },
  { value: "relevant", label: "Phù hợp" },
  { value: "borderline", label: "Chưa chắc" },
  { value: "off_intent", label: "Lệch ý định" },
  { value: "unknown", label: "Chưa đủ dữ liệu" },
];

const MATCH_TYPE_OPTIONS: Array<{ value: KwMatchType | "ALL"; label: string }> = [
  { value: "ALL", label: "Tất cả loại khớp" },
  { value: "EXACT", label: "Exact" },
  { value: "PHRASE", label: "Phrase" },
  { value: "BROAD", label: "Broad" },
];

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function KeywordsView({ company, showToast }: KeywordsViewProps) {
  const [data, setData] = useState<KeywordInsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [intentFilter, setIntentFilter] = useState<IntentMatch | "ALL">("ALL");
  const [matchTypeFilter, setMatchTypeFilter] = useState<KwMatchType | "ALL">("ALL");
  const [campaignFilter, setCampaignFilter] = useState<string>("ALL");
  const [pacingByCampaign, setPacingByCampaign] = useState<Map<string, CampaignPacing>>(new Map());

  const co = company === "all" ? "MBC" : company;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/google/toolkit/budget-pacing?company=${co}`)
      .then(r => r.json())
      .then((json: { success?: boolean; campaigns?: Array<{ id: string; name: string; spent: number; budget: number; expectedPct: number; actualPct: number }> }) => {
        if (cancelled || !json.success || !json.campaigns) return;
        const map = new Map<string, CampaignPacing>();
        for (const c of json.campaigns) {
          const diff = c.actualPct - c.expectedPct;
          const status: CampaignPacing["status"] = diff > 10 ? "over_pace" : diff < -10 ? "under_pace" : "on_track";
          map.set(c.id, { ...c, status });
        }
        setPacingByCampaign(map);
      })
      .catch(() => { /* pacing context is best-effort — never block the keyword table */ });
    return () => { cancelled = true; };
  }, [co]);

  const fetchKeywords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ company: co });
      if (intentFilter !== "ALL") params.set("intentMatch", intentFilter);
      if (matchTypeFilter !== "ALL") params.set("matchType", matchTypeFilter);
      const res = await fetch(`/api/improvements/keywords?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setData(json);
      } else {
        showToast(json.error || "Lỗi khi tải dữ liệu từ khóa", "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Lỗi kết nối", "error");
    } finally {
      setLoading(false);
    }
  }, [co, intentFilter, matchTypeFilter, showToast]);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  const handleAddNegative = async (kw: KeywordInsight, terms: string[]) => {
    setApplyingId(kw.id);
    try {
      const results = await Promise.all(
        terms.map(term =>
          fetch("/api/improvements/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              company: co,
              applyPayload: {
                action: "ADD_NEGATIVE",
                campaignResource: kw.campaignResourceName,
                term,
                matchType: "EXACT",
              },
            }),
          }).then(r => r.json())
        )
      );
      const okCount = results.filter(r => r.success).length;
      if (okCount > 0) {
        showToast(`✅ Đã thêm ${okCount}/${terms.length} negative keyword cho "${kw.keyword}"`);
        fetchKeywords();
      } else {
        showToast(results[0]?.error || "Lỗi khi thêm negative", "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Lỗi kết nối", "error");
    }
    setApplyingId(null);
  };

  const handleAdjustCpc = async (kw: KeywordInsight, newCpcMicros: number) => {
    setApplyingId(kw.id);
    try {
      const res = await fetch("/api/improvements/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: co,
          applyPayload: {
            action: "UPDATE_KEYWORD_CPC",
            resourceName: kw.criterionResourceName,
            newCpcMicros,
          },
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`✅ Đã cập nhật CPC cho "${kw.keyword}"`);
        fetchKeywords();
      } else {
        showToast(json.error || "Lỗi khi cập nhật CPC", "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Lỗi kết nối", "error");
    }
    setApplyingId(null);
  };

  const keywords = data?.keywords ?? [];
  const campaigns = Array.from(new Map(keywords.map(k => [k.campaignId, k.campaignName])).entries());
  const filteredKeywords = campaignFilter === "ALL" ? keywords : keywords.filter(k => k.campaignId === campaignFilter);
  const visibleCampaignPacing = campaigns
    .map(([id]) => pacingByCampaign.get(id))
    .filter((p): p is CampaignPacing => !!p)
    .sort((a, b) => Math.abs(b.actualPct - b.expectedPct) - Math.abs(a.actualPct - a.expectedPct));

  const total = keywords.length;
  const relevantCount = keywords.filter(k => k.intentMatch === "relevant").length;
  const avgQS = (() => {
    const withQS = keywords.filter(k => k.qualityScore !== null);
    if (withQS.length === 0) return null;
    return withQS.reduce((s, k) => s + (k.qualityScore ?? 0), 0) / withQS.length;
  })();
  const avgCpc = total > 0 ? keywords.reduce((s, k) => s + k.currentCpc, 0) / total : 0;
  const savings = keywords
    .filter(k => k.budgetImpact === "over_budget")
    .reduce((s, k) => s + Math.max(0, (k.currentCpc - k.suggestedMaxCpc) * k.clicks), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Tổng từ khóa" value={total.toLocaleString("vi-VN")} />
        <SummaryCard
          label="Phù hợp ý định"
          value={total > 0 ? `${Math.round((relevantCount / total) * 100)}%` : "—"}
          sub={`${relevantCount}/${total} từ khóa`}
        />
        <SummaryCard label="QS trung bình" value={avgQS !== null ? avgQS.toFixed(1) : "—"} />
        <SummaryCard label="CPC trung bình" value={`₫${Math.round(avgCpc).toLocaleString("vi-VN")}`} />
        <SummaryCard label="Có thể tiết kiệm/tháng" value={`₫${Math.round(savings * 30).toLocaleString("vi-VN")}`} sub="ước tính từ CPC vượt mức" />
      </div>

      {visibleCampaignPacing.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Nhịp chi ngân sách tháng này theo chiến dịch (dữ liệu thật từ Google Ads):
          </p>
          <div className="flex flex-wrap gap-2">
            {visibleCampaignPacing.map(p => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
                title={`Chi ₫${p.spent.toLocaleString("vi-VN")} / ₫${p.budget.toLocaleString("vi-VN")} — thực tế ${p.actualPct}% so với kỳ vọng ${p.expectedPct}% theo ngày trong tháng`}
              >
                <span className="max-w-[160px] truncate font-medium text-foreground">{p.name}</span>
                <span className={cn("rounded-full px-2 py-0.5 font-medium", PACING_STYLE[p.status])}>
                  {p.actualPct}%/{p.expectedPct}% — {PACING_LABEL[p.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          value={campaignFilter}
          onChange={e => setCampaignFilter(e.target.value)}
        >
          <option value="ALL">Tất cả chiến dịch</option>
          {campaigns.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          value={intentFilter}
          onChange={e => setIntentFilter(e.target.value as IntentMatch | "ALL")}
        >
          {INTENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          value={matchTypeFilter}
          onChange={e => setMatchTypeFilter(e.target.value as KwMatchType | "ALL")}
        >
          {MATCH_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={fetchKeywords}
          className="ml-auto h-9 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted"
        >
          Làm mới
        </button>
      </div>

      <KeywordTable
        keywords={filteredKeywords}
        loading={loading}
        applyingId={applyingId}
        onAddNegative={handleAddNegative}
        onAdjustCpc={handleAdjustCpc}
      />
    </div>
  );
}
