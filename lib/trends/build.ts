// ============================================================
// Đợt 28 — tab "Diễn biến" (Dashboard): thẻ so kỳ trước, biểu đồ ngày, "Đáng chú ý" — HÀM THUẦN
// ============================================================
// Thay đổi "thật" hay "trong mức dao động": số đếm (lượt mua, lead, click) dao động theo Poisson → so tỉ lệ hai kỳ trên
// thang log với sai số √(1/a + 1/b) (cùng cách đo lại 7/14 ngày ở lib/writes/outcome.ts). Ít số (< MIN_COUNT) thì KHÔNG
// kết luận. Chi phí là số mình chi, không phải số đếm ngẫu nhiên → chỉ hiện %, không gắn nhãn thật/nhiễu.
import type { GoalKind } from "@/lib/case/goal-kind"

export interface Metrics { spend: number; impressions: number; clicks: number; purchases: number; purchaseValue: number; leads: number; spendSales: number; spendLeads: number }
export interface TrendDay extends Omit<Metrics, "spendSales" | "spendLeads"> { date: string }
export interface CampaignPeriods { id: string; name: string; platform: "meta" | "google"; kind: GoalKind; cur: Metrics; prev: Metrics }

export const ZERO: Metrics = { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0, leads: 0, spendSales: 0, spendLeads: 0 }
export const MIN_COUNT = 10
const Z = 1.96

export const add = (a: Metrics, b: Partial<Metrics>): Metrics => {
  const o = { ...a }
  for (const k of Object.keys(ZERO) as (keyof Metrics)[]) o[k] += Number(b[k]) || 0
  return o
}

export type ChangeKind = "real_better" | "real_worse" | "noise" | "few" | "none"
export interface Card { key: string; label: string; cur: number | null; prev: number | null; changePct: number | null; change: ChangeKind; note: string | null; lowerIsBetter: boolean; unit: "vnd" | "count" | "pct" }

/** Tỉ lệ (vd chi phí/kết quả = chi phí / số đếm) giữa hai kỳ: thật hay nhiễu — HÀM THUẦN. `nCur`/`nPrev` = số đếm mẫu số. */
export function judgeRatio(cur: number | null, prev: number | null, nCur: number, nPrev: number, lowerIsBetter: boolean): ChangeKind {
  if (cur === null || prev === null || cur <= 0 || prev <= 0) return "none"
  if (nCur < MIN_COUNT || nPrev < MIN_COUNT) return "few"
  const d = Math.log(cur / prev), se = Math.sqrt(1 / nCur + 1 / nPrev)
  if (Math.abs(d) <= Z * se) return "noise"
  return (d < 0) === lowerIsBetter ? "real_better" : "real_worse"
}

const pctChange = (cur: number | null, prev: number | null) => (cur !== null && prev !== null && prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null)
const div = (a: number, b: number) => (b > 0 ? a / b : null)

export function buildCards(cur: Metrics, prev: Metrics): Card[] {
  const card = (key: string, label: string, c: number | null, p: number | null, change: ChangeKind, lowerIsBetter: boolean, unit: Card["unit"], note: string | null = null): Card =>
    ({ key, label, cur: c, prev: p, changePct: pctChange(c, p), change, note, lowerIsBetter, unit })
  const cards: Card[] = [
    card("spend", "Chi phí", cur.spend, prev.spend, "none", false, "vnd", "Số tiền mình chi — không đánh giá tốt/xấu"),
  ]
  if (cur.purchases + prev.purchases > 0 || cur.spendSales + prev.spendSales > 0) {
    cards.push(card("purchases", "Lượt mua", cur.purchases, prev.purchases, judgeRatio(div(cur.purchases, cur.spendSales), div(prev.purchases, prev.spendSales), cur.purchases, prev.purchases, false), false, "count", "So theo số lượt mua trên mỗi đồng chi (chi nhiều hơn thì đương nhiên được nhiều hơn)"))
    cards.push(card("cpa", "Chi phí / lượt mua", div(cur.spendSales, cur.purchases), div(prev.spendSales, prev.purchases), judgeRatio(div(cur.spendSales, cur.purchases), div(prev.spendSales, prev.purchases), cur.purchases, prev.purchases, true), true, "vnd"))
  }
  if (cur.leads + prev.leads > 0 || cur.spendLeads + prev.spendLeads > 0) {
    cards.push(card("leads", "Lead", cur.leads, prev.leads, judgeRatio(div(cur.leads, cur.spendLeads), div(prev.leads, prev.spendLeads), cur.leads, prev.leads, false), false, "count", "So theo số lead trên mỗi đồng chi"))
    cards.push(card("cpl", "Chi phí / lead", div(cur.spendLeads, cur.leads), div(prev.spendLeads, prev.leads), judgeRatio(div(cur.spendLeads, cur.leads), div(prev.spendLeads, prev.leads), cur.leads, prev.leads, true), true, "vnd"))
  }
  const ctr = (m: Metrics) => (m.impressions > 0 ? (m.clicks / m.impressions) * 100 : null)
  cards.push(card("ctr", "CTR", ctr(cur), ctr(prev), judgeRatio(ctr(cur), ctr(prev), cur.clicks, prev.clicks, false), false, "pct"))
  cards.push(card("cpc", "Chi phí / click", div(cur.spend, cur.clicks), div(prev.spend, prev.clicks), judgeRatio(div(cur.spend, cur.clicks), div(prev.spend, prev.clicks), cur.clicks, prev.clicks, true), true, "vnd"))
  cards.push(card("cpm", "CPM (₫/1.000 lượt hiển thị)", cur.impressions > 0 ? (cur.spend / cur.impressions) * 1000 : null, prev.impressions > 0 ? (prev.spend / prev.impressions) * 1000 : null, "none", true, "vnd", "Giá đấu thầu thị trường — đổi theo mùa, không do riêng mình"))
  return cards
}

