"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/components/SessionProvider";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import {
  FileText, Download, Loader2, Table2, Calendar,
  Building2, CheckSquare, Clock, FileSpreadsheet,
  DollarSign, TrendingUp, Target, MousePointer, BarChart3,
  Database,
} from "lucide-react";
import OdooRevenueTab from "./odoo-tab";

type MainTab = "ads" | "odoo";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface ReportHistoryItem {
  id: string;
  name: string;
  company: string;
  format: "pdf" | "excel";
  period: string;
  generated_by: string;
  generated_at: string;
}

interface AnalyticsOverview {
  totalSpend: number;
  totalRevenue: number;
  avgROAS: number;
  avgCTR: number;
  totalImpressions: number;
  totalClicks: number;
  fbSpend: number;
  googleSpend: number;
  fbROAS: number;
  googleROAS: number;
}

type PeriodPreset = "this_month" | "last_month" | "this_week" | "custom";
type CompanyChoice = string /* mã công ty hoặc "ALL" */;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// `toISOString()` đổi sang UTC rồi mới cắt lấy ngày: ở VN (UTC+7), 00:00 ngày
// 01/08 giờ địa phương ra "2026-07-31". Cả trang này lẫn tab Odoo đều dính, nên
// "Tháng này" thực chất hỏi 31/07 → 30/08 — thừa một ngày của tháng trước và
// thiếu ngày cuối tháng. Ngày ở đây là ngày theo lịch địa phương.
function ymdLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getMonthRange(offset: number): { start: string; end: string } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return {
    start: ymdLocal(d),
    end:   ymdLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  };
}

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return { start: ymdLocal(start), end: ymdLocal(now) };
}

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

