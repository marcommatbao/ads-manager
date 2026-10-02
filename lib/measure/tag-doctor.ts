// ============================================================
// Chẩn đoán gắn thẻ (Đợt 4 · bổ sung, user chốt 27/09) — CHỈ ĐỌC
// ============================================================
// Mục đích: phát hiện sự kiện bắn trùng / sai tên / cấu hình sai TRƯỚC khi đưa
// vào quảng cáo, và nói rõ "bản chuẩn" của từng hành động là cái nào.
//
// "Bản chuẩn" = hai điều kiện cùng lúc:
//   1. TÊN đúng: Meta chỉ tối ưu theo sự kiện chuẩn (Purchase, AddToCart…);
//      Google cần đúng MỘT hành động chính cho mỗi nhóm (Mua hàng…).
//   2. ĐẾM đúng: so số 28 ngày của từng phiên bản với đơn thật trong Odoo cùng
//      kỳ (chỉ Mua hàng; chỉ MBI có bộ lọc đơn marketing). Bản chuẩn đếm thiếu
//      → sửa NGUỒN BẮN, không đổi sang tối ưu bản tự đặt.
//
// Đo thật 27/09 (MBI) là ca mẫu: purchase 337 (tự đặt) vs Purchase 69 (chuẩn);
// GTM đặt "Custom" cho add_to_cart/add_payment_info (user đã sửa, bản 129);
// Google đặt giá theo Thêm giỏ + Bắt đầu thanh toán, KHÔNG theo Mua hàng;
// "Purchase" (thẻ Google) là chính mà 0 lượt/7 ngày dù thẻ có trong GTM.

import { enums } from "google-ads-api"
import { getGoogleAdsCustomer } from "@/lib/google-ads-client"
import { readGroup } from "@/lib/odoo-client"
import { mktOrderDomain } from "@/lib/odoo-mkt-orders"
import { metaGet } from "@/lib/case/meta-graph"
import type { Company, EvidenceSource } from "@/lib/case/types"
import { detectGtmIds, fetchGtm, type GtmContainer } from "./gtm"
import { gtmApiConfigured, liveToContainer, readLive } from "./gtm-api"
import { epochRange, HEALTH_DAYS, metaHealth } from "./meta-health"
import { addDays, rangeDays, vnDate } from "@/lib/case/dates"
import { readStandardLinks } from "./utm-links"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const en = (e: Record<string | number, string | number>, v: unknown) => (typeof v === "number" ? String(e[v] ?? v) : String(v ?? ""))

/** Hành động kinh doanh ↔ tên chuẩn Meta ↔ nhóm chuyển đổi Google. */
export const BUSINESS_ACTIONS = [
  { key: "purchase", label: "Mua hàng", meta: "Purchase", google: "PURCHASE" },
  { key: "add_to_cart", label: "Thêm vào giỏ", meta: "AddToCart", google: "ADD_TO_CART" },
  { key: "add_payment_info", label: "Thêm thông tin thanh toán", meta: "AddPaymentInfo", google: null },
  { key: "initiate_checkout", label: "Bắt đầu thanh toán", meta: "InitiateCheckout", google: "BEGIN_CHECKOUT" },
  { key: "lead", label: "Khách hàng tiềm năng", meta: "Lead", google: "SUBMIT_LEAD_FORM" },
] as const
export type ActionKey = (typeof BUSINESS_ACTIONS)[number]["key"]

/** Khoá so tên: bỏ hoa/thường, "_", "-", khoảng trắng; initiated → initiate. */
export const normEvent = (n: string) => n.toLowerCase().replace(/[_\s-]/g, "").replace(/^initiated/, "initiate")

export interface GoogleActionFact {
  id: string; resourceName: string; name: string; category: string; origin: string; type: string
  primary: boolean; sendTo: string[]; inGtm: boolean | null; total: number; last7: number
}
export interface GoogleGoalFact { resourceName: string; category: string; origin: string; biddable: boolean }

export interface CanonicalRow {
  key: ActionKey
  label: string
  /** total = 28 ngày; last7 = 7 ngày gần nhất (tách lỗi cũ trước khi sửa khỏi lỗi đang xảy ra). */
  meta: { name: string; standard: boolean; total: number; last7: number }[]
  google: { name: string; primary: boolean; total: number; last7: number; inGtm: boolean | null }[]
  /** Đơn thật Odoo cùng kỳ — chỉ có với Mua hàng + MBI; null = không có nguồn so. */
  odooOrders: number | null
  verdict: { tone: "ok" | "warn" | "bad"; text: string }
}

export interface TagIssue {
  id: string
  severity: "bad" | "warn"
  platform: "meta" | "google" | "gtm"
  title: string
  detail: string
  /** Cách sửa từng bước (hướng dẫn cho người). */
  steps: string[]
  /** Việc tool sửa được trên Google (id trong GoogleFixProposal). */
  fixIds: string[]
  /** Việc tool sửa được trên GTM (id trong GtmFixProposal) — C2. */
  gtmFixIds?: string[]
}

/** C2 — sửa thẻ GTM. Ghi qua workspace riêng → phiên bản mới → publish (lib/measure/gtm-fix.ts). */
export type GtmFixProposal =
  | { id: string; kind: "tag_standard"; container: string; tagId: string; tagName: string; fromName: string; toName: string; label: string }
  | { id: string; kind: "tag_retrigger"; container: string; tagId: string; tagName: string; fromTriggerIds: string[]; toTriggerId: string; toTriggerName: string; label: string
      /** Đổi trigger làm Google mất tín hiệu đặt giá (user yêu cầu 28/09) — publish phải tích xác nhận. */
      signalWarning?: string }

export type GoogleFixProposal =
  | { id: string; kind: "goal_biddable"; resourceName: string; category: string; origin: string; before: boolean; after: boolean; label: string }
  | { id: string; kind: "action_primary"; resourceName: string; name: string; before: boolean; after: boolean; label: string }

export interface TagDoctorInput {
  company: Company
  pixelEvents: { pixelId: string; events: { name: string; total: number; last7?: number }[] }[]
  gtm: GtmContainer[]
  googleActions: GoogleActionFact[]
  googleGoals: GoogleGoalFact[]
  dualSource: { pixelId: string; event: string; browser: number; server: number }[]
  odooOrders: number | null
  /** Số ngày của khoảng đang xem (mặc định 28). */
  days?: number
}