export interface Notable { id: string; name: string; platform: "meta" | "google"; tone: "good" | "watch"; reason: string; score: number }
const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`

/** "Đáng chú ý": tối đa 3 tốt + 3 cần để ý, chỉ chiến dịch ĐỦ SỐ. `targetOf` trả trần chi phí/kết quả (mục tiêu) hoặc null. */
export function buildNotable(rows: CampaignPeriods[], targetOf: (r: CampaignPeriods) => { ceiling: number; target: number } | null): { good: Notable[]; watch: Notable[] } {
  const good: Notable[] = [], watch: Notable[] = []
  for (const r of rows) {
    const leads = r.kind === "leads"
    const word = leads ? "lead" : "lượt mua"
    const n = leads ? r.cur.leads : r.cur.purchases, np = leads ? r.prev.leads : r.prev.purchases
    const sp = r.cur.spend, cpr = div(sp, n), cprPrev = div(r.prev.spend, np)
    const t = targetOf(r)
    // Chi đủ để có ~3 kết quả theo trần mà 0 kết quả.
    if (n === 0 && t && sp >= 3 * t.ceiling) { watch.push({ id: r.id, name: r.name, platform: r.platform, tone: "watch", reason: `Chi ${vnd(sp)} (gấp ${Math.round(sp / t.ceiling)} lần trần ${vnd(t.ceiling)}/${word}) mà 0 ${word}`, score: sp }); continue }
    if (n < MIN_COUNT) continue
    const ch = judgeRatio(cpr, cprPrev, n, np, true)
    if (t && cpr !== null && cpr > t.ceiling) watch.push({ id: r.id, name: r.name, platform: r.platform, tone: "watch", reason: `${vnd(cpr)}/${word} — vượt trần ${vnd(t.ceiling)} (${n} ${word})`, score: sp - t.ceiling * n })
    else if (ch === "real_worse") watch.push({ id: r.id, name: r.name, platform: r.platform, tone: "watch", reason: `Chi phí/${word} tăng rõ: ${vnd(cprPrev!)} → ${vnd(cpr!)} (${np} → ${n} ${word})`, score: sp * 0.5 })
    else if (t && cpr !== null && cpr <= t.target) good.push({ id: r.id, name: r.name, platform: r.platform, tone: "good", reason: `${vnd(cpr)}/${word} — đạt mục tiêu ${vnd(t.target)} (${n} ${word})`, score: n })
    else if (ch === "real_better") good.push({ id: r.id, name: r.name, platform: r.platform, tone: "good", reason: `Chi phí/${word} giảm rõ: ${vnd(cprPrev!)} → ${vnd(cpr!)} (${np} → ${n} ${word})`, score: n * 0.5 })
  }
  return { good: good.sort((a, b) => b.score - a.score).slice(0, 3), watch: watch.sort((a, b) => b.score - a.score).slice(0, 3) }
}

/** Kỳ trước = cùng số ngày, liền trước — HÀM THUẦN. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const d = (s: string) => new Date(`${s}T00:00:00Z`)
  const days = Math.round((d(to).getTime() - d(from).getTime()) / 86_400_000) + 1
  const pTo = new Date(d(from).getTime() - 86_400_000), pFrom = new Date(pTo.getTime() - (days - 1) * 86_400_000)
  const f = (x: Date) => x.toISOString().slice(0, 10)
  return { from: f(pFrom), to: f(pTo) }
}
