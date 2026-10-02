// ============================================================
// Đợt 12 (D) — X-quang Meta: đơn từ lượt BẤM vs chỉ XEM · đối chiếu GA4 theo utm · sự kiện tối ưu · tần suất (CHỈ ĐỌC)
// ============================================================
// Đo 29/09 (30 ngày, ₫120tr): ~90% "Mua hàng" Meta báo là 1d_view — người CHỈ XEM quảng cáo rồi mua trong 1 ngày (MBC có
// hàng nghìn đơn gia hạn/tuần nên phần này gần như chắc chắn là ghi công hộ). Ví dụ .XYZ: 204 = 2 bấm + 202 xem; GA4
// utm_campaign "xyz" 2 đơn. GA4 cả tài khoản ~145 đơn từ nguồn Facebook ≈ số đơn TỪ LƯỢT BẤM của Meta.
// Giới hạn lượt gọi: app Meta ở mức phát triển (~60 lượt/giờ) → mặc định 2 lượt (insights chiến dịch + nhóm quảng cáo), phần
// chi tiết (vị trí/thiết bị/tuổi/giờ, +4 lượt) chỉ khi bấm; nhớ 60 phút. Meta KHÔNG cho sửa cài đặt ghi nhận nhóm đã tạo →
// việc làm được đi qua phiên /xu-ly (tạo nhóm mới chỉ tính lượt bấm, có Kiểm trước + hoàn tác).

import { metaGetAll, adAccountId } from "@/lib/case/meta-graph"
import { PURCHASE_TYPES, pickAction, pickActionWindow } from "@/lib/case/meta-evidence"
import { detectCompany } from "@/lib/company-detect"
import { labelForStandardEvent, normalizeStandardEvent } from "@/lib/meta-pixel-events"
import { ga4Ids } from "@/lib/meta-accounts"
import { serviceAccountToken } from "@/lib/measure/gtm-api"
import { metaHealth } from "@/lib/measure/meta-health"
import type { Company } from "@/lib/case/types"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export const VIEW_HEAVY = 0.6
export const HIGH_FREQ = 4

export interface MetaCampaignXray {
  id: string; name: string; spend: number; frequency: number | null
  purchases: number; click: number | null; view: number | null; viewShare: number | null
  cpaMeta: number | null; cpaClick: number | null
  optEvent: string | null; optEventLabel: string | null
  attribution: string; includesView: boolean; advantageAudience: boolean | null; activeAdsets: number
  utm: string[]; ga4Purchases: number | null; utmShared: boolean
  flags: string[]
}
export interface MetaXray {
  company: Company; range: { from: string; to: string }; collectedAt: string
  campaigns: MetaCampaignXray[]
  totals: { spend: number; purchases: number; click: number; view: number; ga4Facebook: number | null; ga4Sources: { source: string; purchases: number }[] }
  warnings: { level: "bad" | "warn"; id: string; text: string; campaignId?: string }[]
  detail: null | { placements: Slice[]; devices: Slice[]; ageGender: Slice[]; hours: Slice[] }
  calls: number; errors: string[]; notes: string[]
}
export interface Slice { key: string; spend: number; click: number | null; view: number | null }

