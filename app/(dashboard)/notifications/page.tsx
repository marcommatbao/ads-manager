"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/SessionProvider";
import {
  Bell, Check, Trash2, Loader2, Filter, Sparkles, X,
  AlertTriangle, AlertCircle, Info, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Severity = "critical" | "warning" | "info";

interface RootCauseAnalysis {
  cpl: number | null;
  cpl_level: "good" | "warning" | "critical" | "no_data";
  budget_constrained: boolean;
  likely_causes: string[];
  suggested_actions: string[];
  ai_generated: boolean;
}

interface Alert {
  id: string;
  type: string;
  severity: Severity;
  campaign_id: string;
  campaign_name: string;
  company: string;
  message: string;
  metadata: Record<string, number | string | undefined>;
  root_cause?: RootCauseAnalysis;
  is_read: boolean;
  is_resolved: boolean;
  resolved_note?: string;
  resolved_at?: string;
  created_at: string;
}

const CPL_ALERT_TYPES = new Set(["cpl_critical", "cpl_warning"]);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(dateStr).toLocaleDateString("vi-VN");
}

function fmt(n: number | undefined | string): string {
  if (n === undefined || typeof n === "string") return "—";
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

const SEVERITY_CONFIG: Record<Severity, {
  label: string;
  icon: typeof AlertTriangle;
  color: string;
  bg: string;
  border: string;
  dot: string;
}> = {
  critical: { label: "Critical", icon: AlertCircle,    color: "text-red-700",   bg: "bg-red-50",    border: "border-red-200",    dot: "bg-red-500" },
  warning:  { label: "Warning",  icon: AlertTriangle,  color: "text-amber-700", bg: "bg-amber-50",  border: "border-amber-200",  dot: "bg-amber-500" },
  info:     { label: "Info",     icon: Info,            color: "text-blue-700",  bg: "bg-blue-50",   border: "border-blue-200",   dot: "bg-blue-500" },
};

// ─────────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────────

export default function NotificationsPage() {
  const { user } = useSession();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Severity | "resolved">("all");
  const [companyFilter, setCompanyFilter] = useState<"all" | string>("all");

  // Resolve modal
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");

  // AI insight (non-CPL alert types)
  const [aiInsight, setAiInsight] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  // Root-cause diagnosis (CPL alert types) — on-demand fetch when the alert
  // wasn't auto-generated yet (cron just ran, or Gemini was unavailable then).
  const [rootCauseOverride, setRootCauseOverride] = useState<Record<string, RootCauseAnalysis>>({});
  const [rootCauseLoading, setRootCauseLoading] = useState<string | null>(null);
  const [rootCauseError, setRootCauseError] = useState<Record<string, string>>({});

  const router = useRouter();

  // Swipe Gestures State
  const [swipeOffset, setSwipeOffset] = useState<Record<string, number>>({});
  const [startX, setStartX] = useState<number | null>(null);
  const [currentSwipeId, setCurrentSwipeId] = useState<string | null>(null);

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    setStartX(e.touches[0].clientX);
    setCurrentSwipeId(id);
  };

  const handleTouchMove = (e: React.TouchEvent, id: string) => {
    if (startX === null || currentSwipeId !== id) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    // Limit visually dragging too far
    if (Math.abs(diff) < 120) {
      setSwipeOffset(prev => ({ ...prev, [id]: diff }));
    }
  };

  const handleTouchEnd = (id: string, campaignId: string) => {
    const offset = swipeOffset[id] || 0;
    if (offset < -70) {
      // Swipe Left => Resolve
      handleResolve(id);
    } else if (offset > 70) {
      // Swipe Right => View Campaign
      router.push(`/campaigns/${campaignId}?platform=facebook`);
    }
    setStartX(null);
    setCurrentSwipeId(null);
    setSwipeOffset(prev => ({ ...prev, [id]: 0 }));
  };

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const resolved = filter === "resolved" ? "true" : "false";
      const res = await fetch(`/api/notifications?resolved=${resolved}`);
      const json = await res.json();
      if (json.success) setAlerts(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAlerts(); }, [filter]);

  const filtered = alerts.filter((a) => {
    if (filter !== "all" && filter !== "resolved" && a.severity !== filter) return false;
    if (companyFilter !== "all" && a.company !== companyFilter) return false;
    return true;
  });

  const handleResolve = async (id: string) => {
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", note: resolveNote }),
    });
    setResolvingId(null);
    setResolveNote("");
    fetchAlerts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa thông báo này?")) return;
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    fetchAlerts();
  };

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    fetchAlerts();
  };

  const getRootCause = async (alert: Alert) => {
    setRootCauseLoading(alert.id);
    setRootCauseError((prev) => ({ ...prev, [alert.id]: "" }));
    try {
      const res = await fetch(`/api/cpl/root-cause?campaign_id=${encodeURIComponent(alert.campaign_id)}`);
      const json = await res.json();
      if (json.success) {
        setRootCauseOverride((prev) => ({ ...prev, [alert.id]: json.data }));
      } else {
        setRootCauseError((prev) => ({ ...prev, [alert.id]: json.error || "Không thể phân tích" }));
      }
    } catch (err) {
      setRootCauseError((prev) => ({ ...prev, [alert.id]: err instanceof Error ? err.message : "Lỗi kết nối" }));
    } finally {
      setRootCauseLoading(null);
    }
  };

  const getAiSuggestion = async (alert: Alert) => {
    setAiLoading(alert.id);
    try {
      const prompt = `Analyze this ad campaign alert and provide a short actionable recommendation in Vietnamese (2-3 sentences):\n\nAlert: ${alert.message}\nCampaign: ${alert.campaign_name}\nCompany: ${alert.company}\nSpend: ${fmt(alert.metadata?.spend as number)}\nConversions: ${fmt(alert.metadata?.conversions as number)}\nCPL: ${fmt(alert.metadata?.cpl as number)}`;
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, type: "alert_suggestion" }),
      });
      const json = await res.json();
      if (json.success) {
        setAiInsight((prev) => ({ ...prev, [alert.id]: json.data?.response || json.data }));
      } else {
        setAiInsight((prev) => ({ ...prev, [alert.id]: `⚠️ Lỗi: ${json.error || "Không thể lấy gợi ý"}` }));
      }
    } catch (err) {
      setAiInsight((prev) => ({
        ...prev,
        [alert.id]: `⚠️ Lỗi kết nối: ${err instanceof Error ? err.message : "Thử lại sau"}`,
      }));
    } finally {
      setAiLoading(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Bell className="h-6 w-6 text-blue-600" /> Tất cả thông báo
          </h1>
          <p className="text-sm text-slate-500 mt-1">Alerts tự động từ hệ thống giám sát campaigns.</p>
        </div>
        <Button onClick={handleMarkAllRead} variant="outline" className="text-xs gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> Đánh dấu tất cả đã đọc
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg max-w-full overflow-x-auto flex-nowrap scrollbar-hide">
          {(["all", "critical", "warning", "info", "resolved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                filter === f ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {f === "all" ? "Tất cả" : f === "critical" ? "🔴 Critical" : f === "warning" ? "🟡 Warning" : f === "info" ? "🟢 Info" : "✓ Đã giải quyết"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg max-w-full overflow-x-auto flex-nowrap scrollbar-hide">
          {(["all", "MBC", "MBI"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCompanyFilter(c)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                companyFilter === c
                  ? c === "MBC" ? "bg-blue-600 text-white shadow-sm"
                    : c === "MBI" ? "bg-violet-600 text-white shadow-sm"
                    : "bg-white shadow-sm text-slate-800"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {c === "all" ? "Tất cả" : c}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} thông báo</span>
      </div>

      {/* Alert List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-xl border border-slate-200">
            <Bell className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">Không có thông báo nào</p>
          </div>
        ) : (
          filtered.map((alert) => {
            const sev = SEVERITY_CONFIG[alert.severity];
            const SevIcon = sev.icon;
            const offset = swipeOffset[alert.id] || 0;
            const isCplAlert = CPL_ALERT_TYPES.has(alert.type);
            const rootCause = alert.root_cause ?? rootCauseOverride[alert.id];
            return (
              <div
                key={alert.id}
                onTouchStart={(e) => handleTouchStart(e, alert.id)}
                onTouchMove={(e) => handleTouchMove(e, alert.id)}
                onTouchEnd={() => handleTouchEnd(alert.id, alert.campaign_id)}
                style={{ transform: `translateX(${offset}px)` }}
                className={cn(
                  "rounded-xl border overflow-hidden bg-white shadow-sm transition-transform duration-200 relative",
                  !alert.is_read && "ring-1",
                  !alert.is_read && alert.severity === "critical" && "ring-red-300",
                  !alert.is_read && alert.severity === "warning" && "ring-amber-300",
                  !alert.is_read && alert.severity === "info" && "ring-blue-300",
                  alert.is_resolved && "opacity-60",
                  startX === null && "transition-transform"
                )}
              >
                {/* Header bar */}
                <div className={cn("flex items-center gap-2 px-4 py-2", sev.bg, "border-b", sev.border)}>
                  <SevIcon className={cn("h-3.5 w-3.5", sev.color)} />
                  <span className={cn("text-[11px] font-bold uppercase", sev.color)}>{sev.label}</span>
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", alert.company === "MBC" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700")}>
                    {alert.company}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-auto">{timeAgo(alert.created_at)}</span>
                  {alert.is_resolved && <span className="text-[10px] font-bold text-emerald-600">✓ Đã giải quyết</span>}
                </div>

                {/* Body */}
                <div className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">{alert.message}</p>
                  <p className="text-xs text-slate-500 mt-1">Campaign: {alert.campaign_name}</p>

                  {/* Metrics */}
                  {alert.metadata && (
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                      {alert.metadata.spend !== undefined && <span>Spend: ₫{fmt(alert.metadata.spend as number)}</span>}
                      {alert.metadata.conversions !== undefined && <span>Conversions: {fmt(alert.metadata.conversions as number)}</span>}
                      {alert.metadata.cpl !== undefined && <span>CPL: ₫{fmt(alert.metadata.cpl as number)}</span>}
                      {alert.metadata.budget_remaining_pct !== undefined && <span>Budget còn: {Math.round(alert.metadata.budget_remaining_pct as number)}%</span>}
                    </div>
                  )}

                  {/* Root-cause diagnosis (CPL alerts) */}
                  {isCplAlert && rootCause && (
                    <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-800 space-y-2">
                      <p className="font-bold text-indigo-600 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Vì sao CPL spike{!rootCause.ai_generated && " (phân tích cơ bản — AI không khả dụng)"}
                      </p>
                      <div>
                        <p className="font-semibold text-indigo-700">Nguyên nhân khả dĩ:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {rootCause.likely_causes.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-indigo-700">Đề xuất:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {rootCause.suggested_actions.map((a, i) => <li key={i}>{a}</li>)}
                        </ul>
                      </div>
                      {rootCause.budget_constrained && (
                        <p className="text-indigo-500 italic">⚠️ Đang mất impression share vì giới hạn ngân sách (Google)</p>
                      )}
                    </div>
                  )}
                  {isCplAlert && rootCauseError[alert.id] && (
                    <p className="mt-2 text-xs text-red-500">⚠️ {rootCauseError[alert.id]}</p>
                  )}

                  {/* AI Insight (non-CPL alert types) */}
                  {!isCplAlert && aiInsight[alert.id] && (
                    <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-800">
                      <p className="font-bold text-indigo-600 mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Gợi ý AI</p>
                      {aiInsight[alert.id]}
                    </div>
                  )}

                  {/* Resolve Note */}
                  {alert.resolved_note && (
                    <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-700">
                      <b>Ghi chú:</b> {alert.resolved_note}
                    </div>
                  )}

                  {/* Actions */}
                  {!alert.is_resolved && (
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => { setResolvingId(alert.id); setResolveNote(""); }}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-emerald-50 transition-colors"
                      >
                        <Check className="h-3 w-3" /> Giải quyết
                      </button>
                      {isCplAlert ? (
                        !rootCause && (
                          <button
                            onClick={() => getRootCause(alert)}
                            disabled={rootCauseLoading === alert.id}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                          >
                            {rootCauseLoading === alert.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Phân tích nguyên nhân
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => getAiSuggestion(alert)}
                          disabled={aiLoading === alert.id}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                        >
                          {aiLoading === alert.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Gợi ý AI
                        </button>
                      )}
                      {user?.role === "super_admin" && (
                        <button
                          onClick={() => handleDelete(alert.id)}
                          className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 transition-colors ml-auto"
                        >
                          <Trash2 className="h-3 w-3" /> Xóa
                        </button>
                      )}
                    </div>
                  )}

                  {/* Swipe Help Text on Mobile */}
                  <div className="md:hidden flex justify-between text-[10px] text-slate-300 mt-4 px-2">
                    <span>👉 Trượt phải: Xem chiến dịch</span>
                    <span>👈 Trượt trái: Giải quyết</span>
                  </div>
                </div>

                {/* Resolve Modal inline */}
                {resolvingId === alert.id && (
                  <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Ghi chú xử lý (tùy chọn)</label>
                      <input
                        type="text"
                        value={resolveNote}
                        onChange={(e) => setResolveNote(e.target.value)}
                        placeholder="VD: Đã pause campaign, test creative mới..."
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:border-emerald-400 focus:outline-none"
                      />
                    </div>
                    <Button onClick={() => handleResolve(alert.id)} className="h-8 text-xs bg-emerald-600 text-white gap-1">
                      <Check className="h-3 w-3" /> Xác nhận
                    </Button>
                    <button onClick={() => setResolvingId(null)} className="h-8 text-xs text-slate-400 hover:text-slate-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
