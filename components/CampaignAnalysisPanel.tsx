"use client";

// ============================================================
// Tấm phân tích hiệu quả chiến dịch — gắn trên trang chi tiết
// ============================================================
// BA QUYẾT ĐỊNH THIẾT KẾ ĐÁNG GHI LẠI:
//
// 1. BẤM MỚI CHẠY, không tự chạy khi mở trang.
//    Mỗi lượt phân tích là một lượt gọi Gemini có tính tiền cộng một vòng kéo
//    dữ liệu Meta/Google. Tự chạy nghĩa là mỗi lần ai đó lỡ mở trang chi tiết
//    là mất tiền. Repo này đã có tiền lệ một tính năng gọi API trả phí không
//    trần và đốt tiền thật.
//
// 2. SỐ THẬT ĐẶT CẠNH LỜI AI, không giấu đi.
//    Phần "Dựa trên gì" và "Số liệu" của từng trụ luôn mở xem được. Người dùng
//    phải đối chiếu được lời AI với số gốc ngay trên cùng màn hình, thay vì
//    phải tin.
//
// 3. NÚT "ÁP NGAY" CHỈ HIỆN KHI THẬT SỰ GHI ĐƯỢC.
//    Hệ thống hiện chỉ có đường ghi thật ở CẤP CHIẾN DỊCH (tạm dừng, đổi ngân
//    sách ngày) — cả Meta lẫn Google. Cấp nhóm quảng cáo thì CHƯA có. Việc nào
//    chưa ghi được thì hiện hướng dẫn làm tay, không dựng một cái nút bấm vào
//    không đổi gì. Một nút giả còn tệ hơn không có nút: người dùng tưởng đã
//    xử lý xong rồi bỏ đi.
// ============================================================

import { useState } from "react";
import {
  Sparkles, Loader2, AlertTriangle, CheckCircle2, AlertCircle,
  HelpCircle, ChevronDown, ChevronRight, ExternalLink, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// Kiểu dữ liệu — khớp với app/api/campaigns/[id]/analysis
// ─────────────────────────────────────────────

type PillarStatus = "good" | "warn" | "bad" | "unknown";
type Severity = "critical" | "warning" | "info";

type ApplyAction =
  | { kind: "PAUSE_CAMPAIGN" }
  | { kind: "SET_DAILY_BUDGET"; currentDailyBudget: number; newDailyBudget: number };

interface Pillar {
  key: string; label: string; status: PillarStatus;
  headline: string; basis: string; evidence: string[];
}

interface Finding {
  id: string; severity: Severity; title: string;
  detail: string; recommendation: string;
  apply: ApplyAction | null; manualHint?: string;
}

interface AnalysisResponse {
  campaignName: string;
  platform: "facebook" | "google";
  company: string | null;
  period: { from: string; to: string };
  dailyBudget: number;
  analysis: {
    score: number | null;
    gated: boolean;
    gateReason: string | null;
    verdict: string;
    pillars: Pillar[];
    findings: Finding[];
    dataWarnings: string[];
  };
  narrative: string | null;
  narrativeError: string | null;
  error?: string;
}

// ─────────────────────────────────────────────
// Trình bày
// ─────────────────────────────────────────────

const STATUS_STYLE: Record<PillarStatus, { chip: string; icon: React.ReactNode; label: string }> = {
  good:    { chip: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="h-3.5 w-3.5" />,   label: "Tốt" },
  warn:    { chip: "bg-amber-50 text-amber-700 border-amber-200",       icon: <AlertCircle className="h-3.5 w-3.5" />,     label: "Cần chú ý" },
  bad:     { chip: "bg-red-50 text-red-700 border-red-200",             icon: <AlertTriangle className="h-3.5 w-3.5" />,   label: "Kém" },
  unknown: { chip: "bg-slate-100 text-slate-500 border-slate-200",      icon: <HelpCircle className="h-3.5 w-3.5" />,      label: "Chưa chấm được" },
};

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "border-red-200 bg-red-50/60",
  warning:  "border-amber-200 bg-amber-50/60",
  info:     "border-slate-200 bg-slate-50/60",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Nghiêm trọng", warning: "Cảnh báo", info: "Ghi chú",
};

