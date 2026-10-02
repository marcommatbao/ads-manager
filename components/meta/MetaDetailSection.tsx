"use client";

// ============================================================
// "Phân tích chi tiết" của /meta-xray — 4 lát cắt (vị trí, thiết bị, tuổi/giới,
// giờ) chỉ tải khi bấm nút vì tốn thêm 4 lượt gọi Meta (app ở mức phát triển,
// ~60 lượt/giờ — xem lib/meta/xray.ts). Đóng/mở KHÔNG gọi lại nếu đã có dữ liệu;
// bấm nút mới gọi lại (component cha quyết định force hay không).
// ============================================================

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { vnd, num } from "@/components/case/format";
import type { MetaXray, Slice } from "@/lib/meta/xray";

/** "facebook · feed" → "facebook · feed" nhưng bỏ gạch dưới cho dễ đọc (impression_device, publisher_platform trả nguyên dạng API). */
function humanize(key: string): string {
  return key.split(" · ").map((part) => part.replaceAll("_", " ")).join(" · ");
}
function hourLabel(key: string): string {
  const h = parseInt(key, 10);
  return Number.isFinite(h) ? `${h}h–${(h + 1) % 24}h` : key;
}

function SliceMiniTable({ slices, format }: { slices: Slice[]; format?: (key: string) => string }) {
  if (slices.length === 0) return <p className="text-[11px] text-slate-400">Chưa có dữ liệu.</p>;
  const maxSpend = Math.max(...slices.map((s) => s.spend), 1);
  return (
    <div className="max-h-64 overflow-y-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="pb-1 pr-2 font-medium"></th>
            <th className="pb-1 pr-2 font-medium">Chi phí</th>
            <th className="pb-1 text-right font-medium">Bấm</th>
            <th className="pb-1 pl-2 text-right font-medium">Chỉ xem</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((s) => (
            <tr key={s.key} className="border-t border-slate-50">
              <td className="py-1 pr-2 text-slate-600">{format ? format(s.key) : s.key}</td>
              <td className="py-1 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="whitespace-nowrap tabular-nums text-slate-700">{vnd(s.spend)}</span>
                  <div className="h-1 min-w-[20px] flex-1 rounded-full bg-slate-100">
                    <div className="h-1 rounded-full bg-indigo-500" style={{ width: `${Math.round((s.spend / maxSpend) * 100)}%` }} />
                  </div>
                </div>
              </td>
              <td className="py-1 text-right tabular-nums text-slate-600">{s.click === null ? "—" : num(s.click, { maximumFractionDigits: 1 })}</td>
              <td className="py-1 pl-2 text-right tabular-nums text-slate-500">{s.view === null ? "—" : num(s.view, { maximumFractionDigits: 1 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SmallCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-bold text-slate-700">{title}</p>
      {children}
    </div>
  );
}

export function MetaDetailSection({ detail, loading, onLoad }: { detail: MetaXray["detail"]; loading: boolean; onLoad: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />}
          Phân tích chi tiết
        </span>
        {detail && <span className="text-[11px] text-slate-400">Đã tải</span>}
      </button>
      {open && (
        detail ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SmallCard title="Vị trí hiển thị"><SliceMiniTable slices={detail.placements} format={humanize} /></SmallCard>
              <SmallCard title="Thiết bị"><SliceMiniTable slices={detail.devices} format={humanize} /></SmallCard>
              <SmallCard title="Tuổi · Giới tính"><SliceMiniTable slices={detail.ageGender} /></SmallCard>
            </div>
            <SmallCard title="Theo giờ (0–23, giờ tài khoản quảng cáo)"><SliceMiniTable slices={detail.hours} format={hourLabel} /></SmallCard>
            <Button type="button" variant="outline" size="sm" className="h-8 bg-white" onClick={onLoad} disabled={loading}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Tải lại (tốn thêm 4 lượt gọi Meta)
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Tách chi phí theo vị trí hiển thị, thiết bị, tuổi/giới tính và khung giờ — tốn thêm lượt gọi Meta nên không tải sẵn.</p>
            <Button type="button" size="sm" className="h-9" onClick={onLoad} disabled={loading}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Tải (tốn 4 lượt gọi Meta)
            </Button>
          </div>
        )
      )}
    </section>
  );
}
