// ============================================================
// Sức khoẻ đo lường — nội dung riêng Google Ads (Đợt 4 · A)
// ============================================================
"use client";

import Link from "next/link";
import { vnd, num, pct } from "@/components/case/format";
import { Pill, type PillTone } from "@/components/measure/Pill";
import { Sparkline } from "@/components/measure/Sparkline";
import { SourceTable } from "@/components/measure/SourceTable";
import { rangeDays } from "@/lib/case/dates";
import type { ConversionActionHealth, ConversionFlag, GoogleHealth } from "@/lib/measure/google-health";

const FLAG_COPY: Record<ConversionFlag, { tone: PillTone; text: string }> = {
  primary_purchase_silent: { tone: "red", text: "⚠ Mua hàng là mục tiêu chính nhưng 0 lượt trong 7 ngày" },
  fixed_default_value: { tone: "amber", text: "⚠ Giá trị mặc định cố định — ROAS không phản ánh đơn thật" },
  purchase_not_primary: { tone: "red", text: "✕ Không có hành động Mua hàng nào là mục tiêu chính" },
};

const CATEGORY_LABEL: Record<string, string> = {
  PURCHASE: "Mua hàng",
  LEAD: "Khách hàng tiềm năng",
  SIGNUP: "Đăng ký",
  SUBMIT_LEAD_FORM: "Gửi form liên hệ",
  PAGE_VIEW: "Xem trang",
  PHONE_CALL_LEAD: "Gọi điện",
  ADD_TO_CART: "Thêm vào giỏ hàng",
};

function valueText(v: ConversionActionHealth["value"]): string {
  if (v.kind === "real") return "Theo đơn thật";
  if (v.kind === "fixed") return `Mặc định cố định ${vnd(v.defaultValue)}`;
  return "Không có giá trị";
}

const UTM_STATUS: Record<string, { tone: PillTone; text: string }> = {
  matched: { tone: "green", text: "✓ Khớp Odoo" },
  unmatched: { tone: "amber", text: "⚠ Có utm, Odoo chưa thấy đơn" },
  no_utm: { tone: "red", text: "✕ Không có utm" },
  unreadable: { tone: "grey", text: "? Không đọc được URL" },
};

export function GoogleHealthView({ data }: { data: GoogleHealth }) {
  const tagPct = data.utm.distinctTags > 0 ? data.utm.matchedTags / data.utm.distinctTags : null;
  const days = rangeDays(data.range);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">Hành động chuyển đổi</h2>
        <p className="mb-3 text-sm text-slate-500"><b>Chính</b> = Google tối ưu giá thầu theo hành động này; <b>Phụ</b> = chỉ theo dõi, không tối ưu.</p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Hành động</th>
                <th className="px-3 py-2 font-medium">Nhóm</th>
                <th className="px-3 py-2 font-medium">Chính/Phụ</th>
                <th className="px-3 py-2 font-medium">Giá trị</th>
                <th className="px-3 py-2 font-medium">Xu hướng {days} ngày</th>
                <th className="px-3 py-2 text-right font-medium">Lượt/7 ngày</th>
                <th className="px-3 py-2 font-medium">Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {data.conversions.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0 align-top">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{c.name}</td>
                  <td className="px-3 py-2.5 text-slate-600">{CATEGORY_LABEL[c.category] ?? c.category}</td>
                  <td className="px-3 py-2.5">
                    <span className={c.primary ? "font-semibold text-slate-800" : "text-slate-500"}>{c.primary ? "Chính" : "Phụ"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{valueText(c.value)}</td>
                  <td className="px-3 py-2.5"><Sparkline values={c.perDay} /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(c.last7, { maximumFractionDigits: 1 })}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex max-w-[260px] flex-col gap-1">
                      {c.flags.length === 0 && c.category === "PURCHASE" && <Pill tone="green">✓ Ổn</Pill>}
                      {c.flags.map((f) => {
                        const copy = FLAG_COPY[f];
                        return <Pill key={f} tone={copy.tone}>{copy.text}</Pill>;
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">Tự gắn thẻ (gclid)</h2>
        <p className="mb-3 text-sm text-slate-500">Tắt tự động gắn thẻ → <code>gclid</code> không có trong URL đích → không dựng lại được phiên click nào dẫn tới đơn.</p>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-800">{data.account.name || data.company}</span>
            {data.account.autoTagging === true && <Pill tone="green">✓ Bật</Pill>}
            {data.account.autoTagging === false && <Pill tone="red">✕ Tắt</Pill>}
            {data.account.autoTagging === null && <Pill tone="grey">? Không đọc được</Pill>}
          </div>
          {data.account.autoTagging === false && (
            <p className="mt-2 text-xs text-red-600">Không dựng lại được nguồn click cho đơn từ tài khoản này.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">utm trong URL đích</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm text-slate-500">{num(data.utm.matchedTags)} / {num(data.utm.distinctTags)} giá trị utm_campaign trong URL quảng cáo khớp đơn Odoo</span>
            <b className="tabular-nums text-lg">{tagPct !== null ? pct(tagPct, 0) : "—"}</b>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-red-500" style={{ width: `${tagPct !== null ? Math.round(tagPct * 100) : 0}%` }} />
          </div>
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            Odoo không lưu utm_source và thẻ dùng chung với Facebook → số đơn theo thẻ gồm mọi nền tảng, không tách được riêng Google.
          </div>
          {!data.utm.tableConfigured && (
            <div className="mt-2 text-xs text-slate-400">Chưa có bảng link chuẩn Google.</div>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="py-2 font-medium">Chiến dịch</th>
                  <th className="py-2 font-medium">utm_campaign trong URL</th>
                  <th className="py-2 text-right font-medium">Đơn Odoo khớp</th>
                  <th className="py-2 font-medium">Trạng thái</th>
                  <th className="py-2 font-medium">Link sai quy ước</th>
                </tr>
              </thead>
              <tbody>
                {data.utm.campaigns.map((c) => {
                  const st = UTM_STATUS[c.status];
                  return (
                    <tr key={c.campaignId} className="border-b border-slate-50 last:border-0 align-top">
                      <td className="py-2">
                        <div className="font-medium text-slate-800">{c.name}</div>
                        <div className="text-xs text-slate-400">{c.channel} · {vnd(c.cost)}</div>
                      </td>
                      <td className="py-2">{c.tags.length ? c.tags.map((t) => <code key={t} className="mr-1 text-xs text-slate-600">{t}</code>) : <span className="text-slate-400">—</span>}</td>
                      <td className="py-2 text-right tabular-nums">{num(c.odooOrders)}</td>
                      <td className="py-2"><Pill tone={st.tone}>{st.text}</Pill></td>
                      <td className="py-2">
                        {c.linkIssues.length === 0 ? (
                          <span className="text-emerald-600">✓</span>
                        ) : (
                          <Link href="/do-luong/utm" className="font-medium text-amber-600 hover:underline">⚠ {c.linkIssues.length}</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">Trang đích chết</h2>
        {data.deadPages.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <Pill tone="green">✓ Không có trang đích chết trong lượt quét</Pill>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Trang đích</th>
                  <th className="px-3 py-2 font-medium">Tình trạng</th>
                  <th className="px-3 py-2 text-right font-medium">Chi {days} ngày đang chảy vào</th>
                </tr>
              </thead>
              <tbody>
                {data.deadPages.map((d) => (
                  <tr key={d.url} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5"><code className="text-xs">{d.url}</code></td>
                    <td className="px-3 py-2.5"><Pill tone="red">✕ {d.reason}</Pill></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{vnd(d.spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SourceTable sources={data.sources} />
    </div>
  );
}