const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`
const attrLabel = (spec: Row[] | undefined) => !spec?.length ? "mặc định" : spec.map((s) => `${s.event_type === "VIEW_THROUGH" ? "xem" : s.event_type === "ENGAGED_VIDEO_VIEW" ? "xem video" : "bấm"} ${s.window_days} ngày`).join(" + ")

/** Cờ + cảnh báo cho MỘT chiến dịch — HÀM THUẦN. */
export function campaignFlags(c: Omit<MetaCampaignXray, "flags">): string[] {
  const f: string[] = []
  if (c.viewShare != null && c.purchases >= 10 && c.viewShare >= VIEW_HEAVY) f.push(`${Math.round(c.viewShare * 100)}% "mua hàng" là CHỈ XEM — CPA thật (từ lượt bấm) ${c.cpaClick ? vnd(c.cpaClick) : "không có đơn"} thay vì ${c.cpaMeta ? vnd(c.cpaMeta) : "—"}`)
  if (c.optEvent && c.optEvent !== "PURCHASE" && c.optEvent !== "LEAD") f.push(`Tối ưu theo "${c.optEventLabel}", không phải Mua hàng`)
  if (c.frequency != null && c.frequency >= HIGH_FREQ) f.push(`Tần suất ${c.frequency.toFixed(1)} — cùng người thấy lặp lại nhiều`)
  if (!c.utm.length) f.push("Không đọc được utm_campaign của quảng cáo — GA4 không đối chiếu được")
  else if (c.ga4Purchases != null && c.click != null && c.purchases >= 20 && c.ga4Purchases < c.purchases * 0.2) f.push(`GA4 (utm ${c.utm.join(", ")}) chỉ ${c.ga4Purchases} đơn so với ${c.purchases} Meta báo${c.utmShared ? " (utm dùng chung với chiến dịch khác)" : ""}`)
  return f
}

/** Tách tên utm_campaign từ link đích quảng cáo. */
export function utmOf(url: string): string | null { try { return new URL(url).searchParams.get("utm_campaign") } catch { return null } }

async function ga4FacebookByCampaign(company: Company, range: { from: string; to: string }): Promise<{ byCampaign: Map<string, number>; sources: { source: string; purchases: number }[]; total: number } | { error: string }> {
  const prop = ga4Ids(company).propertyId
  if (!prop) return { error: "chưa khai báo GA4 property" }
  let token: string
  try { token = await serviceAccountToken("https://www.googleapis.com/auth/analytics.readonly") } catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${prop}:runReport`, {
    method: "POST", signal: AbortSignal.timeout(60_000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ dateRanges: [{ startDate: range.from, endDate: range.to }], dimensions: [{ name: "sessionSource" }, { name: "sessionCampaignName" }], metrics: [{ name: "ecommercePurchases" }],
      dimensionFilter: { orGroup: { expressions: ["face", "fb", "instagram", "ig"].map((v) => ({ filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: v, caseSensitive: false } } })) } }, limit: 5000 }),
  })
  const j = (await res.json().catch(() => ({}))) as Row
  if (!res.ok) return { error: res.status === 403 ? "service account chưa có quyền Viewer GA4" : `GA4 ${res.status}` }
  const byCampaign = new Map<string, number>(), bySource = new Map<string, number>()
  let total = 0
  for (const r of (j.rows ?? []) as Row[]) {
    const src = String(r.dimensionValues[0].value), camp = String(r.dimensionValues[1].value).toLowerCase(), n = Number(r.metricValues[0].value) || 0
    byCampaign.set(camp, (byCampaign.get(camp) ?? 0) + n); bySource.set(src, (bySource.get(src) ?? 0) + n); total += n
  }
  return { byCampaign, total, sources: [...bySource].map(([source, purchases]) => ({ source, purchases })).sort((a, b) => b.purchases - a.purchases) }
}

const memo = new Map<string, { at: number; value: MetaXray }>()

