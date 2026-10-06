// ============================================================
// Bước 7 — Hoàn thành. Đóng phiên + tự đo lại sau 7/14 ngày. Số "sau" chỉ
// hiện khi đã tới ngày đo — không ước đoán trước.
// ============================================================
"use client";

import { useState } from "react";
import { CheckCircle2, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { vnd, num, ddmmyyyy } from "./format";
import { postJson, ApiError } from "./api";
import type { CampaignCase } from "@/lib/case/store";
import { evidenceGoalKind } from "@/lib/case/goal-kind";

const cpa = (n: number | null | undefined) => (n === null || n === undefined ? "—" : vnd(n));
const freq = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(2));

/** "2026-10-04" → "04/10" (không kèm năm — khớp mockup d6-so-nhom). */
function ddmm(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

const MOC_LABELS = ["sau 7 ngày", "sau 14 ngày"];

/** Đợt 6 · B2 — phiên Facebook có tạo nhóm mới (adset_created): mỗi mốc đo lại
 *  ĐÃ đo sẽ có thêm newCost/oldCost… trong `result` (xem lib/case/service.ts
 *  newAdsetComparison). Phát hiện qua chính `result` — không tự suy đoán field khác. */
const hasAdsetKeys = (result?: Record<string, number | null>): boolean => !!result && "newCost" in result;

interface RemeasureColumn { key: string; label: string; fmt: (n: number | null | undefined) => string }

const GOOGLE_REMEASURE_COLUMNS: RemeasureColumn[] = [
  { key: "cost", label: "Chi phí", fmt: vnd },
  { key: "orders", label: "Đơn", fmt: num },
  { key: "cpa", label: "Chi phí/đơn", fmt: cpa },
  { key: "competitorSpend", label: "Tiền vào đối thủ", fmt: vnd },
];

const META_REMEASURE_COLUMNS: RemeasureColumn[] = [
  { key: "cost", label: "Chi phí", fmt: vnd },
  { key: "orders", label: "Lượt mua", fmt: num },
  { key: "cpa", label: "Chi phí/lượt mua", fmt: cpa },
  { key: "orderValue", label: "Doanh thu Meta", fmt: vnd },
  { key: "frequency", label: "Tần suất", fmt: freq },
];
// Đợt 23 (3d): phiên thu lead — "orders"/"cpa" của kết quả đo lại là lead / chi phí mỗi lead.
const META_LEAD_REMEASURE_COLUMNS: RemeasureColumn[] = [
  { key: "cost", label: "Chi phí", fmt: vnd },
  { key: "orders", label: "Lead", fmt: num },
  { key: "cpa", label: "Chi phí/lead", fmt: cpa },
  { key: "frequency", label: "Tần suất", fmt: freq },
];
const GOOGLE_LEAD_REMEASURE_COLUMNS: RemeasureColumn[] = [
  { key: "cost", label: "Chi phí", fmt: vnd },
  { key: "orders", label: "Lead", fmt: num },
  { key: "cpa", label: "Chi phí/lead", fmt: cpa },
  { key: "competitorSpend", label: "Tiền vào đối thủ", fmt: vnd },
];

export function Step7Done({
  c,
  onRefresh,
  onBack,
}: {
  c: CampaignCase;
  onRefresh: (next: CampaignCase) => void;
  onBack: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = c.actions.filter((a) => a.selected);
  const hasDone = c.executions.some((e) => e.status === "done");
  const doneCount = hasDone ? selected.length : 0;
  const openTasks = c.manualTasks.filter((t) => t.status === "open").length;
  const doneTasks = c.manualTasks.length - openTasks;
  const leads = evidenceGoalKind(c.evidence) === "leads";
  const remeasureColumns = c.platform === "facebook"
    ? (leads ? META_LEAD_REMEASURE_COLUMNS : META_REMEASURE_COLUMNS)
    : (leads ? GOOGLE_LEAD_REMEASURE_COLUMNS : GOOGLE_REMEASURE_COLUMNS);

  async function closeCase() {
    setClosing(true);
    setErr(null);
    try {
      const json = await postJson(`/api/cases/${c.id}/close`);
      onRefresh(json.case);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không đóng được phiên");
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Việc tool đã làm" value={`${doneCount}/${selected.length}`} />
        <Kpi label="Việc giao cho người" value={`${openTasks} chưa xong`} sub={c.manualTasks.length > 0 ? `${doneTasks}/${c.manualTasks.length} đã xong` : undefined} />
        {c.remeasure.map((r, i) => (
          <Kpi key={i} label={`Đo lại lần ${i + 1}`} value={ddmmyyyy(r.due)} sub={r.status === "done" ? "Đã đo" : "Đang chờ"} />
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">Phiên này có hiệu quả không? — tự đo lại</div>
        {c.remeasure.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-400">Chưa có lịch đo lại — lịch được tạo sau lần thực hiện thật đầu tiên.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Đo lại</th>
                <th className="px-3 py-2 font-medium">Trạng thái</th>
                {remeasureColumns.map((col) => (
                  <th key={col.key} className="px-3 py-2 text-right font-medium">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.remeasure.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 text-slate-800">{ddmmyyyy(r.due)}</td>
                  <td className="px-3 py-2.5">
                    {r.status === "done" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Đã đo</span>
                    ) : (
                      <span className="text-slate-400">chờ {ddmmyyyy(r.due)}</span>
                    )}
                  </td>
                  {r.status === "done" && r.result ? (
                    <>
                      {remeasureColumns.map((col) => (
                        <td key={col.key} className="px-3 py-2.5 text-right tabular-nums">{col.fmt(r.result![col.key])}</td>
                      ))}
                    </>
                  ) : (
                    <td className="px-3 py-2.5 text-slate-400" colSpan={remeasureColumns.length}>chờ {ddmmyyyy(r.due)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Số &quot;sau&quot; chỉ hiện khi đã tới ngày đo — không ước đoán trước. Nếu sau lần đo cuối không cải thiện, phiên tự mở lại ở bước 4.
        </div>
      </div>

      {c.platform === "facebook" && c.remeasure.some((r) => r.status === "done" && hasAdsetKeys(r.result)) && (
        <div className="space-y-4">
          {c.remeasure.slice(0, 2).map((r, i) => (
            <AdsetComparisonCard key={i} label={MOC_LABELS[i]} r={r} />
          ))}
        </div>
      )}

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="flex justify-between">
        <Button className="h-10" variant="outline" onClick={onBack}>← Bước 6</Button>
        <div className="flex gap-2">
          {c.status !== "done" && (
            <Button className="h-10" onClick={closeCase} disabled={closing}>
              {closing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Đóng phiên
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

/** Đợt 6 · B2 — bảng "Nhóm mới vs Nhóm cũ" cho một mốc đo lại (7 hoặc 14 ngày). */
function AdsetComparisonCard({ label, r }: { label: string; r: CampaignCase["remeasure"][number] }) {
  const result = r.status === "done" ? r.result : undefined;
  const done = hasAdsetKeys(result);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">Nhóm mới vs Nhóm cũ — {label}</div>
      {!done ? (
        <p className="px-4 py-4 text-sm text-slate-400">Chưa tới ngày {ddmm(r.due)}</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Nhóm</th>
                <th className="px-3 py-2 text-right font-medium">Chi phí</th>
                <th className="px-3 py-2 font-medium">Kết quả (sự kiện tối ưu)</th>
                <th className="px-3 py-2 text-right font-medium">Chi phí/kết quả</th>
                <th className="px-3 py-2 text-right font-medium">Lượt mua</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-50">
                <td className="px-4 py-2.5 font-semibold text-slate-800">Nhóm mới</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{cpa(result!.newCost)}</td>
                <td className="px-3 py-2.5 tabular-nums">{num(result!.newResults)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{cpa(result!.newCostPerResult)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(result!.newPurchases)}</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold text-slate-800">Nhóm cũ</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{cpa(result!.oldCost)}</td>
                <td className="px-3 py-2.5 tabular-nums">{num(result!.oldResults)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{cpa(result!.oldCostPerResult)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(result!.oldPurchases)}</td>
              </tr>
            </tbody>
          </table>
          <AdsetVerdictLine result={result!} label={label} />
        </>
      )}
    </div>
  );
}

function AdsetVerdictLine({ result, label }: { result: Record<string, number | null>; label: string }) {
  const n = result.newCostPerResult, o = result.oldCostPerResult;
  if (n === null || n === undefined || o === null || o === undefined || !o) return null;
  const pctChange = Math.round(((n - o) / o) * 100);
  const cheaper = pctChange <= 0;
  return (
    <div className={`border-t border-slate-100 px-4 py-2.5 text-sm ${cheaper ? "text-emerald-700" : "text-red-700"}`}>
      <b>Nhóm mới {cheaper ? `rẻ hơn ${Math.abs(pctChange)}%` : `đắt hơn ${pctChange}%`} mỗi kết quả</b> — {vnd(o)} → {vnd(n)} mỗi kết quả {label}.
    </div>
  );
}