export interface TagDoctorReport extends TagDoctorInput {
  range: { from: string; to: string }
  collectedAt: string
  canonical: CanonicalRow[]
  /** false = khoảng kết thúc TRƯỚC hôm nay → chỉ xem, không đề xuất sửa (cấu hình GTM/Google là của hôm nay). */
  current: boolean
  /** Đợt 9 · 2 — lộ trình sửa đo lường Mua hàng (chỉ khi có vấn đề Mua hàng và khoảng tới hôm nay). */
  roadmap: RoadmapStep[]
  issues: TagIssue[]
  fixes: GoogleFixProposal[]
  gtmFixes: GtmFixProposal[]
  sources: EvidenceSource[]
}

const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })

/** Hàm thuần: số liệu → bảng bản chuẩn + danh sách lỗi + đề xuất sửa Google. */
export function buildTagDoctor(i: TagDoctorInput): Pick<TagDoctorReport, "canonical" | "issues" | "fixes" | "gtmFixes"> {
  const issues: TagIssue[] = []
  const fixes: GoogleFixProposal[] = []
  const gtmFixes: GtmFixProposal[] = []
  const allEvents = i.pixelEvents.flatMap((p) => p.events)
  const pixelTags = i.gtm.flatMap((g) => g.pixelTags.map((t) => ({ ...t, container: g.id, version: g.version })))
  const gtmApi = (container: string) => i.gtm.some((g) => g.id === container && g.source === "api")
  const tagName = (container: string, tagId: string) => i.gtm.find((g) => g.id === container)?.tagsDetail?.find((t) => t.tagId === tagId)?.name ?? `thẻ ${tagId}`
  const stdFix = (container: string, tagId: string, fromName: string, toName: string) => {
    const id = `gtm_std_${container}_${tagId}`
    if (!gtmFixes.some((f) => f.id === id)) gtmFixes.push({ id, kind: "tag_standard", container, tagId, tagName: tagName(container, tagId), fromName, toName, label: `${container} · ${tagName(container, tagId)}: đổi “${fromName}” (Custom) → ${toName} (Standard)` })
    return id
  }

  // ── Google: đề xuất sửa (sinh từ dữ liệu, không gõ cứng) ──
  const goal = (cat: string) => i.googleGoals.find((g) => g.category === cat && g.origin === "WEBSITE")
  const purchaseGoal = goal("PURCHASE")
  const purchaseActions = i.googleActions.filter((a) => a.category === "PURCHASE" && a.origin === "WEBSITE")
  const primarySilent = purchaseActions.filter((a) => a.primary && a.last7 === 0)
  const secondaryAlive = purchaseActions.filter((a) => !a.primary && a.last7 > 0).sort((a, b) => b.last7 - a.last7)
  if (purchaseGoal && !purchaseGoal.biddable) {
    fixes.push({ id: "goal_purchase_on", kind: "goal_biddable", resourceName: purchaseGoal.resourceName, category: "PURCHASE", origin: "WEBSITE", before: false, after: true, label: "Đặt “Mua hàng” làm mục tiêu đặt giá" })
  }
  for (const [cat, id, label] of [["ADD_TO_CART", "goal_cart_off", "Tắt đặt giá theo “Thêm vào giỏ”"], ["BEGIN_CHECKOUT", "goal_checkout_off", "Tắt đặt giá theo “Bắt đầu thanh toán”"]] as const) {
    const g = goal(cat)
    if (g?.biddable && purchaseGoal && !purchaseGoal.biddable) fixes.push({ id, kind: "goal_biddable", resourceName: g.resourceName, category: cat, origin: "WEBSITE", before: true, after: false, label })
  }
  if (primarySilent.length && secondaryAlive.length) {
    const alive = secondaryAlive[0]
    fixes.push({ id: "action_primary_alive", kind: "action_primary", resourceName: alive.resourceName, name: alive.name, before: false, after: true, label: `Đặt “${alive.name}” (${fmt(alive.last7)} lượt/7 ngày) làm hành động CHÍNH cho Mua hàng` })
    for (const s of primarySilent) fixes.push({ id: `action_secondary_${s.id}`, kind: "action_primary", resourceName: s.resourceName, name: s.name, before: true, after: false, label: `Chuyển “${s.name}” (0 lượt/7 ngày) sang PHỤ` })
  }

  // ── Bảng bản chuẩn ──
  const canonical: CanonicalRow[] = BUSINESS_ACTIONS.map((a) => {
    const meta = allEvents.filter((e) => normEvent(e.name) === normEvent(a.meta))
      .reduce<{ name: string; standard: boolean; total: number; last7: number }[]>((acc, e) => {
        const cur = acc.find((x) => x.name === e.name)
        if (cur) { cur.total += e.total; cur.last7 += e.last7 ?? 0 }
        else acc.push({ name: e.name, standard: e.name === a.meta, total: e.total, last7: e.last7 ?? 0 })
        return acc
      }, []).sort((x, y) => Number(y.standard) - Number(x.standard))
    const google = a.google ? i.googleActions.filter((g) => g.category === a.google && g.origin === "WEBSITE")
      .map((g) => ({ name: g.name, primary: g.primary, total: g.total, last7: g.last7, inGtm: g.inGtm })) : []
    const odooOrders = a.key === "purchase" ? i.odooOrders : null
    const std = meta.find((m) => m.standard)
    const custom = meta.filter((m) => !m.standard)
    let verdict: CanonicalRow["verdict"] = { tone: "ok", text: "Tên chuẩn, không có bản trùng" }
    const stopped = custom.length > 0 && custom.every((c) => c.last7 === 0) && i.pixelEvents.some((p) => p.events.some((e) => e.last7 !== undefined))
    if (!meta.length && !google.length) verdict = { tone: "ok", text: "Chưa dùng hành động này" }
    else if (stopped) verdict = { tone: "ok", text: `Bản tự đặt (${custom.map((c) => c.name).join(", ")}) đã NGỪNG bắn trong 7 ngày gần nhất — có vẻ đã sửa; số 28 ngày còn gồm những ngày trước khi sửa` }
    else if (!std && custom.length) verdict = { tone: "bad", text: `Chỉ có bản tự đặt (${custom.map((c) => c.name).join(", ")}) — Meta không tối ưu được. Đổi nguồn bắn sang tên chuẩn ${a.meta}` }
    else if (std && custom.length) {
      const big = custom.reduce((s, c) => s + c.total, 0)
      verdict = big > std.total
        ? { tone: "bad", text: `Bản tự đặt đếm nhiều hơn bản chuẩn (${fmt(big)} vs ${fmt(std.total)}) — bản chuẩn đang đếm thiếu: sửa nguồn bắn, đừng đổi sang tối ưu bản tự đặt` }
        : { tone: "warn", text: `Có thêm bản tự đặt (${custom.map((c) => c.name).join(", ")}) — gom về một tên chuẩn để khỏi đếm lẫn` }
    }
    if (odooOrders !== null && std && odooOrders > 0) {
      const ratio = std.total / odooOrders
      if (ratio < 0.5 || ratio > 2) verdict = { tone: "bad", text: `${verdict.text}. Bản chuẩn ${fmt(std.total)} lượt so với ${fmt(odooOrders)} đơn Odoo — lệch ${ratio < 1 ? "thiếu" : "thừa"} ${fmt(ratio)} lần` }
    }
    const gp = google.filter((g) => g.primary)
    if (a.google && gp.length > 1) verdict = { tone: "warn", text: `${verdict.text}. Google có ${gp.length} hành động CHÍNH cho cùng nhóm — dễ đếm trùng` }
    return { key: a.key, label: a.label, meta, google, odooOrders, verdict }
  })

  // ── Lỗi: Meta tên trùng / tự đặt ──
  for (const row of canonical) {
    const custom = row.meta.filter((m) => !m.standard)
    if (!custom.length || row.verdict.tone === "ok") continue
    const std = row.meta.find((m) => m.standard)
    const tags = pixelTags.filter((t) => custom.some((c) => c.name === t.eventName))
    const a = BUSINESS_ACTIONS.find((x) => x.key === row.key)!
    issues.push({
      id: `meta_variant_${row.key}`, severity: std ? "warn" : "bad", platform: "meta",
      title: `${row.label}: pixel bắn ${std ? "2 tên" : "chỉ tên tự đặt"} — ${row.meta.map((m) => `${m.name} (${fmt(m.total)}; 7 ngày: ${fmt(m.last7)})`).join(" / ")}`,
      detail: tags.length
        ? `Nguồn trong GTM: ${tags.map((t) => `${t.container} thẻ ${t.tagId} (${t.source === "html" ? "HTML tự viết" : "mẫu Facebook Pixel"}, ${t.kind})`).join("; ")}.`
        : `Không thẻ Facebook nào trong GTM gửi tên ${custom.map((c) => `“${c.name}”`).join(", ")} — nguồn khác (mã trang, tích hợp đối tác, API máy chủ). Xem Events Manager → Pixel → sự kiện → Nguồn.`,
      gtmFixIds: tags.filter((t) => t.source === "template" && gtmApi(t.container)).map((t) => stdFix(t.container, t.tagId, t.eventName, a.meta)),
      steps: tags.length
        ? tags.map((t) => `GTM ${t.container} → Thẻ ${t.tagId} → Event Name: Standard → ${a.meta} → Lưu → Submit/Publish`)
        : [`Events Manager → Pixel → sự kiện ${custom.map((c) => c.name).join(", ")} → xem mục nguồn/tích hợp`, `Đổi nơi gửi sang tên chuẩn ${a.meta} (hoặc tắt nếu trùng với bản chuẩn đang gửi)`],
      fixIds: [],
    })
  }
  // ── Lỗi: thẻ GTM Custom trùng nghĩa sự kiện chuẩn (kể cả khi pixel chưa bắn) ──
  for (const t of pixelTags) {
    if (t.kind !== "custom" || t.dynamic) continue
    const a = BUSINESS_ACTIONS.find((x) => normEvent(x.meta) === normEvent(t.eventName))
    if (!a || issues.some((x) => x.id === `meta_variant_${a.key}` && x.detail.includes(`thẻ ${t.tagId}`))) continue
    issues.push({
      id: `gtm_custom_${t.container}_${t.tagId}`, severity: "bad", platform: "gtm",
      title: `GTM ${t.container} thẻ ${t.tagId} gửi “${t.eventName}” dạng Custom — trùng nghĩa ${a.meta}`,
      detail: "Meta coi là sự kiện tự đặt, nhóm tối ưu theo sự kiện chuẩn không thấy lượt này.",
      steps: [`GTM ${t.container} → Thẻ ${t.tagId} → Event Name: Standard → ${a.meta} → Lưu → Submit/Publish`], fixIds: [],
      gtmFixIds: t.source === "template" && gtmApi(t.container) ? [stdFix(t.container, t.tagId, t.eventName, a.meta)] : [],
    })
  }
  for (const t of pixelTags.filter((x) => !x.hasEventId && x.kind === "standard" && !x.dynamic)) {
    issues.push({
      id: `gtm_no_event_id_${t.container}_${t.tagId}`, severity: "warn", platform: "gtm",
      title: `GTM ${t.container} thẻ ${t.tagId} (${t.eventName}) không gửi event_id`,
      detail: "Nếu sự kiện này cũng gửi qua API máy chủ, Meta không khử trùng được → đếm 2 lần.",
      steps: [`GTM ${t.container} → Thẻ ${t.tagId} → Event ID: gắn biến mã sự kiện (cùng giá trị với API máy chủ)`], fixIds: [],
    })
  }
  for (const d of i.dualSource.filter((x) => x.browser > 0 && x.server > 0)) {
    const tag = pixelTags.find((t) => t.eventName === d.event && (!t.pixelId || t.pixelId === d.pixelId))
    if (tag?.hasEventId) continue
    issues.push({
      id: `dual_${d.pixelId}_${d.event}`, severity: "warn", platform: "meta",
      title: `${d.event} gửi 2 đường (trình duyệt ${fmt(d.browser)} · máy chủ ${fmt(d.server)}) mà không thấy thẻ có event_id`,
      detail: "Meta chỉ gộp khi hai bên gửi cùng event_id — không thì mỗi đơn đếm 2 lần.",
      steps: ["Kiểm thẻ trình duyệt và API máy chủ gửi cùng event_id cho mỗi lần mua"], fixIds: [],
    })
  }

  // ── C1: đọc trigger qua API ──
  gtmTriggerIssues(i, issues, gtmFixes)

  // ── Lỗi: Google ──
  const fixIdsOf = (...ids: string[]) => fixes.filter((f) => ids.includes(f.id) || ids.some((p) => p.endsWith("*") && f.id.startsWith(p.slice(0, -1)))).map((f) => f.id)
  if (purchaseGoal && !purchaseGoal.biddable) {
    const bidding = i.googleGoals.filter((g) => g.biddable && g.origin === "WEBSITE").map((g) => g.category)
    issues.push({
      id: "google_goal_not_purchase", severity: "bad", platform: "google",
      title: `Google đặt giá theo ${bidding.length ? bidding.join(", ") : "không mục tiêu website nào"} — KHÔNG theo Mua hàng`,
      detail: "Mục tiêu cấp tài khoản: mọi chiến dịch dùng mục tiêu tài khoản đang tối ưu để có người thêm giỏ/bắt đầu thanh toán, không phải người mua.",
      steps: [
        "Trước hết làm cho hành động Mua hàng CHÍNH có số ổn định ≥ 7 ngày (xem lỗi hành động chính bên dưới nếu có)",
        "Google Ads → Mục tiêu → Tóm tắt → Mua hàng → Dùng làm mục tiêu tài khoản",
        "Cân nhắc bỏ Thêm vào giỏ / Bắt đầu thanh toán khỏi mục tiêu tài khoản",
      ],
      fixIds: fixIdsOf("goal_purchase_on", "goal_cart_off", "goal_checkout_off"),
    })
  }
  for (const s of primarySilent) {
    issues.push({
      id: `google_primary_silent_${s.id}`, severity: "bad", platform: "google",
      title: `“${s.name}” là hành động CHÍNH của Mua hàng mà 0 lượt/7 ngày (${fmt(s.total)} lượt/${i.days ?? HEALTH_DAYS} ngày)`,
      detail: s.inGtm === true ? `Thẻ có trong GTM (${s.sendTo.join(", ")}) nhưng gần như không bắn → nghi điều kiện kích hoạt (trigger).`
        : s.inGtm === false ? `Không thấy thẻ ${s.sendTo.join(", ")} trong GTM → thẻ chưa được cài hoặc cài ngoài GTM.`
        : "Không đối chiếu được với GTM.",
      steps: s.inGtm === true ? ["GTM → mở thẻ Google Ads có nhãn trên → kiểm trigger có bắn ở trang cảm ơn/đơn thành công không → Xem trước (Preview) một lần mua thử"]
        : ["Cài thẻ chuyển đổi Google Ads với nhãn trên vào trang đơn thành công (qua GTM)"],
      fixIds: fixIdsOf("action_primary_alive", "action_secondary_*"),
    })
  }
  for (const a of i.googleActions.filter((x) => x.origin === "WEBSITE" && x.type === "WEBPAGE" && x.inGtm === false && !primarySilent.includes(x))) {
    issues.push({
      id: `google_no_tag_${a.id}`, severity: a.primary ? "bad" : "warn", platform: "google",
      title: `“${a.name}” không có thẻ trong GTM`, detail: `Nhãn ${a.sendTo.join(", ")} không thấy trong container nào.`,
      steps: ["Cài thẻ vào GTM, hoặc xoá/ẩn hành động nếu không còn dùng"], fixIds: [],
    })
  }
  issues.sort((x, y) => Number(y.severity === "bad") - Number(x.severity === "bad"))
  return { canonical, issues, fixes, gtmFixes }
}

