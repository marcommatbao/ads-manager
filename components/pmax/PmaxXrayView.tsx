"use client";

// ============================================================
// PMax X-quang (Đợt 10a) — nội dung tab "🩻 X-quang" trong /google-pmax.
// ------------------------------------------------------------
// Đọc GET /api/google/pmax/xray (lib/pmax/xray.ts — SERVER, kéo google-ads
// SDK) nên ở đây CHỈ `import type` từ đó, không import giá trị/hàm.
// Khoảng ngày của tab này KHÔNG dùng chung store zustand mà 3 tab kia đang
// bám (DateRangePicker toàn cục) — API xray nhận from/to riêng, nên giữ
// khoảng ngày riêng ở đây và đồng bộ vào URL ?from=&to= như /do-luong, để
// tải lại/quay lại không mất lựa chọn.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCw, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { getJson, ApiError } from "@/components/case/api";
import { vnd, num, pct } from "@/components/case/format";
import { DateRangeControl, type DateRangeValue } from "@/components/DateRangeControl";
import { DEFAULT_VIEW_DAYS, MAX_RANGE_DAYS, isYmd, lastDays } from "@/lib/case/dates";
import { PmaxActionsPanel } from "./PmaxActionsPanel";
import type { PmaxXray, ChannelRow, XrayWarning, Cannibalization } from "@/lib/pmax/xray";

type Company = string;

function initialRange(sp: ReturnType<typeof useSearchParams>): DateRangeValue {
  const from = sp.get("from");
  const to = sp.get("to");
  if (isYmd(from) && isYmd(to) && from <= to) return { from, to };
  return lastDays(DEFAULT_VIEW_DAYS);
}

/** Suy network từ id cảnh báo (`engaged_${network}` / `nochannel_${network}`) — chỉ 2 dạng lib/pmax/xray.ts sinh ra. */
function badNetworkSet(warnings: XrayWarning[]): Set<string> {
  const s = new Set<string>();
  for (const w of warnings) {
    const m = /^(?:engaged|nochannel)_(.+)$/.exec(w.id);
    if (m) s.add(m[1]);
  }
  return s;
}

function Badge({ cls, symbol, children }: { cls: string; symbol: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold", cls)}>
      {symbol} {children}
    </span>
  );
}

// ── Section 1: cảnh báo ──

