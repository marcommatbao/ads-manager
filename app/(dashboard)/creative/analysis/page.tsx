"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import {
  BarChart3, Sparkles, TrendingUp, Users, DollarSign,
  AlertCircle, Loader2, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton-loader";
import { cn } from "@/lib/utils";
import {
  scoreCreative,
  SCORE_DIMENSIONS,
  getScoreColor,
  getGradeEmoji,
  type CreativeScore,
} from "@/lib/creative-scorer";
import type { CreativeVariant } from "@/lib/creative-tracker";

// ─────────────────────────────────────────────
// SWR fetcher
// ─────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

function statusBadge(status: string): string {
  switch (status) {
    case "active":  return "bg-emerald-100 text-emerald-700";
    case "paused":  return "bg-amber-100 text-amber-700";
    case "retired": return "bg-slate-100 text-slate-500";
    default:        return "bg-blue-100 text-blue-700";
  }
}

function platformBadge(platform: string): string {
  return platform === "facebook"
    ? "bg-blue-100 text-blue-700"
    : "bg-orange-100 text-orange-700";
}

// ─────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon }: {
  label: string; value: string; sub?: string; icon: typeof BarChart3;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
        </div>
        <div className="flex-shrink-0 rounded-lg bg-blue-50 p-2">
          <Icon className="h-4 w-4 text-blue-600" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Circular Score
// ─────────────────────────────────────────────

