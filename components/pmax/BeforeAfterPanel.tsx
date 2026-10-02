"use client";

// ============================================================
// PMax "🧪 Thí nghiệm" — C1: đo trước/sau khi hạ cửa sổ chuyển đổi lượt xem
// có tương tác (engaged-view). Google Ads API KHÔNG cho đổi cài đặt này qua
// API — người dùng tự đổi trong Google Ads rồi GHI MỐC ở đây; tool so N ngày
// trước/sau mốc (cùng độ dài).
// ------------------------------------------------------------
// Đọc/ghi qua lib/pmax/signals.ts — module SERVER, ở đây CHỈ `import type`.
// Danh sách mốc do PmaxExperimentView tải chung (GET /signals) và truyền
// xuống; panel này tự gọi GET .../marks?id= khi mở "Xem trước/sau" và tự gọi
// POST/DELETE khi thêm/xoá mốc.
// ============================================================

import { useId, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getJson, postJson, deleteJson, ApiError } from "@/components/case/api";
import { vnd, num, pct, ddmmyyyy } from "@/components/case/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import type { ChangeMark, BeforeAfter, WindowStats } from "@/lib/pmax/signals";

type Company = string;

const todayVN = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

const WINDOW_ROWS: { key: keyof WindowStats; label: string; fmt: (n: number) => string }[] = [
  { key: "cost", label: "Chi PMax", fmt: vnd },
  { key: "youtubeShare", label: "% chi YouTube", fmt: (n) => pct(n, 0) },
  { key: "convClick", label: "Đơn từ lượt bấm", fmt: (n) => num(n, { maximumFractionDigits: 1 }) },
  { key: "convEngaged", label: "Đơn sau lượt xem", fmt: (n) => num(n, { maximumFractionDigits: 1 }) },
  { key: "cpaClick", label: "CPA đơn bấm", fmt: vnd },
  { key: "searchConv", label: "Đơn Search (không phải PMax)", fmt: (n) => num(n, { maximumFractionDigits: 1 }) },
];

function BeforeAfterTable({ before, after }: { before: WindowStats; after: WindowStats }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-500">
            <th className="px-2.5 py-1.5 font-medium">Chỉ số</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Trước</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Sau</th>
          </tr>
        </thead>
        <tbody>
          {WINDOW_ROWS.map((r) => (
            <tr key={r.key} className="border-b border-slate-50 last:border-0">
              <td className="px-2.5 py-1.5 text-slate-600">{r.label}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{r.fmt(Number(before[r.key]) || 0)}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-700">{r.fmt(Number(after[r.key]) || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkRow({ mark, company, canEdit, onDeleted }: { mark: ChangeMark; company: Company; canEdit: boolean; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<BeforeAfter | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !result && !loading) {
      setLoading(true); setError(null);
      try {
        const json = await getJson(`/api/google/pmax/signals/marks?company=${company}&id=${mark.id}`);
        setResult(json.result as BeforeAfter);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Không so được trước/sau — thử lại sau");
      } finally { setLoading(false); }
    }
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await deleteJson(`/api/google/pmax/signals/marks?company=${company}&id=${mark.id}`);
      setDelOpen(false);
      onDeleted();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <button type="button" onClick={toggleOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />}
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-slate-800">{mark.label}</span>
            <span className="block text-[10px] text-slate-400">{ddmmyyyy(mark.date)} · {mark.by}</span>
          </span>
        </button>
        {canEdit && (
          <button type="button" onClick={() => setDelOpen(true)} className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500" title="Xoá mốc">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/50 p-3">
          {loading && <div className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Đang so trước/sau…</div>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {result && (
            <>
              <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold", result.ready ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
                {result.ready ? `Đủ ${result.days} ngày để đọc` : `Mới ${result.days} ngày — còn sớm`}
              </span>
              <ul className="space-y-1 text-xs text-slate-700">{result.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
              {result.days > 0 && <BeforeAfterTable before={result.before} after={result.after} />}
            </>
          )}
        </div>
      )}
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Xoá mốc này?</DialogTitle>
            <DialogDescription>&quot;{mark.label}&quot; ({ddmmyyyy(mark.date)}) — chỉ xoá ghi chú, không đổi gì trên Google Ads.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button className="h-10" variant="outline" />}>Giữ nguyên</DialogClose>
            <Button className="h-10" variant="destructive" onClick={doDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BeforeAfterPanel({ company, marks, canEdit, onChanged }: { company: Company; marks: ChangeMark[]; canEdit: boolean; onChanged: () => void }) {
  const dateId = useId(), labelId = useId();
  const [date, setDate] = useState(todayVN());
  const [label, setLabel] = useState("Hạ cửa sổ engaged-view xuống 1 ngày");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  async function addMark() {
    if (!date) return;
    setSaving(true); setSaveErr(null);
    try {
      await postJson("/api/google/pmax/signals/marks", { company, date, label });
      setLabel("Hạ cửa sổ engaged-view xuống 1 ngày");
      onChanged();
    } catch (e) {
      setSaveErr(e instanceof ApiError ? e.message : "Không lưu được mốc — thử lại sau");
    } finally { setSaving(false); }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-extrabold text-slate-900">Trước / sau khi đổi cài đặt ghi nhận</h3>
        <p className="mt-1 text-xs text-slate-500">
          Google Ads API không cho đổi <strong>cửa sổ chuyển đổi lượt xem có tương tác</strong> qua API — cần đổi tay:
        </p>
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs text-slate-500">
          <li>Google Ads → <strong>Mục tiêu</strong> → <strong>Chuyển đổi</strong> → <strong>Tóm tắt</strong></li>
          <li>Chọn hành động mua chính → <strong>Sửa cài đặt</strong></li>
          <li>&quot;Cửa sổ chuyển đổi lượt xem có tương tác&quot; → đặt về <strong>1 ngày</strong></li>
          <li>Quay lại đây, ghi mốc ngày đổi để tool so trước/sau</li>
        </ol>
      </div>

      {!canEdit ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">🔒 Cần quyền sửa để ghi mốc mới — vẫn xem được các mốc đã có.</p>
      ) : (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label htmlFor={dateId} className="text-[11px] font-medium text-slate-500">Ngày đổi</label>
              <Input id={dateId} type="date" value={date} max={todayVN()} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <label htmlFor={labelId} className="text-[11px] font-medium text-slate-500">Ghi chú</label>
              <Input id={labelId} value={label} onChange={(e) => setLabel(e.target.value)} className="h-9" />
            </div>
            <Button type="button" size="sm" className="h-9" onClick={addMark} disabled={saving || !date}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Ghi mốc
            </Button>
          </div>
          {saveErr && <p className="text-xs text-red-600">{saveErr}</p>}
        </div>
      )}

      {marks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-400">Chưa có mốc nào được ghi.</p>
      ) : (
        <div className="space-y-2">
          {marks.map((m) => <MarkRow key={m.id} mark={m} company={company} canEdit={canEdit} onDeleted={onChanged} />)}
        </div>
      )}
    </section>
  );
}