function fmtVN(v: number): string {
  if (v >= 1_000_000_000) return `₫${(v / 1_000_000_000).toFixed(1)}Tỷ`;
  if (v >= 1_000_000) return `₫${(v / 1_000_000).toFixed(1)}Tr`;
  if (v >= 1_000) return `₫${(v / 1_000).toFixed(0)}K`;
  return `₫${Math.round(v).toLocaleString("vi-VN")}`;
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function ReportsPage() {
  const { user } = useSession();

  // Main tab
  const [mainTab, setMainTab] = useState<MainTab>("ads");

  // Config
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [company, setCompany] = useState<CompanyChoice>("ALL");
  const [sections, setSections] = useState({
    summary: true,
    campaigns: true,
    cpl: true,
    budget_history: true,
    ai_insights: false,
  });

  // State
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState(false);
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  /** Có giá trị = một nền tảng lấy hụt số, tổng bên dưới đang thiếu. */
  const [partialError, setPartialError] = useState<string | null>(null);

  // Compute period
  const getPeriod = () => {
    if (periodPreset === "this_month") return getMonthRange(0);
    if (periodPreset === "last_month") return getMonthRange(-1);
    if (periodPreset === "this_week") return getWeekRange();
    return { start: customStart, end: customEnd };
  };

  // Fetch analytics overview
  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoadingAnalytics(true);
      try {
        const period = getPeriod();
        const [metaRes, googleRes] = await Promise.allSettled([
          fetch(`/api/meta/summary?from=${period.start}&to=${period.end}`).then(r => r.json()),
          fetch(`/api/google/summary?from=${period.start}&to=${period.end}`).then(r => r.json()).catch(() => null),
        ]);

        const metaData = metaRes.status === "fulfilled" && metaRes.value?.success ? metaRes.value.data?.summary : null;
        const googleData = googleRes.status === "fulfilled" && googleRes.value?.success ? googleRes.value.data?.summary : null;

        // Lấy hụt một nền tảng thì các thẻ dưới đây đang cộng thiếu, KHÔNG phải
        // nền tảng đó tiêu 0đ. Bản cũ nuốt hết vào 0 nên hôm Meta chặn vì vượt
        // hạn mức API, trang này vẫn hiện một con "Tổng chi tiêu" trông rất
        // bình thường mà thiếu hẳn phần Facebook.
        const failed: string[] = [];
        if (!metaData) failed.push("Facebook");
        if (!googleData) failed.push("Google");
        setPartialError(
          failed.length
            ? `Không lấy được số ${failed.join(" và ")} — các thẻ dưới đây đang THIẾU phần này, không phải chi 0đ.`
            : null,
        );

        const fbSpend = metaData?.totalSpend ?? 0;
        const gSpend = googleData?.totalSpend ?? 0;
        const fbRevenue = metaData?.totalRevenue ?? 0;
        const gRevenue = googleData?.totalRevenue ?? 0;
        const totalSpend = fbSpend + gSpend;
        const totalRevenue = fbRevenue + gRevenue;
        const totalImpressions = (metaData?.totalImpressions ?? 0) + (googleData?.totalImpressions ?? 0);
        const totalClicks = (metaData?.totalClicks ?? 0) + (googleData?.totalClicks ?? 0);

        setAnalytics({
          totalSpend,
          totalRevenue,
          avgROAS: totalSpend > 0 ? totalRevenue / totalSpend : 0,
          // Combined FB+Google CTR — must match the combined totalImpressions/
          // totalClicks shown alongside it (was Meta-only, mismatched the card).
          avgCTR: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
          totalImpressions,
          totalClicks,
          fbSpend,
          googleSpend: gSpend,
          fbROAS: fbSpend > 0 ? fbRevenue / fbSpend : 0,
          googleROAS: gSpend > 0 ? gRevenue / gSpend : 0,
        });
      } catch (err) {
        setPartialError(
          err instanceof Error ? `Không tải được tổng quan: ${err.message}` : "Không tải được tổng quan",
        );
      } finally {
        setLoadingAnalytics(false);
      }
    };
    fetchAnalytics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodPreset, customStart, customEnd]);

  // Fetch history
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/reports?action=history");
      const json = await res.json();
      if (json.success) setHistory(json.data);
    } catch { /* ignore */ } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => { fetchHistory(); }, []);

  // Export handler
  const handleExport = async (format: "pdf" | "excel") => {
    const setter = format === "pdf" ? setGeneratingPDF : setGeneratingExcel;
    setter(true);
    try {
      const period = getPeriod();
      const res = await fetch(`/api/reports/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, company, sections }),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "pdf"
        ? `BaoCao-${company}-${period.start}.pdf`
        : `BaoCao-${company}-${period.start}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      // Refresh history
      setTimeout(fetchHistory, 500);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi xuất báo cáo. Vui lòng thử lại.");
    } finally {
      setter(false);
    }
  };

  const currentMonthLabel = new Date().toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
  const lastMonthLabel = new Date(Date.now() - 30 * 86400000).toLocaleDateString("vi-VN", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-blue-600" /> Reports & Analytics
        </h1>
        <p className="text-sm text-slate-500 mt-1">Tổng quan hiệu quả quảng cáo và xuất báo cáo tự động.</p>
      </div>

      {/* ── Main Tab Switcher ── */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setMainTab("ads")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
            mainTab === "ads"
              ? "bg-white text-amber-800 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          <BarChart3 className="h-4 w-4" />
          Ads Analytics
        </button>
        <button
          onClick={() => setMainTab("odoo")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
            mainTab === "odoo"
              ? "bg-white text-violet-700 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Database className="h-4 w-4" />
          Odoo ERP
        </button>
      </div>

      {/* ── Odoo Tab ── */}
      {mainTab === "odoo" && (
        <OdooRevenueTab
          adsSpend={analytics?.totalSpend ?? 0}
        />
      )}

      {/* ── Ads Tab content (existing) — hidden when Odoo tab active ── */}
      {mainTab === "ads" && <>

      {/* ── Analytics Overview ── */}
      <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl">
        <h3 className="text-sm font-bold text-slate-300 mb-1 flex items-center gap-1.5">
          📊 Tổng Quan Hiệu Quả — {currentMonthLabel}
        </h3>
        {/* Khối này KHÔNG chịu bộ lọc "Công ty" bên dưới (bộ lọc đó chỉ áp cho
            file xuất ra): /api/meta/summary và /api/google/summary không nhận
            tham số company. Nói rõ phạm vi còn hơn để người đọc tự suy là nó
            đang theo lựa chọn của mình. */}
        <p className="text-[11px] text-slate-400 mb-4">
          Toàn tài khoản (MBC + MBI), theo kỳ đã chọn — không đổi theo bộ lọc Công ty ở phần Xuất báo cáo.
        </p>

        {partialError && (
          <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
            ⚠️ {partialError}
          </div>
        )}

        {loadingAnalytics ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0,1,2,3].map(i => (
              <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : analytics ? (
          <>
            {/* Top KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div className="rounded-xl bg-white/10 backdrop-blur-sm p-4 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Tổng Chi Tiêu</span>
                  <DollarSign className="h-4 w-4 text-blue-400" />
                </div>
                <p className="text-xl font-black">{fmtVN(analytics.totalSpend)}</p>
              </div>
              <div className="rounded-xl bg-white/10 backdrop-blur-sm p-4 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Doanh Thu</span>
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                </div>
                <p className="text-xl font-black">{fmtVN(analytics.totalRevenue)}</p>
              </div>
              <div className="rounded-xl bg-white/10 backdrop-blur-sm p-4 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">ROAS</span>
                  <Target className="h-4 w-4 text-violet-400" />
                </div>
                <p className="text-xl font-black">{analytics.avgROAS.toFixed(1)}x</p>
              </div>
              <div className="rounded-xl bg-white/10 backdrop-blur-sm p-4 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Impressions</span>
                  <MousePointer className="h-4 w-4 text-amber-400" />
                </div>
                <p className="text-xl font-black">{formatNumber(analytics.totalImpressions)}</p>
              </div>
            </div>

            {/* Platform split */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-blue-500/15 border border-blue-400/20 p-4">
                <p className="text-xs font-bold text-blue-300 mb-2">🔵 Facebook</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-slate-400">Spend:</span> <b>{fmtVN(analytics.fbSpend)}</b></div>
                  <div><span className="text-slate-400">ROAS:</span> <b>{analytics.fbROAS.toFixed(1)}x</b></div>
                </div>
                {analytics.totalSpend > 0 && (
                  <div className="mt-2 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(analytics.fbSpend / analytics.totalSpend) * 100}%` }} />
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-red-500/15 border border-red-400/20 p-4">
                <p className="text-xs font-bold text-red-300 mb-2">🔴 Google</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-slate-400">Spend:</span> <b>{fmtVN(analytics.googleSpend)}</b></div>
                  <div><span className="text-slate-400">ROAS:</span> <b>{analytics.googleROAS.toFixed(1)}x</b></div>
                </div>
                {analytics.totalSpend > 0 && (
                  <div className="mt-2 h-1.5 bg-red-900/50 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${(analytics.googleSpend / analytics.totalSpend) * 100}%` }} />
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">Không thể tải dữ liệu phân tích.</p>
        )}
      </div>

      {/* ── Export Section ── */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5 text-blue-600" /> Xuất Báo Cáo
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Config ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Period */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3">
              <Calendar className="h-4 w-4 text-blue-500" /> Kỳ báo cáo
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { key: "this_month", label: `Tháng này (${currentMonthLabel})` },
                { key: "last_month", label: `Tháng trước (${lastMonthLabel})` },
                { key: "this_week", label: "Tuần này" },
                { key: "custom", label: "Tuỳ chọn" },
              ] as const).map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriodPreset(p.key)}
                  className={cn(
                    "border rounded-lg px-3 py-2 text-xs font-semibold transition-all",
                    periodPreset === p.key
                      ? "border-amber-500 bg-amber-50 text-amber-800 shadow-sm"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {periodPreset === "custom" && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Từ ngày</label>
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Đến ngày</label>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Company */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3">
              <Building2 className="h-4 w-4 text-violet-500" /> Công ty
            </h3>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              {([
                { key: "ALL", label: "Cả hai — MBC & MBI", color: "border-slate-500 bg-slate-50 text-slate-700" },
                { key: "MBC", label: "MBC only", color: "border-blue-500 bg-blue-50 text-blue-700" },
                { key: "MBI", label: "MBI only", color: "border-violet-500 bg-violet-50 text-violet-700" },
              ] as const).map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCompany(c.key)}
                  className={cn(
                    "border rounded-lg px-4 py-2 text-xs font-semibold transition-all",
                    company === c.key ? `${c.color} shadow-sm` : "border-slate-200 text-slate-500 hover:border-slate-300"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3">
              <CheckSquare className="h-4 w-4 text-emerald-500" /> Nội dung xuất
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { key: "summary", label: "Tổng quan KPIs (Spend, Leads, CPL)" },
                { key: "campaigns", label: "Bảng campaigns chi tiết" },
                { key: "cpl", label: "CPL Tracking (MBC vs MBI)" },
                { key: "budget_history", label: "Lịch sử điều chỉnh budget" },
                { key: "ai_insights", label: "AI Insights & nhận xét" },
              ] as const).map((s) => (
                <label
                  key={s.key}
                  className={cn(
                    "flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer transition-all text-xs font-medium",
                    sections[s.key]
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={sections[s.key]}
                    onChange={(e) => setSections({ ...sections, [s.key]: e.target.checked })}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => handleExport("pdf")}
              disabled={generatingPDF}
              className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white font-semibold gap-2 shadow-md"
            >
              {generatingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              📄 Xuất PDF
            </Button>
            <Button
              onClick={() => handleExport("excel")}
              disabled={generatingExcel}
              className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 shadow-md"
            >
              {generatingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              📊 Xuất Excel
            </Button>
          </div>
        </div>

        {/* ── Right: History ── */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-400" /> Lịch sử xuất
              </h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {loadingHistory ? (
                <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" /></div>
              ) : history.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">Chưa có báo cáo nào</div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{item.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded",
                            item.company === "MBC" ? "bg-blue-100 text-blue-700"
                              : item.company === "MBI" ? "bg-violet-100 text-violet-700"
                              : "bg-slate-100 text-slate-600"
                          )}>
                            {item.company}
                          </span>
                          <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded",
                            item.format === "pdf" ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                          )}>
                            {item.format.toUpperCase()}
                          </span>
                          <span className="text-[10px] text-slate-400">{timeAgo(item.generated_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Preview hint */}
          <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-slate-200 p-5 text-center">
            <FileText className="h-10 w-10 text-blue-200 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-medium">
              Chọn cấu hình rồi nhấn Xuất PDF hoặc Excel để tạo báo cáo tự động.
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Xuất bởi: {user?.name || "User"} · {user?.role || ""}
            </p>
          </div>
        </div>
      </div>

      {/* End of ads tab */}
      </>}
    </div>
  );
}
