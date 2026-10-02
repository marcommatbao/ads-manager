// ============================================================
// Sức khoẻ đo lường — nội dung riêng Facebook (Đợt 4 · A)
// ============================================================
"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { vnd, num, pct } from "@/components/case/format";
import { Kpi } from "@/components/measure/Kpi";
import { Pill } from "@/components/measure/Pill";
import { Sparkline } from "@/components/measure/Sparkline";
import { SourceTable } from "@/components/measure/SourceTable";
import { MIN_LANDING_RATE, MIN_CLICKS_FOR_LANDING_RATE } from "@/lib/case/meta-thresholds";
import { rangeDays } from "@/lib/case/dates";
import type { MetaHealth, OptEventHealth, PixelEventSeries, PixelHealth } from "@/lib/measure/meta-health";

const TONE_SVG: Record<"red" | "amber" | "green" | "grey", string> = {
  red: "#dc2626",
  amber: "#d97706",
  green: "#16a34a",
  grey: "#94a3b8",
};

function seriesFor(pixels: PixelHealth[], pixelId: string | null, pixelEventName: string | null): PixelEventSeries | null {
  if (!pixelId || !pixelEventName) return null;
  const pixel = pixels.find((p) => p.pixelId === pixelId);
  return pixel?.events.find((e) => e.name === pixelEventName) ?? null;
}