function CircleScore({ score, size = 96, strokeWidth = 8 }: { score: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const colors = getScoreColor(score);
  const strokePct = (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="fill-none stroke-slate-100"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={cn("fill-none transition-all duration-700 ease-out", `stroke-current ${colors.text}`)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - strokePct}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold text-slate-900 tabular-nums">{score}</span>
        <span className="text-xs text-slate-400">/ 100</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Performance Tab
// ─────────────────────────────────────────────

function PerformanceTab() {
  const { data, error, isLoading } = useSWR<{ success: boolean; data: CreativeVariant[]; summary: Record<string, number> }>(
    "/api/creatives",
    fetcher,
    { revalidateOnFocus: false }
  );

  const creatives = data?.data ?? [];
  const totalCreatives = creatives.length;

  // Chỉ trung bình mẫu ĐÃ có số đo — mẫu chưa chạy không kéo CTR về 0.
  const measured = creatives.filter((c) => c.performance);
  const avgCtr =
    measured.length > 0
      ? (measured.reduce((sum, c) => sum + c.performance!.ctr, 0) / measured.length).toFixed(2)
      : "—";

  // Soát dữ liệu 07/10: chỉ trung bình mẫu ĐÃ được AI chấm (0 = chưa chấm, không tính như điểm thấp).
  const scored = creatives.filter((c) => c.ai_quality_score > 0);
  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, c) => sum + c.ai_quality_score * 10, 0) / scored.length)
      : 0;

  const bestPerformer = creatives.reduce<CreativeVariant | null>((best, c) => {
    if (!c.performance) return best;
    if (!best?.performance) return c;
    return c.performance.ctr > best.performance.ctr ? c : best;
  }, null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-slate-50">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        Không thể tải dữ liệu creative. Vui lòng thử lại.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Tổng creatives"
          value={String(totalCreatives)}
          icon={BarChart3}
        />
        <StatCard
          label="CTR trung bình"
          value={avgCtr === "—" ? "—" : `${avgCtr}%`}
          sub="Tất cả platforms"
          icon={TrendingUp}
        />
        <StatCard
          label="Score trung bình"
          value={avgScore > 0 ? `${avgScore}` : "—"}
          sub="AI quality score"
          icon={Sparkles}
        />
        <StatCard
          label="Hiệu suất tốt nhất"
          value={bestPerformer ? `${bestPerformer.performance!.ctr.toFixed(2)}%` : "—"}
          sub={bestPerformer?.headline?.slice(0, 20) ?? "Chưa có dữ liệu"}
          icon={Users}
        />
      </div>

      {/* Table */}
      {totalCreatives === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <BarChart3 className="h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500">Chưa có creative nào</p>
          <p className="text-xs text-slate-400 mt-1">
            Tạo ad copy từ tab "Ad Copy" và lưu vào thư viện
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Creative</th>
                  <th className="px-4 py-3 text-left">Platform</th>
                  <th className="px-4 py-3 text-right">CTR</th>
                  <th className="px-4 py-3 text-right">Lượt hiển thị</th>
                  <th className="px-4 py-3 text-right">Chi phí</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3 text-left">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {creatives.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="max-w-[200px]">
                        <p className="font-medium text-slate-900 truncate">{c.headline || "—"}</p>
                        <p className="text-xs text-slate-400 truncate">{c.product}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", platformBadge(c.platform))}>
                        {c.platform === "facebook" ? "Facebook" : "Google"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {c.performance ? `${c.performance.ctr.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {c.performance ? fmtNumber(c.performance.impressions) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {c.performance ? fmtCurrency(c.performance.spend) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.ai_quality_score > 0 ? <span className={cn(
                        "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold",
                        c.ai_quality_score >= 7
                          ? "bg-emerald-100 text-emerald-700"
                          : c.ai_quality_score >= 5
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      )}>
                        {c.ai_quality_score * 10}
                      </span> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize", statusBadge(c.status))}>
                        {c.status === "active" ? "Đang chạy" : c.status === "paused" ? "Tạm dừng" : c.status === "draft" ? "Nháp" : "Đã nghỉ"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Scoring Tab
// ─────────────────────────────────────────────

function ScoringTab() {
  const [headline, setHeadline] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [description, setDescription] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [socialProof, setSocialProof] = useState("");
  const [offer, setOffer] = useState("");
  const [hasImage, setHasImage] = useState(false);
  const [result, setResult] = useState<CreativeScore | null>(null);

  function handleScore() {
    if (!headline.trim()) return;
    const score = scoreCreative({
      headline,
      primaryText,
      description,
      hasImage,
      usp: "",
      socialProof,
      offer,
      cta: ctaText,
    });
    setResult(score);
  }

  const colors = result ? getScoreColor(result.total) : null;

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Input form */}
      <div className="w-full lg:w-[40%]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <p className="text-sm font-medium text-slate-700">Nhập thông tin creative để chấm điểm</p>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <Input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Tên miền .COM chỉ từ 99K"
              className="w-full"
            />
            <p className="text-xs text-slate-400">{headline.length}/40 ký tự tối ưu</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Nội dung chính
            </label>
            <Textarea
              value={primaryText}
              onChange={(e) => setPrimaryText(e.target.value)}
              placeholder="200,000+ doanh nghiệp Việt đã tin dùng. Đăng ký ngay hôm nay..."
              className="w-full min-h-[80px]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Mô tả (description)
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Đăng ký nhanh, dùng ngay"
              className="w-full"
            />
            <p className="text-xs text-slate-400">{description.length}/30 ký tự tối ưu</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">CTA</label>
            <Input
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              placeholder="Đăng ký ngay"
              className="w-full"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Social proof
            </label>
            <Input
              value={socialProof}
              onChange={(e) => setSocialProof(e.target.value)}
              placeholder="200,000+ doanh nghiệp tin dùng"
              className="w-full"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Offer</label>
            <Input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="Giảm 50%, tặng kèm SSL"
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="has-image"
              type="checkbox"
              checked={hasImage}
              onChange={(e) => setHasImage(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-amber-500"
            />
            <label htmlFor="has-image" className="text-sm text-slate-600">
              Có kèm ảnh / video
            </label>
          </div>

          <Button
            onClick={handleScore}
            disabled={!headline.trim()}
            className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 h-10"
          >
            <Search className="h-4 w-4 mr-2" />
            Chấm điểm
          </Button>
        </div>
      </div>

      {/* Result panel */}
      <div className="w-full lg:w-[60%]">
        {result === null ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
            <Sparkles className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-500">Chưa có kết quả</p>
            <p className="text-xs text-slate-400 mt-1">
              Nhập thông tin và nhấn "Chấm điểm"
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Overall score */}
            <div className={cn("rounded-xl border p-5", colors!.bg, colors!.border)}>
              <div className="flex items-center gap-5">
                <CircleScore score={result.total} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getGradeEmoji(result.grade)}</span>
                    <span className={cn("text-lg font-bold", colors!.text)}>
                      Hạng {result.grade}
                    </span>
                  </div>
                  <p className={cn("mt-0.5 text-sm font-medium", colors!.text)}>
                    CTR ước tính: {result.ctrEstimate}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Điểm tổng: {result.total}/100
                  </p>
                </div>
              </div>
            </div>

            {/* Dimension breakdown */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Phân tích chi tiết</p>
              {SCORE_DIMENSIONS.map((dim) => {
                const raw = result.scores[dim.key];
                const pct = Math.round((raw / dim.max) * 100);
                return (
                  <div key={dim.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-600">{dim.label}</span>
                      <span className="tabular-nums text-slate-500">
                        {raw}/{dim.max}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", dim.color)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recommendations */}
            {result.suggestions.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                <p className="text-sm font-semibold text-amber-800">Gợi ý cải thiện</p>
                <ul className="space-y-1.5">
                  {result.suggestions.map((s, i) => (
                    <li key={i} className="text-sm text-amber-700 leading-relaxed">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

type TabId = "performance" | "scoring";

const TABS: Array<{ id: TabId; label: string; icon: typeof BarChart3 }> = [
  { id: "performance", label: "Hiệu suất", icon: BarChart3 },
  { id: "scoring",     label: "Chấm điểm", icon: Sparkles },
];

export default function AnalysisPage() {
  const [activeTab, setActiveTab] = useState<TabId>("performance");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Phân tích Creative</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Theo dõi hiệu suất và chấm điểm creative trước khi chạy
        </p>
      </div>

      {/* Tab Nav */}
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              activeTab === id
                ? "bg-amber-500 text-amber-950 shadow-sm"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "performance" ? <PerformanceTab /> : <ScoringTab />}
    </div>
  );
}
