"use client";

// ============================================================
// Đã làm & kết quả (Đợt 15b)
// ------------------------------------------------------------
// Mọi lần tool ghi lên Google/Meta + kết quả đo lại sau 7 và 14 ngày.
// Dữ liệu từ GET /api/writes?days=N; lọc/tìm kiếm chạy client-side.
// ============================================================

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { AlertTriangle, ChevronDown, History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Kpi } from "@/components/measure/Kpi";
import { Pill, type PillTone } from "@/components/measure/Pill";
import { vnd, ddmmyyyy } from "@/components/case/format";
import { getJson, postJson, ApiError } from "@/components/case/api";
import { companyLabel } from "@/lib/companies/registry";
import type { WriteEvent } from "@/lib/writes/feed";
import { VERDICT_LABEL, type Verdict } from "@/lib/writes/verdict";
import { prettyWriteLabel } from "@/lib/writes/labels";
import type { WindowResult } from "@/lib/writes/outcome";

type WindowState = "done" | "case" | "skip" | "pending_job" | "not_due";
type WindowRow = {
  days: 7 | 14;
  state: WindowState;
  dueOn: string;
  result?: WindowResult | Record<string, number | null> | null;
  note?: string | null;
};
type WriteRow = WriteEvent & { windows: WindowRow[] };
type WritesResponse = { success: true; days: number; rows: WriteRow[]; errors: string[] };

type VerdictFilter = "ALL" | "xau" | "tot" | "chua_ro" | "chua_do";
type PlatformFilter = "ALL" | "google" | "meta";

const VERDICT_TONE: Record<Verdict, PillTone> = { tot: "green", xau: "red", khong_doi: "grey", chua_ro: "amber" };
const RANGES = [7, 30, 90, 180] as const;
const VERDICT_FILTER_LABEL: Record<VerdictFilter, string> = { ALL: "Tất cả", xau: "Xấu", tot: "Tốt", chua_ro: "Chưa rõ", chua_do: "Chưa đo" };
const PLATFORM_LABEL: Record<PlatformFilter, string> = { ALL: "Tất cả", google: "Google", meta: "Meta" };

function isWindowResult(r: WindowRow["result"]): r is WindowResult {
  return !!r && typeof (r as WindowResult).verdict === "string";
}

/** Phán quyết quy về một khoá chung (kể cả kết quả từ phiên xử lý); null = chưa đo. */
function verdictOf(w: WindowRow | undefined): Verdict | null {
  if (!w) return null;
  if (w.state === "done" && isWindowResult(w.result)) return w.result.verdict;
  if (w.state === "case" && w.result && !isWindowResult(w.result)) {
    const v = w.result.verdict;
    if (v === 1) return "tot";
    if (v === 0) return "chua_ro";
    if (v === -1) return "xau";
  }
  return null;
}

const vnDateTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}/${g("month")}/${g("year")} ${g("hour")}:${g("minute")}`;
};
const vnDayMonth = (iso: string): string => vnDateTime(iso).slice(0, 5);

export default function DaLamPage() {
  const [days, setDays] = useState<number>(30);
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("ALL");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");
  const [search, setSearch] = useState("");
  const [undoing, setUndoing] = useState<string | null>(null);
  const [undoMsg, setUndoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { data, error, isLoading, mutate } = useSWR<WritesResponse>(`/api/writes?days=${days}`, getJson);

  const rows = useMemo(() => [...(data?.rows ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (platformFilter !== "ALL" && r.platform !== platformFilter) return false;
      if (q && !prettyWriteLabel(r.label).toLowerCase().includes(q)) return false;
      if (verdictFilter !== "ALL") {
        const v = verdictOf(r.windows.find((w) => w.days === 14));
        if (verdictFilter === "chua_do" ? v !== null : v !== verdictFilter) return false;
      }
      return true;
    });
  }, [rows, platformFilter, search, verdictFilter]);

  const counts = useMemo(() => {
    const c: Record<Verdict, number> = { tot: 0, xau: 0, khong_doi: 0, chua_ro: 0 };
    let waiting = 0;
    for (const r of rows) {
      const v = verdictOf(r.windows.find((w) => w.days === 14));
      if (v) c[v] += 1;
      else waiting += 1;
    }
    return { ...c, waiting };
  }, [rows]);

  const errors = data?.errors ?? [];

  // Đợt 23 (3c): hoàn tác bật/tắt / đổi ngân sách — máy chủ tự kiểm giá trị hiện tại, đã bị sửa tiếp thì từ chối.
  const undo = async (r: WriteRow) => {
    if (!window.confirm(`Hoàn tác thay đổi này?\n\n${prettyWriteLabel(r.label)}\n\nTool sẽ trả chiến dịch về giá trị trước đó trên ${r.platform === "meta" ? "Meta" : "Google"}.`)) return;
    setUndoing(r.id);
    setUndoMsg(null);
    try {
      await postJson("/api/writes/undo", { id: r.id });
      setUndoMsg({ ok: true, text: "Đã hoàn tác. Lần hoàn tác cũng được ghi lại và đo sau 7/14 ngày." });
      await mutate();
    } catch (e) {
      setUndoMsg({ ok: false, text: e instanceof Error ? e.message : "Hoàn tác thất bại" });
    } finally {
      setUndoing(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <History className="h-5 w-5 text-blue-600" aria-hidden="true" /> Đã làm &amp; kết quả
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Mỗi lần tool (hoặc bạn qua tool) thay đổi quảng cáo được đo lại sau 7 và 14 ngày: so chi phí/đơn trước–sau, đã trừ biến động chung của các chiến dịch cùng loại không bị chạm. &lsquo;Chưa rõ&rsquo; = quá ít đơn hoặc biến động chung quá lớn để kết luận.
          </p>
        </div>
        <Button className="h-10" variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading}>
          <RefreshCw className={isLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden="true" /> Tải lại
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[150px]">
          <div className="mb-1 text-xs font-medium text-slate-400">Khoảng thời gian</div>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger aria-label="Khoảng thời gian"><SelectValue>{(v: string) => `${v} ngày qua`}</SelectValue></SelectTrigger>
            <SelectContent>
              {RANGES.map((d) => <SelectItem key={d} value={String(d)}>{d} ngày qua</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[150px]">
          <div className="mb-1 text-xs font-medium text-slate-400">Kết quả 14 ngày</div>
          <Select value={verdictFilter} onValueChange={(v) => setVerdictFilter(v as VerdictFilter)}>
            <SelectTrigger aria-label="Lọc theo kết quả 14 ngày"><SelectValue>{(v: string) => VERDICT_FILTER_LABEL[v as VerdictFilter] ?? v}</SelectValue></SelectTrigger>
            <SelectContent>
              {(Object.keys(VERDICT_FILTER_LABEL) as VerdictFilter[]).map((k) => <SelectItem key={k} value={k}>{VERDICT_FILTER_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[150px]">
          <div className="mb-1 text-xs font-medium text-slate-400">Nền tảng</div>
          <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as PlatformFilter)}>
            <SelectTrigger aria-label="Nền tảng"><SelectValue>{(v: string) => PLATFORM_LABEL[v as PlatformFilter] ?? v}</SelectValue></SelectTrigger>
            <SelectContent>
              {(Object.keys(PLATFORM_LABEL) as PlatformFilter[]).map((k) => <SelectItem key={k} value={k}>{PLATFORM_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="mb-1 text-xs font-medium text-slate-400">Tìm theo việc đã làm</div>
          <Input
            className="h-10"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Gõ một phần nội dung…"
            aria-label="Tìm theo việc đã làm"
          />
        </div>
      </div>

      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
        </div>
      )}

      {!isLoading && error && (
        <EmptyState
          icon={AlertTriangle}
          title={error instanceof ApiError ? error.message : "Không tải được danh sách việc đã làm"}
          action={<Button className="h-10" onClick={() => mutate()}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Thử lại</Button>}
        />
      )}

      {!isLoading && !error && data && (
        <>
          {undoMsg && (
            <div role="status" className={`rounded-xl border p-3 text-sm ${undoMsg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
              {undoMsg.text}
            </div>
          )}
          {errors.length > 0 && (
            <details className="group rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Một số nguồn không đọc được ({errors.length})
                <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}

          {rows.length === 0 ? (
            <EmptyState
              title={`Chưa có thay đổi nào trong ${data.days} ngày qua`}
              description="Khi tool ghi lên tài khoản Google/Meta, việc đó sẽ xuất hiện ở đây kèm kết quả đo lại sau 7 và 14 ngày. Thử chọn khoảng thời gian dài hơn."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Kpi label="Tốt (14 ngày)" value={String(counts.tot)} />
                <Kpi label="Xấu (14 ngày)" value={String(counts.xau)} bad={counts.xau > 0} />
                <Kpi label="Không đổi (14 ngày)" value={String(counts.khong_doi)} />
                <Kpi label="Chưa rõ (14 ngày)" value={String(counts.chua_ro)} />
                <Kpi label="Đang chờ đo" value={String(counts.waiting)} />
              </div>

              {filtered.length === 0 ? (
                <EmptyState compact title="Không có việc nào khớp bộ lọc" description="Đổi lại kết quả/nền tảng hoặc từ khoá tìm kiếm ở trên." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full min-w-[960px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                        <th className="px-4 py-2.5 font-medium whitespace-nowrap">Ngày</th>
                        <th className="px-3 py-2.5 font-medium">Công ty</th>
                        <th className="px-3 py-2.5 font-medium">Nền tảng</th>
                        <th className="px-3 py-2.5 font-medium">Việc đã làm</th>
                        <th className="px-3 py-2.5 font-medium">7 ngày</th>
                        <th className="px-3 py-2.5 font-medium">14 ngày</th>
                        <th className="px-3 py-2.5 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => {
                        const w7 = r.windows.find((w) => w.days === 7);
                        const w14 = r.windows.find((w) => w.days === 14);
                        const bad = verdictOf(w14) === "xau";
                        return (
                          <tr key={r.id} className={`border-b border-slate-50 last:border-0 align-top ${bad ? "border-l-4 border-l-red-500 bg-red-50/30" : ""}`}>
                            <td className="px-4 py-2.5 tabular-nums whitespace-nowrap text-slate-600">{vnDateTime(r.at)}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">{r.company === "MBC" || r.company === "MBI" ? r.company : companyLabel(r.company)}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">{r.platform === "meta" ? "Meta" : "Google"}</td>
                            <td className="max-w-md px-3 py-2.5">
                              <div className="font-semibold text-slate-800">{prettyWriteLabel(r.label)}</div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                                <span>{r.sourceLabel}</span>
                                {r.undoneAt && <Pill tone="grey">Đã hoàn tác {vnDayMonth(r.undoneAt)}</Pill>}
                              </div>
                            </td>
                            <td className="px-3 py-2.5"><WindowCell w={w7} link={r.link} /></td>
                            <td className="px-3 py-2.5"><WindowCell w={w14} link={r.link} /></td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap gap-1.5">
                                {r.undoable && !r.undoneAt && (
                                  <Button size="sm" variant="outline" disabled={undoing !== null} onClick={() => undo(r)}>
                                    {undoing === r.id ? "Đang hoàn tác…" : "Hoàn tác"}
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" render={<Link href={r.link} />}>Mở</Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function WindowCell({ w, link }: { w: WindowRow | undefined; link: string }) {
  if (!w) return <span className="text-slate-300">—</span>;

  if (w.state === "done" && isWindowResult(w.result)) {
    const r = w.result;
    return (
      <div className="space-y-1" title={w.note ?? r.note}>
        <Pill tone={VERDICT_TONE[r.verdict]}>{VERDICT_LABEL[r.verdict]}</Pill>
        <div className="tabular-nums text-xs text-slate-700">
          {r.cpaBefore !== null ? vnd(r.cpaBefore) : "0 đơn"} → {r.cpaAfter !== null ? vnd(r.cpaAfter) : "0 đơn"}
        </div>
        {(w.note ?? r.note) && <div className="max-w-[240px] text-xs text-slate-400">{w.note ?? r.note}</div>}
      </div>
    );
  }

  if (w.state === "case") {
    const res = w.result && !isWindowResult(w.result) ? w.result : null;
    const v = res?.verdict;
    return (
      <div className="space-y-1 text-xs">
        <div className="text-slate-600">Theo phiên xử lý</div>
        {v === 1 && <span className="font-semibold text-emerald-600">✓ đạt</span>}
        {v === 0 && <span className="font-semibold text-amber-600">≈ chưa rõ</span>}
        {v === -1 && <span className="font-semibold text-red-600">▲ xấu hơn</span>}
        {typeof res?.cpa === "number" && <div className="tabular-nums text-slate-700">CPA {vnd(res.cpa)}</div>}
        {typeof res?.roas === "number" && <div className="tabular-nums text-slate-700">ROAS {res.roas.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}</div>}
        <div><Link href={link} className="text-blue-600 hover:underline">Xem phiên</Link></div>
      </div>
    );
  }

  if (w.state === "not_due") return <span className="text-xs text-slate-500">Đo ngày {ddmmyyyy(w.dueOn)}</span>;
  if (w.state === "pending_job") return <span className="text-xs text-slate-500">Đang chờ lượt đo</span>;
  if (w.state === "skip") {
    return (
      <span className="text-xs text-slate-400" title={w.note ?? undefined}>
        Không đo{w.note ? <span className="block max-w-[220px] text-slate-400">{w.note}</span> : null}
      </span>
    );
  }
  return <span className="text-slate-300">—</span>;
}
