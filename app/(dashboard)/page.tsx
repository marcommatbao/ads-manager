"use client";

import { companyIds, companyLabel, hasModule, orderedCompanyIds } from "@/lib/companies/registry";
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import MetricsCard from "@/components/MetricsCard";
import ChartPanel from "@/components/ChartPanel";
import CampaignTable from "@/components/CampaignTable";
import { useToast } from "@/components/Toast";
import { useAdsStore, detectCompany, type CompanyFilter } from "@/store/useAdsStore";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  DollarSign,
  TrendingUp,
  Target,
  MousePointer,
  Eye,
  PointerIcon,
  Megaphone,
  ArrowRight,
  Settings,
  Wifi,
  Sunrise,
  X,
  RefreshCw,
  AlertTriangle,
  Building,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Campaign, ReportData, DashboardSummary } from "@/types/ads.types";
import { DateRangePicker } from "@/components/DateRangePicker";
import { forecastMonthlySpend, TREND_CONFIG, type SpendForecast } from "@/lib/spend-forecaster";
import { detectAnomalies, SEVERITY_CONFIG, type DailyMetrics, type Anomaly } from "@/lib/anomaly-detector";
import {
  quickFatigueCheck,
  FATIGUE_BADGES,
  OBJECTIVE_LABELS,
  type FatigueAnalysis,
  type FatigueLevel,
} from "@/lib/fatigue-detector";
import {
  GROUP_LABELS,
  fmtVND as fmtVNDRedist,
  type RedistributionLog,
  type BudgetChange,
  type ObjectiveGroup,
} from "@/lib/budget-redistributor.shared";
import { CrossPlatformWidget } from "@/components/dashboard/CrossPlatformWidget";
import CompanyComparison from "@/components/dashboard/company-comparison";
import UnifiedOverview from "@/components/dashboard/UnifiedOverview";
import RevenueChart from "@/components/dashboard/RevenueChart";
import NextBestActions from "@/components/dashboard/NextBestActions";
import CompanyPnL from "@/components/dashboard/CompanyPnL";
import { KpiTab } from "@/components/dashboard/KpiTab";
import { KpiOverviewTab } from "@/components/dashboard/KpiOverviewTab";
import { HealthOverviewTab } from "@/components/dashboard/HealthOverviewTab";
import { TrendsTab } from "@/components/dashboard/TrendsTab";
import { DashboardSection } from "@/components/dashboard/DashboardSection";

// ─────────────────────────────────────────────
// Date preset helpers
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Platform mini card
// ─────────────────────────────────────────────
interface PlatformCardProps {
  name: "Facebook" | "Google";
  accent: string;
  spend: number;
  roas: number;
  ctr: number;
  isLoading: boolean;
  currency?: string;
}

function PlatformCard({
  name,
  accent,
  spend = 0,
  roas = 0,
  ctr = 0,
  isLoading,
  currency = "USD",
  notConnected = false,
}: PlatformCardProps & { notConnected?: boolean }) {
  function Val({ v }: { v: string }) {
    if (isLoading) return <div className="h-5 w-16 animate-pulse rounded bg-slate-100" />;
    return <p className="text-base font-bold text-slate-800">{v}</p>;
  }

  // Format spend for platform card
  const spendDisplay = formatCurrency(spend, currency, false);

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between h-full"
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <p className="mb-4 text-sm font-semibold text-slate-700">{name} Performance</p>
      
      {notConnected ? (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <p className="text-xs text-slate-500 mb-3">Not connected</p>
          <Link href="/settings">
            <Button variant="outline" size="sm" className="h-7 text-xs font-semibold px-3">
              Connect {name} Ads
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-[11px] font-medium uppercase text-slate-400 mb-1">Spend</p>
            <Val v={spendDisplay} />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase text-slate-400 mb-1">CTR</p>
            <Val v={`${ctr.toFixed(2)}%`} />
          </div>
        </div>
      )}
    </div>
  );
}

function avgMetric(list: Campaign[], fn: (c: Campaign) => number) {
  if (!list.length) return 0;
  return list.reduce((s, c) => s + fn(c), 0) / list.length;
}

// ─────────────────────────────────────────────
// Setup Banner (shown when 401 / no API token)
// ─────────────────────────────────────────────
function SetupBanner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
        <Wifi className="h-8 w-8 text-amber-500" />
      </div>
      <h2 className="text-xl font-bold text-slate-800">
        Connect your Meta Ads account to get started
      </h2>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        Add your <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">META_ACCESS_TOKEN</code>{" "}
        and <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">META_AD_ACCOUNT_ID</code>{" "}
        in Settings to start seeing real campaign data.
      </p>
      <Link href="/settings" className="mt-6">
        <Button className="gap-2 bg-amber-500 text-amber-950 hover:bg-amber-600">
          <Settings className="h-4 w-4" />
          Go to Settings
        </Button>
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────
// API response shapes
// ─────────────────────────────────────────────
interface SummaryResponse {
  success: boolean;
  code?: number;
  data?: {
    summary: DashboardSummary;
    changes: {
      spend: number; revenue: number; roas: number;
      ctr: number; impressions: number; clicks: number;
    };
    periodLabel: string;
    previousPeriodLabel: string;
  };
  meta?: {
    currency?: string;
  };
}

interface InsightsResponse {
  success: boolean;
  data?: ReportData[];
}

interface CampaignsResponse {
  success: boolean;
  data?: Campaign[];
  meta?: {
    currency?: string;
  };
}

// ─────────────────────────────────────────────
// Morning Briefing Card (6AM - 12PM)
// ─────────────────────────────────────────────
interface BriefingData {
  date: string;
  generatedAt: string;
  aiSummary: string;
  /** Nguồn dữ liệu lấy hụt — số trong bản tin đang thiếu phần đó. */
  dataGaps?: string[];
  yesterday: { totalSpend: number; roas: number; avgCTR: number; avgCPC: number };
  alerts: Array<{ severity: string; campaignName: string; description: string }>;
  topCampaigns: Array<{ name: string; roas: number | null; ctr: number; reason: string }>;
  needAttention: Array<{ name: string; reason: string }>;
  forecast: { estimatedMonthSpend: number; daysLeft: number };
}