const memo = new Map<string, { at: number; value: TagDoctorReport }>()

export async function tagDoctor(company: Company, opts: { force?: boolean; range?: { from: string; to: string } } = {}): Promise<TagDoctorReport> {
  // Đệm theo công ty + KHOẢNG — trước 28/09 chỉ theo công ty (khoảng luôn cố định).
  const memoKey = `${company}|${opts.range?.from ?? ""}|${opts.range?.to ?? ""}`
  const hit = memo.get(memoKey)
  if (!opts.force && hit && Date.now() - hit.at < 30 * 60_000) return hit.value
  const sources: EvidenceSource[] = []

  // Meta: dùng lại Sức khoẻ đo lường (đệm chung, không tốn thêm lượt gọi).
  const mh = await metaHealth(company, { force: opts.force, range: opts.range })
  const days = rangeDays(mh.range)
  const current = mh.range.to === vnDate()
  const pixelEvents = mh.pixels.filter((p) => p.known).map((p) => ({ pixelId: p.pixelId, events: p.events.map((e) => ({ name: e.name, total: e.total, last7: e.perDay.slice(-7).reduce((s, x) => s + x, 0) })) }))
  sources.push({ id: "pixel", label: `Sự kiện pixel ${days} ngày`, status: pixelEvents.length ? "ok" : "error", rows: pixelEvents.length })

  // Purchase gửi qua trình duyệt và máy chủ (1 lượt/pixel).
  const dualSource: TagDoctorInput["dualSource"] = []
  const { start, end } = epochRange(mh.range)
  for (const p of pixelEvents) {
    try {
      const j = await metaGet<Row>(`${p.pixelId}/stats`, { aggregation: "event_source", event: "Purchase", start_time: String(start), end_time: String(end) })
      let browser = 0, server = 0
      for (const g of j.data ?? []) for (const e of g.data ?? []) { if (e.value === "BROWSER") browser += Number(e.count) || 0; if (e.value === "SERVER") server += Number(e.count) || 0 }
      dualSource.push({ pixelId: p.pixelId, event: "Purchase", browser, server })
    } catch { /* không có → bỏ qua, không đoán */ }
  }

  // GTM: dò mã trên chính trang đích của bảng link chuẩn công ty.
  let gtm: GtmContainer[] = []
  try {
    const pages = [...new Set(readStandardLinks().links.filter((l) => l.company === company).map((l) => { const u = new URL(l.url); return `${u.origin}${u.pathname}` }))]
    const ids = await detectGtmIds(pages)
    // C1: có khoá tài khoản dịch vụ → đọc qua API (có trigger); container nào API không đọc được thì lùi về gtm.js.
    const apiNotes: string[] = []
    gtm = await Promise.all(ids.map(async (id) => {
      if (gtmApiConfigured()) {
        try { return liveToContainer(await readLive(id)) } catch (e) { apiNotes.push(`${id}: ${e instanceof Error ? e.message : String(e)} — dùng gtm.js công khai`) }
      }
      return { ...(await fetchGtm(id)), source: "public" as const }
    }))
    const viaApi = gtm.filter((g) => g.source === "api").length
    sources.push({
      id: "gtm", label: viaApi ? "Cấu hình GTM (Tag Manager API)" : "Cấu hình GTM công khai", status: gtm.length ? (apiNotes.length ? "partial" : "ok") : "partial", rows: gtm.length,
      note: gtm.length ? [gtm.map((g) => `${g.id} bản ${g.version ?? "?"}${g.source === "api" ? " (API)" : " (gtm.js)"}`).join(", "), ...apiNotes].join(" · ") : "Không thấy mã GTM trên trang đích",
    })
  } catch (e) {
    sources.push({ id: "gtm", label: "Cấu hình GTM công khai", status: "error", rows: 0, note: e instanceof Error ? e.message : String(e) })
  }
  const gtmLabels = new Set(gtm.flatMap((g) => g.googleAdsLabels.map((l) => l.sendTo)))

  // Google: hành động + nhãn + số theo ngày; mục tiêu cấp tài khoản.
  let googleActions: GoogleActionFact[] = [], googleGoals: GoogleGoalFact[] = []
  try {
    const c = getGoogleAdsCustomer(company)
    // Cùng khoảng (giờ VN) với phần Meta — trước 28/09 tính riêng theo UTC, lệch 1 ngày từ 0h–7h.
    const { from, to } = mh.range
    const acts = (await c.query(`SELECT conversion_action.id, conversion_action.resource_name, conversion_action.name, conversion_action.category,
        conversion_action.origin, conversion_action.type, conversion_action.primary_for_goal, conversion_action.tag_snippets
      FROM conversion_action WHERE conversion_action.status = 'ENABLED'`)) as Row[]
    const daily = (await c.query(`SELECT segments.date, segments.conversion_action, metrics.all_conversions FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}'`)) as Row[]
    const last7From = addDays(to, -6)
    const tot = new Map<string, { total: number; last7: number }>()
    for (const r of daily) {
      const k = String(r.segments.conversion_action), n = Number(r.metrics.all_conversions) || 0
      const cur = tot.get(k) ?? { total: 0, last7: 0 }
      cur.total += n; if (String(r.segments.date) >= last7From) cur.last7 += n
      tot.set(k, cur)
    }
    googleActions = acts.map((r) => {
      const a = r.conversion_action
      const sendTo = [...new Set((JSON.stringify(a.tag_snippets ?? []).match(/AW-\d+\/[A-Za-z0-9_-]+/g) ?? []))]
      const t = tot.get(String(a.resource_name)) ?? { total: 0, last7: 0 }
      return {
        id: String(a.id), resourceName: String(a.resource_name), name: String(a.name), category: en(enums.ConversionActionCategory, a.category),
        origin: en(enums.ConversionOrigin, a.origin), type: en(enums.ConversionActionType, a.type), primary: !!a.primary_for_goal, sendTo,
        inGtm: !sendTo.length || !gtm.length ? null : sendTo.some((s) => gtmLabels.has(s)),
        total: Math.round(t.total * 10) / 10, last7: Math.round(t.last7 * 10) / 10,
      }
    })
    googleGoals = ((await c.query(`SELECT customer_conversion_goal.resource_name, customer_conversion_goal.category, customer_conversion_goal.origin, customer_conversion_goal.biddable FROM customer_conversion_goal`)) as Row[])
      .map((r) => ({ resourceName: String(r.customer_conversion_goal.resource_name), category: en(enums.ConversionActionCategory, r.customer_conversion_goal.category), origin: en(enums.ConversionOrigin, r.customer_conversion_goal.origin), biddable: !!r.customer_conversion_goal.biddable }))
    sources.push({ id: "google", label: "Hành động + mục tiêu Google Ads", status: "ok", rows: googleActions.length })
  } catch (e) {
    sources.push({ id: "google", label: "Hành động + mục tiêu Google Ads", status: "error", rows: 0, note: e instanceof Error ? e.message : String(e) })
  }

  // Odoo: đơn marketing MBI đã thu tiền cùng kỳ (bộ lọc phòng MKT). MBC chưa có bộ lọc → null.
  let odooOrders: number | null = null
  if (company === "MBI") {
    try {
      const rows = (await readGroup("sale.order", mktOrderDomain(mh.range.from, mh.range.to) as unknown[][], ["amount_untaxed:sum"], ["state"])) as Row[]
      odooOrders = rows.reduce((s, r) => s + Number(r.__count ?? 0), 0)
      sources.push({ id: "odoo", label: "Đơn marketing Odoo (đã thu tiền)", status: "ok", rows: odooOrders })
    } catch (e) {
      sources.push({ id: "odoo", label: "Đơn marketing Odoo (đã thu tiền)", status: "error", rows: 0, note: e instanceof Error ? e.message : String(e) })
    }
  } else sources.push({ id: "odoo", label: "Đơn Odoo", status: "partial", rows: 0, note: "Chưa có bộ lọc đơn marketing cho MBC — không so số" })

  const input: TagDoctorInput = { company, pixelEvents, gtm, googleActions, googleGoals, dualSource, odooOrders, days }
  const built = buildTagDoctor(input)
  if (!current) {
    // Xem khoảng cũ: số liệu để xem, KHÔNG đề xuất sửa — cấu hình GTM/Google là của hôm nay.
    built.fixes = []; built.gtmFixes = []
    built.issues = built.issues.map((x) => ({ ...x, fixIds: [], gtmFixIds: [] }))
    sources.push({ id: "range", label: "Khoảng đang xem", status: "partial", rows: 0, note: `Khoảng kết thúc ${mh.range.to} (trước hôm nay) — chỉ xem; chọn khoảng tới hôm nay để tool đề xuất sửa.` })
  }
  const value: TagDoctorReport = { ...input, ...built, current, roadmap: current ? purchaseRoadmap(input, built) : [], range: mh.range, collectedAt: new Date().toISOString(), sources }
  memo.set(memoKey, { at: Date.now(), value })
  return value
}