/** Tóm tắt trạng thái học của các nhóm quảng cáo dùng chung một sự kiện tối ưu. */
function learningSummary(adsets: OptEventHealth["adsets"]): string {
  if (!adsets.length) return "Chưa có nhóm quảng cáo nào dùng";
  const label: Record<string, string> = { LEARNING: "Đang học", SUCCESS: "Học xong", FAIL: "Học thất bại" };
  const counts = new Map<string, number>();
  for (const a of adsets) {
    const key = a.learningStatus ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const allFail = adsets.every((a) => a.learningStatus === "FAIL");
  if (allFail) return `${adsets.length} nhóm QC — tất cả ✕ Học thất bại`;
  const parts = [...counts.entries()].map(([k, n]) => `${n} ${k === "unknown" ? "chưa rõ" : label[k] ?? k}`);
  return `${adsets.length} nhóm QC — ${parts.join(", ")}`;
}

function optEventBadge(opt: OptEventHealth): { tone: "red" | "amber" | "green" | "grey"; text: string } {
  if (opt.status === "dead") return { tone: "red", text: "✕ Gần như không bắn" };
  if (opt.status === "low") return { tone: "amber", text: "⚠ Chưa đủ 50/tuần để Meta học" };
  if (opt.status === "unknown") return { tone: "grey", text: "? Không đọc được pixel" };
  if (opt.allFail) return { tone: "amber", text: "⚠ Pixel bắn đủ nhưng quảng cáo mang về quá ít — mọi nhóm học thất bại" };
  if (opt.adsLow) return { tone: "amber", text: `⚠ Pixel bắn đủ trên site nhưng quảng cáo mang về ít — Meta chỉ tính ${opt.adsAttributed} lượt cho ${opt.adsets.length} nhóm` };
  return { tone: "green", text: "✓ Đủ" };
}

export function FacebookHealthView({ data }: { data: MetaHealth }) {
  const allOptEvents = data.products.flatMap((p) => p.optEvents);
  const problemEvents = allOptEvents.filter((e) => e.status === "dead" || e.status === "low" || e.allFail || e.adsLow);
  const flaggedLanding = data.landing.filter((l) => l.flagged);
  const linksBadLabel = data.links.tableConfigured ? String(data.links.bad.length) : "Chưa có bảng chuẩn";
  const days = rangeDays(data.range);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Sự kiện tối ưu có vấn đề" value={num(problemEvents.length)} sub={`/ ${allOptEvents.length} sự kiện tối ưu đang dùng`} bad={problemEvents.length > 0} />
        <Kpi label="Lượt mua thiếu giá trị" value={num(data.noValue.length)} sub="Chiến dịch có mua hàng nhưng Meta ghi doanh thu ₫0" bad={data.noValue.length > 0} />
        <Kpi label="Chiến dịch click→trang dưới 30%" value={num(flaggedLanding.length)} sub={`Ngưỡng ${pct(MIN_LANDING_RATE, 0)} · từ ${num(MIN_CLICKS_FOR_LANDING_RATE)} click`} bad={flaggedLanding.length > 0} />
        <Kpi
          label="Liên kết sai quy ước utm"
          value={linksBadLabel}
          sub={<Link href="/do-luong/utm" className="text-blue-600 hover:underline">Xem chi tiết →</Link>}
          bad={data.links.tableConfigured && data.links.bad.length > 0}
        />
      </div>

      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">Theo nhóm sản phẩm</h2>
        <p className="mb-3 text-sm text-slate-500">Mỗi sự kiện: xu hướng {days} ngày + lượt/tuần. Sự kiện tự đặt (custom) đánh dấu riêng vì Meta không hiểu ý nghĩa của nó.</p>
        <div className="space-y-4">
          {data.products.map((product) => (
            <div key={product.group} className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">{product.label}</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="px-4 py-2 font-medium">Sự kiện pixel</th>
                    <th className="px-3 py-2 font-medium">Xu hướng {days} ngày</th>
                    <th className="px-3 py-2 text-right font-medium">Lượt/tuần</th>
                    <th className="px-3 py-2 font-medium">Meta tính cho quảng cáo</th>
                    <th className="px-3 py-2 font-medium">Trạng thái học</th>
                    <th className="px-3 py-2 font-medium">Tình trạng</th>
                  </tr>
                </thead>
                <tbody>
                  {product.optEvents.map((opt, i) => {
                    const series = seriesFor(data.pixels, opt.pixelId, opt.pixelEventName);
                    const badge = optEventBadge(opt);
                    return (
                      <tr key={i} className="border-b border-slate-50 last:border-0 align-top">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-800">{opt.label}</div>
                          {opt.custom && <Pill tone="grey" className="mt-1">tự đặt</Pill>}
                        </td>
                        <td className="px-3 py-2.5"><Sparkline values={series?.perDay ?? []} stroke={TONE_SVG[badge.tone]} /></td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{opt.perWeek === null ? "không rõ" : num(opt.perWeek, { maximumFractionDigits: 1 })}</td>
                        <td className="px-3 py-2.5 text-slate-600">Meta tính cho quảng cáo: <span className="tabular-nums font-medium">{num(opt.adsAttributed)}</span></td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">{learningSummary(opt.adsets)}</td>
                        <td className="px-3 py-2.5">
                          <Pill tone={badge.tone}>{badge.text}</Pill>
                          {(opt.status === "dead" || opt.status === "low" || opt.allFail || opt.adsLow) && (
                            <div className="mt-1"><Link href="/xu-ly" className="text-xs text-blue-600 hover:underline">Mở phiên xử lý</Link></div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">Pixel</h2>
        <p className="mb-3 text-sm text-slate-500">Toàn bộ sự kiện Meta đọc được trên từng pixel — kể cả sự kiện không dùng để tối ưu quảng cáo nào.</p>
        <div className="space-y-4">
          {data.pixels.map((pixel) => (
            <div key={pixel.pixelId} className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                <span className="text-sm font-semibold text-slate-800">Pixel {pixel.pixelId}</span>
                {!pixel.known && <Pill tone="red">✕ Không đọc được: {pixel.error ?? "lỗi không rõ"}</Pill>}
              </div>
              {pixel.known && (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                        <th className="px-4 py-2 font-medium">Sự kiện</th>
                        <th className="px-3 py-2 font-medium">Xu hướng {days} ngày</th>
                        <th className="px-3 py-2 text-right font-medium">Tổng {days} ngày</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pixel.events.map((e) => (
                        <tr key={e.name} className="border-b border-slate-50 last:border-0">
                          <td className="px-4 py-2.5 font-medium text-slate-800"><code className="text-xs">{e.name}</code></td>
                          <td className="px-3 py-2.5"><Sparkline values={e.perDay} /></td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{num(e.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pixel.variants.map((v) => (
                    <div key={v.key} className="m-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                      ⚠ Cùng hành động bắn dưới {v.names.length} tên: {v.names.map((n) => `${n.name} (${num(n.total)})`).join(" và ")} — nhóm quảng cáo tối ưu theo một tên chỉ tính lượt của đúng tên đó, bỏ sót phần bắn dưới tên kia.
                    </div>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {data.noValue.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-bold text-slate-900">Lượt mua thiếu giá trị</h2>
          <p className="mb-3 text-sm text-slate-500">Chiến dịch có lượt mua nhưng Meta ghi doanh thu ₫0 — pixel thiếu tham số value.</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Chiến dịch</th>
                  <th className="px-3 py-2 text-right font-medium">Chi</th>
                  <th className="px-3 py-2 text-right font-medium">Lượt mua</th>
                  <th className="px-3 py-2 text-right font-medium">Doanh thu Meta ghi</th>
                  <th className="px-3 py-2 font-medium">Tình trạng</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.noValue.map((r) => (
                  <tr key={r.campaignId} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{vnd(r.cost)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{num(r.purchases)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{vnd(r.value)}</td>
                    <td className="px-3 py-2.5"><Pill tone="red">✕ Gửi giá trị ₫0</Pill></td>
                    <td className="px-3 py-2.5"><Link href="/xu-ly" className="text-xs text-blue-600 hover:underline">Mở phiên xử lý</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">Click → trang đích</h2>
        <p className="mb-3 text-sm text-slate-500">
          Ngưỡng cảnh báo: dưới {pct(MIN_LANDING_RATE, 0)} click liên kết chuyển thành lượt xem trang đích (tính từ {num(MIN_CLICKS_FOR_LANDING_RATE)} click liên kết trở lên).
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Chiến dịch</th>
                <th className="px-3 py-2 text-right font-medium">Click liên kết</th>
                <th className="px-3 py-2 text-right font-medium">Xem trang đích</th>
                <th className="px-3 py-2 text-right font-medium">Tỉ lệ</th>
                <th className="px-3 py-2 text-right font-medium">Chi</th>
                <th className="px-3 py-2 text-right font-medium">Mua hàng</th>
                <th className="px-3 py-2 font-medium">Tình trạng</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.landing.map((r) => (
                <tr key={r.campaignId} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(r.linkClicks)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(r.landingViews)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(r.rate)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{vnd(r.cost)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(r.purchases)}</td>
                  <td className="px-3 py-2.5">
                    {r.flagged ? (
                      <Pill tone="red">✕ Dưới {pct(MIN_LANDING_RATE, 0)}</Pill>
                    ) : r.rate !== null && r.linkClicks >= MIN_CLICKS_FOR_LANDING_RATE ? (
                      <Pill tone="green">▲ Trên {pct(MIN_LANDING_RATE, 0)}</Pill>
                    ) : (
                      <Pill tone="grey">— Chưa đủ click để đánh giá</Pill>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{r.flagged && <Link href="/xu-ly" className="text-xs text-blue-600 hover:underline">Mở phiên xử lý</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">Liên kết quảng cáo</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Đọc được" value={num(data.links.checked)} />
            <Stat label="Trỏ về Facebook" value={num(data.links.onPlatform)} sub="không kiểm" />
            <Stat label="Quảng cáo bài viết" value={`${num(data.links.postRead)} đọc được link`} />
            <Stat label="Không có link" value={num(data.links.noLink)} />
          </div>
          {data.links.postUnreadable > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {num(data.links.postUnreadable)} chưa đọc được — Trang chưa có token: {data.links.postNoToken.map((p) => p.pageId).join(", ")}.{" "}
                <Link href="/settings#ket-noi" className="font-medium underline underline-offset-2">Thêm token Trang</Link>
              </span>
            </div>
          )}
          {data.links.postTokenErrors.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Token Trang hết hiệu lực: {data.links.postTokenErrors.map((p) => p.name ?? p.pageId).join(", ")}.{" "}
                <Link href="/settings#ket-noi" className="font-medium underline underline-offset-2">Thêm token Trang</Link>
              </span>
            </div>
          )}
          <div className="mt-3">
            {data.links.tableConfigured ? (
              <span className="text-slate-600">{num(data.links.bad.length)} liên kết sai quy ước utm — </span>
            ) : (
              <span className="text-slate-500">Chưa có bảng link chuẩn cho {data.company} — </span>
            )}
            <Link href="/do-luong/utm" className="font-medium text-blue-600 hover:underline">Xem chi tiết →</Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">Nối Odoo</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm text-slate-500">Tỉ lệ đơn có thẻ utm_campaign</span>
            <b className="tabular-nums text-lg">{data.odoo.totalOrders > 0 ? pct(data.odoo.taggedOrders / data.odoo.totalOrders) : "—"}</b>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-red-500" style={{ width: `${data.odoo.totalOrders > 0 ? Math.round((data.odoo.taggedOrders / data.odoo.totalOrders) * 100) : 0}%` }} />
          </div>
          {data.odoo.byStandardTag.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="py-2 font-medium">Sản phẩm</th>
                  <th className="py-2 font-medium">utm_campaign</th>
                  <th className="py-2 text-right font-medium">Đơn</th>
                  <th className="py-2 text-right font-medium">Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {data.odoo.byStandardTag.map((r) => (
                  <tr key={r.label} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 font-medium text-slate-800">{r.label}</td>
                    <td className="py-2"><code className="text-xs text-slate-600">{r.utmCampaign}</code></td>
                    <td className="py-2 text-right tabular-nums">{num(r.orders)}</td>
                    <td className="py-2 text-right tabular-nums">{vnd(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{data.odoo.note}</span>
          </div>
        </div>
      </section>

      <SourceTable sources={data.sources} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-base font-semibold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