function MorningBriefingCard() {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only show between 6AM - 12PM, or if user hasn't seen today's briefing
    const hour = new Date().getHours();
    const todayKey = `briefing_dismissed_${new Date().toISOString().split("T")[0]}`;
    if (sessionStorage.getItem(todayKey)) return;
    if (hour < 6 || hour >= 12) return;

    setLoading(true);
    fetch("/api/automation/morning-briefing")
      .then(r => r.json())
      .then(json => {
        // `disabled` = tắt có chủ đích (ENABLE_MORNING_BRIEFING), không phải sự
        // cố → ẩn hẳn thẻ, không hiện dòng lỗi đỏ trên đầu Dashboard.
        if (json.disabled) { setDisabled(true); return; }
        if (json.success) setBriefing(json.data);
        else setError(json.error);
      })
      .catch(() => setError("Không thể tải báo cáo buổi sáng"))
      .finally(() => setLoading(false));
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    const todayKey = `briefing_dismissed_${new Date().toISOString().split("T")[0]}`;
    sessionStorage.setItem(todayKey, "1");
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/automation/morning-briefing", { method: "POST" });
      const json = await res.json();
      if (json.disabled) { setDisabled(true); return; }
      if (json.success) setBriefing(json.data);
    } finally {
      setLoading(false);
    }
  };

  // `error` phải nằm TRƯỚC điều kiện "chưa có briefing": trước đây thẻ trả null
  // ngay khi chưa có dữ liệu, nên nhánh hiện lỗi bên dưới là MÃ CHẾT — Gemini
  // hỏng hay Meta chặn hạn mức đều biến mất không dấu vết.
  if (disabled || dismissed) return null;
  if (!briefing && !loading && !error) return null;

  const todayLabel = new Date().toLocaleDateString("vi-VN", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric"
  });

  return (
    <div className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-white shadow-sm mb-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-amber-100">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-gradient-to-br from-amber-400 to-orange-400 p-1.5 shadow-sm">
            <Sunrise className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-amber-900">Báo cáo buổi sáng</h3>
            <p className="text-[10px] text-amber-600">{todayLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-500 transition-colors"
            title="Tải lại"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-400 transition-colors"
            title="Ẩn đi"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        {loading && !briefing ? (
          <div className="flex items-center gap-2 py-4">
            <RefreshCw className="h-4 w-4 text-amber-400 animate-spin" />
            <span className="text-sm text-amber-600">Đang tạo báo cáo buổi sáng...</span>
          </div>
        ) : error ? (
          <p className="text-sm text-red-500 py-2">{error}</p>
        ) : briefing ? (
          <div className="space-y-3">
            {/* AI Summary */}
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {briefing.aiSummary}
              {/* Số 0 vì "không chạy gì" và số 0 vì "không lấy được" nhìn y
                  hệt nhau — nói ra để người đọc bản tin không kết luận nhầm. */}
              {!!briefing.dataGaps?.length && (
                <span className="mt-2 block rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                  Số liệu bản tin đang THIẾU {briefing.dataGaps.length} nguồn: {briefing.dataGaps.slice(0, 2).join("; ")}
                  {briefing.dataGaps.length > 2 && ` … (+${briefing.dataGaps.length - 2})`}
                </span>
              )}
            </div>

            {/* Quick stats bar */}
            <div className="flex items-center gap-4 text-[10px] text-amber-700 pt-2 border-t border-amber-100">
              <span>📊 Spend hôm qua: <b>₫{Math.round(briefing.yesterday.totalSpend).toLocaleString("vi-VN")}</b></span>
              <span>ROAS: <b>{briefing.yesterday.roas.toFixed(1)}x</b></span>
              <span>CTR: <b>{briefing.yesterday.avgCTR.toFixed(2)}%</b></span>
              {briefing.forecast && (
                <span>💰 Dự báo tháng: <b>₫{Math.round(briefing.forecast.estimatedMonthSpend).toLocaleString("vi-VN")}</b> (còn {briefing.forecast.daysLeft} ngày)</span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Revenue Reminder Banner (days 1-3 of month)
// ─────────────────────────────────────────────
function RevenueReminderBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const today = new Date();
    const dayOfMonth = today.getDate();
    if (dayOfMonth > 3) return; // only show days 1-3

    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const dismissKey = `revenue_reminder_${monthKey}`;
    if (sessionStorage.getItem(dismissKey)) return;

    // Check if revenue config exists for current month
    fetch(`/api/settings/revenue?month=${monthKey}`)
      .then(r => r.json())
      .then(json => {
        if (!json.data || json.data.mbc_revenue === 0) {
          setShow(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    const today = new Date();
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    sessionStorage.setItem(`revenue_reminder_${monthKey}`, "1");
  };

  if (!show || dismissed) return null;

  const monthLabel = new Date().toLocaleDateString("vi-VN", { month: "long", year: "numeric" });

  return (
    <div className="rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 via-green-50 to-white shadow-sm mb-6 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-100 p-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-900">
              📊 Tháng mới bắt đầu!
            </p>
            <p className="text-xs text-emerald-700">
              Nhập doanh thu ERP {monthLabel} để ROAS hiển thị chính xác.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings/revenue">
            <Button className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 text-xs h-8">
              <TrendingUp className="h-3.5 w-3.5" />
              Nhập ngay
            </Button>
          </Link>
          <button
            onClick={handleDismiss}
            className="text-xs text-emerald-500 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Budget Pacing Card (replaces old SpendForecastWidget)
// ─────────────────────────────────────────────
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ReferenceLine,
  Area,
  ComposedChart,
} from "recharts";

type BudgetTab = "all" | string;

interface BudgetEntry {
  company: string;
  platform: string;
  budget_amount: number;
  spent: number;
  remaining: number;
  percentage: number;
  forecast_end_of_month: number;
  forecast_status: "ok" | "warning" | "danger";
  days_left: number;
  daily_average: number;
}

const MONTH_LABELS_PACING = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4",
  "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8",
  "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

function fmtVN(v: number): string {
  if (v >= 1_000_000_000) return `₫${(v / 1_000_000_000).toFixed(1)}Tỷ`;
  if (v >= 1_000_000) return `₫${(v / 1_000_000).toFixed(1)}Tr`;
  if (v >= 1_000) return `₫${(v / 1_000).toFixed(0)}K`;
  return `₫${Math.round(v).toLocaleString("vi-VN")}`;
}

/** Build chart data: ideal pace line + actual cumulative + projected */
function buildPacingChartData(
  entries: BudgetEntry[],
  now: Date
): Array<Record<string, number | string | null>> {
  const totalBudget = entries.reduce((s, e) => s + e.budget_amount, 0);
  const totalSpent = entries.reduce((s, e) => s + e.spent, 0);
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();
  const dailyAvg = today > 0 ? totalSpent / today : 0;

  const data: Array<Record<string, number | string | null>> = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const idealPace = Math.round((totalBudget / daysInMonth) * d);

    if (d <= today) {
      // Actual spend: linear interpolation (best approximation without daily data)
      const actual = Math.round((totalSpent / today) * d);
      data.push({
        day: `${d}`,
        ideal: idealPace,
        actual,
        projected: null,
        budget: totalBudget,
      });
    } else {
      // Projected
      const projected = Math.round(totalSpent + dailyAvg * (d - today));
      data.push({
        day: `${d}`,
        ideal: idealPace,
        actual: null,
        projected,
        budget: totalBudget,
      });
    }
  }

  return data;
}

function BudgetPlatformRow({ entry }: { entry: BudgetEntry }) {
  const isFb = entry.platform === "facebook";
  const platformLabel = isFb ? "Facebook" : "Google";
  const platformColor = isFb ? "text-blue-600" : "text-red-500";
  const barColor = entry.percentage >= 95
    ? "bg-gradient-to-r from-red-400 to-red-500"
    : entry.percentage >= 80
    ? "bg-gradient-to-r from-amber-400 to-amber-500"
    : entry.percentage >= 50
    ? "bg-gradient-to-r from-blue-400 to-blue-500"
    : "bg-gradient-to-r from-emerald-400 to-emerald-500";

  const overrun = entry.forecast_end_of_month - entry.budget_amount;

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className={cn("text-xs font-semibold", platformColor)}>
          {isFb ? "🔵" : "🔴"} {platformLabel}
        </span>
        <span className="text-xs font-bold text-slate-700">{fmtVN(entry.spent)}</span>
      </div>
      {/* Progress bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-1.5">
        <div
          className={cn("h-full rounded-full transition-all duration-700", barColor)}
          style={{ width: `${Math.min(entry.percentage, 100)}%` }}
        />
      </div>
      {/* Stats row */}
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>Budget: {fmtVN(entry.budget_amount)}</span>
        <span>Còn: {fmtVN(entry.remaining)}</span>
        <span>{entry.days_left} ngày</span>
        <span className="font-bold">{entry.percentage}%</span>
      </div>
      {/* Forecast status */}
      {entry.forecast_status === "danger" && (
        <p className="text-[10px] mt-1.5 text-red-600 font-medium">
          ⚠️ Dự báo vượt {fmtVN(Math.abs(overrun))} nếu giữ pace
        </p>
      )}
      {entry.forecast_status === "warning" && (
        <p className="text-[10px] mt-1.5 text-amber-600 font-medium">
          ⏳ Gần ngân sách — theo dõi sát
        </p>
      )}
      {entry.forecast_status === "ok" && (
        <p className="text-[10px] mt-1.5 text-emerald-600 font-medium">
          ✅ Đang đúng pace
        </p>
      )}
    </div>
  );
}

function BudgetPacingCard() {
  const [tab, setTab] = useState<BudgetTab>("all");
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    fetch(`/api/settings/budget?month=${month}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setEntries(json.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-56 animate-pulse bg-slate-50 rounded-lg" />
      </div>
    );
  }

  if (entries.length === 0) return null;

  const now = new Date();
  const monthLabel = `${MONTH_LABELS_PACING[now.getMonth()]} ${now.getFullYear()}`;

  // Filter by tab
  const filtered = tab === "all" ? entries : entries.filter((e) => e.company === tab);
  const hasData = filtered.some((e) => e.spent > 0);

  // Totals
  const totalBudget = filtered.reduce((s, e) => s + e.budget_amount, 0);
  const totalSpent = filtered.reduce((s, e) => s + e.spent, 0);
  const totalRemaining = Math.max(0, totalBudget - totalSpent);
  const totalPct = totalBudget > 0 ? Math.min(Math.round((totalSpent / totalBudget) * 100), 100) : 0;

  // Chart data
  const chartData = buildPacingChartData(filtered, now);

  // Chart Y-axis formatter
  const yFmt = (v: number) => {
    if (v >= 1_000_000) return `₫${(v / 1_000_000).toFixed(0)}Tr`;
    if (v >= 1_000) return `₫${(v / 1_000).toFixed(0)}K`;
    return `₫${v}`;
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          🔥 Budget {monthLabel}
        </h3>
        <Link
          href="/settings/budget"
          className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-0.5"
        >
          Chi tiết <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 px-5 pb-4">
        {(["all", ...orderedCompanyIds(["MBC", "MBI"])] as BudgetTab[]).map((t) => ( // Đợt 25: công ty theo bản cài
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
              tab === t
                ? t === "MBC" ? "bg-blue-600 text-white"
                  : t === "MBI" ? "bg-violet-600 text-white"
                  : "bg-slate-700 text-white"
                : "text-slate-400 hover:text-slate-600 bg-slate-50"
            )}
          >
            {t === "all" ? "Tổng" : t === "MBC" || t === "MBI" ? t : companyLabel(t)}
          </button>
        ))}

        {/* Total summary in header */}
        {hasData && (
          <div className="ml-auto flex items-center gap-3 text-[10px] text-slate-400">
            <span>Đã chi: <b className="text-slate-700">{fmtVN(totalSpent)}</b></span>
            <span>/ {fmtVN(totalBudget)}</span>
            <span className="font-bold text-slate-700">{totalPct}%</span>
          </div>
        )}
      </div>

      {/* ── Platform Rows ── */}
      {hasData ? (
        <div className="px-5 pb-4 divide-y divide-slate-100">
          {filtered
            .filter((e) => e.spent > 0)
            .map((e) => (
              <BudgetPlatformRow
                key={`${e.company}_${e.platform}`}
                entry={e}
              />
            ))}
        </div>
      ) : (
        <div className="px-5 pb-4 text-center text-xs text-slate-400 py-4">
          Chưa có dữ liệu chi tiêu cho nhóm này
        </div>
      )}

      {/* ── Mini Pacing Chart ── */}
      {hasData && (
        <div className="border-t border-slate-100 px-5 pt-3 pb-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            📈 Pace chi tiêu vs Lý tưởng
          </p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 9, fill: "#94A3B8" }}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                />
                <YAxis
                  tickFormatter={yFmt}
                  tick={{ fontSize: 9, fill: "#94A3B8" }}
                  tickLine={false}
                  axisLine={false}
                />
                <RTooltip
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    fontSize: 11,
                  }}
                  formatter={(val: any, name: any) => {
                    const labels: Record<string, string> = {
                      actual: "Chi thực",
                      ideal: "Pace lý tưởng",
                      projected: "Dự báo",
                    };
                    return [fmtVN(Number(val) || 0), labels[String(name)] ?? name];
                  }}
                  labelFormatter={(label) => `Ngày ${label}`}
                />

                {/* Budget line */}
                <ReferenceLine
                  y={totalBudget}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Budget: ${fmtVN(totalBudget)}`,
                    position: "right",
                    fill: "#ef4444",
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                />

                {/* Ideal pace (dashed light blue) */}
                <Line
                  type="linear"
                  dataKey="ideal"
                  stroke="#93C5FD"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  dot={false}
                  name="ideal"
                />

                {/* Actual spend (solid blue) */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={false}
                  name="actual"
                />

                {/* Projected (dashed red/orange) */}
                <Line
                  type="monotone"
                  dataKey="projected"
                  stroke="#F97316"
                  strokeDasharray="4 3"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  name="projected"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* Chart legend */}
          <div className="flex items-center justify-center gap-4 mt-2 text-[9px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 rounded-full inline-block" /> Chi thực</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-300 rounded-full inline-block opacity-60" style={{ borderTop: "1px dashed" }} /> Pace lý tưởng</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 rounded-full inline-block" /> Dự báo</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 rounded-full inline-block" /> Budget</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Fatigue Alert Card
// Shows only when campaigns have critical/fatigued status
// ─────────────────────────────────────────────

interface FatigueItem {
  campaign: Campaign;
  fatigue: FatigueAnalysis;
}

function FatigueAlertCard({ campaigns: allCampaigns }: { campaigns: Campaign[] }) {
  const [pausingId, setPausingId] = useState<string | null>(null);

  // Run quick fatigue check on all active campaigns
  const fatigueItems: FatigueItem[] = useMemo(() => {
    return allCampaigns
      .filter((c) => c.status === "ACTIVE" && c.metrics.impressions > 100)
      .map((c) => ({ campaign: c, fatigue: quickFatigueCheck(c) }))
      .filter((item) => item.fatigue.fatigueLevel === "critical" || item.fatigue.fatigueLevel === "fatigued")
      .sort((a, b) => b.fatigue.fatigueScore - a.fatigue.fatigueScore);
  }, [allCampaigns]);

  if (fatigueItems.length === 0) return null;

  const criticalCount = fatigueItems.filter((i) => i.fatigue.fatigueLevel === "critical").length;
  const fatiguedCount = fatigueItems.filter((i) => i.fatigue.fatigueLevel === "fatigued").length;

  const handlePause = async (campaignId: string) => {
    setPausingId(campaignId);
    try {
      await fetch(`/api/meta/campaigns/${campaignId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PAUSE", campaignId }),
      });
    } finally {
      setPausingId(null);
    }
  };

  return (
    <div className="rounded-xl border-2 border-red-200 bg-gradient-to-br from-red-50/70 via-orange-50/30 to-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-red-100">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-gradient-to-br from-red-500 to-orange-500 p-1.5 shadow-sm">
            <AlertTriangle className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-red-900">🔥 Cần xử lý hôm nay</h3>
            <p className="text-[10px] text-red-600">
              {criticalCount > 0 && `${criticalCount} critical`}
              {criticalCount > 0 && fatiguedCount > 0 && " · "}
              {fatiguedCount > 0 && `${fatiguedCount} fatigued`}
            </p>
          </div>
        </div>
        <Link
          href="/campaigns"
          className="text-[11px] font-semibold text-red-500 hover:text-red-600 flex items-center gap-0.5"
        >
          Xem tất cả <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Campaign list */}
      <div className="divide-y divide-red-50">
        {fatigueItems.slice(0, 5).map((item) => {
          const { campaign, fatigue } = item;
          const badge = FATIGUE_BADGES[fatigue.fatigueLevel];
          const isCritical = fatigue.fatigueLevel === "critical";
          const primarySignal = fatigue.signals[0];
          const objectiveLabel = OBJECTIVE_LABELS[fatigue.objective ?? ""] || campaign.objective;

          // Calculate campaign age
          const ageMs = campaign.startDate
            ? Date.now() - new Date(campaign.startDate).getTime()
            : 0;
          const ageDays = Math.floor(ageMs / 86400000);

          return (
            <div
              key={campaign.id}
              className="px-5 py-3 hover:bg-red-50/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border",
                        badge.bg,
                        badge.text,
                        badge.border,
                        isCritical && "animate-pulse"
                      )}
                    >
                      {badge.emoji} {fatigue.fatigueScore}
                    </span>
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {campaign.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    {primarySignal && (
                      <span className={cn(isCritical ? "text-red-600" : "text-orange-600", "font-medium")}>
                        {primarySignal.description}
                      </span>
                    )}
                    <span className="text-slate-300">·</span>
                    <span>Chạy {ageDays} ngày</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400">{objectiveLabel}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">💡 {fatigue.recommendedAction}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isCritical && (
                    <button
                      onClick={() => handlePause(campaign.id)}
                      disabled={pausingId === campaign.id}
                      className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {pausingId === campaign.id ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        "⏸ Tắt ngay"
                      )}
                    </button>
                  )}
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Xem chi tiết →
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Budget Redistribution Widget ("Đêm Qua")
// ─────────────────────────────────────────────

function BudgetRedistributionCard() {
  const [logs, setLogs] = useState<RedistributionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoing, setUndoing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cron/budget-redistribute?action=today-logs")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setLogs(json.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleUndoAll = async (logId: string) => {
    setUndoing(logId);
    try {
      await fetch("/api/cron/budget-redistribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undo-all", logId }),
      });
      // Refresh
      const res = await fetch("/api/cron/budget-redistribute?action=today-logs");
      const json = await res.json();
      if (json.success) setLogs(json.data ?? []);
    } finally {
      setUndoing(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-24 animate-pulse bg-slate-50 rounded-lg" />
      </div>
    );
  }

  // No logs today at all
  if (logs.length === 0) return null;

  const hasChanges = logs.some((l) => l.totalChanges > 0);
  const totalSavings = logs.reduce((s, l) => s + l.estimatedSavings, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          🔄 Tối ưu ngân sách tự động — 06:00 hôm nay
        </h3>
        <Link
          href="/automation/redistribution"
          className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-0.5"
        >
          Xem chi tiết <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="px-5 pb-5">
        {!hasChanges ? (
          /* No changes - everything balanced */
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-center">
            <p className="text-sm text-emerald-700 font-medium">
              ✅ 06:00 — Tất cả campaigns đang cân bằng
            </p>
            <p className="text-xs text-emerald-500 mt-0.5">
              Không cần điều chỉnh hôm nay
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs
              .filter((l) => l.totalChanges > 0 && !l.id.startsWith("undo_"))
              .map((log) => {
                const increases = log.changes.filter(
                  (c) => c.action === "increase" && c.status === "success"
                );
                const decreases = log.changes.filter(
                  (c) => c.action === "decrease" && c.status === "success"
                );
                const skipped = log.changes.filter(
                  (c) => c.status === "skipped"
                );

                return (
                  <div
                    key={log.id}
                    className="rounded-xl border border-blue-100 bg-blue-50/30 p-4"
                  >
                    {/* Company header */}
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-bold",
                          log.company === "MBC"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-violet-100 text-violet-700"
                        )}
                      >
                        {log.company} — Đã điều chỉnh {log.totalChanges} campaigns
                      </span>
                      <button
                        onClick={() => handleUndoAll(log.id)}
                        disabled={undoing === log.id}
                        className="text-[10px] font-medium text-amber-600 hover:text-amber-700 flex items-center gap-1 disabled:opacity-50"
                      >
                        {undoing === log.id ? (
                          <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          "↩"
                        )}
                        Hoàn tác
                      </button>
                    </div>

                    {/* Increases */}
                    {increases.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] font-bold text-emerald-600 mb-1">
                          ↑ Tăng budget (Top performers)
                        </p>
                        {increases.slice(0, 3).map((c) => (
                          <div
                            key={c.campaignId}
                            className="flex items-center justify-between text-[10px] text-slate-600 py-0.5"
                          >
                            <span className="truncate max-w-[60%]">
                              {c.campaignName}
                            </span>
                            <span className="text-emerald-600 font-semibold">
                              {fmtVNDRedist(c.oldBudget)} → {fmtVNDRedist(c.newBudget)}{" "}
                              <span className="text-emerald-500">+{Math.round(((c.newBudget - c.oldBudget) / c.oldBudget) * 100)}%</span>
                            </span>
                          </div>
                        ))}
                        {increases.length > 3 && (
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            ...và {increases.length - 3} campaigns khác
                          </p>
                        )}
                      </div>
                    )}

                    {/* Decreases */}
                    {decreases.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] font-bold text-red-600 mb-1">
                          ↓ Giảm budget (Bottom performers)
                        </p>
                        {decreases.slice(0, 3).map((c) => (
                          <div
                            key={c.campaignId}
                            className="flex items-center justify-between text-[10px] text-slate-600 py-0.5"
                          >
                            <span className="truncate max-w-[60%]">
                              {c.campaignName}
                            </span>
                            <span className="text-red-600 font-semibold">
                              {fmtVNDRedist(c.oldBudget)} → {fmtVNDRedist(c.newBudget)}{" "}
                              <span className="text-red-500">{Math.round(((c.newBudget - c.oldBudget) / c.oldBudget) * 100)}%</span>
                            </span>
                          </div>
                        ))}
                        {decreases.length > 3 && (
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            ...và {decreases.length - 3} campaigns khác
                          </p>
                        )}
                      </div>
                    )}

                    {/* Skipped */}
                    {skipped.length > 0 && (
                      <p className="text-[10px] text-slate-400">
                        ⏭ Bỏ qua: {skipped.length} campaigns ({skipped.map((s) => s.error ?? "Learning phase").join(", ")})
                      </p>
                    )}
                  </div>
                );
              })}

            {/* Savings footer */}
            {totalSavings > 0 && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-emerald-700">
                  💰 Tiết kiệm ước tính: <b>{fmtVNDRedist(totalSavings)}/ngày</b>
                </span>
                <span className="text-[10px] text-emerald-500">
                  Chuyển từ campaigns kém → campaigns tốt
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Company Split Cards
// ─────────────────────────────────────────────



function computeCompanyStats(allCampaigns: Campaign[]) {
  // Đợt 21: nhóm theo công ty của bản cài (trước đây ghim MBC + MBI → bản khách hiện "MBC 0 / MBI 0", không có công ty mình).
  // Bản Mắt Bão: companyIds() = ["MBC","MBI"] → cùng 2 thẻ, cùng thứ tự, cùng nội dung.
  const groups: Record<string, Campaign[]> = Object.fromEntries(companyIds().map((co) => [co, [] as Campaign[]]));
  for (const c of allCampaigns) {
    // Use pre-computed company field first (set by Google API route),
    // then fall back to detectCompany with accountName for Google,
    // then campaign name prefix for Facebook
    const co = c.company ?? detectCompany(c.name, c.accountName);
    if (co && groups[co]) groups[co].push(c);
  }
  const summarize = (camps: Campaign[]) => {
    const active = camps.filter(c => c.status === "ACTIVE");
    const totalSpend = camps.reduce((s, c) => s + (c.metrics?.spend ?? 0), 0);
    const totalImps = camps.reduce((s, c) => s + (c.metrics?.impressions ?? 0), 0);
    const totalClicks = camps.reduce((s, c) => s + (c.metrics?.clicks ?? 0), 0);
    const ctr = totalImps > 0 ? (totalClicks / totalImps) * 100 : 0;
    const roas = totalSpend > 0 ? camps.reduce((s, c) => s + (c.metrics?.roas ?? 0) * (c.metrics?.spend ?? 0), 0) / totalSpend : 0;
    return { campaigns: active.length, spend: totalSpend, ctr, roas };
  };
  const LEGACY_CARD: Record<string, { fullName: string; accent: string; accentBg: string; accentBorder: string }> = {
    MBC: { fullName: "Mat Bao Corporation", accent: "text-blue-700", accentBg: "bg-blue-50", accentBorder: "border-blue-200" },
    MBI: { fullName: "Mat Bao Invest", accent: "text-violet-700", accentBg: "bg-violet-50", accentBorder: "border-violet-200" },
  };
  return companyIds().map((co) => ({
    company: co,
    ...(LEGACY_CARD[co] ?? { fullName: companyLabel(co), accent: "text-slate-700", accentBg: "bg-slate-50", accentBorder: "border-slate-200" }),
    ...summarize(groups[co] ?? []),
  }));
}

function CompanySplitCards({ allCampaigns, currency, isLoading, onSelect }: {
  allCampaigns: Campaign[]; currency: string; isLoading: boolean; onSelect: (c: CompanyFilter) => void;
}) {
  const stats = computeCompanyStats(allCampaigns);
  if (isLoading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[0, 1].map(i => <div key={i} className="h-32 rounded-xl border border-slate-200 bg-white animate-pulse" />)}
    </div>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {stats.map(s => (
        <button
          key={s.company}
          onClick={() => onSelect(s.company as CompanyFilter)}
          className={cn("rounded-xl border-2 p-4 text-left transition-all hover:shadow-md", s.accentBorder, s.accentBg)}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={cn("rounded-lg p-1.5", s.company === "MBC" ? "bg-blue-100" : "bg-violet-100")}>
              <Building className={cn("h-4 w-4", s.accent)} />
            </div>
            <div>
              <p className={cn("text-sm font-bold", s.accent)}>🏢 {s.company}</p>
              <p className="text-[10px] text-slate-400">{s.fullName}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs">
            <div><span className="text-slate-400">Spend:</span> <b className={s.accent}>{formatCurrency(s.spend, currency, true)}</b></div>
            <div><span className="text-slate-400">Campaigns:</span> <b className={s.accent}>{s.campaigns} active</b></div>
            <div><span className="text-slate-400">CTR:</span> <b className={s.accent}>{s.ctr.toFixed(2)}%</b></div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Cross-Channel Overview Widget
// ─────────────────────────────────────────────

function CrossChannelOverview({
  campaigns: allCampaigns,
  isLoading,
  googleConnected,
  googleError,
  onRetryGoogle,
}: {
  campaigns: Campaign[];
  isLoading: boolean;
  googleConnected: boolean;
  googleError: string | null;
  onRetryGoogle: () => void;
}) {
  const stats = useMemo(() => {
    const fb = allCampaigns.filter(c => c.platform === "facebook");
    const gg = allCampaigns.filter(c => c.platform === "google");

    const fbSpend = fb.reduce((s, c) => s + (c.metrics?.spend ?? 0), 0);
    const ggSpend = gg.reduce((s, c) => s + (c.metrics?.spend ?? 0), 0);
    const totalSpend = fbSpend + ggSpend;

    const fbConv = fb.reduce((s, c) => s + (c.metrics?.conversions ?? 0), 0);
    const ggConv = gg.reduce((s, c) => s + (c.metrics?.conversions ?? 0), 0);
    const totalConv = fbConv + ggConv;

    const fbCpl = fbConv > 0 ? Math.round(fbSpend / fbConv) : 0;
    const ggCpl = ggConv > 0 ? Math.round(ggSpend / ggConv) : 0;
    const combinedCpl = totalConv > 0 ? Math.round(totalSpend / totalConv) : 0;

    const fbPct = totalSpend > 0 ? Math.round((fbSpend / totalSpend) * 100) : 0;
    const ggPct = totalSpend > 0 ? 100 - fbPct : 0;

    // Efficiency comparison
    let efficiencyNote = "";
    if (fbCpl > 0 && ggCpl > 0) {
      if (ggCpl < fbCpl) {
        const pct = Math.round(((fbCpl - ggCpl) / fbCpl) * 100);
        efficiencyNote = `→ Google đang hiệu quả hơn ${pct}%`;
      } else if (fbCpl < ggCpl) {
        const pct = Math.round(((ggCpl - fbCpl) / ggCpl) * 100);
        efficiencyNote = `→ Facebook đang hiệu quả hơn ${pct}%`;
      }
    }

    return {
      fbSpend, ggSpend, totalSpend,
      fbConv, ggConv, totalConv,
      fbCpl, ggCpl, combinedCpl,
      fbPct, ggPct,
      efficiencyNote,
    };
  }, [allCampaigns]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-40 animate-pulse bg-slate-50 rounded-lg" />
      </div>
    );
  }

  // Nothing to show if no campaigns at all
  if (allCampaigns.length === 0 && !googleError) return null;

  const { fbSpend, ggSpend, totalSpend, fbConv, ggConv, totalConv, fbCpl, ggCpl, combinedCpl, fbPct, ggPct, efficiencyNote } = stats;

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white via-blue-50/20 to-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          📊 Tổng quan tất cả kênh
        </h3>
        <div className="flex items-center gap-2">
          <Link
            href="/campaigns"
            className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-0.5"
          >
            Chi tiết <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Google error banner */}
      {googleError && (
        <div className="mx-5 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 font-medium">⚠️ Không lấy được data Google Ads.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRetryGoogle}
              className="text-[10px] font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-amber-100 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Thử lại
            </button>
            <Link href="/settings" className="text-[10px] font-semibold text-amber-600 hover:text-amber-700">
              Kiểm tra kết nối
            </Link>
          </div>
        </div>
      )}

      <div className="px-5 pb-5 space-y-4">
        {/* ── 3 Summary cards ── */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">💰 Tổng Spend</p>
            <p className="text-lg font-extrabold text-slate-800">{fmtVN(totalSpend)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">🎯 Conversions</p>
            <p className="text-lg font-extrabold text-slate-800">{totalConv} <span className="text-xs font-medium text-slate-400">leads</span></p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">📉 CPL Trung Bình</p>
            <p className="text-lg font-extrabold text-slate-800">{combinedCpl > 0 ? fmtVN(combinedCpl) : "—"}</p>
          </div>
        </div>

        {/* ── Budget allocation ── */}
        {totalSpend > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phân bổ ngân sách</p>
            {/* Facebook bar */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold text-blue-600 w-20 shrink-0">🔵 Facebook</span>
              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-700"
                  style={{ width: `${fbPct}%` }}
                />
              </div>
              <span className="text-[11px] font-bold text-slate-600 w-24 text-right">{fbPct}% · {fmtVN(fbSpend)}</span>
            </div>
            {/* Google bar */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold text-red-500 w-20 shrink-0">🔴 Google</span>
              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all duration-700"
                  style={{ width: `${ggPct}%` }}
                />
              </div>
              <span className="text-[11px] font-bold text-slate-600 w-24 text-right">{ggPct}% · {fmtVN(ggSpend)}</span>
            </div>
          </div>
        )}

        {/* ── CPL comparison ── */}
        {(fbCpl > 0 || ggCpl > 0) && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CPL theo kênh</p>
            <div className="flex items-center gap-6">
              {fbCpl > 0 && (
                <span className="text-xs">
                  🔵 Facebook: <b className="text-blue-700">{fmtVN(fbCpl)}</b>
                  <span className="text-slate-400 ml-1">({fbConv} leads)</span>
                </span>
              )}
              {ggCpl > 0 && (
                <span className="text-xs">
                  🔴 Google: <b className="text-red-600">{fmtVN(ggCpl)}</b>
                  <span className="text-slate-400 ml-1">({ggConv} leads)</span>
                </span>
              )}
            </div>
            {efficiencyNote && (
              <p className="text-[11px] font-semibold text-emerald-600">{efficiencyNote}</p>
            )}
          </div>
        )}

        {/* ── Quick links ── */}
        <div className="flex items-center gap-3 pt-1">
          <Link
            href="/campaigns"
            onClick={() => { /* will use platform filter */ }}
            className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-center text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
          >
            Xem chi tiết Facebook
          </Link>
          <Link
            href="/campaigns"
            className="flex-1 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-center text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
          >
            Xem chi tiết Google
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Dashboard Page
// ─────────────────────────────────────────────
export default function DashboardPage() {
  const {
    campaigns, setCampaigns,
    summary, setSummary,
    dateRange, setDateRange,
    selectedPlatform,
    selectedCompany, setSelectedCompany,
    isLoading, setLoading,
    setError,
    currency, setCurrency,
  } = useAdsStore();

  const { toast } = useToast();

  const [mainTab, setMainTab] = useState<"overview" | "trends" | "kpi" | "kpi-overview" | "health">("overview");

  // Deep link từ thẻ "Đường lead" ở /lib/overview/health.ts (href="/?tab=health#duong-lead") —
  // đọc window.location trực tiếp (KHÔNG dùng useSearchParams: trang này chưa bọc Suspense và
  // là "use client" nặng, xem cùng luật app/(dashboard)/settings/ga4/page.tsx). Cuộn tới #hash
  // do chính HealthOverviewTab lo (đợi dữ liệu tải xong mới có phần tử để cuộn tới).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "health") setMainTab("health");
  }, []);

  const [reportData,      setReportData]     = useState<ReportData[]>([]);
  const [notConfigured,   setNotConfigured]  = useState(false);
  const [googleRawSummary,   setGoogleRawSummary]  = useState<{ spend: number; roas: number; ctr: number } | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [fbRawSummary,       setFbRawSummary]      = useState<{ spend: number; roas: number; ctr: number } | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);

  // Filter by company
  const companyCampaigns = selectedCompany === "all"
    ? campaigns
    : campaigns.filter(c => (c.company ?? detectCompany(c.name, c.accountName)) === selectedCompany);

  const activeCampaigns = companyCampaigns.filter((c) => c.status === "ACTIVE").slice(0, 5);

  // Compute platform-specific stats honoring company filter
  const platformStats = useMemo(() => {
    const calc = (platform: "facebook" | "google", rawSum: { spend: number; roas: number; ctr: number } | null) => {
      // If "All" selected, fallback to raw API summary for complete accuracy across all (including inactive)
      if (selectedCompany === "all" && rawSum) return rawSum;

      // Filter by platform property (set by fetcher: 'facebook' | 'google')
      const platformCamps = companyCampaigns.filter(c => c.platform === platform);

      const spend = platformCamps.reduce((s, c) => s + (c.metrics?.spend ?? 0), 0);
      const imps = platformCamps.reduce((s, c) => s + (c.metrics?.impressions ?? 0), 0);
      const clicks = platformCamps.reduce((s, c) => s + (c.metrics?.clicks ?? 0), 0);
      const rev = platformCamps.reduce((s, c) => s + (c.metrics?.revenue ?? 0), 0);

      const ctr = imps > 0 ? (clicks / imps) * 100 : 0;
      const roas = spend > 0 ? (rev / spend) : 0;

      return { spend, roas, ctr };
    };
    return {
      facebook: calc("facebook", fbRawSummary),
      google: calc("google", googleRawSummary),
    };
  }, [selectedCompany, companyCampaigns, fbRawSummary, googleRawSummary]);

  const fetchData = useCallback(async () => {
    const { from, to } = dateRange;
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    setGoogleError(null);

    try {
      const isFb = selectedPlatform === "all" || selectedPlatform === "facebook";
      const isGoogle = selectedPlatform === "all" || selectedPlatform === "google";

      // ── Fetch Facebook + Google in parallel ──
      // Đợt 21 A3b: chiến dịch Google theo MỌI công ty của bản cài (trước đây ghim MBC + MBI → bản khách trống).
      const googleCos = companyIds();
      const [metaSummaryRes, metaInsightsRes, metaCampaignsRes, googleSummaryRes, googleInsightsRes, ...googleCampRes] = await Promise.all([
        isFb ? fetch(`/api/meta/summary?from=${from}&to=${to}`) : null,
        isFb ? fetch(`/api/meta/insights?from=${from}&to=${to}`) : null,
        isFb ? fetch(`/api/meta/campaigns?status=ACTIVE&from=${from}&to=${to}`) : null,
        isGoogle ? fetch(`/api/google/summary?from=${from}&to=${to}`).catch(() => null) : null,
        isGoogle ? fetch(`/api/google/insights?from=${from}&to=${to}`).catch(() => null) : null,
        ...googleCos.map((co) => (isGoogle ? fetch(`/api/google/campaigns?company=${encodeURIComponent(co)}&from=${from}&to=${to}`).catch(() => null) : null)),
      ]);

      // Handle 401 — Facebook not configured
      if (isFb && metaSummaryRes?.status === 401 && !isGoogle) {
        setNotConfigured(true);
        setLoading(false);
        return;
      }

      // ── Parse Facebook responses ──
      let metaSummaryJson: SummaryResponse | null = null;
      let metaInsightsJson: InsightsResponse | null = null;
      let metaCampaignsJson: CampaignsResponse | null = null;

      if (isFb && metaSummaryRes?.ok) {
        metaSummaryJson = await metaSummaryRes.json() as SummaryResponse;
      }
      if (isFb && metaInsightsRes?.ok) {
        metaInsightsJson = await metaInsightsRes.json() as InsightsResponse;
      }
      if (isFb && metaCampaignsRes?.ok) {
        metaCampaignsJson = await metaCampaignsRes.json() as CampaignsResponse;
      }

      // ── Parse Google responses ──
      let googleSummaryJson: SummaryResponse | null = null;
      let googleInsightsJson: InsightsResponse | null = null;
      let isGoogleOk = false;

      if (isGoogle && googleSummaryRes?.ok) {
        googleSummaryJson = await googleSummaryRes.json() as SummaryResponse;
        isGoogleOk = googleSummaryJson?.success ?? false;
      }
      if (isGoogle && googleInsightsRes?.ok) {
        googleInsightsJson = await googleInsightsRes.json() as InsightsResponse;
      }

      // Parse Google campaigns (new route format: { success, campaigns })
      const googleCampJsons = await Promise.all(googleCampRes.map((r) => ((isGoogle && r?.ok) ? r.json().catch(() => null) : null)));

      // Track Google connection issues
      if (isGoogle && !isGoogleOk && !googleSummaryRes?.ok) {
        setGoogleError("Không thể kết nối Google Ads API");
      }

      setGoogleConnected(isGoogleOk);

      // ── Read currency ──
      const apiCurrency = metaSummaryJson?.meta?.currency || metaCampaignsJson?.meta?.currency || "VND";
      setCurrency(apiCurrency);

      // ── Merge Summary ──
      const fbSum = metaSummaryJson?.success ? metaSummaryJson.data?.summary : null;
      const gSum = googleSummaryJson?.success ? googleSummaryJson.data?.summary : null;

      // Store platform-specific data for PlatformCards
      if (fbSum) {
        setFbRawSummary({ spend: fbSum.totalSpend, roas: fbSum.avgROAS, ctr: fbSum.avgCTR });
      }
      if (gSum) {
        setGoogleRawSummary({ spend: gSum.totalSpend, roas: gSum.avgROAS, ctr: gSum.avgCTR });
      }

      // Build merged summary
      if (fbSum || gSum) {
        const merged: DashboardSummary = {
          totalSpend:       (fbSum?.totalSpend ?? 0) + (gSum?.totalSpend ?? 0),
          totalRevenue:     (fbSum?.totalRevenue ?? 0) + (gSum?.totalRevenue ?? 0),
          avgROAS:          0,
          avgCTR:           0,
          totalImpressions: (fbSum?.totalImpressions ?? 0) + (gSum?.totalImpressions ?? 0),
          totalClicks:      (fbSum?.totalClicks ?? 0) + (gSum?.totalClicks ?? 0),
          activeCampaigns:  (fbSum?.activeCampaigns ?? 0) + (gSum?.activeCampaigns ?? 0),
          periodLabel:      fbSum?.periodLabel ?? gSum?.periodLabel ?? "",
        };
        // Weighted averages
        const totalSpend = merged.totalSpend;
        if (totalSpend > 0) {
          merged.avgROAS = Math.round((merged.totalRevenue / totalSpend) * 100) / 100;
        }
        const totalImps = merged.totalImpressions;
        if (totalImps > 0) {
          merged.avgCTR = Math.round((merged.totalClicks / totalImps) * 10000) / 100;
        }
        setSummary(merged);
      }

      // ── Merge Insights → ChartPanel ──
      const fbInsights = metaInsightsJson?.success ? (metaInsightsJson.data ?? []) : [];
      const gInsights = googleInsightsJson?.success ? (googleInsightsJson.data ?? []) : [];
      setReportData([...fbInsights, ...gInsights]);

      // ── Merge Campaigns → Table ──
      const fbCampaigns = metaCampaignsJson?.success ? (metaCampaignsJson.data ?? []) : [];

      // Normalize Google campaigns from new route format (numeric enums)
      const GSTATUS: Record<number | string, "ACTIVE" | "PAUSED" | "ARCHIVED"> = {
        2: "ACTIVE", "ENABLED": "ACTIVE", 3: "PAUSED", "PAUSED": "PAUSED", 4: "ARCHIVED", "REMOVED": "ARCHIVED",
      };
      const GCHANNEL: Record<number | string, string> = {
        2: "Search", "SEARCH": "Search", 3: "Display", "DISPLAY": "Display", 6: "Video", "VIDEO": "Video", 9: "PMax", "PERFORMANCE_MAX": "PMax",
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalizeGG = (json: any): Campaign[] => {
        if (!json?.success || !json.data) return [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return json.data.filter((gc: any) => (GSTATUS[gc.status] ?? "ARCHIVED") === "ACTIVE").map((gc: any) => ({
          id: String(gc.id),
          name: gc.name,
          platform: "google" as const,
          status: GSTATUS[gc.status] ?? "ARCHIVED",
          objective: GCHANNEL[gc.channelType] ?? "",
          dailyBudget: gc.dailyBudget ?? 0, totalBudget: 0,
          startDate: "", endDate: null,
          company: gc.company,
          channelType: GCHANNEL[gc.channelType] ?? "",
          accountName: gc.company === "MBC" ? "Mắt Bão - VND" : gc.company === "MBI" ? "MIFI Active" : companyLabel(gc.company ?? ""), // Đợt 21: công ty khác không bị gắn nhãn MIFI
          accountId: "",
          metrics: {
            impressions: gc.metrics?.impressions ?? 0,
            clicks: gc.metrics?.clicks ?? 0,
            spend: gc.metrics?.spend ?? 0,
            ctr: parseFloat(gc.metrics?.ctr ?? "0"),
            cpc: gc.metrics?.avgCpc ?? 0, cpm: 0, roas: 0,
            conversions: gc.metrics?.conversions ?? 0,
            revenue: 0,
          },
        }));
      };
      const gCampaigns = googleCampJsons.flatMap((j) => normalizeGG(j));
      setCampaigns([...fbCampaigns, ...gCampaigns]);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      // Detect Facebook token expiry
      if (message.toLowerCase().includes("token") || message.toLowerCase().includes("oauth") || message.toLowerCase().includes("access token")) {
        setTokenExpired(true);
      }
      setError(message);
      toast({
        title: "Failed to load dashboard data",
        description: message,
        variant: "error",
        duration: 8000,
        action: {
          label: "Retry",
          onClick: fetchData,
        },
      });
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, selectedPlatform]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Render: not configured ──
  if (notConfigured) return <SetupBanner />;

  return (
    <>

      {/* ── System banners ── */}
      {/* "Báo cáo buổi sáng" (đánh giá AI hằng ngày) TẠM ẨN theo yêu cầu
          17/09/2026. Bỏ ẩn = xoá cặp {false && } bên dưới. Component và API
          (/api/automation/morning-briefing) vẫn còn nguyên, cron vẫn chạy —
          chỉ là không hiện trên Dashboard. */}
      {false && <MorningBriefingCard />}
      {hasModule("matbao") && <RevenueReminderBanner />}
      {tokenExpired && (
        <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-3 flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-900">Token Facebook đã hết hạn</p>
              <p className="text-xs text-amber-700">Kết nối lại Meta Ads để tiếp tục nhận dữ liệu mới.</p>
            </div>
          </div>
          <Link href="/settings">
            <Button className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Kết nối lại
            </Button>
          </Link>
        </div>
      )}

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 border-b border-slate-100 mb-1">
        {([
          { key: "overview",     label: "📊 Tổng quan" },
          { key: "trends",       label: "📈 Diễn biến" },
          { key: "kpi",          label: "📦 Chi Phí SP" },
          { key: "kpi-overview", label: "🎯 KPI Tổng Quan" },
          { key: "health",       label: "🩺 Tình trạng & cảnh báo" },
        ] as const).filter(t => hasModule("matbao") || (t.key !== "kpi" && t.key !== "kpi-overview")).map(t => ( /* Đợt 21 B: 2 tab KPI đọc Odoo / KPI MBC–MBI → chỉ gói Mắt Bão */
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            className={cn(
              "px-4 py-2 text-xs font-semibold border-b-2 transition-colors",
              mainTab === t.key
                ? "border-amber-500 text-amber-800 bg-amber-50/50"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Chi Phí SP tab ── */}
      {mainTab === "kpi" && hasModule("matbao") && <KpiTab />}

      {/* ── KPI Tổng Quan tab (mục tiêu vs thực tế) ── */}
      {mainTab === "kpi-overview" && hasModule("matbao") && <KpiOverviewTab />}

      {/* ── Tình trạng & cảnh báo tab (Đợt 5) ── */}
      {mainTab === "health" && <HealthOverviewTab />}

      {/* ── Diễn biến tab (Đợt 28) ── */}
      {mainTab === "trends" && <TrendsTab />}

      {/* ── Tổng quan tab ── */}
      {mainTab === "overview" && (
        <div className="space-y-8 pt-4">

          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {summary?.periodLabel && (
                <p className="text-xs text-slate-400">Lịch tổng quan · {summary.periodLabel}</p>
              )}
              <div className="flex items-center gap-0.5 rounded-full border border-slate-200 bg-white p-0.5 shadow-sm">
                {(["all", ...orderedCompanyIds(["MBC", "MBI"])] as CompanyFilter[]).map(c => ( // Đợt 25: công ty theo bản cài
                  <button
                    key={c}
                    onClick={() => setSelectedCompany(c)}
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                      selectedCompany === c
                        ? c === "MBC" ? "bg-blue-600 text-white shadow-sm"
                          : c === "MBI" ? "bg-violet-600 text-white shadow-sm"
                          : "bg-slate-700 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {c === "all" ? "Tất cả" : c === "MBC" || c === "MBI" ? c : companyLabel(c)}
                  </button>
                ))}
              </div>
            </div>
            <DateRangePicker />
          </div>

          {/* Zone 1: Cross-channel summary */}
          <DashboardSection title="Tổng hợp kênh">
            <UnifiedOverview />
          </DashboardSection>

          {/* Zone 2: Cần chú ý — hidden theo yêu cầu 21/09/2026.
              Từng chứa <CplDashboardWidget /> (đã ẩn 17/09/2026) và
              <NgramNegativeWidget />. Cả hai thẻ vẫn còn trong components/,
              trả lại là dựng lại được nguyên khối. Từ khoá nên chặn vẫn xem
              và xử lý được ở /toolkit/ngram. */}

          {/* Zone 3: Performance diagnostics — hidden */}
          {/* Zone 4: Budget & risk — hidden */}

          {/* Zone 5: Business outcome — doanh thu Odoo + P&L Report API: gói Mắt Bão (Đợt 21 A2) */}
          {hasModule("matbao") && (<DashboardSection
            title="Kết quả kinh doanh"
            actions={
              <button
                onClick={() => setMainTab("kpi-overview")}
                className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg px-2 py-1 transition-colors"
              >
                KPI Tổng quan <ArrowRight className="h-3 w-3" />
              </button>
            }
          >
            <RevenueChart />
            <CompanyPnL />
          </DashboardSection>)}

          {/* Zone 6: Daily trends (collapsible) */}
          <DashboardSection
            title="Xu hướng theo ngày"
            collapsible
            defaultCollapsed={false}
          >
            <ChartPanel data={reportData} isLoading={isLoading} />
          </DashboardSection>

          {/* Zone 7: Active campaigns */}
          <DashboardSection
            title="Chiến dịch đang chạy"
            actions={
              <Link href="/campaigns" className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 transition-colors">
                Xem tất cả <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            <CampaignTable campaigns={activeCampaigns} isLoading={isLoading} currency={currency} />
          </DashboardSection>

        </div>
      )}
    </>
  );
}
