// ============================================================
// Bước 4 (Facebook) — nguyên nhân từ bằng chứng đã đo
// ============================================================
// Cùng luật với Google: xếp theo tiền, nêu rõ phần thiếu, luôn liệt kê giả
// thuyết đã loại. Các ngưỡng dưới đây là quy ước của tool (không phải số Meta
// công bố) trừ mốc 50 sự kiện/tuần — mức Meta nói một nhóm quảng cáo cần để ra
// khỏi giai đoạn học.

import { FUNNEL_EVENTS } from "./meta-evidence"
import { isReels } from "./meta-placements"
import { isLeadOptimized, metaGoalKind } from "./goal-kind"
import type { Cause, CheckedOk, Diagnosis, MetaEvidence, MetaPlacementSlice } from "./types"

/** Meta: nhóm quảng cáo cần ~50 sự kiện tối ưu mỗi tuần để ra khỏi giai đoạn học. */
export const EVENTS_PER_WEEK_TO_LEARN = 50
/** Tần suất trong kỳ từ mức này trở lên = cùng người xem quá nhiều lần. */
export const HIGH_FREQUENCY = 4
/** Vị trí chiếm ít nhất tỉ trọng chi phí này mới xét. */
export const PLACEMENT_MIN_SHARE = 0.1
/** Chi phí/kết quả ở vị trí gấp ngần này phần còn lại = vị trí đắt. */
export const PLACEMENT_COST_RATIO = 2
/** Cần ít nhất ngần này kết quả để so vị trí theo một chỉ số. */
// 10 từng quá thấp: đo 27/09 chiến dịch MBI có 27 lượt xem trang đích cho 18 vị
// trí → tool đòi loại Bảng tin dựa trên vài lượt lẻ.
export const MIN_RESULTS_TO_COMPARE = 30
/** Click liên kết tới trang đích dưới tỉ lệ này (khi đủ click) = đứt giữa click và trang. */
// Ngưỡng click→trang đích ở tệp THUẦN (giao diện cũng dùng; nhập từ tệp này kéo meta-client + fs vào gói trình duyệt).
export { MIN_LANDING_RATE, MIN_CLICKS_FOR_LANDING_RATE } from "./meta-thresholds"

/** Đợt 12: "lượt mua" chỉ-xem ≥ 60% và ≥ 10 lượt → nguyên nhân (đo 29/09 tài khoản ~90%). */
export const VIEW_HEAVY_SHARE = 0.6
export const VIEW_HEAVY_MIN_PURCHASES = 10
import { MIN_LANDING_RATE, MIN_CLICKS_FOR_LANDING_RATE } from "./meta-thresholds"
/** Meta báo ≥ ngần này lượt mua mới đối chiếu Odoo; Odoo < tỉ lệ này × Meta = lệch lớn. */
export const ODOO_MIN_META_PURCHASES = 5
export const ODOO_GAP_RATIO = 0.3

