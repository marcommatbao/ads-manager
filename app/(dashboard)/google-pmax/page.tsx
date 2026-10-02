"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Zap, AlertTriangle, Sparkles, ChevronDown, ChevronUp, Lightbulb, FileEdit } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdsStore } from "@/store/useAdsStore";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useToast } from "@/components/Toast";
import { PmaxXrayView } from "@/components/pmax/PmaxXrayView";
import { PmaxExperimentView } from "@/components/pmax/PmaxExperimentView";
import { PmaxAssetsView } from "@/components/pmax/PmaxAssetsView";
import { companyIds, companyLabel } from "@/lib/companies/registry";

interface PMaxDateRange { from: string; to: string }

// ============================================================
// PMax Insights 2.0 — cả 4 tab đều live: Tổng quan + Khám phá (Stage 1),
// AI PMax Advisor + Hành động nháp (Stage 2, xem commit caddc25 và các bản
// sau đó — f60b337 thêm áp dụng ngân sách thật, c21ff71 sửa confidence).
// Đợt 10a: thêm tab "🩻 X-quang" (deep link `?tab=xray` từ thẻ "PMax" ở
// trang Tổng quan, xem lib/overview/health.ts) — nội dung ở components/pmax/PmaxXrayView.tsx.
// ============================================================

// ── Types (mirrors lib/pmax-insights/types.ts — redeclared locally,
// matching this codebase's existing convention of not importing server
// lib types into client pages) ──

type RecommendationStatus = "expand" | "test" | "protect" | "review";

const STATUS_LABEL: Record<RecommendationStatus, string> = {
  expand: "Có thể mở rộng",
  test: "Nên test",
  protect: "Giữ hiệu quả",
  review: "Cần xem lại",
};
const STATUS_COLOR: Record<RecommendationStatus, string> = {
  expand: "bg-emerald-50 text-emerald-700 border-emerald-200",
  test: "bg-blue-50 text-blue-700 border-blue-200",
  protect: "bg-violet-50 text-violet-700 border-violet-200",
  review: "bg-amber-50 text-amber-700 border-amber-200",
};

interface CampaignOverviewMetrics {
  totalDays: number; recentDays: number;
  spendRecent: number; spendTotal: number;
  conversionsRecent: number; conversionsTotal: number;
  revenueRecent: number; revenueTotal: number;
  clicksRecent: number; clicksTotal: number;
  roasRecent: number; roasTotal: number;
  trendPct: number;
  trendLowBaseline: boolean;
}
interface AssetCoverage {
  headlineCount: number; descriptionCount: number; imageCount: number; videoCount: number; logoCount: number;
  notEligibleCount: number;
  gaps: string[];
}
interface CampaignScores { performance: number; expansionReadiness: number; confidence: number }
interface CampaignOverview {
  campaignId: string; campaignName: string; campaignStatus: string;
  metrics: CampaignOverviewMetrics;
  channelMix: { channel: string; costMicros: number; impressions: number; pct: number }[];
  assetCoverage: AssetCoverage;
  scores: CampaignScores;
  recommendationStatus: RecommendationStatus;
  aiSummaryLine: string | null;
}

type PMaxRootCause = "search_intent" | "asset_coverage" | "creative_quality" | "structure" | "insufficient_data";
const ROOT_CAUSE_LABEL: Record<PMaxRootCause, string> = {
  search_intent: "Search intent", asset_coverage: "Độ phủ Asset", creative_quality: "Chất lượng creative",
  structure: "Cấu trúc campaign/asset group", insufficient_data: "Chưa đủ dữ liệu",
};
interface PMaxDiagnosis {
  entityType: "campaign" | "asset_group"; entityId: string;
  whatsWorking: string[]; whatsLimiting: string[]; mainContributor: string;
  safeToScale: boolean | null; needsProtection: boolean; rootCause: PMaxRootCause;
  confidenceNote: string; aiGenerated: boolean; generatedAt: string;
}

// ── Stage 2 types ──

