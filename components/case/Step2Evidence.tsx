// ============================================================
// Bước 2 — Thu thập bằng chứng. CHỈ ĐỌC: không đổi gì trên tài khoản quảng cáo.
// ============================================================
"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { vnd, num, pct, datetimeVN } from "./format";
import { postJson, ApiError } from "./api";
import { META_EVENT_LABEL, META_EVENT_ORDER, META_LEARNING_LABEL } from "./meta-copy";
import type { CampaignCase } from "@/lib/case/store";
import type { MetaEvidence, MetaPlacementSlice, SourceStatus } from "@/lib/case/types";
import { metaGoalKind } from "@/lib/case/goal-kind";

const SOURCE_PILL: Record<SourceStatus, { icon: typeof CheckCircle2; cls: string; text: string }> = {
  ok: { icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "Đủ" },
  partial: { icon: TriangleAlert, cls: "bg-amber-50 text-amber-700 border-amber-200", text: "Thiếu" },
  error: { icon: AlertTriangle, cls: "bg-red-50 text-red-700 border-red-200", text: "Lỗi" },
};

/** Chi phí/xem trang đích/lượt mua (thu lead: lead) theo vị trí, gộp qua mọi nhóm quảng cáo — sắp theo chi phí. */
function aggregatePlacements(placements: MetaPlacementSlice[], leads: boolean) {
  const by = new Map<string, { key: string; label: string; cost: number; landingViews: number; purchases: number }>();
  for (const p of placements) {
    const cur = by.get(p.key) ?? { key: p.key, label: p.label, cost: 0, landingViews: 0, purchases: 0 };
    cur.cost += p.cost;
    cur.landingViews += p.landingViews;
    cur.purchases += leads ? p.leads ?? 0 : p.purchases;
    by.set(p.key, cur);
  }
  const totalCost = [...by.values()].reduce((s, r) => s + r.cost, 0);
  return [...by.values()]
    .map((r) => ({ ...r, share: totalCost > 0 ? r.cost / totalCost : 0 }))
    .sort((a, b) => b.cost - a.cost);
}