const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`
const pct = (x: number) => `${Math.round(x * 100)}%`
const dec = (x: number, d: number) => x.toLocaleString("vi-VN", { maximumFractionDigits: d })

export interface PlacementRow { key: string; label: string; cost: number; results: number; adsetIds: string[] }
export interface PlacementVerdict extends PlacementRow { share: number; costPerResult: number | null; restCostPerResult: number | null; excess: number; flagged: boolean }

/** Chỉ số so vị trí: sâu nhất mà đủ số. Trả null khi không chỉ số nào đủ để so. */
export function placementMetric(ev: MetaEvidence): { key: "purchases" | "leads" | "optResults" | "landingViews"; label: string } | null {
  const sum = (f: (p: MetaPlacementSlice) => number) => ev.placements.reduce((s, p) => s + f(p), 0)
  // Đợt 23 (3d): chiến dịch thu lead so vị trí theo lead (không theo lượt mua — luôn ~0).
  if (metaGoalKind(ev.campaign.objective) === "leads") {
    if (sum((p) => p.leads ?? 0) >= MIN_RESULTS_TO_COMPARE) return { key: "leads", label: "lead" }
  } else if (sum((p) => p.purchases) >= MIN_RESULTS_TO_COMPARE) return { key: "purchases", label: "lượt mua" }
  if (sum((p) => p.optResults) >= MIN_RESULTS_TO_COMPARE) return { key: "optResults", label: "kết quả theo sự kiện tối ưu" }
  if (sum((p) => p.landingViews) >= MIN_RESULTS_TO_COMPARE) return { key: "landingViews", label: "lượt xem trang đích" }
  return null
}

export function judgePlacements(ev: MetaEvidence): { metric: ReturnType<typeof placementMetric>; rows: PlacementVerdict[] } {
  const metric = placementMetric(ev)
  const by = new Map<string, PlacementRow>()
  for (const p of ev.placements) {
    const r = by.get(p.key) ?? { key: p.key, label: p.label, cost: 0, results: 0, adsetIds: [] }
    r.cost += p.cost
    r.results += metric ? p[metric.key] ?? 0 : 0
    if (!r.adsetIds.includes(p.adsetId)) r.adsetIds.push(p.adsetId)
    by.set(p.key, r)
  }
  const totalCost = [...by.values()].reduce((s, r) => s + r.cost, 0)
  const totalRes = [...by.values()].reduce((s, r) => s + r.results, 0)
  const rows = [...by.values()].map((r) => {
    const share = totalCost > 0 ? r.cost / totalCost : 0
    const restRes = totalRes - r.results
    const restCpr = restRes > 0 ? (totalCost - r.cost) / restRes : null
    const cpr = r.results > 0 ? r.cost / r.results : null
    const expected = restCpr ? r.results * restCpr : r.cost
    const excess = Math.max(0, r.cost - expected)
    const flagged = !!metric && !!restCpr && share >= PLACEMENT_MIN_SHARE
      && (cpr === null ? r.cost >= PLACEMENT_COST_RATIO * restCpr : cpr >= PLACEMENT_COST_RATIO * restCpr)
    return { ...r, share, costPerResult: cpr, restCostPerResult: restCpr, excess, flagged }
  }).sort((a, b) => b.cost - a.cost)
  return { metric, rows }
}

/** Sự kiện sâu nhất có đủ 50/tuần trên CẢ nhóm sản phẩm (mọi chiến dịch cùng sản phẩm gộp lại). */
export function bestLearnableEvent(ev: MetaEvidence): { key: string; label: string; perWeek: number } | null {
  // Thu lead: sự kiện cuối là "lead" — bỏ các sự kiện mua hàng nằm trước nó trong phễu.
  const from = metaGoalKind(ev.campaign.objective) === "leads" ? FUNNEL_EVENTS.findIndex((e) => e.key === "lead") : 0
  for (const e of FUNNEL_EVENTS.slice(from)) {
    if (e.key === "custom") continue // gộp mọi tên tự đặt — không chọn được một sự kiện cụ thể từ số này
    const perWeek = ev.peers.eventsPerWeek[e.key] ?? 0
    if (perWeek >= EVENTS_PER_WEEK_TO_LEARN) return { key: e.key, label: e.label, perWeek }
  }
  return null
}

export function diagnoseMeta(ev: MetaEvidence): Diagnosis {
  const causes: Cause[] = []
  const notCauses: CheckedOk[] = []
  const context: string[] = []
  const c = ev.campaign
  const spent = ev.adsets.filter((a) => a.cost > 0)
  const share = (m: number) => (c.cost > 0 ? m / c.cost : null)
  const weeks = Math.max(ev.peers.weeks, 1 / 7)
  // Đợt 23 (3d): chiến dịch thu lead — "kết quả cuối" là lead, không phải Mua hàng. Các kiểm chỉ đúng với đơn mua (giá trị đơn,
  // lượt mua chỉ-xem, lệch Odoo) bỏ qua; nhóm tối ưu theo sự kiện khác lead thì báo theo lead.
  const leads = metaGoalKind(c.objective) === "leads"
  if (leads) context.push("Chiến dịch thu lead — chấm theo số lead Meta ghi (form trên Meta + pixel). Không đối chiếu đơn Odoo.")

  // 1. Tối ưu theo sự kiện không phải Mua hàng (thu lead: không phải lead).
  const notLead = leads ? spent.filter((a) => !isLeadOptimized(a)) : []
  if (leads) {
    if (notLead.length) {
      const money = notLead.reduce((s, a) => s + a.cost, 0)
      causes.push({
        id: "opt-event-not-lead", title: `Nhóm quảng cáo tối ưu theo ${[...new Set(notLead.map((a) => a.optEvent.label))].join(", ")}, không phải Khách hàng tiềm năng`,
        detail: "Meta tìm người dễ làm sự kiện này nhất, không phải người dễ để lại thông tin nhất. Meta KHÔNG cho đổi sự kiện của nhóm đã chạy — muốn đổi phải tạo nhóm mới",
        money, share: share(money), shareOf: "campaign_cost",
        evidence: notLead.map((a) => ({ label: `${a.name} — ${a.optEvent.label}`, value: `${a.optResults}${a.optResultsApprox ? " (xấp xỉ)" : ""} kết quả`, cost: a.cost })),
      })
    } else if (spent.length) notCauses.push({ id: "opt-event-not-lead", text: "Mọi nhóm quảng cáo có chi tiêu đều tối ưu theo Khách hàng tiềm năng" })
  }
  const notPurchase = leads ? [] : spent.filter((a) => !a.optEvent.isPurchase)
  if (leads) { /* đã xét ở trên */ } else if (notPurchase.length) {
    const money = notPurchase.reduce((s, a) => s + a.cost, 0)
    const events = [...new Set(notPurchase.map((a) => a.optEvent.label))]
    causes.push({
      id: "opt-event-not-purchase", title: `Nhóm quảng cáo tối ưu theo ${events.join(", ")}, không phải Mua hàng`,
      detail: notPurchase.some((a) => a.optEvent.type === "OTHER")
        ? "Sự kiện tự đặt tên: Meta chỉ đếm các lượt đến từ chính quảng cáo — pixel có thể bắn nhiều trên cả site mà nhóm vẫn chỉ được tính vài lượt (xem Sức khoẻ đo lường). Meta KHÔNG cho đổi sự kiện của nhóm đã chạy — muốn đổi phải tạo nhóm mới"
        : "Meta tìm người dễ làm sự kiện này nhất, không phải người dễ mua nhất. Meta KHÔNG cho đổi sự kiện của nhóm đã chạy — muốn đổi phải tạo nhóm mới",
      money, share: share(money), shareOf: "campaign_cost",
      evidence: notPurchase.map((a) => ({ label: `${a.name} — ${a.optEvent.label}`, value: `${a.optResults}${a.optResultsApprox ? " (xấp xỉ)" : ""} kết quả`, cost: a.cost })),
    })
  } else if (spent.length) notCauses.push({ id: "opt-event-not-purchase", text: "Mọi nhóm quảng cáo có chi tiêu đều tối ưu theo Mua hàng" })

  // 2. Meta không học được.
  const fail = spent.filter((a) => a.learning.status === "FAIL")
  if (fail.length) {
    const money = fail.reduce((s, a) => s + a.cost, 0)
    causes.push({
      id: "learning-fail", title: `${fail.length}/${spent.length} nhóm quảng cáo có trạng thái học THẤT BẠI`,
      detail: `Meta đếm được quá ít sự kiện tối ưu để học (cần khoảng ${EVENTS_PER_WEEK_TO_LEARN}/tuần/nhóm), nên đang phân phối gần như mò`,
      money, share: share(money), shareOf: "campaign_cost",
      evidence: fail.map((a) => ({ label: a.name, value: `${a.learning.conversions ?? "?"} sự kiện Meta đếm cho việc học`, cost: a.cost })),
    })
  } else if (spent.some((a) => a.learning.status)) notCauses.push({ id: "learning-fail", text: "Không nhóm nào ở trạng thái học thất bại" })

  // 3. Quá mỏng: nhiều chiến dịch cùng sản phẩm chia nhau ít sự kiện.
  const bestEvent = ev.peers.eventsPerWeek[leads ? "lead" : "purchase"] ?? 0
  const optPerWeek = spent.reduce((s, a) => s + a.optResults, 0) / weeks
  if (ev.peers.activeCampaigns >= 2 && optPerWeek < EVENTS_PER_WEEK_TO_LEARN) {
    causes.push({
      id: "budget-thin", title: `${ev.peers.activeCampaigns} chiến dịch cùng sản phẩm chia nhau số sự kiện ít ỏi`,
      detail: `Chiến dịch này được khoảng ${dec(optPerWeek, 1)} kết quả/tuần; cả nhóm sản phẩm ${dec(bestEvent, 1)} ${leads ? "lead" : "lượt mua"}/tuần. Gộp lại mới có cơ hội đủ ${EVENTS_PER_WEEK_TO_LEARN}/tuần cho một nhóm quảng cáo`,
      money: null, share: null, shareOf: null,
      evidence: FUNNEL_EVENTS.filter((e) => (ev.peers.eventsPerWeek[e.key] ?? 0) > 0).map((e) => ({ label: e.label, value: `${dec(ev.peers.eventsPerWeek[e.key], 1)}/tuần (cả nhóm sản phẩm)` })),
    })
  }

  // 3b. Click không tới trang đích (hoặc pixel không ghi lượt xem trang).
  if (c.linkClicks >= MIN_CLICKS_FOR_LANDING_RATE) {
    const rate = c.landingViews / c.linkClicks
    if (rate < MIN_LANDING_RATE) {
      causes.push({
        id: "click-no-landing", title: `${c.linkClicks.toLocaleString("vi-VN")} click liên kết nhưng chỉ ${c.landingViews.toLocaleString("vi-VN")} lượt xem trang đích (${pct(rate)})`,
        detail: "Hoặc pixel trên trang đích không ghi lượt xem trang, hoặc người bấm không chờ trang tải xong (thường gặp với click vô tình ở Reels). Chưa phân biệt được hai khả năng này từ số liệu Meta",
        money: null, share: null, shareOf: null,
        evidence: [{ label: "Click liên kết", value: c.linkClicks.toLocaleString("vi-VN") }, { label: "Xem trang đích", value: c.landingViews.toLocaleString("vi-VN") }],
      })
    } else notCauses.push({ id: "click-no-landing", text: `${pct(rate)} click liên kết tới được trang đích` })
  }

  // 4. Mua hàng không mang giá trị.
  if (leads) { /* thu lead — không có giá trị đơn */ } else if (c.purchases > 0 && c.purchaseValue <= 0) {
    causes.push({
      id: "purchase-value-missing", title: `Meta ghi ${c.purchases} lượt mua nhưng doanh thu ₫0`,
      detail: "Pixel bắn Mua hàng không kèm giá trị đơn — Meta không biết đơn nào đáng tiền, ROAS trên Meta luôn bằng 0",
      money: null, share: null, shareOf: null, evidence: [{ label: "Lượt mua", value: String(c.purchases) }, { label: "Doanh thu Meta ghi", value: vnd(0) }],
    })
  } else if (c.purchases > 0) notCauses.push({ id: "purchase-value-missing", text: `Lượt mua có kèm giá trị (${vnd(c.purchaseValue)})` })

  // 5. Vị trí hiển thị đắt.
  const pl = judgePlacements(ev)
  if (!ev.placements.length) context.push("Không có số liệu theo vị trí hiển thị — bỏ qua phần so vị trí.")
  else if (!pl.metric) context.push(`Chưa đủ ${MIN_RESULTS_TO_COMPARE} kết quả ở bất kỳ chỉ số nào (mua, sự kiện tối ưu, xem trang đích) để so các vị trí.`)
  else {
    const bad = pl.rows.filter((r) => r.flagged)
    context.push(`So vị trí theo ${pl.metric.label} (chỉ số sâu nhất có đủ ${MIN_RESULTS_TO_COMPARE} kết quả).`)
    if (bad.length) {
      const money = bad.reduce((s, r) => s + r.excess, 0)
      causes.push({
        id: "placement-waste", title: `${bad.map((r) => r.label).join(", ")} tốn tiền mà ít ${pl.metric.label}`,
        detail: `Chi phí mỗi ${pl.metric.label} ở ${bad.length > 1 ? "các vị trí này" : "vị trí này"} gấp từ ${PLACEMENT_COST_RATIO} lần phần còn lại. Tiền tính là phần chi vượt so với mức của các vị trí khác`,
        money, share: share(money), shareOf: "campaign_cost",
        evidence: bad.map((r) => ({
          label: r.label, cost: r.cost,
          value: `${r.results} ${pl.metric!.label} · ${pct(r.share)} chi phí${r.costPerResult ? ` · ${vnd(r.costPerResult)}/kết quả` : ""} (phần còn lại ${vnd(r.restCostPerResult ?? 0)})`,
        })),
      })
    } else notCauses.push({ id: "placement-waste", text: `Không vị trí nào (≥ ${pct(PLACEMENT_MIN_SHARE)} chi phí) đắt gấp ${PLACEMENT_COST_RATIO} lần phần còn lại` })
    const reels = pl.rows.filter((r) => isReels(r.key)).reduce((s, r) => s + r.cost, 0)
    if (reels > 0) context.push(`Reels chiếm ${pct(reels / Math.max(1, c.cost))} chi phí chiến dịch (${vnd(reels)}).`)
  }

  // 6. Tần suất cao.
  if (c.frequency !== null && c.frequency >= HIGH_FREQUENCY) {
    causes.push({
      id: "high-frequency", title: `Mỗi người thấy quảng cáo trung bình ${dec(c.frequency, 1)} lần trong kỳ`,
      detail: "Cùng một nhóm người bị lặp lại nhiều lần — thường là tệp quá hẹp hoặc ngân sách quá lớn so với tệp",
      money: null, share: null, shareOf: null, evidence: [{ label: "Tần suất", value: dec(c.frequency, 2) }, { label: "Số người tiếp cận", value: c.reach.toLocaleString("vi-VN") }],
    })
  } else if (c.frequency !== null) notCauses.push({ id: "high-frequency", text: `Tần suất ${dec(c.frequency, 1)} — dưới mức ${HIGH_FREQUENCY}` })

  // 6b. Đợt 12 — "Mua hàng" chủ yếu là CHỈ XEM (1 ngày, không bấm). Đo 29/09: MBC .XYZ 204 "đơn" = 2 bấm + 202 chỉ xem, GA4
  //     utm xyz chỉ 2 đơn; toàn tài khoản ~90% là chỉ xem. Meta học theo tín hiệu này → tiêu tiền cho người đằng nào cũng mua.
  if (leads) { /* lượt mua chỉ-xem chỉ có nghĩa với chiến dịch bán hàng */ } else if (c.purchasesView != null && c.purchasesClick != null && c.purchases >= VIEW_HEAVY_MIN_PURCHASES && c.purchasesView / Math.max(c.purchases, 1) >= VIEW_HEAVY_SHARE) {
    const clickCpa = c.purchasesClick > 0 ? c.cost / c.purchasesClick : null
    causes.push({
      id: "view-through-heavy", title: `${Math.round((c.purchasesView / c.purchases) * 100)}% "lượt mua" Meta báo là người CHỈ XEM quảng cáo (không bấm) rồi mua trong 1 ngày`,
      detail: `Tính riêng lượt mua từ lượt bấm: ${dec(c.purchasesClick, 0)} lượt · CPA ${clickCpa ? vnd(clickCpa) : "không có đơn"} (so với ${vnd(c.purchases > 0 ? c.cost / c.purchases : 0)} theo số Meta). Khách cũ/gia hạn lướt qua quảng cáo cũng bị tính — Meta học theo tín hiệu này. Meta không cho đổi cài đặt ghi nhận của nhóm đã tạo → tạo nhóm mới chỉ tính lượt bấm.`,
      money: null, share: null, shareOf: null,
      evidence: [{ label: "Từ lượt bấm (7 ngày)", value: dec(c.purchasesClick, 0) }, { label: "Chỉ xem (1 ngày)", value: dec(c.purchasesView, 0) }, { label: "Meta tính", value: dec(c.purchases, 0) }],
    })
  } else if (c.purchasesView != null) notCauses.push({ id: "view-through-heavy", text: `Lượt mua chỉ-xem ${dec(c.purchasesView ?? 0, 0)}/${dec(c.purchases, 0)} — chưa áp đảo` })

  // 7. Meta lệch Odoo (chấm theo Meta, gắn cờ — user chốt 27/09).
  if (leads) { /* không có đơn để đối chiếu Odoo */ } else if (!ev.odoo.checked) context.push(`Chưa đối chiếu được với Odoo: ${ev.odoo.note}`)
  else if (c.purchases >= ODOO_MIN_META_PURCHASES && ev.odoo.orders < c.purchases * ODOO_GAP_RATIO) {
    causes.push({
      id: "meta-vs-odoo", title: `Meta báo ${c.purchases} lượt mua, Odoo chỉ có ${ev.odoo.orders} đơn mang thẻ của chiến dịch`,
      detail: "Số Meta dùng để chấm có thể cao hơn thực tế nhiều lần — kết luận \"đạt\" trên Meta cần đọc cùng số Odoo",
      money: null, share: null, shareOf: null,
      evidence: [{ label: "Meta", value: `${c.purchases} lượt mua · ${vnd(c.purchaseValue)}` }, { label: "Odoo", value: `${ev.odoo.orders} đơn · ${vnd(ev.odoo.revenue)}` }],
    })
  } else notCauses.push({ id: "meta-vs-odoo", text: `Odoo ghi ${ev.odoo.orders} đơn mang thẻ — không lệch lớn so với Meta (${c.purchases})` })

  causes.sort((a, b) => (b.money ?? -1) - (a.money ?? -1))
  return { causes, notCauses, visibleTermShare: 1, context }
}