function scoreTone(score: number | null, gated: boolean): string {
  if (score === null) return "text-slate-400";
  if (gated) return "text-blue-600";
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`;

function describeApply(a: ApplyAction): string {
  switch (a.kind) {
    case "PAUSE_CAMPAIGN":    return "Tạm dừng chiến dịch";
    case "SET_DAILY_BUDGET":  return `Giảm ngân sách ngày xuống ${vnd(a.newDailyBudget)}`;
  }
}

/** Câu xác nhận — phải nói rõ thay đổi gì trên tài khoản quảng cáo THẬT. */
function confirmText(a: ApplyAction, campaignName: string): string {
  switch (a.kind) {
    case "PAUSE_CAMPAIGN":
      return `Tạm dừng chiến dịch "${campaignName}" ngay trên tài khoản quảng cáo thật?\n\nChiến dịch sẽ ngừng phân phối và ngừng tiêu tiền cho tới khi được bật lại.`;
    case "SET_DAILY_BUDGET":
      return `Đổi ngân sách ngày của "${campaignName}" từ ${vnd(a.currentDailyBudget)} xuống ${vnd(a.newDailyBudget)}?\n\nThay đổi có hiệu lực ngay trên tài khoản quảng cáo thật.`;
  }
}

// ─────────────────────────────────────────────

export function CampaignAnalysisPanel({
  campaignId, platform, company, campaignName, onMutated,
}: {
  campaignId: string;
  platform: "facebook" | "google";
  company: string | null;
  campaignName: string;
  /** Gọi sau khi áp thành công để trang cha tải lại số liệu. */
  onMutated?: () => void;
}) {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPillar, setOpenPillar] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ platform });
      if (company) qs.set("company", company);
      const res = await fetch(`/api/campaigns/${campaignId}/analysis?${qs}`);
      const json = (await res.json()) as AnalysisResponse;
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
      setApplied(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không phân tích được chiến dịch này");
    }
    setLoading(false);
  };

  const applyFinding = async (finding: Finding) => {
    const action = finding.apply;
    if (!action) return;
    if (!window.confirm(confirmText(action, campaignName))) return;

    setApplying(finding.id);
    try {
      let res: Response;
      if (action.kind === "SET_DAILY_BUDGET") {
        res = await fetch(
          platform === "google"
            ? `/api/google/campaigns/${campaignId}/budget`
            : `/api/meta/campaigns/${campaignId}/budget`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              platform === "google"
                ? { dailyBudget: action.newDailyBudget, company }
                : { dailyBudget: action.newDailyBudget }
            ),
          }
        );
      } else {
        // Chỉ còn đúng một hành động trạng thái là TẠM DỪNG. Nhánh "kích hoạt
        // lại" từng được khai báo nhưng không chỗ nào sinh ra nó, nên đã gỡ —
        // giữ lại một nhánh chết chỉ khiến người đọc sau tưởng nó chạy được.
        res = await fetch(
          platform === "google"
            ? `/api/google/campaigns/${campaignId}/status`
            : `/api/meta/campaigns/${campaignId}/status`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              platform === "google"
                // Google Ads dùng enum ENABLED/PAUSED, Meta dùng ACTIVE/PAUSED —
                // hai route đã tự quy đổi, ở đây gửi đúng chữ mỗi route chờ đọc.
                ? { action: "PAUSE", company }
                : { action: "PAUSE", campaignId }
            ),
          }
        );
      }

      const result = (await res.json().catch(() => ({}))) as {
        success?: boolean; error?: string; message?: string; conflictWarning?: string;
      };

      if (result.success) {
        setApplied(prev => new Set(prev).add(finding.id));
        toast({
          title: `✅ ${describeApply(action)} — đã áp dụng`,
          description: result.message ?? campaignName,
        });
        // Hệ thống tự động vừa đụng vào chiến dịch này. Không chặn (người dùng
        // đã quyết) nhưng PHẢI nói ra, nếu không họ vừa ghi đè lên thay đổi của
        // cron mà không biết, rồi vài giờ sau cron đè ngược lại.
        if (result.conflictWarning) {
          toast({ title: `⚠️ Lưu ý: ${result.conflictWarning}`, variant: "error" });
        }
        onMutated?.();
      } else {
        toast({
          title: "❌ Không áp dụng được",
          description: result.error ?? `HTTP ${res.status}`,
          variant: "error",
        });
      }
    } catch (e) {
      toast({
        title: "❌ Lỗi kết nối khi áp dụng",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
    setApplying(null);
  };

  // ── Chưa chạy lần nào ──
  if (!data && !loading && !error) {
    return (
      <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/70 to-white p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="p-2.5 bg-violet-100 rounded-lg text-violet-600 shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-[240px]">
            <h2 className="text-sm font-bold text-slate-800">Phân tích hiệu quả bằng AI</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Chấm chiến dịch theo 5 trụ — mục tiêu so kết quả, giai đoạn học, chỗ nghẽn trong phễu,
              xu hướng theo ngày, và so các nhóm bên trong với nhau. Mỗi kết luận đều kèm số liệu gốc để đối chiếu.
            </p>
          </div>
          <Button onClick={run} className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white shrink-0">
            <Sparkles className="h-3.5 w-3.5" /> Phân tích ngay
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-6 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
        <div>
          <p className="text-sm font-semibold text-slate-700">Đang chấm chiến dịch...</p>
          <p className="text-xs text-slate-500 mt-0.5">Đọc số liệu, so ngưỡng, rồi nhờ AI diễn giải.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="text-sm font-semibold text-red-700">Không phân tích được</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
        <Button variant="outline" size="sm" onClick={run} className="mt-3">Thử lại</Button>
      </div>
    );
  }

  if (!data) return null;
  const { analysis } = data;

  return (
    <div className="rounded-xl border border-violet-200 bg-white overflow-hidden">
      {/* ── Đầu tấm: điểm + kết luận ── */}
      <div className="bg-gradient-to-br from-violet-50/80 to-white p-5 border-b border-violet-100">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="text-center shrink-0">
            <p className={cn("text-3xl font-bold leading-none", scoreTone(analysis.score, analysis.gated))}>
              {analysis.score === null ? "—" : analysis.score}
            </p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wide">
              {analysis.score === null ? "chưa chấm" : "trên 100"}
            </p>
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-violet-600" />
              <h2 className="text-sm font-bold text-slate-800">Phân tích hiệu quả</h2>
              <span className="text-[10px] text-slate-400">
                {data.period.from} → {data.period.to}
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{analysis.verdict}</p>
          </div>
          <Button variant="outline" size="sm" onClick={run} className="gap-1.5 shrink-0">
            Chấm lại
          </Button>
        </div>

        {analysis.gated && analysis.gateReason && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex gap-2">
            <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 leading-relaxed">{analysis.gateReason}</p>
          </div>
        )}

        {analysis.dataWarnings.map((w, i) => (
          <div key={i} className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">{w}</p>
          </div>
        ))}
      </div>

      {/* ── Lời diễn giải của AI ── */}
      {data.narrative && (
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          {data.narrative.split(/\n\s*\n/).map((para, i) => (
            <p key={i} className="text-sm text-slate-700 leading-relaxed mb-2 last:mb-0">{para}</p>
          ))}
          <p className="text-[10px] text-slate-400 mt-2 italic">
            Đoạn trên do AI viết lại từ kết quả chấm bên dưới. Số liệu gốc nằm trong phần &ldquo;Dựa trên gì&rdquo; của từng trụ.
          </p>
        </div>
      )}
      {data.narrativeError && (
        <div className="px-5 py-3 border-b border-slate-100 bg-amber-50/60">
          <p className="text-xs text-amber-800">
            Phần diễn giải bằng AI không chạy được ({data.narrativeError}). Kết quả chấm điểm bên dưới vẫn đầy đủ và không phụ thuộc vào AI.
          </p>
        </div>
      )}

      {/* ── 5 trụ ── */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
          Dựa trên gì để đánh giá
        </h3>
        <div className="space-y-1.5">
          {analysis.pillars.map(p => {
            const st = STATUS_STYLE[p.status];
            const open = openPillar === p.key;
            return (
              <div key={p.key} className="rounded-lg border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setOpenPillar(open ? null : p.key)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                >
                  {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0",
                    st.chip
                  )}>
                    {st.icon} {st.label}
                  </span>
                  <span className="text-xs font-semibold text-slate-600 shrink-0">{p.label}</span>
                  <span className="text-xs text-slate-500 truncate">— {p.headline}</span>
                </button>
                {open && (
                  <div className="px-3 pb-3 pt-1 bg-slate-50/70 border-t border-slate-100 space-y-2">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Thước đo</p>
                      <p className="text-xs text-slate-600 leading-relaxed">{p.basis}</p>
                    </div>
                    {p.evidence.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Số liệu</p>
                        <ul className="space-y-0.5">
                          {p.evidence.map((e, i) => (
                            <li key={i} className="text-xs text-slate-600 font-mono">· {e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Việc cần làm ── */}
      <div className="px-5 py-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
          Cần làm gì {analysis.findings.length > 0 && `(${analysis.findings.length})`}
        </h3>

        {analysis.findings.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 flex gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-800">
              Không phát hiện vấn đề nào theo 5 trụ ở trên. Tiếp tục theo dõi số liệu hằng ngày.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {analysis.findings.map(f => {
              const isApplied = applied.has(f.id);
              return (
                <div key={f.id} className={cn("rounded-lg border p-3", SEVERITY_STYLE[f.severity])}>
                  <div className="flex items-start gap-2">
                    <span className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase shrink-0 mt-0.5",
                      f.severity === "critical" ? "bg-red-600 text-white"
                        : f.severity === "warning" ? "bg-amber-500 text-white"
                        : "bg-slate-400 text-white"
                    )}>
                      {SEVERITY_LABEL[f.severity]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{f.title}</p>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{f.detail}</p>
                      <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">
                        <span className="font-semibold">Nên làm: </span>{f.recommendation}
                      </p>

                      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                        {f.apply && !isApplied && (
                          <Button
                            size="sm"
                            onClick={() => applyFinding(f)}
                            disabled={applying === f.id}
                            className="gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs"
                          >
                            {applying === f.id
                              ? <><Loader2 className="h-3 w-3 animate-spin" /> Đang áp...</>
                              : <>⚡ {describeApply(f.apply)}</>}
                          </Button>
                        )}
                        {isApplied && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Đã áp dụng
                          </span>
                        )}
                        {!f.apply && f.manualHint && (
                          <span className="inline-flex items-start gap-1.5 text-[11px] text-slate-500 leading-relaxed">
                            <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                            <span><span className="font-semibold">Làm tay: </span>{f.manualHint}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
