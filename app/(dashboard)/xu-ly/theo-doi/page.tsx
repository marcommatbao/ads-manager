"use client";

// ============================================================
// Theo dõi phiên xử lý (Đợt 4 · C)
// ------------------------------------------------------------
// Mọi phiên của 2 công ty × 2 nền tảng trên MỘT bảng: đang ở bước nào, đo lại
// 7/14 ngày ra sao, việc giao người còn mở bao lâu. Lọc client-side trên dữ
// liệu /api/cases/board — server đã lọc theo công ty người dùng được xem.
// ============================================================

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { AlertTriangle, ListChecks, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Kpi } from "@/components/measure/Kpi";
import { Pill, type PillTone } from "@/components/measure/Pill";
import { vnd, ddmmyyyy } from "@/components/case/format";
import { getJson, ApiError } from "@/components/case/api";
import { STEP_LABELS } from "@/components/case/StepStepper";
import { ImportCasesDialog } from "@/components/case/ImportCasesDialog";
import { useSession } from "@/components/SessionProvider";
import { isSuperAdmin } from "@/lib/permissions";
import type { BoardRow, BoardState } from "@/lib/case/board";
import type { Company } from "@/lib/case/types";
import type { CaseStep } from "@/lib/case/store";

type BoardResponse = { success: true; companies: Company[]; rows: BoardRow[]; reminders: { enabled: boolean; overdueDays: number } };

const STATE_PILL: Record<BoardState, { tone: PillTone; text: string }> = {
  working: { tone: "blue", text: "▶ Đang xử lý" },
  waiting: { tone: "amber", text: "◷ Chờ đo lại" },
  reopened: { tone: "red", text: "↺ Đã mở lại" },
  done: { tone: "green", text: "✓ Xong" },
};
const STATE_LABEL: Record<BoardState, string> = { working: "Đang xử lý", waiting: "Chờ đo lại", reopened: "Đã mở lại", done: "Xong" };