type RecommendationType = "scale_carefully" | "refine_search_themes" | "refresh_creative" | "protect_efficiency" | "hold_monitor";
const REC_TYPE_LABEL: Record<RecommendationType, string> = {
  scale_carefully: "Mở rộng thận trọng", refine_search_themes: "Tinh chỉnh Search Theme",
  refresh_creative: "Làm mới Creative", protect_efficiency: "Bảo toàn hiệu quả", hold_monitor: "Theo dõi thêm",
};
type RecommendationPriority = "now" | "test" | "watch";
const PRIORITY_LABEL: Record<RecommendationPriority, string> = { now: "Làm ngay", test: "Nên test", watch: "Theo dõi thêm" };
const PRIORITY_COLOR: Record<RecommendationPriority, string> = {
  now: "bg-red-50 text-red-700 border-red-200", test: "bg-blue-50 text-blue-700 border-blue-200", watch: "bg-slate-100 text-slate-600 border-slate-200",
};
type RecommendationReviewState = "unread" | "reviewed" | "drafted" | "dismissed" | "watching" | "applied";
const REVIEW_STATE_LABEL: Record<RecommendationReviewState, string> = {
  applied: "Đã áp dụng",
  unread: "Chưa xem", reviewed: "Đã xem", drafted: "Đã tạo nháp", dismissed: "Bỏ qua", watching: "Theo dõi thêm",
};

interface PMaxRecommendation {
  id: string; company: string; campaignId: string; campaignName: string;
  assetGroupId: string | null; searchCategoryLabel: string | null;
  type: RecommendationType; priority: RecommendationPriority;
  title: string; reason: string; evidence: string[]; confidencePct: number;
  expectedImpact: string; guardrail: string;
  reviewState: RecommendationReviewState;
  /** Mức ngân sách do LUẬT tính ở server, không phải AI sinh ra. */
  budgetProposal?: { currentVnd: number; proposedVnd: number; deltaPct: number; basis: string[] } | null;
  budgetBlockedReason?: string | null;
  createdAt: string; reviewedAt: string | null; reviewedBy: string | null;
}

type DraftActionType = "search_themes" | "creative_brief";
interface DraftSearchThemeItem { theme: string; intent: string; action: string; reason: string }
interface DraftSearchThemesContent { campaignId: string; campaignName: string; assetGroupId: string | null; items: DraftSearchThemeItem[] }
interface DraftCreativeBriefContent {
  campaignId: string; campaignName: string; assetGroupId: string | null;
  productAngle: string; uspDirection: string; messageDirection: string; refreshReason: string; assetNeed: string;
}
interface PMaxDraftAction {
  id: string; company: string; recommendationId: string | null;
  type: DraftActionType; content: DraftSearchThemesContent | DraftCreativeBriefContent;
  createdAt: string; createdBy: string;
}

// ── Helpers ──

function fmtVND(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `₫${(v / 1_000_000).toFixed(1)}Tr`;
  if (Math.abs(v) >= 1_000) return `₫${Math.round(v / 1000)}K`;
  return `₫${Math.round(v).toLocaleString("vi-VN")}`;
}

const CHANNEL_META: Record<string, { icon: string; bar: string }> = {
  "Google Search": { icon: "🔍", bar: "bg-blue-500" },
  "Search Partners": { icon: "🤝", bar: "bg-blue-300" },
  "Display Network": { icon: "🖼️", bar: "bg-emerald-500" },
  "YouTube": { icon: "▶️", bar: "bg-red-500" },
  "Gmail": { icon: "✉️", bar: "bg-amber-500" },
  "Discover": { icon: "✨", bar: "bg-pink-400" },
  "Google TV": { icon: "📺", bar: "bg-violet-500" },
  "Mixed": { icon: "⚡", bar: "bg-slate-400" },
};

// ── Diagnosis block (shared by campaign + asset group drill-down) ──