export async function metaXray(company: Company, range: { from: string; to: string }, opts: { detail?: boolean; force?: boolean } = {}): Promise<MetaXray> {
  const key = `${company}|${range.from}|${range.to}|${opts.detail ? 1 : 0}`
  const hit = memo.get(key)
  if (!opts.force && hit && Date.now() - hit.at < 60 * 60_000) return hit.value
  const act = `act_${adAccountId()}`
  const tr = JSON.stringify({ since: range.from, until: range.to })
  const windows = JSON.stringify(["7d_click", "1d_view"])
  const errors: string[] = [], notes: string[] = []
  let calls = 0
  const ins = await metaGetAll<Row>(`${act}/insights`, { level: "campaign", time_range: tr, fields: "campaign_id,campaign_name,spend,frequency,actions", action_attribution_windows: windows, limit: "200" }, 3); calls++
  const mine = ins.filter((r) => detectCompany(String(r.campaign_name)) === company && Number(r.spend) > 0)
  let adsets: Row[] = []
  try { adsets = await metaGetAll<Row>(`${act}/adsets`, { fields: "campaign_id,optimization_goal,promoted_object,attribution_spec,targeting{targeting_automation}", effective_status: JSON.stringify(["ACTIVE"]), limit: "200" }, 3); calls++ } catch (e) { errors.push(`Nhóm quảng cáo: ${e instanceof Error ? e.message : String(e)}`) }
  const [ga4, health] = await Promise.all([ga4FacebookByCampaign(company, range), metaHealth(company, { range }).catch((e) => { errors.push(`Link quảng cáo: ${e instanceof Error ? e.message : String(e)}`); return null })])
  if ("error" in ga4) notes.push(`Không đối chiếu được GA4: ${ga4.error}`)
  // utm theo chiến dịch (từ link đích quảng cáo đang chạy — Đợt 9 observedLinks).
  const utmBy = new Map<string, Set<string>>()
  for (const l of health?.links.observedLinks ?? []) { const u = utmOf(l.url); if (u) (utmBy.get(l.campaignName) ?? utmBy.set(l.campaignName, new Set()).get(l.campaignName)!).add(u.toLowerCase()) }
  const utmCount = new Map<string, number>()
  for (const s of utmBy.values()) for (const u of s) utmCount.set(u, (utmCount.get(u) ?? 0) + 1)
  const campaigns: MetaCampaignXray[] = mine.map((r) => {
    const id = String(r.campaign_id)
    const as = adsets.filter((a) => String(a.campaign_id) === id)
    const first = as[0]
    const ev = first ? normalizeStandardEvent(first.promoted_object?.custom_event_type) ?? (first.optimization_goal ? String(first.optimization_goal) : null) : null
    const purchases = pickAction(r.actions, PURCHASE_TYPES)
    const click = pickActionWindow(r.actions, PURCHASE_TYPES, "7d_click"), view = pickActionWindow(r.actions, PURCHASE_TYPES, "1d_view")
    const spend = Number(r.spend) || 0
    const utm = [...(utmBy.get(String(r.campaign_name)) ?? [])]
    const ga4Purchases = "error" in ga4 || !utm.length ? null : utm.reduce((s, u) => s + (ga4.byCampaign.get(u) ?? 0), 0)
    const base = { id, name: String(r.campaign_name), spend, frequency: r.frequency != null ? Number(r.frequency) : null, purchases, click, view,
      viewShare: purchases > 0 && view != null ? view / purchases : null, cpaMeta: purchases > 0 ? spend / purchases : null, cpaClick: click ? spend / click : null,
      optEvent: ev, optEventLabel: ev ? labelForStandardEvent(ev) : null, attribution: as.length ? [...new Set(as.map((a) => attrLabel(a.attribution_spec)))].join(" · ") : "—",
      includesView: as.some((a) => (a.attribution_spec ?? []).some((s: Row) => s.event_type === "VIEW_THROUGH")),
      advantageAudience: first ? Number(first.targeting?.targeting_automation?.advantage_audience) === 1 : null, activeAdsets: as.length,
      utm, ga4Purchases, utmShared: utm.some((u) => (utmCount.get(u) ?? 0) > 1) }
    return { ...base, flags: campaignFlags(base) }
  }).sort((a, b) => b.spend - a.spend)
  const sum = (f: (c: MetaCampaignXray) => number | null) => campaigns.reduce((s, c) => s + (f(c) ?? 0), 0)
  const totals = { spend: sum((c) => c.spend), purchases: sum((c) => c.purchases), click: sum((c) => c.click), view: sum((c) => c.view), ga4Facebook: "error" in ga4 ? null : ga4.total, ga4Sources: "error" in ga4 ? [] : ga4.sources }
  const warnings: MetaXray["warnings"] = []
  if (totals.purchases >= 20 && totals.view / totals.purchases >= VIEW_HEAVY)
    warnings.push({ level: "bad", id: "view_heavy_account", text: `${Math.round((totals.view / totals.purchases) * 100)}% "mua hàng" Meta báo (${Math.round(totals.view)}/${Math.round(totals.purchases)}) là người CHỈ XEM quảng cáo rồi mua trong 1 ngày. Tính theo lượt bấm: ${Math.round(totals.click)} đơn — CPA ${totals.click ? vnd(totals.spend / totals.click) : "—"} thay vì ${vnd(totals.spend / Math.max(totals.purchases, 1))}.${totals.ga4Facebook != null ? ` GA4 ghi ${totals.ga4Facebook} đơn từ nguồn Facebook.` : ""}` })
  const srcNames = totals.ga4Sources.filter((s) => s.purchases > 0).map((s) => s.source)
  if (srcNames.length >= 3) warnings.push({ level: "warn", id: "utm_source_chaos", text: `GA4 thấy ${srcNames.length} cách ghi nguồn Facebook (${srcNames.slice(0, 5).join(", ")}) — chuẩn hoá bằng bảng link chuẩn (Đo lường → Gắn thẻ) để đối chiếu từng chiến dịch.` })
  const optWrong = campaigns.filter((c) => c.optEvent && c.optEvent !== "PURCHASE" && c.optEvent !== "LEAD")
  if (optWrong.length) warnings.push({ level: "warn", id: "opt_not_purchase", text: `${optWrong.length} chiến dịch tối ưu theo sự kiện khác Mua hàng (${[...new Set(optWrong.map((c) => c.optEventLabel))].join(", ")}) — ${vnd(optWrong.reduce((s, c) => s + c.spend, 0))} trong kỳ.` })

  let detail: MetaXray["detail"] = null
  if (opts.detail) {
    const bd = async (breakdowns: string, key: (r: Row) => string): Promise<Slice[]> => {
      calls++
      const rows = await metaGetAll<Row>(`${act}/insights`, { level: "campaign", time_range: tr, fields: "campaign_name,spend,actions", breakdowns, action_attribution_windows: windows, limit: "500" }, 5)
      const m = new Map<string, Slice>()
      for (const r of rows.filter((x) => detectCompany(String(x.campaign_name)) === company)) {
        const k = key(r); const s = m.get(k) ?? { key: k, spend: 0, click: 0, view: 0 }
        s.spend += Number(r.spend) || 0; s.click = (s.click ?? 0) + (pickActionWindow(r.actions, PURCHASE_TYPES, "7d_click") ?? 0); s.view = (s.view ?? 0) + (pickActionWindow(r.actions, PURCHASE_TYPES, "1d_view") ?? 0)
        m.set(k, s)
      }
      return [...m.values()].sort((a, b) => b.spend - a.spend)
    }
    try {
      detail = {
        placements: await bd("publisher_platform,platform_position", (r) => `${r.publisher_platform} · ${r.platform_position}`),
        devices: await bd("impression_device", (r) => String(r.impression_device)),
        ageGender: await bd("age,gender", (r) => `${r.age} · ${r.gender === "male" ? "nam" : r.gender === "female" ? "nữ" : "?"}`),
        hours: (await bd("hourly_stats_aggregated_by_advertiser_time_zone", (r) => String(r.hourly_stats_aggregated_by_advertiser_time_zone ?? "").slice(0, 2))).sort((a, b) => a.key.localeCompare(b.key)),
      }
    } catch (e) { errors.push(`Phân tích chi tiết: ${e instanceof Error ? e.message : String(e)}`) }
  }
  notes.push("Meta không cho sửa cài đặt ghi nhận của nhóm quảng cáo đã tạo — muốn chỉ tính lượt bấm phải tạo nhóm mới (Mở phiên xử lý).")
  const value: MetaXray = { company, range, collectedAt: new Date().toISOString(), campaigns, totals, warnings, detail, calls, errors, notes }
  memo.set(key, { at: Date.now(), value })
  return value
}
