"use client";

// ============================================================
// NbaTriage — Next Best Action triage queue (Prompt D)
// Hàng đợi xử lý cho marketing ops: lọc theo company/platform/type/
// executionMode/priority/status + lifecycle actions (acknowledge,
// snooze, resolve, dismiss, feedback). Desktop + mobile + states.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import { isHiddenPage } from "@/lib/hidden-pages";
import Link from "next/link";
import {
  Sparkles, RefreshCw, ArrowRight, AlertTriangle, Lock,
  Check, Clock, X, ThumbsUp, ThumbsDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { orderedCompanyIds, companyLabel } from "@/lib/companies/registry";

// Đợt 25: công ty theo bản cài (bản Mắt Bão y như cũ)
const coText = (id: string) => (id === "MBC" || id === "MBI" ? id : companyLabel(id));

type ExecMode = "advisory_only" | "manual_action" | "auto_apply_candidate";

interface Rec {
  id: string;
  company: string;
  platform: "facebook" | "google";
  recommendationType: string;
  reasonCodes: string[];
  title: string;
  summary: string;
  recommendedAction: string;
  expectedOutcome: string;
  executionMode: ExecMode;
  blockedBy: string[];
  internalLink?: string;
  estimatedMonthlySavings?: number;
  feedback?: "helped" | "not_helpful" | "ignored";
  band: "HIGH" | "MEDIUM" | "LOW";
}

interface ApiResponse {
  success: boolean;
  count: number;
  totalMonthlySavingsVnd: number;
  savingsBasis?: { countedItems: number; blockedExcluded: number; distinctEntities: number; method: string };
  /** Ngưỡng CPL đang chạy trên số dự phòng vì KPI tháng chưa nhập. */
  thresholdWarnings?: string[];
  totalsByPriorityBucket: Record<string, number>;
  totalsByPlatform: Record<string, number>;
  items: Rec[];
  error?: string;
}

const BAND: Record<Rec["band"], string> = {
  HIGH: "bg-red-100 text-red-700", MEDIUM: "bg-amber-100 text-amber-700", LOW: "bg-slate-100 text-slate-600",
};
const BAND_RANK: Record<Rec["band"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const BAND_STRIPE: Record<Rec["band"], string> = {
  HIGH: "border-l-4 border-l-red-500", MEDIUM: "border-l-4 border-l-amber-400", LOW: "border-l-4 border-l-slate-300",
};
const MODE: Record<ExecMode, { label: string; cls: string }> = {
  advisory_only: { label: "Tư vấn", cls: "bg-slate-100 text-slate-600" },
  manual_action: { label: "Làm tay", cls: "bg-amber-100 text-amber-700" },
  auto_apply_candidate: { label: "Tự áp được", cls: "bg-emerald-100 text-emerald-700" },
};
const BLOCK: Record<string, string> = {
  LEARNING_PHASE: "Đang học", LOW_DATA: "Thiếu dữ liệu", RECENT_CHANGE: "Vừa thay đổi",
  COOLDOWN_LIKELY: "Chờ nguội", LOW_CONFIDENCE: "Độ tin thấp", NOT_REVERSIBLE: "Khó hoàn tác",
};
const TYPE_LABEL: Record<string, string> = {
  REDUCE_CPL: "Giảm CPL", PAUSE_WASTE: "Chặn lãng phí", REFRESH_CREATIVE: "Làm mới creative",
  SCALE_BUDGET: "Tăng ngân sách", REVIEW_BUDGET: "Rà soát ngân sách", FIX_KEYWORD: "Sửa keyword",
  ADJUST_SCHEDULE: "Lịch chạy", ACCOUNT_FIX: "Tài khoản", IMPORTED_IMPROVEMENT: "Improvement",
};

function fmtVND(v: number): string {
  if (v >= 1_000_000_000) return `₫${(v / 1_000_000_000).toFixed(2)} tỷ`;
  if (v >= 1_000_000) return `₫${(v / 1_000_000).toFixed(1)}tr`;
  if (v >= 1_000) return `₫${Math.round(v / 1_000)}k`;
  return `₫${Math.round(v).toLocaleString("vi-VN")}`;
}

const PRIORITY_FILTERS = [
  { key: "0", label: "Tất cả" }, { key: "70", label: "HIGH" },
  { key: "45", label: "MEDIUM+" },
] as const;

export default function NbaTriage() {
  const [items, setItems] = useState<Rec[]>([]);
  const [meta, setMeta] = useState<{ savings: number; basis?: ApiResponse["savingsBasis"] } | null>(null);
  const [thresholdWarnings, setThresholdWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [company, setCompany] = useState("");
  const [platform, setPlatform] = useState("");
  const [mode, setMode] = useState("");
  const [type, setType] = useState("");
  const [minPriority, setMinPriority] = useState("0");
  const [status, setStatus] = useState("active"); // active | blocked | acknowledged | resolved

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (company) p.set("company", company);
    if (platform) p.set("platform", platform);
    if (mode) p.set("executionMode", mode);
    if (type) p.set("recommendationType", type);
    if (minPriority !== "0") p.set("minPriority", minPriority);
    if (status === "acknowledged") p.set("status", "acknowledged");
    else if (status === "resolved") p.set("status", "resolved");
    return p.toString();
  }, [company, platform, mode, type, minPriority, status]);

  const load = useCallback(async (refresh = false) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/next-best-action?${query}${refresh ? "&refresh=1" : ""}`);
      const text = await res.text();
      const json = (text ? JSON.parse(text) : {}) as ApiResponse;
      if (!res.ok || !json.success) throw new Error(json.error ?? `Lỗi tải dữ liệu (HTTP ${res.status})`);
      let list = json.items;
      if (status === "blocked") list = list.filter(r => (r.blockedBy ?? []).length > 0);
      if (status === "active") list = list.filter(r => (r.blockedBy ?? []).length === 0);
      list = [...list].sort((a, b) => (BAND_RANK[a.band] ?? 2) - (BAND_RANK[b.band] ?? 2));
      setItems(list);
      setMeta({ savings: json.totalMonthlySavingsVnd, basis: json.savingsBasis });
      setThresholdWarnings(json.thresholdWarnings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => { load(false); }, [load]);

  const triage = useCallback(async (id: string, action: string, extra?: Record<string, unknown>) => {
    setItems(prev => prev.filter(r => r.id !== id)); // optimistic
    try {
      await fetch("/api/next-best-action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...extra }),
      });
    } catch { /* optimistic */ }
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="rounded-full bg-violet-50 p-2"><Sparkles className="h-4 w-4 text-violet-600" /></div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-slate-800">Hàng đợi xử lý — Next Best Action</h2>
          <p className="text-[11px] text-slate-400">
            {items.length} việc{meta ? ` · tiết kiệm ước tính ${fmtVND(meta.savings)}/tháng` : ""}
            {meta?.basis && (
              // Con số này là ƯỚC TÍNH từ một tỉ lệ phần trăm cố định của chi
              // tiêu, không phải số đo được. Hiện trần trụi như số chắc chắn
              // là để người đọc mang đi báo cáo một thứ không có thật.
              <span
                title={`${meta.basis.method} Tính trên ${meta.basis.distinctEntities} chiến dịch, từ ${meta.basis.countedItems} việc đang hiện${meta.basis.blockedExcluded > 0 ? ` (không tính ${meta.basis.blockedExcluded} việc đang bị chặn)` : ""}.`}
                className="ml-1 cursor-help text-slate-400 underline decoration-dotted">
                ước tính thế nào?
              </span>
            )}
          </p>
        </div>
        <button onClick={() => load(true)} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 disabled:opacity-50">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Làm mới
        </button>
      </div>

      {/* Ngưỡng CPL đang chạy trên số đóng băng từ 7/2026 vì KPI tháng chưa
          nhập. Không báo thì mọi gợi ý "CPL vượt ngưỡng" bên dưới đang so với
          mục tiêu của một tháng đã qua, mà nhìn vào không thể biết. */}
      {thresholdWarnings.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-[11px] font-bold text-amber-900">
            ⚠️ Ngưỡng CPL đang dùng số của tháng cũ
          </p>
          {thresholdWarnings.map((w, i) => (
            <p key={i} className="mt-0.5 text-[11px] text-amber-800">{w}</p>
          ))}
        </div>
      )}

      

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <Select value={company} onChange={setCompany} options={[["", "Mọi công ty"], ...orderedCompanyIds(["MBC", "MBI"]).map((c) => [c, coText(c)] as [string, string])]} />
        <Select value={platform} onChange={setPlatform} options={[["", "Mọi nền"], ["facebook", "Facebook"], ["google", "Google"]]} />
        <Select value={mode} onChange={setMode} options={[["", "Mọi chế độ"], ["advisory_only", "Tư vấn"], ["manual_action", "Làm tay"], ["auto_apply_candidate", "Tự áp"]]} />
        <Select value={type} onChange={setType} options={[["", "Mọi loại"], ...Object.entries(TYPE_LABEL)]} />
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {PRIORITY_FILTERS.map(p => (
            <button key={p.key} onClick={() => setMinPriority(p.key)}
              className={cn("px-2.5 py-1 rounded-md font-semibold transition", minPriority === p.key ? "bg-white text-blue-700 shadow-sm" : "text-slate-500")}>{p.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {([["active", "Cần làm"], ["blocked", "Bị chặn"], ["acknowledged", "Đã nhận"], ["resolved", "Đã xong"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)}
              className={cn("px-2.5 py-1 rounded-md font-semibold transition", status === k ? "bg-white text-blue-700 shadow-sm" : "text-slate-500")}>{l}</button>
          ))}
        </div>
      </div>

      {/* Body */}
      {error ? (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      ) : loading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-400 text-center py-10">Không có việc nào khớp bộ lọc 🎉</div>
      ) : (
        <div className="space-y-3">
          {items.map(r => (
            <div key={r.id} className={cn("rounded-xl border border-slate-100 bg-slate-50/40 p-4", BAND_STRIPE[r.band] ?? BAND_STRIPE.LOW)}>
              <div className="flex items-start gap-2 flex-wrap">
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md", BAND[r.band] ?? BAND.LOW)}>{r.band ?? "LOW"}</span>
                <p className="text-sm font-semibold text-slate-800 flex-1 min-w-[200px]">{r.title}</p>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-500">{r.company}</span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{TYPE_LABEL[r.recommendationType] ?? r.recommendationType}</span>
                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", (MODE[r.executionMode] ?? MODE.advisory_only).cls)}>{(MODE[r.executionMode] ?? MODE.advisory_only).label}</span>
                {(r.blockedBy ?? []).map(b => (
                  <span key={b} className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-50 text-orange-600"><Lock className="h-2.5 w-2.5" />{BLOCK[b] ?? b}</span>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1.5">{r.summary}</p>
              <div className="grid sm:grid-cols-2 gap-2 mt-2 text-[11px]">
                <p className="text-slate-600"><span className="font-semibold text-slate-700">Nên làm:</span> {r.recommendedAction}</p>
                <p className="text-slate-600"><span className="font-semibold text-slate-700">Kỳ vọng:</span> {r.expectedOutcome}</p>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {r.estimatedMonthlySavings ? <span className="text-[11px] font-semibold text-emerald-600 mr-1">≈ {fmtVND(r.estimatedMonthlySavings)}/tháng</span> : null}
                {r.internalLink && !isHiddenPage(r.internalLink) && <Link href={r.internalLink} className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 mr-auto">Mở tool <ArrowRight className="h-3 w-3" /></Link>}
                <TriageBtn icon={<Check className="h-3 w-3" />} label="Đã nhận" onClick={() => triage(r.id, "acknowledge")} />
                <TriageBtn icon={<Clock className="h-3 w-3" />} label="Hoãn 1d" onClick={() => triage(r.id, "snooze", { hours: 24 })} />
                <TriageBtn icon={<Check className="h-3 w-3" />} label="Xong" onClick={() => triage(r.id, "resolve")} accent="emerald" />
                <TriageBtn icon={<X className="h-3 w-3" />} label="Bỏ qua" onClick={() => triage(r.id, "dismiss")} />
                <TriageBtn icon={<ThumbsUp className="h-3 w-3" />} label="" onClick={() => triage(r.id, "feedback", { feedback: "helped" })} accent="emerald" title="Hữu ích" />
                <TriageBtn icon={<ThumbsDown className="h-3 w-3" />} label="" onClick={() => triage(r.id, "feedback", { feedback: "not_helpful" })} title="Không hữu ích" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-600 focus:outline-none focus:border-blue-400">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function TriageBtn({ icon, label, onClick, accent, title }: { icon: React.ReactNode; label: string; onClick: () => void; accent?: "emerald"; title?: string }) {
  return (
    <button onClick={onClick} title={title ?? label}
      className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition",
        accent === "emerald" ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-slate-200 text-slate-500 hover:bg-slate-100")}>
      {icon}{label && <span>{label}</span>}
    </button>
  );
}