function DiagnosisBlock({ diagnosis }: { diagnosis: PMaxDiagnosis }) {
  return (
    <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-900 space-y-2">
      <p className="font-bold text-indigo-700 flex items-center gap-1">
        <Sparkles className="h-3 w-3" /> Chẩn đoán AI{!diagnosis.aiGenerated && " (phân tích cơ bản — AI không khả dụng)"}
      </p>
      <div>
        <p className="font-semibold">Đang hoạt động tốt:</p>
        <ul className="list-disc list-inside">{diagnosis.whatsWorking.map((w, i) => <li key={i}>{w}</li>)}</ul>
      </div>
      <div>
        <p className="font-semibold">Đang hạn chế tăng trưởng:</p>
        <ul className="list-disc list-inside">{diagnosis.whatsLimiting.map((w, i) => <li key={i}>{w}</li>)}</ul>
      </div>
      <p><span className="font-semibold">Nguồn đóng góp chính:</span> {diagnosis.mainContributor}</p>
      <p><span className="font-semibold">Vấn đề chính:</span> {ROOT_CAUSE_LABEL[diagnosis.rootCause]}</p>
      <p>
        <span className="font-semibold">An toàn để scale:</span>{" "}
        {diagnosis.safeToScale === null ? "Chưa đủ dữ liệu để kết luận" : diagnosis.safeToScale ? "Có" : "Chưa"}
        {diagnosis.needsProtection && " — nên giữ hiệu quả trước khi mở rộng"}
      </p>
      <p className="italic text-indigo-600">{diagnosis.confidenceNote}</p>
    </div>
  );
}

// ── Campaign card (Tổng quan tab) ──