// ============================================================
// C1 — chẩn đoán theo TRIGGER (chỉ có khi đọc GTM qua API) — hàm thuần
// ============================================================
/** Sự kiện dataLayer kiểu GA4 ↔ hành động kinh doanh. */
export const DL_EVENT_ACTION: Record<string, ActionKey> = {
  purchase: "purchase", add_to_cart: "add_to_cart", begin_checkout: "initiate_checkout", add_payment_info: "add_payment_info", generate_lead: "lead",
}
const ACTION_DL_EVENT = Object.fromEntries(Object.entries(DL_EVENT_ACTION).map(([e, a]) => [a, e])) as Record<ActionKey, string>
const actionOfMeta = (name: string | null) => BUSINESS_ACTIONS.find((a) => name && a.meta === name)?.key ?? null
const actionOfGoogle = (category: string) => BUSINESS_ACTIONS.find((a) => a.google === category)?.key ?? null

export function gtmTriggerIssues(i: TagDoctorInput, issues: TagIssue[], gtmFixes: GtmFixProposal[]): void {
  const meta7 = (name: string) => {
    const hits = i.pixelEvents.flatMap((p) => p.events.filter((e) => e.name === name))
    return hits.some((e) => e.last7 !== undefined) ? hits.reduce((s, e) => s + (e.last7 ?? 0), 0) : null
  }
  const googleOf = (sendTo: string | null) => (sendTo ? i.googleActions.find((a) => a.sendTo.includes(sendTo)) ?? null : null)
  const biddable = (category: string) => i.googleGoals.some((g) => g.category === category && g.origin === "WEBSITE" && g.biddable)
  for (const g of i.gtm) {
    if (g.source !== "api" || !g.tagsDetail) continue
    const triggers = g.triggers ?? []
    const usedTriggerIds = new Set(g.tagsDetail.flatMap((t) => t.triggers.map((x) => x.id)))
    const live = g.tagsDetail.filter((t) => !t.paused && t.triggers.length)
    // Tín hiệu 7 ngày của một thẻ: Meta = số sự kiện chuẩn cùng tên; Google = hành động có nhãn khớp.
    const signal = (t: (typeof live)[number]): { label: string; last7: number } | null => {
      if (t.type === "meta" && t.eventName) { const n = meta7(t.eventName); return n === null ? null : { label: `Meta ${t.eventName}`, last7: n } }
      const a = googleOf(t.sendTo)
      return a ? { label: `Google “${a.name}”`, last7: a.last7 } : null
    }
    /**
     * Ước lượng tín hiệu SAU khi thẻ Google `t` chuyển sang trigger `toId`: số lớn nhất của các thẻ KHÁC đang dùng trigger đó.
     * Đo 28/09: thẻ 254 (Google "Add to cart" — đang là mục tiêu đặt giá) bắn nhầm begin_checkout ~33 lượt/7 ngày;
     * trigger add_to_cart đích chỉ ~10 lượt/7 ngày (thẻ Meta 137) → sửa cho đúng tên mà Google mất ~2/3 tín hiệu.
     */
    const signalLoss = (t: (typeof live)[number], toId: string): string | undefined => {
      if (t.type !== "google") return undefined
      const a = googleOf(t.sendTo)
      if (!a || !(a.primary || biddable(a.category))) return undefined
      const peers = live.filter((o) => o.tagId !== t.tagId && o.triggers.some((x) => x.id === toId)).map((o) => ({ o, s: signal(o) })).filter((x) => x.s)
      const after = peers.length ? Math.max(...peers.map((x) => x.s!.last7)) : null
      if (after !== null && after >= a.last7 * 0.5) return undefined
      const role = biddable(a.category) ? "đang là MỤC TIÊU ĐẶT GIÁ của Google" : "đang là hành động CHÍNH của Google"
      return after === null
        ? `“${a.name}” ${role} (${fmt(a.last7)} lượt/7 ngày). Không đo được trigger đích bắn bao nhiêu → có thể mất gần hết tín hiệu; chiến dịch tối ưu chuyển đổi sẽ học lại.`
        : `“${a.name}” ${role} (${fmt(a.last7)} lượt/7 ngày). Trigger đích chỉ ~${fmt(after)} lượt/7 ngày (thẻ ${peers.map((x) => x.o.tagId).join(", ")}) → Google mất ~${Math.round((1 - after / Math.max(a.last7, 1)) * 100)}% tín hiệu đặt giá; chiến dịch tối ưu chuyển đổi sẽ thiếu dữ liệu. Nên sửa đo lường Mua hàng và chuyển đặt giá sang Mua hàng TRƯỚC khi đổi.`
    }

    // (A) Sự kiện dataLayer mà MỌI thẻ chờ nó đều im — trang không đẩy sự kiện đó.
    const byEvent = new Map<string, typeof live>()
    for (const t of live) {
      if (!t.triggers.every((x) => x.customEvent)) continue
      for (const e of new Set(t.triggers.map((x) => x.customEvent!))) byEvent.set(e, [...(byEvent.get(e) ?? []), t])
    }
    for (const [ev, tags] of byEvent) {
      const action = DL_EVENT_ACTION[ev]
      if (!action) continue
      const measured = tags.map((t) => ({ t, s: signal(t) })).filter((x): x is { t: (typeof tags)[number]; s: { label: string; last7: number } } => !!x.s)
      if (!measured.length || measured.some((x) => x.s.last7 > 0)) continue
      // Bằng chứng hành động VẪN xảy ra: bản tên khác của cùng sự kiện có lượt, hoặc đơn Odoo.
      const a = BUSINESS_ACTIONS.find((x) => x.key === action)!
      const others = i.pixelEvents.flatMap((p) => p.events).filter((e) => normEvent(e.name) === normEvent(a.meta) && e.name !== a.meta && (e.last7 ?? 0) > 0)
      const evidence = [
        ...others.map((e) => `“${e.name}” (không từ thẻ này) vẫn ${fmt(e.last7 ?? 0)} lượt/7 ngày`),
        ...(action === "purchase" && i.odooOrders ? [`Odoo có ${fmt(i.odooOrders)} đơn marketing trong 28 ngày`] : []),
      ]
      if (!evidence.length) continue
      // Thẻ KHÁC cùng hành động đang có số nhờ trigger theo trang → trigger đó đã được chứng minh bắn.
      const sibling = live.filter((o) => !measured.some((m) => m.t.tagId === o.tagId) && o.triggers.length && o.triggers.every((x) => !x.customEvent))
        .map((o) => ({ o, s: signal(o) })).find((x) => x.s && x.s.last7 > 0 && (x.o.type === "meta" ? actionOfMeta(x.o.eventName) : (() => { const ga = googleOf(x.o.sendTo); return ga ? actionOfGoogle(ga.category) : null })()) === action)
      const pageTriggers = sibling ? [] : triggers.filter((x) => !x.customEvent && !usedTriggerIds.has(x.id) && normEvent(x.name).includes(normEvent(ev)))
      // Mua hàng: nối trigger theo trang thì MẤT giá trị đơn → không đề xuất (user chốt 28/09: chờ đội web).
      const fixIds: string[] = []
      if (sibling && action !== "purchase") {
        const to = sibling.o.triggers[0]
        for (const m of measured) {
          const id = `gtm_retrigger_${g.id}_${m.t.tagId}`
          if (gtmFixes.some((f) => f.id === id)) continue
          const warn = signalLoss(m.t, to.id)
          gtmFixes.push({ id, kind: "tag_retrigger", container: g.id, tagId: m.t.tagId, tagName: m.t.name, fromTriggerIds: m.t.triggers.map((x) => x.id), toTriggerId: to.id, toTriggerName: to.name, ...(warn ? { signalWarning: warn } : {}),
            label: `${g.id} · ${m.t.name}: đổi trigger ${m.t.triggers.map((x) => `“${x.name}”`).join(", ")} → “${to.name}” (${to.condition}) — trigger thẻ ${sibling.o.tagId} đang dùng, ${fmt(sibling.s!.last7)} lượt/7 ngày` })
          fixIds.push(id)
        }
      }
      issues.push({
        id: `gtm_dl_silent_${g.id}_${ev}`, severity: "bad", platform: "gtm",
        title: `${g.id}: sự kiện dataLayer “${ev}” gần như không được đẩy — ${measured.length} thẻ chờ nó đều 0 lượt/7 ngày`,
        detail: [
          `Thẻ chờ “${ev}”: ${measured.map((x) => `${x.t.tagId} ${x.t.name} (${x.s.label}: 0/7 ngày)`).join("; ")}.`,
          `Trong khi đó ${evidence.join("; ")} → hành động vẫn xảy ra, chỉ là trang không gửi sự kiện “${ev}” vào dataLayer.`,
          ...(sibling ? [`Thẻ ${sibling.o.tagId} “${sibling.o.name}” cùng hành động bắn theo ${sibling.o.triggers.map((x) => `trigger ${x.id} (${x.condition})`).join(", ")} và có ${fmt(sibling.s!.last7)} lượt/7 ngày.${action === "purchase" ? " Không tự nối cho Mua hàng: trigger theo trang không mang giá trị đơn." : ""}`] : []),
          ...(pageTriggers.length ? [`Có trigger theo trang chưa thẻ nào dùng: ${pageTriggers.map((x) => `${x.id} ${x.name} (${x.condition})`).join("; ")} — nối vào thì thẻ bắn được nhưng giá trị đơn/mã đơn TRỐNG (các số đó nằm trong dataLayer).`] : []),
        ].join(" "),
        steps: [
          `Đội web: ở trang hoàn tất đơn, đẩy dataLayer.push({ event: "${ev}", ecommerce: { transaction_id: <mã đơn>, value: <giá trị chưa VAT>, currency: "VND", items: [...] } }) — đúng tên “${ev}”, đẩy SAU khi đơn thành công`,
          "Gửi kèm event_id (dùng làm mã khử trùng với API máy chủ) — cùng giá trị cho pixel trình duyệt và máy chủ",
          "Kiểm bằng GTM Preview một đơn thử: thẻ phải chuyển sang “Fired” — tool tự thấy số về trong 1–2 ngày",
          ...(fixIds.length ? ["Hoặc tạm thời: để tool nối thẻ vào trigger đang có số (bên dưới) — bắn ngay, không cần đội web"] : []),
        ],
        fixIds: [], gtmFixIds: fixIds,
      })
    }

    // (B) Thẻ bắn theo sự kiện của HÀNH ĐỘNG KHÁC (vd thẻ Thêm giỏ bắn lúc bắt đầu thanh toán).
    for (const t of live) {
      const expectedAction = t.type === "meta" ? actionOfMeta(t.eventName) : (() => { const a = googleOf(t.sendTo); return a ? actionOfGoogle(a.category) : null })()
      if (!expectedAction) continue
      const want = ACTION_DL_EVENT[expectedAction]
      const evs = t.triggers.map((x) => x.customEvent)
      if (!want || evs.some((e) => !e) || evs.includes(want)) continue
      const wrong = evs.filter((e): e is string => !!e && !!DL_EVENT_ACTION[e])
      if (!wrong.length) continue
      // Tên thẻ nói đúng sự kiện nó bắt → cố ý (đo 28/09: Google không có loại "Thêm thông tin thanh toán",
      // hành động add_payment_info bị xếp vào Bắt đầu thanh toán; thẻ 248 bắn theo add_payment_info là ĐÚNG).
      if (wrong.some((e) => normEvent(t.name).includes(normEvent(e)))) continue
      const target = triggers.filter((x) => x.customEvent === want).sort((x, y) => Number(usedTriggerIds.has(y.id)) - Number(usedTriggerIds.has(x.id)))[0]
      const expectedLabel = BUSINESS_ACTIONS.find((a) => a.key === expectedAction)!.label
      const id = `gtm_retrigger_${g.id}_${t.tagId}`
      const warn = target ? signalLoss(t, target.id) : undefined
      if (target) gtmFixes.push({
        id, kind: "tag_retrigger", container: g.id, tagId: t.tagId, tagName: t.name, fromTriggerIds: t.triggers.map((x) => x.id), toTriggerId: target.id, toTriggerName: target.name, ...(warn ? { signalWarning: warn } : {}),
        label: `${g.id} · ${t.name}: đổi trigger ${t.triggers.map((x) => `“${x.name}”`).join(", ")} → “${target.name}” (${target.condition})`,
      })
      issues.push({
        id: `gtm_mismatch_${g.id}_${t.tagId}`, severity: "bad", platform: "gtm",
        title: `${g.id} thẻ ${t.tagId} “${t.name}” đo ${expectedLabel} nhưng bắn theo sự kiện “${wrong.join(", ")}”`,
        detail: `${t.type === "google" ? `Hành động Google của thẻ thuộc nhóm ${expectedLabel}` : `Thẻ gửi ${t.eventName}`}, trigger lại là ${t.triggers.map((x) => `${x.id} ${x.name} (${x.condition})`).join("; ")} → số ${expectedLabel} thực chất là số của hành động khác.${warn ? ` ⚠ ${warn}` : ""}`,
        steps: target
          ? [`GTM ${g.id} → Thẻ ${t.tagId} → Kích hoạt: bỏ ${t.triggers.map((x) => x.name).join(", ")} → chọn “${target.name}” → Lưu → Submit/Publish`]
          : [`GTM ${g.id} → tạo trigger Sự kiện tuỳ chỉnh “${want}” → gắn vào thẻ ${t.tagId} thay trigger hiện tại`],
        fixIds: [], gtmFixIds: target ? [id] : [],
      })
    }
  }
}