export default function TheoDoiPage() {
  const { user } = useSession();
  const { data, error, isLoading, mutate } = useSWR<BoardResponse>("/api/cases/board", getJson);
  const [companyFilter, setCompanyFilter] = useState<"ALL" | Company>("ALL");
  const [platformFilter, setPlatformFilter] = useState<"ALL" | "google" | "facebook">("ALL");
  const [stateFilter, setStateFilter] = useState<"ALL" | BoardState>("ALL");
  const [importOpen, setImportOpen] = useState(false);
  const canImport = !!user && isSuperAdmin(user.role);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const reminders = data?.reminders ?? { enabled: false, overdueDays: 3 };

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (companyFilter === "ALL" || r.company === companyFilter) &&
          (platformFilter === "ALL" || r.platform === platformFilter) &&
          (stateFilter === "ALL" || r.state === stateFilter),
      ),
    [rows, companyFilter, platformFilter, stateFilter],
  );

  const kpi = useMemo(
    () => ({
      working: rows.filter((r) => r.state === "working").length,
      waiting: rows.filter((r) => r.state === "waiting").length,
      reopened: rows.filter((r) => r.state === "reopened").length,
      overdueTasks: rows.reduce((s, r) => s + r.tasks.overdue, 0),
    }),
    [rows],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <ListChecks className="h-5 w-5 text-blue-600" aria-hidden="true" /> Theo dõi phiên xử lý
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Mọi phiên đang mở, đang chờ đo lại, hoặc vừa mở lại vì đo lại không cải thiện.</p>
        </div>
        <div className="flex items-start gap-2">
          {canImport && (
            <div className="text-right">
              <Button className="h-10" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Nhập phiên từ tệp
              </Button>
              <div className="mt-1 text-xs text-slate-400">Chỉ super admin thấy nút này</div>
            </div>
          )}
          <Button className="h-10" variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={isLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden="true" /> Tải lại
          </Button>
        </div>
      </div>

      {canImport && (
        <ImportCasesDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => mutate()} />
      )}

      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
        </div>
      )}

      {!isLoading && error && (
        <EmptyState
          icon={AlertTriangle}
          title={error instanceof ApiError ? error.message : "Không tải được danh sách phiên xử lý"}
          action={<Button className="h-10" onClick={() => mutate()}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Thử lại</Button>}
        />
      )}

      {!isLoading && !error && data && rows.length === 0 && (
        <EmptyState
          title="Chưa có phiên xử lý nào"
          description="Không có chiến dịch nào đang được xử lý, chờ đo lại, hay vừa mở lại. Mở tổng quan để chọn chiến dịch cần xử lý."
          action={<Button className="h-10" render={<Link href="/xu-ly" />}>Mở tổng quan chiến dịch</Button>}
        />
      )}

      {!isLoading && !error && data && rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Phiên đang mở" value={String(kpi.working)} />
            <Kpi label="Chờ đo lại" value={String(kpi.waiting)} />
            <Kpi label="Đã mở lại (không cải thiện)" value={String(kpi.reopened)} bad={kpi.reopened > 0} />
            <Kpi label="Việc giao người quá 3 ngày" value={String(kpi.overdueTasks)} sub={reminders.enabled ? "sẽ nhắc qua Teams" : "nhắc qua Teams chưa bật"} bad={kpi.overdueTasks > 0} />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-[160px]">
              <div className="mb-1 text-xs font-medium text-slate-400">Công ty</div>
              <Select value={companyFilter} onValueChange={(v) => setCompanyFilter(v as "ALL" | Company)}>
                <SelectTrigger aria-label="Công ty"><SelectValue>{(v: string) => (v === "ALL" ? "Tất cả" : v)}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả</SelectItem>
                  {data.companies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <div className="mb-1 text-xs font-medium text-slate-400">Nền tảng</div>
              <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as "ALL" | "google" | "facebook")}>
                <SelectTrigger aria-label="Nền tảng"><SelectValue>{(v: string) => ({ ALL: "Tất cả", google: "Google", facebook: "Facebook" } as Record<string, string>)[v] ?? v}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[200px]">
              <div className="mb-1 text-xs font-medium text-slate-400">Trạng thái</div>
              <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as "ALL" | BoardState)}>
                <SelectTrigger aria-label="Trạng thái"><SelectValue>{(v: string) => ({ ALL: "Tất cả", working: "Đang xử lý", waiting: "Chờ đo lại", reopened: "Đã mở lại", done: "Xong" } as Record<string, string>)[v] ?? v}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả</SelectItem>
                  {(Object.keys(STATE_LABEL) as BoardState[]).map((s) => <SelectItem key={s} value={s}>{STATE_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState compact title="Không có phiên nào khớp bộ lọc" description="Đổi lại công ty/nền tảng/trạng thái ở trên." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Chiến dịch</th>
                    <th className="px-3 py-2.5 font-medium">Bước</th>
                    <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                    <th className="px-3 py-2.5 font-medium">Đo lại 7 ngày</th>
                    <th className="px-3 py-2.5 font-medium">Đo lại 14 ngày</th>
                    <th className="px-3 py-2.5 font-medium">Việc giao người</th>
                    <th className="px-3 py-2.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const st = STATE_PILL[r.state];
                    return (
                      <tr key={r.id} className="border-b border-slate-50 last:border-0 align-top">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-800">{r.campaignName}</div>
                          <div className="text-xs text-slate-400">{r.company} · {r.platform === "facebook" ? "Facebook" : "Google"}</div>
                        </td>
                        <td className="px-3 py-2.5"><Pill tone="grey">{r.step} · {STEP_LABELS[r.step as CaseStep]}</Pill></td>
                        <td className="px-3 py-2.5"><Pill tone={st.tone}>{st.text}</Pill></td>
                        <td className="px-3 py-2.5"><RemeasureCell r={r.remeasure[0]} /></td>
                        <td className="px-3 py-2.5"><RemeasureCell r={r.remeasure[1]} /></td>
                        <td className="px-3 py-2.5">
                          {r.tasks.open === 0 ? (
                            <span className="text-xs text-slate-400">— không có</span>
                          ) : (
                            <div className="space-y-1">
                              <div className="tabular-nums text-xs text-slate-600">{r.tasks.open} đang mở · cũ nhất {r.tasks.oldestDays} ngày</div>
                              {r.tasks.overdue > 0 && (
                                <Pill tone="red">⚠ Quá {reminders.overdueDays} ngày — {reminders.enabled ? "sẽ nhắc qua Teams" : "nhắc qua Teams chưa bật"}</Pill>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Button size="sm" variant="outline" render={<Link href={`/xu-ly/${r.id}`} />}>Mở phiên</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.some((r) => r.remeasure.some((rm) => rm && rm.done && rm.cpaAfter !== null)) && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              <b>Cách đọc:</b> ▼ CPA sau đo lại thấp hơn trước (tốt hơn) · ▲ cao hơn (xấu hơn) · — chưa đủ số để so.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RemeasureCell({ r }: { r: BoardRow["remeasure"][number] }) {
  if (!r) return <span className="text-slate-300">—</span>;
  if (!r.done) return <span className="text-xs text-slate-500">Chưa tới ngày {ddmmyyyy(r.due)}</span>;
  // Đợt 23: có kết quả chấm theo mục tiêu (lib/case/judge.ts) → hiện đạt / chưa rõ / xấu hơn; phiên chấm ROAS hiện ROAS.
  if (typeof r.verdict === "number") {
    const roas = r.roasAfter !== null && r.roasAfter !== undefined;
    return (
      <span className="tabular-nums text-xs text-slate-700">
        {roas ? <>ROAS {r.roasBefore ?? "—"} → {r.roasAfter}</> : <>{r.cpaBefore !== null ? vnd(r.cpaBefore) : "—"} → {r.cpaAfter !== null ? vnd(r.cpaAfter) : "0 đơn"}</>}{" "}
        {r.verdict === 1 && <span className="font-semibold text-emerald-600">✓ đạt</span>}
        {r.verdict === 0 && <span className="font-semibold text-amber-600" title="Thay đổi dưới 10% và chưa về mục tiêu">≈ chưa rõ</span>}
        {r.verdict === -1 && <span className="font-semibold text-red-600">▲ xấu hơn</span>}
      </span>
    );
  }
  if (r.cpaBefore === null || r.cpaAfter === null) return <span className="text-slate-300">—</span>;
  return (
    <span className="tabular-nums text-xs text-slate-700">
      {vnd(r.cpaBefore)} → {vnd(r.cpaAfter)}{" "}
      {r.better === true && <span className="font-semibold text-emerald-600">▼ tốt hơn</span>}
      {r.better === false && <span className="font-semibold text-red-600">▲ xấu hơn</span>}
      {r.better === null && <span className="text-slate-400">—</span>}
    </span>
  );
}
