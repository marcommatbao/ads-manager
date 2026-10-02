// ============================================================
// Bước 1 — Phân tích: chiến dịch đang ở đâu, cấu hình hiện tại ra sao.
// ============================================================
"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { vnd, num, pct, ddmmyyyy } from "./format";
import { metaObjectiveLabel } from "./meta-copy";
import type { CampaignCase } from "@/lib/case/store";

const BIDDING_LABEL: Record<string, string> = {
  MAXIMIZE_CONVERSIONS: "Tối đa hoá chuyển đổi",
  TARGET_CPA: "CPA mục tiêu",
  MAXIMIZE_CONVERSION_VALUE: "Tối đa hoá giá trị chuyển đổi",
  TARGET_ROAS: "ROAS mục tiêu",
  MANUAL_CPC: "Giá thầu CPC thủ công",
};

export function Step1Analysis({ c, onNext, busy }: { c: CampaignCase; onNext: () => void; busy?: boolean }) {
  const ev = c.evidence;
  if (!ev) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Phiên chưa có bằng chứng"
        description="Bước thu thập chưa chạy lần nào — sang bước 2 để kéo bằng chứng từ tài khoản."
      />
    );
  }

  if (ev.kind === "meta") {
    const camp = ev.campaign;
    const cpa = camp.purchases > 0 ? camp.cost / camp.purchases : null;
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Chiến dịch này đang ở đâu?</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Nguồn: dữ liệu Meta (Facebook/Instagram) {c.company}, {ddmmyyyy(c.range.from)} – {ddmmyyyy(c.range.to)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Đã chi" value={vnd(camp.cost)} bad={camp.purchases === 0} />
          <Kpi label="Lượt mua (Meta)" value={num(camp.purchases)} bad={camp.purchases === 0} sub="Mục tiêu cuối: Mua hàng" />
          <Kpi label="Chi phí/lượt mua" value={cpa !== null ? vnd(cpa) : "—"} />
          <Kpi label="Doanh thu Meta ghi" value={vnd(camp.purchaseValue)} bad={camp.purchases > 0 && camp.purchaseValue <= 0} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">Cấu hình hiện tại</div>
          <table className="w-full text-sm">
            <tbody>
              <Row label="Mục tiêu chiến dịch">{metaObjectiveLabel(camp.objective)}</Row>
              <Row label="Ngân sách ngày">
                <span className="tabular-nums">{camp.dailyBudget !== null ? vnd(camp.dailyBudget) : "Đặt ở cấp nhóm quảng cáo"}</span>
              </Row>
              <Row label="Tần suất">
                <span className="tabular-nums">{camp.frequency !== null ? camp.frequency.toFixed(2) : "—"}</span>
                {" · "}người tiếp cận <span className="tabular-nums">{num(camp.reach)}</span>
              </Row>
              <Row label="Lượt click liên kết"><span className="tabular-nums">{num(camp.linkClicks)}</span></Row>
              <Row label="Lượt xem trang đích"><span className="tabular-nums">{num(camp.landingViews)}</span></Row>
              <Row label="Trạng thái chiến dịch">{camp.status === "ACTIVE" ? "Đang chạy" : camp.status}</Row>
            </tbody>
          </table>
        </div>

        <div
          className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
            camp.purchases === 0 ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"
          }`}
        >
          {camp.purchases === 0 ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>
            {camp.purchases === 0
              ? `0 lượt mua trên ${vnd(camp.cost)} đã chi trong kỳ — cần tìm nguyên nhân. Bước tiếp theo sẽ kéo bằng chứng từ tài khoản.`
              : `${num(camp.purchases)} lượt mua trên ${vnd(camp.cost)} đã chi trong kỳ. Xem bằng chứng chi tiết ở bước 2.`}
          </span>
        </div>

        <div className="flex justify-end">
          <Button className="h-10" onClick={onNext} disabled={busy}>Thu thập bằng chứng →</Button>
        </div>
      </div>
    );
  }

  const camp = ev.campaign;
  const cpc = camp.clicks > 0 ? camp.cost / camp.clicks : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">Chiến dịch này đang ở đâu?</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Nguồn: dữ liệu Google Ads {c.company}, {ddmmyyyy(c.range.from)} – {ddmmyyyy(c.range.to)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Đã chi" value={vnd(camp.cost)} bad={camp.orders === 0} />
        <Kpi label="Click" value={num(camp.clicks)} sub={cpc !== null ? `CPC TB ${vnd(cpc)}` : undefined} />
        <Kpi label="Đơn mua" value={num(camp.orders)} bad={camp.orders === 0} sub="Mục tiêu cuối: Mua hàng" />
        <Kpi label="Chuyển đổi phụ (tất cả)" value={num(camp.allConversions, { maximumFractionDigits: 1 })} sub="all_conversions — gồm thêm giỏ, chat, form…" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">Cấu hình hiện tại</div>
        <table className="w-full text-sm">
          <tbody>
            <Row label="Chiến lược giá thầu">
              {BIDDING_LABEL[camp.biddingType] ?? camp.biddingType}
              {camp.targetCpa !== null && <> · CPA mục tiêu <b className="tabular-nums">{vnd(camp.targetCpa)}</b></>}
              {camp.targetRoas !== null && <> · ROAS mục tiêu <b className="tabular-nums">{camp.targetRoas}</b></>}
            </Row>
            <Row label="Ngân sách ngày"><span className="tabular-nums">{vnd(camp.budgetDaily)}</span></Row>
            {ev?.kind !== "google_pmax" && (
            <Row label="Tỉ lệ hiển thị">
              <span className="tabular-nums">{pct(camp.impressionShare)}</span>
              {camp.lostIsBudget !== null && <> · mất <span className="tabular-nums">{pct(camp.lostIsBudget)}</span> vì ngân sách</>}
              {camp.lostIsRank !== null && <> · <span className="tabular-nums">{pct(camp.lostIsRank)}</span> vì thứ hạng</>}
            </Row>
            )}
            <Row label="Trạng thái chiến dịch">{camp.status === "ENABLED" ? "Đang chạy" : camp.status}</Row>
          </tbody>
        </table>
      </div>

      {ev?.network && ev.network.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">Pmax chi tiền ở kênh nào</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Kênh</th>
                <th className="px-4 py-2 text-right font-medium">Chi</th>
                <th className="px-4 py-2 text-right font-medium">Click</th>
                <th className="px-4 py-2 text-right font-medium">Đơn</th>
              </tr>
            </thead>
            <tbody>
              {ev.network.filter((n) => n.cost > 0).map((n) => (
                <tr key={n.network} className="border-t border-slate-50">
                  <td className="px-4 py-2 text-slate-700">{NETWORK_LABEL[n.network] ?? n.network}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{vnd(n.cost)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{num(n.clicks)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${n.conversions === 0 ? "font-semibold text-red-600" : "text-slate-800"}`}>{num(n.conversions, { maximumFractionDigits: 1 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div
        className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
          camp.orders === 0 ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"
        }`}
      >
        {camp.orders === 0 ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
        <span>
          {camp.orders === 0
            ? `0 đơn trên ${vnd(camp.cost)} đã chi trong kỳ — cần tìm nguyên nhân. Bước tiếp theo sẽ kéo bằng chứng từ tài khoản.`
            : `${num(camp.orders)} đơn trên ${vnd(camp.cost)} đã chi trong kỳ. Xem bằng chứng chi tiết ở bước 2.`}
        </span>
      </div>

      <div className="flex justify-end">
        <Button className="h-10" onClick={onNext} disabled={busy}>Thu thập bằng chứng →</Button>
      </div>
    </div>
  );
}

const NETWORK_LABEL: Record<string, string> = {
  SEARCH: "Tìm kiếm", SEARCH_PARTNERS: "Đối tác tìm kiếm", CONTENT: "Hiển thị", YOUTUBE: "YouTube",
  GMAIL: "Gmail", DISCOVER: "Khám phá", MAPS: "Maps", MIXED: "Nhiều kênh", GOOGLE_TV: "Google TV",
};

function Kpi({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${bad ? "text-red-600" : "text-slate-900"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr className="border-b border-slate-50 last:border-0">
      <td className="w-56 px-4 py-2 text-slate-500">{label}</td>
      <td className="px-4 py-2 text-slate-800">{children}</td>
    </tr>
  );
}