export function Step2Evidence({
  c,
  onRefresh,
  onBack,
  onNext,
  busy,
}: {
  c: CampaignCase;
  onRefresh: (next: CampaignCase) => void;
  onBack: () => void;
  onNext: () => void;
  busy?: boolean;
}) {
  const [collecting, setCollecting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function recollect() {
    setCollecting(true);
    setErr(null);
    try {
      const json = await postJson(`/api/cases/${c.id}/collect`);
      onRefresh(json.case);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không kéo lại được bằng chứng");
    } finally {
      setCollecting(false);
    }
  }

  if (!c.evidence) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Chưa có bằng chứng nào"
        description={`Bấm Kéo lại để lấy bằng chứng từ ${c.platform === "facebook" ? "Meta" : "Google Ads"}.`}
        action={
          <Button className="h-10" onClick={recollect} disabled={collecting}>
            {collecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Kéo lại
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">Bằng chứng đã kéo từ tài khoản</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Chỉ đọc — bước này không thay đổi gì trên {c.platform === "facebook" ? "Meta" : "Google Ads"} · lấy lúc {datetimeVN(c.evidence.collectedAt)}
          </p>
        </div>
        <Button className="h-10" variant="outline" size="sm" onClick={recollect} disabled={collecting}>
          {collecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          Kéo lại
        </Button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-4 py-2 font-medium">Nguồn</th>
              <th className="px-3 py-2 text-right font-medium">Đã lấy</th>
              <th className="px-3 py-2 font-medium">Ghi chú</th>
              <th className="px-3 py-2 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {c.evidence.sources.map((s) => {
              const pill = SOURCE_PILL[s.status];
              const Icon = pill.icon;
              return (
                <tr key={s.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 text-slate-800">{s.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{num(s.rows)}</td>
                  <td className="px-3 py-2.5 text-slate-500">{s.note ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${pill.cls}`}>
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {pill.text}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {c.evidence.kind === "meta" && <MetaEvidenceBlocks ev={c.evidence} />}

      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Nguồn nào thiếu sẽ ghi rõ ở cột Ghi chú — kết luận ở bước 4 chỉ dựng trên phần đã thấy, không suy ra phần bị ẩn.</span>
      </div>

      <div className="flex justify-between">
        <Button className="h-10" variant="outline" onClick={onBack} disabled={busy}>← Bước 1</Button>
        <Button className="h-10" onClick={onNext} disabled={busy}>Xác nhận mục tiêu →</Button>
      </div>
    </div>
  );
}

function MetaEvidenceBlocks({ ev }: { ev: MetaEvidence }) {
  const leads = metaGoalKind(ev.campaign.objective) === "leads"; // Đợt 23 (3d)
  const placementRows = aggregatePlacements(ev.placements, leads);
  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">Nhóm quảng cáo</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-4 py-2 font-medium">Nhóm quảng cáo</th>
              <th className="px-3 py-2 font-medium">Trạng thái</th>
              <th className="px-3 py-2 font-medium">Sự kiện tối ưu</th>
              <th className="px-3 py-2 font-medium">Trạng thái học</th>
              <th className="px-3 py-2 font-medium">Vị trí</th>
              <th className="px-3 py-2 text-right font-medium">Chi phí</th>
              <th className="px-3 py-2 text-right font-medium">{leads ? "Lead" : "Lượt mua"}</th>
              <th className="px-3 py-2 text-right font-medium">Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {ev.adsets.map((a) => (
              <tr key={a.id} className="border-b border-slate-50 last:border-0 align-top">
                <td className="px-4 py-2.5 text-slate-800">{a.name}</td>
                <td className="px-3 py-2.5 text-slate-600">{a.status === "ACTIVE" ? "Đang chạy" : a.status}</td>
                <td className="px-3 py-2.5 text-slate-600">{a.optEvent.label}</td>
                <td className="px-3 py-2.5 text-slate-600">
                  {a.learning.status ? (META_LEARNING_LABEL[a.learning.status] ?? a.learning.status) : "—"}
                  {a.learning.conversions !== null && <span className="text-slate-400"> ({num(a.learning.conversions)} sự kiện)</span>}
                </td>
                <td className="px-3 py-2.5 text-slate-600">{a.automaticPlacement ? "Tự động" : "Thủ công"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{vnd(a.cost)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(leads ? a.leads ?? 0 : a.purchases)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span title={a.optResultsApprox ? "Sự kiện tự đặt: Meta gộp mọi sự kiện tự đặt, số là xấp xỉ" : undefined}>
                    {num(a.optResults)}{a.optResultsApprox ? "≈" : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {placementRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">Chi tiêu theo vị trí hiển thị</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Vị trí</th>
                <th className="px-3 py-2 text-right font-medium">Chi phí</th>
                <th className="px-3 py-2 text-right font-medium">% chi phí</th>
                <th className="px-3 py-2 text-right font-medium">Xem trang đích</th>
                <th className="px-3 py-2 text-right font-medium">{leads ? "Lead" : "Lượt mua"}</th>
              </tr>
            </thead>
            <tbody>
              {placementRows.map((r) => (
                <tr key={r.key} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 text-slate-800">{r.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{vnd(r.cost)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(r.share)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(r.landingViews)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(r.purchases)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-sm">
          <div className="mb-1.5 font-semibold text-slate-800">Đối chiếu Odoo</div>
          {ev.odoo.checked && (
            <div className="mb-1.5 space-y-0.5 text-slate-700">
              <div>Thẻ utm_campaign: {ev.odoo.tags.map((t) => `“${t}”`).join(", ")}</div>
              <div>Đơn Odoo: <span className="tabular-nums font-semibold">{num(ev.odoo.orders)}</span> · Doanh thu: <span className="tabular-nums font-semibold">{vnd(ev.odoo.revenue)}</span></div>
            </div>
          )}
          <p className="text-xs text-slate-500">{ev.odoo.note}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-sm">
          <div className="mb-1.5 font-semibold text-slate-800">Chiến dịch cùng sản phẩm</div>
          <p className="mb-1.5 text-slate-700">Cùng sản phẩm: <b className="tabular-nums">{num(ev.peers.campaigns)}</b> chiến dịch (<span className="tabular-nums">{num(ev.peers.activeCampaigns)}</span> đang chi)</p>
          <ul className="space-y-0.5 text-xs text-slate-600">
            {META_EVENT_ORDER.filter((k) => ev.peers.eventsPerWeek[k] !== undefined).map((k) => (
              <li key={k}>{META_EVENT_LABEL[k]}: <span className="tabular-nums">{num(ev.peers.eventsPerWeek[k])}</span>/tuần</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