// ============================================================
// Đợt 9 · 2 — LỘ TRÌNH sửa đo lường Mua hàng (hàm thuần)
// ============================================================
// Thứ tự user chốt 28/09 (sau khi thấy sửa thẻ 254 trước làm Google mất ~70% tín hiệu đặt giá):
//   1. trang đẩy "purchase" vào dataLayer → 2. Google ghi nhận Mua hàng → 3. đặt giá theo Mua hàng
//   → 4. mới sửa các thẻ đo nhầm nhóm. Tool tự chấm từng bước bằng số thật; job giám sát báo khi bước đổi.
export interface RoadmapStep {
  id: "dl_purchase" | "google_purchase_signal" | "bid_purchase" | "fix_mislabeled"
  label: string
  status: "done" | "todo" | "waiting"
  evidence: string
  action: string
  href: string
}
export function purchaseRoadmap(i: TagDoctorInput, built: Pick<TagDoctorReport, "issues" | "fixes" | "gtmFixes">): RoadmapStep[] {
  const purchaseGoal = i.googleGoals.find((g) => g.category === "PURCHASE" && g.origin === "WEBSITE")
  const dlIssue = built.issues.find((x) => x.id.startsWith("gtm_dl_silent_") && x.id.endsWith("_purchase"))
  const primary = i.googleActions.filter((a) => a.category === "PURCHASE" && a.origin === "WEBSITE" && a.primary)
  const relevant = !!dlIssue || (!!purchaseGoal && !purchaseGoal.biddable) || primary.some((a) => a.last7 === 0)
  if (!relevant) return []
  const events = i.pixelEvents.flatMap((p) => p.events)
  const std = events.filter((e) => e.name === "Purchase").reduce((s, e) => s + (e.last7 ?? 0), 0)
  const variant = events.filter((e) => e.name !== "Purchase" && normEvent(e.name) === "purchase").reduce((s, e) => s + (e.last7 ?? 0), 0)
  const gSig = primary.reduce((s, a) => s + a.last7, 0)
  const dlDone = !dlIssue && std >= Math.max(5, variant * 0.3)
  const sigDone = gSig >= 3
  const bidDone = !!purchaseGoal?.biddable
  const mislabeled = built.issues.filter((x) => x.id.startsWith("gtm_mismatch_"))
  // Không đọc được GTM qua API thì KHÔNG biết có thẻ đo nhầm hay không → không được coi là xong.
  const gtmReadable = i.gtm.some((g) => g.source === "api")
  const fixDone = gtmReadable && mislabeled.length === 0
  const steps: Omit<RoadmapStep, "status">[] = [
    { id: "dl_purchase", label: "Trang đẩy sự kiện Mua hàng (purchase) vào dataLayer",
      evidence: `Purchase chuẩn từ GTM ${fmt(std)} lượt/7 ngày${variant ? ` (bản tự đặt ${fmt(variant)})` : ""}${dlIssue ? " · thẻ chờ purchase đang im" : ""}`,
      action: "Gửi dặn việc cho đội web (nút “Sao chép dặn việc cho đội web” ở lỗi dataLayer bên dưới)", href: "/do-luong?tab=tags" },
    { id: "google_purchase_signal", label: "Google ghi nhận Mua hàng",
      evidence: primary.length ? primary.map((a) => `“${a.name}” ${fmt(a.last7)} lượt/7 ngày`).join(" · ") : "Chưa có hành động Mua hàng CHÍNH",
      action: "Chờ 1–2 ngày sau khi đội web sửa; nếu vẫn 0 → kiểm thẻ Google Purchase trong GTM Preview", href: "/do-luong?tab=google" },
    { id: "bid_purchase", label: "Chuyển Google sang đặt giá theo Mua hàng",
      evidence: purchaseGoal ? (purchaseGoal.biddable ? "Mua hàng đang là mục tiêu đặt giá" : `Đang đặt giá theo ${i.googleGoals.filter((g) => g.biddable && g.origin === "WEBSITE").map((g) => g.category).join(", ") || "không mục tiêu nào"}`) : "Không thấy mục tiêu Mua hàng",
      action: "Mục “Sửa trên Google”: chọn “Đặt Mua hàng làm mục tiêu đặt giá” (+ tắt Thêm giỏ / Bắt đầu thanh toán) → Kiểm trước → XAC NHAN", href: "/do-luong?tab=tags" },
    { id: "fix_mislabeled", label: "Sửa các thẻ đo nhầm nhóm",
      evidence: !gtmReadable ? "Chưa đọc được GTM qua API (Cài đặt → Kết nối → Google Tag Manager)" : fixDone ? "Không còn thẻ đo nhầm nhóm" : mislabeled.map((x) => x.title).join(" · "),
      action: "Mục “Sửa trên GTM”: chọn việc đổi trigger → Kiểm trước → Publish", href: "/do-luong?tab=tags" },
  ]
  const done = [dlDone, sigDone, bidDone, fixDone]
  let reachedTodo = false
  return steps.map((st, k) => {
    // Bước 4 cố ý CHỜ bước 3: sửa thẻ nhầm nhóm khi còn đặt giá theo nó là mất tín hiệu (ca 254).
    const blocked = k === 3 && !bidDone && built.gtmFixes.some((f) => f.kind === "tag_retrigger" && !!f.signalWarning)
    const status: RoadmapStep["status"] = done[k] ? "done" : !reachedTodo && !blocked ? "todo" : "waiting"
    if (status === "todo") reachedTodo = true
    return { ...st, status }
  })
}