function CampaignCard({ campaign, company, dateRange, onChanged }: { campaign: CampaignOverview; company: string; dateRange: PMaxDateRange; onChanged?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  // ── Bật/tắt campaign PMax ──────────────────────────────────────────────
  // Dùng lại /api/google/campaigns/[id]/status — route đó KHÔNG lọc theo loại
  // campaign nên chạy được cho cả PMax. Trước bản này không có chỗ nào trong
  // tool bật/tắt được PMax: /google-search lọc riêng Search, còn trang này chỉ
  // đọc. Tạo được mà không bật được thì vòng làm việc đứt.
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const isOn = /ENABLED|ACTIVE/i.test(campaign.campaignStatus);

  const toggleStatus = async () => {
    // Bật PMax = bắt đầu tiêu tiền trên SÁU kênh cùng lúc (Search, Display,
    // YouTube, Gmail, Discover, Maps). Hỏi lại — không có nút hoàn tác.
    if (!isOn && !confirm(
      `Bật "${campaign.campaignName}"?\n\nPerformance Max sẽ BẮT ĐẦU TIÊU TIỀN và tự phân bổ qua Search, Display, YouTube, Gmail, Discover, Maps.`,
    )) return;
    setStatusBusy(true); setStatusErr(null);
    try {
      const res = await fetch(`/api/google/campaigns/${campaign.campaignId}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isOn ? "PAUSE" : "ACTIVE", company }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? "Không đổi được trạng thái");
      onChanged?.();
    } catch (e) {
      setStatusErr(e instanceof Error ? e.message : "Lỗi không rõ");
    } finally { setStatusBusy(false); }
  };
  const [diagnosis, setDiagnosis] = useState<PMaxDiagnosis | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  // Drop any cached diagnosis when the selected range changes — otherwise
  // an already-open card keeps showing a diagnosis computed for the old
  // range after the user picks a new one.
  useEffect(() => { setDiagnosis(null); setDiagError(null); }, [dateRange.from, dateRange.to]);

  const loadDiagnosis = async () => {
    if (diagnosis || loadingDiag) return;
    setLoadingDiag(true);
    setDiagError(null);
    try {
      const res = await fetch(`/api/google/pmax/diagnosis?company=${company}&campaignId=${campaign.campaignId}&from=${dateRange.from}&to=${dateRange.to}`);
      const json = await res.json();
      if (json.success) setDiagnosis(json.data);
      else setDiagError(json.error ?? "Không thể tạo chẩn đoán");
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setLoadingDiag(false);
    }
  };

  const m = campaign.metrics;
  const topChannels = campaign.channelMix.slice(0, 3);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate" title={campaign.campaignName}>{campaign.campaignName}</p>
            <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", isOn ? "bg-emerald-500" : "bg-slate-300")} />
              {campaign.campaignStatus}
            </p>
            {statusErr && <p className="text-[10px] text-red-600 mt-0.5">❌ {statusErr}</p>}
          </div>
          <button onClick={toggleStatus} disabled={statusBusy}
            className={cn("shrink-0 rounded px-2 py-1 text-[10px] font-bold disabled:opacity-50",
              isOn ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-emerald-600 text-white hover:bg-emerald-700")}>
            {statusBusy ? "..." : isOn ? "⏸ Tạm dừng" : "▶ Bật"}
          </button>
          <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold", STATUS_COLOR[campaign.recommendationStatus])}>
            {STATUS_LABEL[campaign.recommendationStatus]}
          </span>
        </div>

        {/* Bỏ khối "Doanh thu tracking (Nd)" + dòng % xu hướng theo yêu cầu
            17/09/2026 — số này là doanh thu theo tracking Google Ads, chưa đối
            soát Odoo, nên không dùng để ra quyết định. Dữ liệu vẫn được tính và
            vẫn vào phần Chẩn đoán AI; chỉ không hiện trên thẻ nữa.
            grid-cols-1 thay vì giữ 2 cột với một ô trống. */}
        <div className="grid grid-cols-1 gap-3 mt-3 text-xs">
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Conversions ({m.totalDays}d)</p>
            <p className="text-base font-bold text-slate-800">{m.conversionsTotal}</p>
            <p className="text-[10px] text-slate-400">ROAS {m.roasTotal}x · Chi {fmtVND(m.spendTotal)}</p>
          </div>
        </div>

        {topChannels.length > 0 && (
          <div className="mt-3 space-y-1">
            {topChannels.map((c) => {
              const meta = CHANNEL_META[c.channel] ?? { icon: "📊", bar: "bg-slate-400" };
              return (
                <div key={c.channel} className="flex items-center gap-2 text-[10px]">
                  <span className="w-24 shrink-0 truncate">{meta.icon} {c.channel}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                    <div className={cn("h-1.5 rounded-full", meta.bar)} style={{ width: `${c.pct}%` }} />
                  </div>
                  <span className="w-10 text-right font-semibold text-slate-500">{c.pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span>Performance {campaign.scores.performance}</span>
            <span>Expansion {campaign.scores.expansionReadiness}</span>
            <span>Confidence {campaign.scores.confidence}</span>
          </div>
          <button
            onClick={() => { setExpanded((e) => !e); if (!expanded) loadDiagnosis(); }}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            {loadingDiag ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Chẩn đoán AI {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {expanded && diagnosis && <DiagnosisBlock diagnosis={diagnosis} />}
        {expanded && diagError && <p className="mt-2 text-[11px] text-red-500">⚠️ {diagError}</p>}
        {campaign.assetCoverage.gaps.length > 0 && (
          <p className="mt-2 text-[10px] text-amber-600">⚠️ {campaign.assetCoverage.gaps[0]}{campaign.assetCoverage.gaps.length > 1 && ` (+${campaign.assetCoverage.gaps.length - 1})`}</p>
        )}
      </div>
    </div>
  );
}


// ── Recommendation card (AI PMax Advisor tab) ──

function RecommendationCard({ rec, company, dateRange, onStateChange, onDraftCreated }: {
  rec: PMaxRecommendation; company: string; dateRange: PMaxDateRange;
  onStateChange: (id: string, state: RecommendationReviewState) => void;
  onDraftCreated: () => void;
}) {
  const [drafting, setDrafting] = useState<DraftActionType | null>(null);
  const [applying, setApplying] = useState(false);
  const [confirmBudget, setConfirmBudget] = useState(false);
  const { toast } = useToast();

  const fmtVndFull = (n: number) => `₫${n.toLocaleString("vi-VN")}`;

  // Áp dụng ngân sách: client CHỈ gửi id, server tự tính lại con số từ dữ liệu
  // tươi rồi mới ghi. Không gửi số lên để không ai đặt được ngân sách tùy ý.
  const applyBudget = async () => {
    setApplying(true);
    try {
      const res = await fetch("/api/google/pmax/apply-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: rec.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        toast({
          title: "❌ Không áp dụng được",
          description: json.error ?? `HTTP ${res.status}`,
          variant: "error",
        });
        return;
      }
      toast({
        title: `✅ Đã đổi ngân sách ${fmtVndFull(json.beforeVnd)} → ${fmtVndFull(json.afterVnd)}`,
        description: "Theo dõi ROAS 7–14 ngày tới trước khi đổi tiếp.",
      });
      onStateChange(rec.id, "applied");
    } catch {
      toast({ title: "❌ Lỗi kết nối khi áp dụng ngân sách", variant: "error" });
    } finally {
      setApplying(false);
      setConfirmBudget(false);
    }
  };

  // Both of these applied their optimistic UI state and never looked at the
  // response, so a 403 or a store write failure left the card reading
  // "đã duyệt" / "đã tạo nháp" while the server had recorded nothing. The
  // optimistic update now rolls back when the write really failed.
  const setState = async (state: RecommendationReviewState) => {
    const previous = rec.reviewState;
    onStateChange(rec.id, state); // optimistic
    try {
      const res = await fetch("/api/google/pmax/advisor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rec.id, reviewState: state }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        onStateChange(rec.id, previous);
        toast({ title: "❌ Không lưu được trạng thái", description: json.error ?? `HTTP ${res.status}`, variant: "error" });
      }
    } catch {
      onStateChange(rec.id, previous);
      toast({ title: "❌ Lỗi kết nối khi lưu trạng thái", variant: "error" });
    }
  };

  const createDraft = async (type: DraftActionType) => {
    setDrafting(type);
    try {
      const res = await fetch("/api/google/pmax/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Same window the recommendation itself was scored on, so the draft
        // doesn't propose themes from a period the card never looked at.
        body: JSON.stringify({ company, type, campaignId: rec.campaignId, assetGroupId: rec.assetGroupId, recommendationId: rec.id, from: dateRange.from, to: dateRange.to }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        toast({ title: "❌ Không tạo được hành động nháp", description: json.error ?? `HTTP ${res.status}`, variant: "error" });
        return;
      }
      onStateChange(rec.id, "drafted");
      onDraftCreated();
      toast({ title: "✅ Đã tạo hành động nháp" });
    } catch {
      toast({ title: "❌ Lỗi kết nối khi tạo hành động nháp", variant: "error" });
    } finally {
      setDrafting(null);
    }
  };

  return (
    <div className={cn("rounded-xl border bg-white shadow-sm p-4 space-y-2.5", rec.reviewState === "dismissed" && "opacity-50")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{rec.title}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{rec.campaignName} · {REC_TYPE_LABEL[rec.type]}</p>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold", PRIORITY_COLOR[rec.priority])}>
          {PRIORITY_LABEL[rec.priority]}
        </span>
      </div>

      <p className="text-xs text-slate-700">{rec.reason}</p>

      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase">Bằng chứng</p>
        <ul className="list-disc list-inside text-[11px] text-slate-700">{rec.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div><p className="text-[10px] font-bold text-slate-400 uppercase">Tác động kỳ vọng</p><p className="text-slate-700">{rec.expectedImpact}</p></div>
        <div><p className="text-[10px] font-bold text-slate-400 uppercase">Điều kiện / Guardrail</p><p className="text-slate-700">{rec.guardrail}</p></div>
      </div>

      {/* Xác nhận hai bước trước khi ghi tiền thật lên tài khoản Google Ads.
          Hiện đúng số cũ, số mới, căn cứ và điều sẽ phải theo dõi sau đó. */}
      {confirmBudget && rec.budgetProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !applying && setConfirmBudget(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-base font-bold text-slate-800">Xác nhận đổi ngân sách</h4>
            <p className="mt-1 text-xs text-slate-500 truncate" title={rec.campaignName}>{rec.campaignName}</p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Hiện tại</span>
                <span className="font-semibold text-slate-700">{fmtVndFull(rec.budgetProposal.currentVnd)}/ngày</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-sm">
                <span className="text-slate-500">Sau khi đổi</span>
                <span className="font-black text-emerald-700">
                  {fmtVndFull(rec.budgetProposal.proposedVnd)}/ngày (+{rec.budgetProposal.deltaPct}%)
                </span>
              </div>
            </div>

            <p className="mt-3 text-[11px] font-semibold text-slate-500 uppercase">Căn cứ</p>
            <ul className="mt-1 space-y-0.5">
              {rec.budgetProposal.basis.map((b, i) => (
                <li key={i} className="text-[11px] text-slate-600">· {b}</li>
              ))}
            </ul>

            <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
              Đây là thay đổi <strong>thật</strong> trên tài khoản Google Ads. Sau khi đổi: {rec.guardrail}
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmBudget(false)}
                disabled={applying}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                onClick={applyBudget}
                disabled={applying}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {applying ? "Đang ghi lên Google Ads…" : "Xác nhận đổi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {rec.type === "scale_carefully" && (rec.budgetProposal || rec.budgetBlockedReason) && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          {rec.budgetProposal ? (
            <>
              <p className="text-xs font-bold text-emerald-900">
                {fmtVndFull(rec.budgetProposal.currentVnd)}/ngày → {fmtVndFull(rec.budgetProposal.proposedVnd)}/ngày
                <span className="ml-1 font-semibold">(+{rec.budgetProposal.deltaPct}%)</span>
              </p>
              <ul className="mt-1 space-y-0.5">
                {rec.budgetProposal.basis.map((b, i) => (
                  <li key={i} className="text-[10px] text-emerald-800">· {b}</li>
                ))}
              </ul>
              <p className="mt-1 text-[10px] text-emerald-700/80">
                Mức này do hệ thống tính từ số liệu thật, không phải AI ước lượng.
              </p>
            </>
          ) : (
            /* Nói lý do thay vì hiện một nút bấm không được. */
            <p className="text-[10px] text-slate-500">Chưa đề xuất được mức ngân sách: {rec.budgetBlockedReason}</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-[10px] text-slate-500">Độ tin cậy {rec.confidencePct}% · <span className="font-semibold text-slate-600">{REVIEW_STATE_LABEL[rec.reviewState]}</span></span>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {rec.reviewState === "unread" && (
            <button onClick={() => setState("reviewed")} className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-50">Đã xem</button>
          )}
          {/* Nút chỉ hiện khi LUẬT tính được con số (budget-rule.ts) — không có
              số thì hiện lý do ở khối trên, không hiện nút bấm không được. */}
          {rec.type === "scale_carefully" && rec.budgetProposal && rec.reviewState !== "applied" && (
            <button
              onClick={() => setConfirmBudget(true)}
              disabled={applying}
              className="text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded disabled:opacity-50 flex items-center gap-1"
            >
              {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Áp dụng ngân sách
            </button>
          )}
          {rec.reviewState !== "dismissed" && (
            <button onClick={() => setState("dismissed")} className="text-[10px] font-semibold text-slate-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50">Bỏ qua</button>
          )}
          {rec.reviewState !== "watching" && (
            <button onClick={() => setState("watching")} className="text-[10px] font-semibold text-amber-600 hover:text-amber-700 px-2 py-1 rounded hover:bg-amber-50">Theo dõi thêm</button>
          )}
          {(rec.type === "refine_search_themes" || rec.type === "hold_monitor") && (
            <button onClick={() => createDraft("search_themes")} disabled={drafting !== null} className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50 flex items-center gap-1">
              {drafting === "search_themes" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileEdit className="h-3 w-3" />} Nháp Search Theme
            </button>
          )}
          {(rec.type === "refresh_creative" || rec.type === "protect_efficiency") && (
            <button onClick={() => createDraft("creative_brief")} disabled={drafting !== null} className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50 flex items-center gap-1">
              {drafting === "creative_brief" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileEdit className="h-3 w-3" />} Nháp Creative Brief
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Draft action card (Hành động nháp tab) ──

function DraftActionCard({ draft }: { draft: PMaxDraftAction }) {
  if (draft.type === "search_themes") {
    const content = draft.content as DraftSearchThemesContent;
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-700">📝 Draft Search Themes — {content.campaignName}</p>
          <span className="text-[9px] text-slate-400">{new Date(draft.createdAt).toLocaleString("vi-VN")}</span>
        </div>
        <div className="space-y-1.5">
          {content.items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] bg-slate-50 rounded px-2 py-1.5">
              <span className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold",
                item.action === "add" ? "bg-emerald-100 text-emerald-700" : item.action === "remove_redundant" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
              )}>
                {item.action === "add" ? "Thêm" : item.action === "remove_redundant" ? "Loại bỏ" : "Thu hẹp"}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-700">{item.theme} <span className="text-slate-400 font-normal">({item.intent})</span></p>
                <p className="text-slate-500">{item.reason}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-slate-400 italic">Chỉ là đề xuất — chưa đẩy lên Google Ads, cần thao tác thủ công.</p>
      </div>
    );
  }

  const content = draft.content as DraftCreativeBriefContent;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-700">🎨 Draft Creative Brief — {content.campaignName}</p>
        <span className="text-[9px] text-slate-400">{new Date(draft.createdAt).toLocaleString("vi-VN")}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
        <div><p className="font-bold text-slate-400 uppercase text-[9px]">Product Angle</p><p className="text-slate-600">{content.productAngle}</p></div>
        <div><p className="font-bold text-slate-400 uppercase text-[9px]">USP Direction</p><p className="text-slate-600">{content.uspDirection}</p></div>
        <div><p className="font-bold text-slate-400 uppercase text-[9px]">Message Direction</p><p className="text-slate-600">{content.messageDirection}</p></div>
        <div><p className="font-bold text-slate-400 uppercase text-[9px]">Vì sao cần làm mới</p><p className="text-slate-600">{content.refreshReason}</p></div>
      </div>
      <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded bg-violet-100 text-violet-700">
        Cần: {content.assetNeed === "image_heavy" ? "Ưu tiên hình ảnh" : content.assetNeed === "video_heavy" ? "Ưu tiên video" : content.assetNeed === "text_heavy" ? "Ưu tiên text" : "Cân bằng"}
      </span>
    </div>
  );
}

// ── Page ──

const TABS = [
  { id: "overview", label: "Tổng quan" },
  { id: "xray", label: "🩻 X-quang" },
  { id: "experiment", label: "🧪 Thí nghiệm" },
  { id: "assets", label: "🎨 Asset" },
  { id: "advisor", label: "AI PMax Advisor" },
  { id: "drafts", label: "Hành động nháp" },
] as const;
type TabId = typeof TABS[number]["id"];

function initialTab(sp: URLSearchParams): TabId {
  const t = sp.get("tab");
  return TABS.some((x) => x.id === t) ? (t as TabId) : "overview";
}

// useSearchParams bắt buộc Suspense boundary khi build tĩnh (xem
// node_modules/next/dist/docs/.../use-search-params.md, cùng mẫu /do-luong).
export default function PMaxInsightsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>}>
      <PMaxInsightsPageInner />
    </Suspense>
  );
}

function PMaxInsightsPageInner() {
  const dateRange = useAdsStore((s) => s.dateRange);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [company, setCompany] = useState<string>("MBC");
  // Deep link `?tab=xray` (thẻ cảnh báo ở Tổng quan) đọc Ở LẦN RENDER ĐẦU —
  // sau đó người dùng tự đổi tab bằng thanh tab, không đồng bộ ngược lại URL
  // (cùng quy ước với /do-luong: chỉ platform/tab đọc 1 lần, range mới ghi ngược).
  const [tab, setTab] = useState<TabId>(() => initialTab(searchParams));

  function changeTab(next: TabId) {
    setTab(next);
    // Xoá query cũ khi rời tab X-quang — from/to của nó không có nghĩa ở tab khác.
    if (next !== "xray" && searchParams.toString()) router.replace("/google-pmax", { scroll: false });
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignOverview[]>([]);


  const [recommendations, setRecommendations] = useState<PMaxRecommendation[]>([]);
  const [loadingAdvisor, setLoadingAdvisor] = useState(false);
  const [advisorLoaded, setAdvisorLoaded] = useState(false);

  const [drafts, setDrafts] = useState<PMaxDraftAction[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/google/pmax/overview?company=${company}&from=${dateRange.from}&to=${dateRange.to}`);
      const json = await res.json();
      if (json.success) {
        setCampaigns(json.data);
      } else {
        setError(json.error ?? "Không thể tải dữ liệu");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi kết nối tới Google Ads");
    } finally {
      setLoading(false);
    }
  }, [company, dateRange.from, dateRange.to]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const loadAdvisor = useCallback(() => {
    setLoadingAdvisor(true);
    fetch(`/api/google/pmax/advisor?company=${company}&from=${dateRange.from}&to=${dateRange.to}`)
      .then((r) => r.json())
      .then((json) => { if (json.success) { setRecommendations(json.data); setAdvisorLoaded(true); } })
      .finally(() => setLoadingAdvisor(false));
  }, [company, dateRange.from, dateRange.to]);

  const loadDrafts = useCallback(() => {
    setLoadingDrafts(true);
    fetch(`/api/google/pmax/drafts?company=${company}`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setDrafts(json.data); })
      .finally(() => setLoadingDrafts(false));
  }, [company]);

  // Lazy per-tab load — Advisor calls Gemini per campaign, only fetch when
  // the tab is actually opened, not on every page load.
  useEffect(() => { if (tab === "advisor") loadAdvisor(); }, [tab, loadAdvisor]);
  useEffect(() => { if (tab === "drafts") loadDrafts(); }, [tab, loadDrafts]);
  useEffect(() => { setAdvisorLoaded(false); setRecommendations([]); setDrafts([]); }, [company]);
  // Drafts are persisted actions, independent of the viewing window — only
  // the Advisor's live recommendations need to re-run for a new range.
  useEffect(() => { setAdvisorLoaded(false); setRecommendations([]); }, [dateRange.from, dateRange.to]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 shadow-lg shadow-blue-200">
              <Zap className="h-5 w-5 text-white" />
            </div>
            Performance Max Insights
          </h1>
          <p className="text-sm text-slate-500 mt-1">Insights → AI Diagnosis → AI Advisor cho campaign Performance Max</p>
          <p className="text-[11px] text-amber-600 mt-1">
            ⚠️ Doanh thu/conversions ở đây là theo tracking quảng cáo Google Ads — chưa đối soát với Odoo.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker />
          {companyIds().map((c) => (
            <button
              key={c}
              onClick={() => setCompany(c)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold transition-all border-2",
                company === c ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-500 hover:border-slate-300"
              )}
            >
              {c === "MBC" ? "🌐 Mắt Bão (MBC)" : c === "MBI" ? "🧾 Mắt Bão Invoice" : companyLabel(c)}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-all",
              tab === t.id ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "xray" ? (
        // Dữ liệu X-quang có nguồn/khoảng ngày riêng (xem PmaxXrayView) — không
        // phụ thuộc `campaigns` của tab Tổng quan, nên tách khỏi 3 nhánh gate dưới.
        <PmaxXrayView company={company} />
      ) : tab === "experiment" ? (
        // Cùng lý do: tab Thí nghiệm có nguồn dữ liệu riêng (geo-experiment,
        // signals, lead quality) — không phụ thuộc `campaigns` của Tổng quan.
        <PmaxExperimentView company={company} />
      ) : tab === "assets" ? (
        // Cùng lý do: tab Asset có nguồn dữ liệu riêng (asset_group_asset,
        // asset_group_signal, campaign đã tạm dừng) — không phụ thuộc
        // `campaigns` của Tổng quan.
        <PmaxAssetsView company={company} />
      ) : loading ? (
        <div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <p className="text-xs text-red-500 mt-1">Kiểm tra cấu hình Google Ads trong Settings</p>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-10 text-center">
          <Zap className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">Không tìm thấy chiến dịch PMax đang chạy</p>
          <p className="text-xs text-slate-400 mt-1">Tài khoản {company} chưa có Performance Max campaign nào hoạt động trong 30 ngày qua.</p>
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {campaigns.map((c) => <CampaignCard key={c.campaignId} campaign={c} company={company} dateRange={dateRange} onChanged={() => void loadOverview()} />)}
            </div>
          )}

          {tab === "advisor" && (
            loadingAdvisor && !advisorLoaded ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : recommendations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
                <Lightbulb className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-500">Chưa có gợi ý nào</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {recommendations.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    rec={rec}
                    company={company}
                    dateRange={dateRange}
                    onStateChange={(id, state) => setRecommendations((prev) => prev.map((r) => r.id === id ? { ...r, reviewState: state } : r))}
                    onDraftCreated={loadDrafts}
                  />
                ))}
              </div>
            )
          )}
          {tab === "drafts" && (
            loadingDrafts ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : drafts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
                <FileEdit className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-500">Chưa có hành động nháp nào</p>
                <p className="text-xs text-slate-400 mt-1">Tạo từ recommendation card ở tab &quot;AI PMax Advisor&quot;</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {drafts.map((d) => <DraftActionCard key={d.id} draft={d} />)}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