function WarningBanner({ warnings }: { warnings: XrayWarning[] }) {
  const bad = warnings.filter((w) => w.level === "bad");
  const warn = warnings.filter((w) => w.level === "warn");
  return (
    <div className="space-y-2">
      {bad.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-red-700">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Cảnh báo
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-red-700">
            {bad.map((w) => (
              <li key={w.id} className="flex gap-1.5">
                <span className="shrink-0 font-bold">✕</span>
                <span>{w.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {warn.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <ul className="space-y-1.5 text-xs text-amber-700">
            {warn.map((w) => (
              <li key={w.id} className="flex gap-1.5">
                <span className="shrink-0 font-bold">⚠</span>
                <span>{w.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {bad.length === 0 && warn.length === 0 && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          ✓ Không phát hiện cảnh báo bất thường ở kênh nào trong khoảng này.
        </p>
      )}
      <p className="text-[11px] italic text-slate-400">
        Đơn sau lượt xem = người xem video ≥10 giây, không bấm, sau đó mua. Google vẫn tính để đặt giá. Tính năng thí nghiệm đo tăng thật sẽ có ở Đợt 10c.
      </p>
    </div>
  );
}

// ── Section 2: chi phí & đơn theo kênh ──

function ChannelTable({ channels, totals, badNetworks }: {
  channels: ChannelRow[];
  totals: { cost: number; convClick: number; convEngaged: number };
  badNetworks: Set<string>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 text-left text-[11px] text-slate-500">
            <th className="px-3 py-2 font-medium">Kênh</th>
            <th className="px-3 py-2 font-medium">Chi (₫, % chi)</th>
            <th className="px-3 py-2 text-right font-medium">Đơn từ lượt bấm</th>
            <th className="px-3 py-2 text-right font-medium">Đơn sau lượt xem</th>
            <th className="px-3 py-2 text-right font-medium">CPA theo đơn bấm</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((c) => (
            <tr key={c.network} className={cn("border-b border-slate-50 align-top last:border-0", badNetworks.has(c.network) && "bg-red-50/60")}>
              <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800">
                {badNetworks.has(c.network) && <span className="mr-1 text-red-600">✕</span>}
                {c.label}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-slate-700">{vnd(c.cost)}</span>
                  <div className="h-1.5 max-w-[100px] min-w-[32px] flex-1 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.round(c.costShare * 100)}%` }} />
                  </div>
                  <span className="w-9 shrink-0 text-right tabular-nums text-slate-400">{Math.round(c.costShare * 100)}%</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{num(c.convClick, { maximumFractionDigits: 1 })}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{num(c.convEngaged, { maximumFractionDigits: 1 })}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{vnd(c.cpaClick)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
            <td className="px-3 py-2.5">Tổng</td>
            <td className="px-3 py-2.5 tabular-nums">{vnd(totals.cost)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{num(totals.convClick, { maximumFractionDigits: 1 })}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{num(totals.convEngaged, { maximumFractionDigits: 1 })}</td>
            <td className="px-3 py-2.5 text-right text-slate-400">—</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const CAMPAIGN_STATUS_LABEL: Record<string, string> = { ENABLED: "Đang chạy", PAUSED: "Tạm dừng", REMOVED: "Đã xoá" };
const BIDDING_LABEL: Record<string, string> = {
  MAXIMIZE_CONVERSIONS: "Tối đa chuyển đổi", MAXIMIZE_CONVERSION_VALUE: "Tối đa giá trị chuyển đổi",
  TARGET_CPA: "CPA mục tiêu", TARGET_ROAS: "ROAS mục tiêu", MANUAL_CPC: "CPC thủ công", MANUAL_CPA: "CPA thủ công",
  TARGET_SPEND: "Tối đa lượt bấm", ENHANCED_CPC: "CPC nâng cao",
};
const biddingLabel = (v: string) => BIDDING_LABEL[v] ?? v.replaceAll("_", " ");

function CampaignXrayRow({ campaign }: { campaign: PmaxXray["campaigns"][number] }) {
  const [open, setOpen] = useState(false);
  const isOn = campaign.status === "ENABLED";
  const badNetworks = badNetworkSet(campaign.warnings);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800" title={campaign.name}>{campaign.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isOn ? "bg-emerald-500" : "bg-slate-300")} />
            {CAMPAIGN_STATUS_LABEL[campaign.status] ?? campaign.status} · {biddingLabel(campaign.bidding)} · Ngân sách {vnd(campaign.budget)}/ngày
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="tabular-nums text-xs font-semibold text-slate-700">{vnd(campaign.cost)}</p>
            <p className="tabular-nums text-[10px] text-slate-400">{num(campaign.convClick, { maximumFractionDigits: 1 })} bấm · {num(campaign.convEngaged, { maximumFractionDigits: 1 })} xem</p>
          </div>
          {campaign.warnings.length > 0 && <span className="text-xs font-bold text-red-500" title="Có cảnh báo">✕</span>}
          {open ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
        </div>
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/50 p-3">
          {campaign.warnings.length > 0 && (
            <ul className="space-y-1 text-xs text-red-700">
              {campaign.warnings.map((w) => (
                <li key={w.id} className="flex gap-1.5"><span className="shrink-0 font-bold">✕</span><span>{w.text}</span></li>
              ))}
            </ul>
          )}
          <ChannelTable
            channels={campaign.channels}
            totals={{ cost: campaign.cost, convClick: campaign.convClick, convEngaged: campaign.convEngaged }}
            badNetworks={badNetworks}
          />
        </div>
      )}
    </div>
  );
}

function ChannelSection({ account, campaigns }: { account: PmaxXray["account"]; campaigns: PmaxXray["campaigns"] }) {
  const badNetworks = badNetworkSet(account.warnings);
  const withCost = campaigns.filter((c) => c.cost > 0);
  const withoutCost = campaigns.filter((c) => c.cost <= 0);
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-800">Chi phí &amp; đơn theo kênh</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          &quot;Đơn từ lượt bấm&quot; là số nên tin để đặt CPA; &quot;đơn sau lượt xem&quot; Google vẫn tính vào Smart Bidding nhưng không chắc là do quảng cáo.
        </p>
      </div>
      <ChannelTable channels={account.channels} totals={account.totals} badNetworks={badNetworks} />
      {campaigns.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600">Theo chiến dịch ({campaigns.length})</p>
          <div className="space-y-2">
            {withCost.map((c) => <CampaignXrayRow key={c.id} campaign={c} />)}
          </div>
          {withoutCost.length > 0 && (
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer select-none py-1">+{withoutCost.length} chiến dịch không phát sinh chi phí trong khoảng này</summary>
              <div className="mt-2 space-y-2">{withoutCost.map((c) => <CampaignXrayRow key={c.id} campaign={c} />)}</div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

// ── Section 3: lượt tìm theo ý định ──

const HILITE_INTENT = new Set(["own_brand", "competitor"]);

function IntentSection({ terms }: { terms: PmaxXray["terms"] }) {
  const [showNgrams, setShowNgrams] = useState(false);
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-800">Lượt tìm của PMax theo ý định</h3>
        <p className="mt-0.5 text-xs text-slate-500">{num(terms.total)} lượt tìm PMax tự chọn hiển thị trong khoảng này — nhóm theo ý định để thấy tiền có rơi vào khách đã biết mình hay tên đối thủ không.</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] text-slate-500">
              <th className="px-3 py-2 font-medium">Ý định</th>
              <th className="px-3 py-2 text-right font-medium">Số lượt tìm</th>
              <th className="px-3 py-2 text-right font-medium">Lượt bấm</th>
              <th className="px-3 py-2 text-right font-medium">Đơn</th>
              <th className="px-3 py-2 font-medium">Ví dụ</th>
            </tr>
          </thead>
          <tbody>
            {terms.intents.map((it) => (
              <tr key={it.intent} className={cn("border-b border-slate-50 align-top last:border-0", HILITE_INTENT.has(it.intent) && "bg-amber-50/60")}>
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800">
                  {HILITE_INTENT.has(it.intent) && <span className="mr-1 text-amber-600">⚠</span>}
                  {it.label}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(it.terms)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(it.clicks)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(it.conversions, { maximumFractionDigits: 1 })}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {it.examples.slice(0, 5).map((ex) => (
                      <span key={ex.term} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600" title={`${ex.clicks} lượt bấm · ${ex.conversions} đơn`}>
                        {ex.term}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {terms.ngrams.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowNgrams((s) => !s)} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
            {showNgrams ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
            Cụm từ lặp lại nhiều ({terms.ngrams.length})
          </button>
          {showNgrams && (
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] text-slate-500">
                    <th className="px-3 py-2 font-medium">Cụm từ</th>
                    <th className="px-3 py-2 text-right font-medium">Số lượt tìm</th>
                    <th className="px-3 py-2 text-right font-medium">Lượt bấm</th>
                    <th className="px-3 py-2 text-right font-medium">Đơn</th>
                  </tr>
                </thead>
                <tbody>
                  {terms.ngrams.map((g) => (
                    <tr key={g.gram} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2.5 text-slate-800">{g.gram}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{num(g.terms)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{num(g.clicks)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{num(g.conversions, { maximumFractionDigits: 1 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Section 4: PMax ăn sang Search ──

function CannibalizationSection({ c }: { c: Cannibalization }) {
  const badgeCls = c.brandShare >= 0.4 ? "bg-red-50 text-red-700 border-red-200" : c.brandShare >= 0.2 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200";
  const symbol = c.brandShare >= 0.4 ? "✕" : c.brandShare >= 0.2 ? "⚠" : "✓";
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-800">PMax ăn sang Search</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Khi đã có chiến dịch Search thương hiệu, lượt tìm thương hiệu do PMax giành thường là khách cũ — tốn tiền mà không thêm khách mới. Loại trừ thương hiệu khỏi PMax sẽ có ở Đợt 10b.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase text-slate-400">Lượt bấm tìm kiếm vào thương hiệu mình</p>
          <Badge cls={cn("mt-1.5 text-sm", badgeCls)} symbol={symbol}>{pct(c.brandShare, 0)}</Badge>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase text-slate-400">Trùng từ khoá Search đang chạy</p>
          <p className="mt-1 tabular-nums text-sm font-bold text-slate-800">{num(c.overlapClicks)} / {num(c.pmaxClicks)} lượt bấm</p>
          <p className="tabular-nums text-[10px] text-slate-400">{num(c.overlapTerms)} lượt tìm · {num(c.overlapConversions, { maximumFractionDigits: 1 })} đơn</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase text-slate-400">Tổng lượt bấm PMax vào thương hiệu</p>
          <p className="mt-1 tabular-nums text-sm font-bold text-slate-800">{num(c.brandClicks)}</p>
        </div>
      </div>
      {c.examples.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-500">
                <th className="px-3 py-2 font-medium">Lượt tìm PMax</th>
                <th className="px-3 py-2 text-right font-medium">Lượt bấm</th>
                <th className="px-3 py-2 font-medium">Trùng từ khoá Search</th>
              </tr>
            </thead>
            <tbody>
              {c.examples.map((ex) => (
                <tr key={ex.term} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2.5 text-slate-800">{ex.term}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(ex.clicks)}</td>
                  <td className="px-3 py-2.5 text-slate-500">{ex.searchKeyword}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Section 5: asset group ──

const AD_STRENGTH_LABEL: Record<string, { text: string; symbol: string; cls: string }> = {
  EXCELLENT: { text: "Xuất sắc", symbol: "✓", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  GOOD: { text: "Tốt", symbol: "✓", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  AVERAGE: { text: "Trung bình", symbol: "⚠", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  POOR: { text: "Kém", symbol: "✕", cls: "bg-red-50 text-red-700 border-red-200" },
  NO_ADS: { text: "Chưa có quảng cáo", symbol: "✕", cls: "bg-red-50 text-red-700 border-red-200" },
  PENDING: { text: "Đang chờ", symbol: "◌", cls: "bg-slate-50 text-slate-500 border-slate-200" },
};
const AG_STATUS_LABEL: Record<string, { text: string; symbol: string; cls: string }> = {
  ELIGIBLE: { text: "Đủ điều kiện", symbol: "✓", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  LIMITED: { text: "Hạn chế", symbol: "⚠", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  NOT_ELIGIBLE: { text: "Không đủ điều kiện", symbol: "✕", cls: "bg-red-50 text-red-700 border-red-200" },
  PENDING: { text: "Đang chờ", symbol: "◌", cls: "bg-slate-50 text-slate-500 border-slate-200" },
  PAUSED: { text: "Tạm dừng", symbol: "⏸", cls: "bg-slate-50 text-slate-500 border-slate-200" },
  REMOVED: { text: "Đã xoá", symbol: "✕", cls: "bg-slate-50 text-slate-500 border-slate-200" },
};
const fallbackBadge = (raw: string) => ({ text: raw, symbol: "?", cls: "bg-slate-50 text-slate-500 border-slate-200" });

function AssetGroupSection({ groups }: { groups: PmaxXray["assetGroups"] }) {
  if (groups.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-bold text-slate-800">Asset group đang chạy</h3>
        <p className="text-xs text-slate-400">Không có asset group PMax nào đang bật.</p>
      </section>
    );
  }
  const byCampaign = new Map<string, { campaignName: string; items: PmaxXray["assetGroups"] }>();
  for (const g of groups) {
    const b = byCampaign.get(g.campaignId) ?? { campaignName: g.campaignName, items: [] };
    b.items.push(g);
    byCampaign.set(g.campaignId, b);
  }
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold text-slate-800">Asset group đang chạy</h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] text-slate-500">
              <th className="px-3 py-2 font-medium">Chiến dịch › Asset group</th>
              <th className="px-3 py-2 font-medium">Độ mạnh</th>
              <th className="px-3 py-2 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {[...byCampaign.values()].flatMap((b) => b.items.map((g, i) => {
              const strength = AD_STRENGTH_LABEL[g.adStrength] ?? fallbackBadge(g.adStrength);
              const status = AG_STATUS_LABEL[g.status] ?? fallbackBadge(g.status);
              return (
                <tr key={`${g.campaignId}-${g.name}-${i}`} className="border-b border-slate-50 align-top last:border-0">
                  <td className="px-3 py-2.5">
                    {i === 0 && <span className="block text-[10px] font-semibold text-slate-400">{b.campaignName}</span>}
                    <span className="text-slate-700">{g.name}</span>
                  </td>
                  <td className="px-3 py-2.5"><Badge cls={strength.cls} symbol={strength.symbol}>{strength.text}</Badge></td>
                  <td className="px-3 py-2.5"><Badge cls={status.cls} symbol={status.symbol}>{status.text}</Badge></td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Skeleton ──

function XraySkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
    </div>
  );
}

// ── Root ──

export function PmaxXrayView({ company }: { company: Company }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [range, setRange] = useState<DateRangeValue>(() => initialRange(searchParams));
  const [data, setData] = useState<PmaxXray | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force?: boolean) => {
    if (force) setReloading(true); else setLoading(true);
    setError(null);
    try {
      const json = await getJson(`/api/google/pmax/xray?company=${company}&from=${range.from}&to=${range.to}${force ? "&force=1" : ""}`);
      setData(json as PmaxXray);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Lỗi kết nối tới Google Ads");
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, [company, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  function handleRangeChange(next: DateRangeValue) {
    setRange(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "xray");
    params.set("from", next.from);
    params.set("to", next.to);
    router.replace(`/google-pmax?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">🩻 X-quang chi tiêu PMax</h2>
          <p className="mt-1 text-xs text-slate-500">Tách chi phí &amp; đơn theo TỪNG kênh thật (Search/Display/YouTube/Gmail/Discover/Maps) và theo kiểu ghi nhận — lớp minh bạch mà báo cáo PMax gộp chung không cho thấy.</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeControl value={range} onChange={handleRangeChange} maxDays={MAX_RANGE_DAYS} />
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || reloading}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-50"
          >
            {reloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            Tải lại
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <XraySkeleton />
      ) : !data ? null : data.account.totals.cost === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-10 text-center">
          <ScanLine className="mx-auto mb-3 h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-500">Không có chi phí PMax trong khoảng này</p>
          <p className="mt-1 text-xs text-slate-400">Đổi khoảng ngày hoặc kiểm tra chiến dịch Performance Max của {company}.</p>
        </div>
      ) : (
        <>
          {data.errors.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ⚠ Một phần dữ liệu không đọc được: {data.errors.join(" · ")}
            </p>
          )}
          <WarningBanner warnings={data.account.warnings} />
          <PmaxActionsPanel company={company} range={range} />
          <ChannelSection account={data.account} campaigns={data.campaigns} />
          <IntentSection terms={data.terms} />
          <CannibalizationSection c={data.cannibalization} />
          <AssetGroupSection groups={data.assetGroups} />
          <p className="text-right text-[10px] text-slate-300">Cập nhật lúc {new Date(data.collectedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>
        </>
      )}
    </div>
  );
}
