"use client";

// Danh sách "việc cụ thể" dùng chung cho Search + PMax (user 01/10: 118 / 59 việc kéo rất dài, tích từng ô rất lâu).
// Khung cuộn cố định chiều cao, ô lọc (bỏ dấu), "Chỉ hiện đã chọn", Chọn tất cả / Bỏ chọn phần đang hiện, hiện 20 dòng một lần.

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { vnd } from "@/components/case/format";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export interface ProposalItem { id: string; label: string; campaignName?: string | null; why: string; warning?: string | null; cost: number | null }

const PAGE = 20;
const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

export function ProposalList({ proposals, checked, onToggle, canEdit }: {
  proposals: ProposalItem[]; checked: Record<string, boolean>; onToggle: (id: string) => void; canEdit: boolean;
}) {
  const [q, setQ] = useState("");
  const [onlyChecked, setOnlyChecked] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const fq = fold(q.trim());
  const shown = proposals.filter((p) => (!onlyChecked || checked[p.id]) && (!fq || fold(`${p.label} ${p.campaignName ?? ""}`).includes(fq)));
  const big = proposals.length > 8;
  const filtered = !!fq || onlyChecked;
  const allOn = shown.length > 0 && shown.every((p) => checked[p.id]);
  const setAll = (on: boolean) => { for (const p of shown) if (!!checked[p.id] !== on) onToggle(p.id); };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {canEdit && shown.length > 1 && (
          <label className="flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50/60 px-2 py-1 font-semibold text-indigo-700">
            <Checkbox checked={allOn} onCheckedChange={() => setAll(!allOn)} />
            {allOn ? "Bỏ chọn" : "Chọn tất cả"} {filtered ? `${shown.length} đang lọc` : shown.length}
          </label>
        )}
        {big && (
          <>
            <Input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Lọc theo tên / chiến dịch…" className="h-8 w-56" />
            <label className="flex items-center gap-1.5 text-slate-600">
              <Checkbox checked={onlyChecked} onCheckedChange={() => { setOnlyChecked((v) => !v); setLimit(PAGE); }} /> Chỉ hiện đã chọn
            </label>
            <span className="text-slate-400">{shown.length}/{proposals.length} việc</span>
          </>
        )}
      </div>
      <div className={cn("space-y-1.5", big && "max-h-[420px] overflow-y-auto rounded-lg border border-slate-100 p-1.5")}>
        {shown.length === 0 && <p className="px-2 py-3 text-center text-xs text-slate-400">Không có việc nào khớp bộ lọc.</p>}
        {shown.slice(0, limit).map((p) => (
          <label key={p.id} className={cn("flex items-start gap-2 rounded-lg border p-2.5 text-xs",
            checked[p.id] ? "border-indigo-200 bg-indigo-50/40" : "border-slate-100 bg-slate-50/40", !canEdit && "opacity-70")}>
            <Checkbox checked={!!checked[p.id]} onCheckedChange={() => onToggle(p.id)} disabled={!canEdit} className="mt-0.5" />
            <span className="min-w-0 flex-1 space-y-0.5">
              <span className="block font-medium text-slate-800">{p.label}{p.campaignName && <span className="ml-1 font-normal text-slate-400">· {p.campaignName}</span>}</span>
              <span className="block text-slate-500">{p.why}</span>
              {p.warning && <span className="flex items-start gap-1 text-amber-700"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> {p.warning}</span>}
            </span>
            {p.cost !== null && <span className="shrink-0 tabular-nums text-slate-500">{vnd(p.cost)} trong kỳ</span>}
          </label>
        ))}
        {shown.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="w-full rounded-lg border border-dashed border-slate-200 py-2 text-xs font-semibold text-indigo-600 hover:bg-slate-50">
            Xem thêm {Math.min(PAGE, shown.length - limit)} việc (còn {shown.length - limit})
          </button>
        )}
      </div>
    </div>
  );
}
