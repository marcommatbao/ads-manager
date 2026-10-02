"use client";

// ============================================================
// Báo cáo quản lý tuần (Đợt 15c) — đọc GET /api/reports/weekly-summary.
// Job weekly_report dựng mỗi thứ Hai 08:30 (VN) + gửi Teams kênh Ads; trang lưu từng tuần để xem lại.
// Số tính bằng mã (lib/reports/weekly.ts); nguồn hỏng ghi "không đọc được", không hiện 0.
// ============================================================

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { AlertTriangle, CalendarRange, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { datetimeVN } from "@/components/case/format";
import { getJson, postJson, ApiError } from "@/components/case/api";
import { cn } from "@/lib/utils";
import type { WeeklyReport } from "@/lib/reports/weekly";

interface Resp {
  weeks: { key: string; label: string }[];
  report: (WeeklyReport & { sent?: { at: string; sent: boolean; notConfigured?: boolean; error?: string } }) | null;
  canEdit: boolean;
}

const TONE: Record<string, string> = { good: "text-green-700", bad: "text-red-700", warn: "text-amber-700" };

function WeeklyReportPage() {
  const sp = useSearchParams();
  const [week, setWeek] = useState<string | null>(sp.get("week"));
  const { data, error, isLoading, mutate } = useSWR<Resp>(`/api/reports/weekly-summary${week ? `?week=${week}` : ""}`, getJson);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function rebuild() {
    setBusy(true); setMsg(null);
    try { const r = await postJson("/api/reports/weekly-summary", { op: "rebuild" }); setWeek(r.report.weekKey); await mutate(); setMsg("Đã dựng lại (chỉ lưu, không gửi Teams)"); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "Không dựng lại được"); }
    finally { setBusy(false); }
  }

  const r = data?.report;
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><CalendarRange className="h-5 w-5 text-blue-600" aria-hidden="true" /> Báo cáo tuần</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Mỗi thứ Hai 08:30: tiền & kết quả, số đáng tin tới đâu, tool đã làm gì, việc tồn, thử nghiệm. Số tính bằng mã, không do AI viết.</p>
        </div>
        <div className="flex items-center gap-2">
          {!!data?.weeks.length && (
            <select aria-label="Chọn tuần" value={r?.weekKey ?? ""} onChange={(e) => setWeek(e.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm">
              {data.weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
            </select>
          )}
          {data?.canEdit && (
            <Button className="h-10" variant="outline" size="sm" disabled={busy} onClick={rebuild}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Dựng lại tuần trọn gần nhất
            </Button>
          )}
        </div>
      </div>

      {msg && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{msg}</div>}
      {isLoading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải…</div>}
      {error && <EmptyState icon={AlertTriangle} title="Không tải được báo cáo" description={error instanceof ApiError ? error.message : "Có lỗi khi tải"} />}
      {data && !r && <EmptyState icon={CalendarRange} title="Chưa có báo cáo tuần nào" description="Báo cáo đầu tiên dựng vào thứ Hai 08:30. Người có quyền sửa có thể bấm “Dựng lại tuần trọn gần nhất” để dựng ngay." />}

      {r && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{r.label}</span>
            <span>dựng {datetimeVN(r.builtAt)}</span>
            {r.sent && <span>{r.sent.sent ? `đã gửi Teams ${datetimeVN(r.sent.at)}` : r.sent.notConfigured ? "chưa gửi Teams (thiếu TEAMS_WEBHOOK_ADS)" : `gửi Teams lỗi: ${r.sent.error}`}</span>}
          </div>
          {r.errors.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Không đọc được: {r.errors.join(" · ")}</div>}
          {r.sections.map((s) => (
            <section key={s.title} className="rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-2.5 font-semibold text-slate-900">{s.title}</h2>
              <table className="w-full text-sm">
                <tbody>
                  {s.rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className={cn("px-4 py-2 text-slate-700", row.label.startsWith("  ") && "pl-8 text-slate-500")}>{row.label.trim()}</td>
                      <td className={cn("px-4 py-2 text-right font-semibold tabular-nums", row.tone ? TONE[row.tone] : "text-slate-900")}>{row.value}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><WeeklyReportPage /></Suspense>;
}
