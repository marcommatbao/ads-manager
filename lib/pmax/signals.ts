// ============================================================
// Đợt 10c — Tín hiệu PMax: D2 ngưỡng học · C2 mục tiêu khách mới · C1 đo trước/sau khi đổi cài đặt ghi nhận
// ============================================================
// D2: Smart Bidding cần đủ đơn + đủ ngân sách để thoát "đang học". Đo 28/09: MBI PMax Chữ ký số 3 đơn/30 ngày, tCPA
//     ₫265.847 với ngân sách ₫1tr/ngày — không bao giờ đủ 30 đơn → gợi ý gộp / hạ mục tiêu tối ưu lên phễu trên.
// C2: segments.new_versus_returning_customers + campaign_lifecycle_goal (đọc được; đổi chế độ qua
//     CampaignLifecycleGoalService — validate_only QUA 28/09). Tất cả PMax MBC/MBI đang TARGET_ALL_EQUALLY.
//     Google tự nhận khách cũ từ dữ liệu chuyển đổi + danh sách khách; danh sách CRM của 2 tài khoản đang báo cỡ 0
//     → số "khách mới" chỉ tham khảo.
// C1: Google KHÔNG cho đổi cửa sổ engaged-view qua API (Bước 0). Người dùng đổi trong Google Ads rồi GHI MỐC ở đây;
//     tool so N ngày trước / sau mốc (cùng độ dài): chi YouTube, đơn bấm, đơn sau lượt xem, CPA đơn bấm, đơn Search.

import fs from "fs"
import path from "path"
import { enums } from "google-ads-api"
import { getGoogleAdsCustomer } from "@/lib/google-ads-client"
import { googleAdsErrorMessage } from "@/lib/google-ads-error"
import { withFileLock } from "@/lib/file-lock"
import { writeFileAtomicSync } from "@/lib/fs-atomic"
import { addDays, isYmd, vnDate } from "@/lib/case/dates"
import type { Company } from "@/lib/case/types"
import { customerIdOf, PMAX_CONFIRM_TEXT, PmaxControlError } from "./controls"
import { pmaxXray } from "./xray"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const inv = (e: Record<string, unknown>) => Object.fromEntries(Object.entries(e).filter(([, v]) => typeof v === "number").map(([k, v]) => [v as number, k]))
const BID = inv(enums.BiddingStrategyType as unknown as Record<string, unknown>)
const MODE = inv(enums.CustomerAcquisitionOptimizationMode as unknown as Record<string, unknown>)
const NVR = inv(((enums as unknown as Record<string, Record<string, unknown>>).ConvertingUserPriorEngagementTypeAndLtvBucket) ?? {})

// ── D2 · Ngưỡng học ─────────────────────────────────────────

export const LEARN_MIN_CONV = 30
export const BUDGET_X_CPA = 3
export interface LearningInput { id: string; name: string; bidding: string; budget: number; targetCpa: number | null; targetRoas: number | null; cost: number; conv: number; convClick: number; value: number; learning: boolean; limitedByBudget: boolean }
export interface LearningCheck extends LearningInput {
  status: "ok" | "thieu_don" | "thieu_ngan_sach" | "dang_hoc"
  cpa: number | null
  neededBudget: number | null
  issues: string[]
  engagedHeavy: boolean
}
const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`

export function learningChecks(rows: LearningInput[]): { checks: LearningCheck[]; merge: { ids: string[]; names: string[]; conv: number; text: string } | null } {
  const checks = rows.map((r): LearningCheck => {
    const cpa = r.targetCpa ?? (r.conv > 0 ? r.cost / r.conv : null)
    const neededBudget = cpa ? BUDGET_X_CPA * cpa : null
    const issues: string[] = []
    if (r.conv < LEARN_MIN_CONV) issues.push(`Chỉ ${Math.round(r.conv)} đơn/30 ngày — Google cần khoảng ${LEARN_MIN_CONV} để đặt giá ổn định.`)
    if (neededBudget && r.budget < neededBudget) issues.push(`Ngân sách ${vnd(r.budget)}/ngày < ${BUDGET_X_CPA}× CPA (${vnd(neededBudget)}) — mỗi ngày không đủ tiền cho vài đơn nên học rất chậm.`)
    if (r.learning) issues.push("Google đang báo \"đang học\" — đừng đổi mục tiêu/ngân sách >20% lúc này.")
    const engagedHeavy = r.conv >= LEARN_MIN_CONV && r.convClick < r.conv * 0.3
    if (engagedHeavy) issues.push(`Đủ số đơn nhưng ${Math.round((1 - r.convClick / Math.max(r.conv, 1)) * 100)}% là đơn sau lượt xem — Google học theo tín hiệu yếu (xem thí nghiệm YouTube).`)
    const status: LearningCheck["status"] = r.learning ? "dang_hoc" : r.conv < LEARN_MIN_CONV ? "thieu_don" : neededBudget && r.budget < neededBudget ? "thieu_ngan_sach" : "ok"
    return { ...r, cpa, neededBudget, issues, status, engagedHeavy }
  })
  // Gộp: ≥ 2 chiến dịch thiếu đơn, cùng kiểu đặt giá, gộp lại thì vượt ngưỡng hoặc gần hơn hẳn.
  const low = checks.filter((c) => c.status === "thieu_don")
  const groups = new Map<string, LearningCheck[]>()
  for (const c of low) groups.set(c.bidding, [...(groups.get(c.bidding) ?? []), c])
  const best = [...groups.values()].filter((g) => g.length >= 2).sort((a, b) => b.reduce((s, c) => s + c.conv, 0) - a.reduce((s, c) => s + c.conv, 0))[0]
  const merge = best ? { ids: best.map((c) => c.id), names: best.map((c) => c.name), conv: best.reduce((s, c) => s + c.conv, 0),
    text: `Gộp ${best.length} chiến dịch thiếu đơn thành 1 PMax (mỗi sản phẩm là 1 asset group) → ${Math.round(best.reduce((s, c) => s + c.conv, 0))} đơn/30 ngày dồn cho MỘT bộ học${best.reduce((s, c) => s + c.conv, 0) >= LEARN_MIN_CONV ? ", đủ ngưỡng" : ", vẫn dưới ngưỡng — cân nhắc tối ưu theo bước phễu sớm hơn (vd Thêm giỏ/Để lại thông tin) có nhiều số hơn"}.` } : null
  return { checks, merge }
}

export async function readLearning(company: Company): Promise<ReturnType<typeof learningChecks>> {
  const c = getGoogleAdsCustomer(company)
  const x = await pmaxXray(company, { from: addDays(vnDate(), -30), to: addDays(vnDate(), -1) })
  const rows = (await c.query(`SELECT campaign.id, campaign.name, campaign.bidding_strategy_type, campaign.maximize_conversions.target_cpa_micros, campaign.target_cpa.target_cpa_micros, campaign.maximize_conversion_value.target_roas, campaign_budget.amount_micros, campaign.primary_status_reasons, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX' AND campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS`)) as Row[]
  const reasons = (r: Row) => ((r.campaign.primary_status_reasons ?? []) as unknown[]).map((v) => (typeof v === "number" ? inv(enums.CampaignPrimaryStatusReason as unknown as Record<string, unknown>)[v] : String(v)))
  return learningChecks(rows.map((r) => {
    const id = String(r.campaign.id)
    const tcpa = Number(r.campaign.maximize_conversions?.target_cpa_micros || r.campaign.target_cpa?.target_cpa_micros) || 0
    return { id, name: String(r.campaign.name), bidding: BID[Number(r.campaign.bidding_strategy_type)] ?? String(r.campaign.bidding_strategy_type), budget: (Number(r.campaign_budget.amount_micros) || 0) / 1e6,
      targetCpa: tcpa ? tcpa / 1e6 : null, targetRoas: Number(r.campaign.maximize_conversion_value?.target_roas) || null,
      cost: (Number(r.metrics.cost_micros) || 0) / 1e6, conv: Number(r.metrics.conversions) || 0, value: Number(r.metrics.conversions_value) || 0,
      convClick: x.campaigns.find((k) => k.id === id)?.convClick ?? 0,
      learning: reasons(r).includes("BIDDING_STRATEGY_LEARNING"), limitedByBudget: reasons(r).includes("BUDGET_CONSTRAINED") }
  }))
}

// ── C2 · Khách mới ──────────────────────────────────────────

export interface NewCustomerRow { id: string; name: string; mode: string; newConv: number; returningConv: number; unknownConv: number; newShare: number | null; suggest: string | null }
export interface NewCustomerView { rows: NewCustomerRow[]; accountValue: number | null; note: string }
export const MODE_LABEL: Record<string, string> = { TARGET_ALL_EQUALLY: "Mọi khách như nhau", BID_HIGHER_FOR_NEW_CUSTOMER: "Trả giá cao hơn cho khách mới", TARGET_NEW_CUSTOMER: "Chỉ nhắm khách mới" }

export function newCustomerView(rows: { id: string; name: string; mode: string; nvr: Record<string, number> }[], accountValue: number | null): NewCustomerView {
  const out = rows.map((r): NewCustomerRow => {
    const nw = (r.nvr.NEW ?? 0) + (r.nvr.NEW_AND_HIGH_LTV ?? 0), ret = r.nvr.RETURNING ?? 0, unk = (r.nvr.UNKNOWN ?? 0) + (r.nvr.UNSPECIFIED ?? 0)
    const known = nw + ret
    const newShare = known >= 10 ? nw / known : null
    let suggest: string | null = null
    if (r.mode === "TARGET_ALL_EQUALLY" && newShare != null && newShare < 0.7) suggest = `${Math.round((1 - newShare) * 100)}% đơn là khách cũ → cân nhắc "Trả giá cao hơn cho khách mới" để PMax bớt tiêu vào người đằng nào cũng mua.`
    return { id: r.id, name: r.name, mode: r.mode, newConv: Math.round(nw * 10) / 10, returningConv: Math.round(ret * 10) / 10, unknownConv: Math.round(unk * 10) / 10, newShare, suggest }
  })
  return { rows: out, accountValue, note: "Google tự nhận khách cũ từ dữ liệu chuyển đổi + danh sách khách hàng. Danh sách CRM trên tài khoản đang báo cỡ 0 → tải danh sách khách (email/SĐT) vào Google Ads để số này chính xác hơn." }
}

export async function readNewCustomer(company: Company): Promise<NewCustomerView> {
  const c = getGoogleAdsCustomer(company)
  const [camps, nvr, goals, acct] = await Promise.all([
    c.query(`SELECT campaign.id, campaign.name FROM campaign WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX' AND campaign.status = 'ENABLED'`) as Promise<Row[]>,
    c.query(`SELECT campaign.id, segments.new_versus_returning_customers, metrics.conversions FROM campaign WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX' AND campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS`) as Promise<Row[]>,
    c.query(`SELECT campaign_lifecycle_goal.campaign, campaign_lifecycle_goal.customer_acquisition_goal_settings.optimization_mode FROM campaign_lifecycle_goal`) as Promise<Row[]>,
    c.query(`SELECT customer_lifecycle_goal.customer_acquisition_goal_value_settings.value FROM customer_lifecycle_goal`).catch(() => []) as Promise<Row[]>,
  ])
  const mode = new Map(goals.map((g) => [String(g.campaign_lifecycle_goal.campaign).split("/").pop()!, MODE[Number(g.campaign_lifecycle_goal.customer_acquisition_goal_settings?.optimization_mode)] ?? "TARGET_ALL_EQUALLY"]))
  const agg = new Map<string, Record<string, number>>()
  for (const r of nvr) { const id = String(r.campaign.id); const k = NVR[Number(r.segments.new_versus_returning_customers)] ?? "UNKNOWN"; const m = agg.get(id) ?? {}; m[k] = (m[k] ?? 0) + (Number(r.metrics.conversions) || 0); agg.set(id, m) }
  const v = Number(acct[0]?.customer_lifecycle_goal?.customer_acquisition_goal_value_settings?.value)
  return newCustomerView(camps.map((r) => ({ id: String(r.campaign.id), name: String(r.campaign.name), mode: mode.get(String(r.campaign.id)) ?? "TARGET_ALL_EQUALLY", nvr: agg.get(String(r.campaign.id)) ?? {} })), Number.isFinite(v) ? v : null)
}

const NC_FILE = path.join(process.cwd(), "data", "pmax-new-customer.json")
export interface NewCustomerChange { id: string; company: Company; at: string; by: string; campaignId: string; campaignName: string; from: string; to: string; status: "done" | "failed"; error?: string; undoneAt?: string }
function readNc(): NewCustomerChange[] { try { return JSON.parse(fs.readFileSync(NC_FILE, "utf-8")) as NewCustomerChange[] } catch { return [] } }
export const listNewCustomerChanges = (co: Company) => readNc().filter((x) => x.company === co).reverse().slice(0, 30)

async function configureMode(company: Company, campaignId: string, mode: string, exists: boolean, validateOnly: boolean) {
  const c = getGoogleAdsCustomer(company) as unknown as { campaignLifecycleGoals: { configureCampaignLifecycleGoals: (r: object) => Promise<unknown> } }
  const cust = customerIdOf(company)
  const settings = { optimization_mode: (enums.CustomerAcquisitionOptimizationMode as unknown as Record<string, number>)[mode] }
  // Đo 28/09: dạng update KHÔNG được kèm trường campaign (field_error 5); chiến dịch chưa có goal → create.
  const operation = exists
    ? { update: { resource_name: `customers/${cust}/campaignLifecycleGoals/${campaignId}`, customer_acquisition_goal_settings: settings }, update_mask: { paths: ["customer_acquisition_goal_settings.optimization_mode"] } }
    : { create: { campaign: `customers/${cust}/campaigns/${campaignId}`, customer_acquisition_goal_settings: settings } }
  await c.campaignLifecycleGoals.configureCampaignLifecycleGoals({ customer_id: cust, operation, validate_only: validateOnly })
}

export async function setNewCustomerMode(input: { company: Company; campaignId: string; mode: string; actor: string; validateOnly: boolean; confirmText?: string }): Promise<NewCustomerChange> {
  if (!(input.mode in MODE_LABEL)) throw new PmaxControlError("Chế độ không hợp lệ")
  if (!input.validateOnly && input.confirmText?.trim() !== PMAX_CONFIRM_TEXT) throw new PmaxControlError(`Gõ đúng “${PMAX_CONFIRM_TEXT}” để ghi lên tài khoản thật`)
  if (input.mode === "TARGET_NEW_CUSTOMER") throw new PmaxControlError("\"Chỉ nhắm khách mới\" bỏ hẳn khách cũ — tool chưa cho bật (quá rủi ro với khách gia hạn); làm tay nếu chắc chắn")
  const c = getGoogleAdsCustomer(input.company)
  const [goal] = (await c.query(`SELECT campaign_lifecycle_goal.customer_acquisition_goal_settings.optimization_mode FROM campaign_lifecycle_goal WHERE campaign_lifecycle_goal.campaign = 'customers/${customerIdOf(input.company)}/campaigns/${Number(input.campaignId)}'`)) as Row[]
  const [camp] = (await c.query(`SELECT campaign.name FROM campaign WHERE campaign.id = ${Number(input.campaignId)} AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'`)) as Row[]
  if (!camp) throw new PmaxControlError("Không thấy chiến dịch PMax", 404)
  const from = goal ? MODE[Number(goal.campaign_lifecycle_goal.customer_acquisition_goal_settings?.optimization_mode)] ?? "TARGET_ALL_EQUALLY" : "TARGET_ALL_EQUALLY"
  const ch: NewCustomerChange = { id: `pmaxnc_${Date.now().toString(36)}`, company: input.company, at: new Date().toISOString(), by: input.actor, campaignId: input.campaignId, campaignName: String(camp.campaign.name), from, to: input.mode, status: "failed" }
  if (from === input.mode) { ch.error = "Chiến dịch đã ở chế độ này"; return ch }
  try { await configureMode(input.company, input.campaignId, input.mode, !!goal, true) } catch (e) { ch.error = `Google từ chối khi kiểm — CHƯA ghi gì: ${googleAdsErrorMessage(e)}`; return ch }
  if (input.validateOnly) { ch.status = "done"; return ch }
  return withFileLock(NC_FILE, async () => {
    try {
      await configureMode(input.company, input.campaignId, input.mode, !!goal, false)
      const [after] = (await c.query(`SELECT campaign_lifecycle_goal.customer_acquisition_goal_settings.optimization_mode FROM campaign_lifecycle_goal WHERE campaign_lifecycle_goal.campaign = 'customers/${customerIdOf(input.company)}/campaigns/${Number(input.campaignId)}'`)) as Row[]
      const now = MODE[Number(after?.campaign_lifecycle_goal?.customer_acquisition_goal_settings?.optimization_mode)]
      ch.status = now === input.mode ? "done" : "failed"
      if (now !== input.mode) ch.error = `Đọc lại thấy chế độ ${now ?? "?"}`
    } catch (e) { ch.error = `Lỗi khi ghi: ${googleAdsErrorMessage(e)}` }
    fs.mkdirSync(path.dirname(NC_FILE), { recursive: true }); writeFileAtomicSync(NC_FILE, JSON.stringify([...readNc(), ch].slice(-200), null, 1))
    return ch
  })
}

export async function undoNewCustomerMode(company: Company, id: string, actor: string): Promise<NewCustomerChange> {
  const ch = readNc().find((x) => x.id === id && x.company === company)
  if (!ch || ch.status !== "done") throw new PmaxControlError("Không tìm thấy lần đổi", 404)
  if (ch.undoneAt) throw new PmaxControlError("Đã hoàn tác rồi", 409)
  const r = await setNewCustomerMode({ company, campaignId: ch.campaignId, mode: ch.from, actor, validateOnly: false, confirmText: PMAX_CONFIRM_TEXT })
  if (r.status !== "done") throw new PmaxControlError(r.error ?? "Hoàn tác thất bại")
  await withFileLock(NC_FILE, async () => { const l = readNc(); const x = l.find((y) => y.id === id); if (x) x.undoneAt = new Date().toISOString(); writeFileAtomicSync(NC_FILE, JSON.stringify(l, null, 1)) })
  return r
}

// ── C1 · Mốc thay đổi + so trước/sau ─────────────────────────

const CH_FILE = path.join(process.cwd(), "data", "pmax-change-marks.json")
export interface ChangeMark { id: string; company: Company; date: string; label: string; by: string; at: string }
function readMarks(): ChangeMark[] { try { return JSON.parse(fs.readFileSync(CH_FILE, "utf-8")) as ChangeMark[] } catch { return [] } }
export const listMarks = (co: Company) => readMarks().filter((m) => m.company === co).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
export async function addMark(company: Company, date: string, label: string, by: string): Promise<ChangeMark> {
  if (!isYmd(date) || date > vnDate()) throw new PmaxControlError("Ngày không hợp lệ")
  const m: ChangeMark = { id: `mark_${Date.now().toString(36)}`, company, date, label: label.trim().slice(0, 200) || "Đổi cài đặt ghi nhận", by, at: new Date().toISOString() }
  await withFileLock(CH_FILE, async () => { fs.mkdirSync(path.dirname(CH_FILE), { recursive: true }); writeFileAtomicSync(CH_FILE, JSON.stringify([...readMarks(), m].slice(-300), null, 1)) })
  return m
}
export async function removeMark(company: Company, id: string): Promise<void> {
  await withFileLock(CH_FILE, async () => writeFileAtomicSync(CH_FILE, JSON.stringify(readMarks().filter((m) => !(m.id === id && m.company === company)), null, 1)))
}

export interface WindowStats { from: string; to: string; cost: number; convClick: number; convEngaged: number; cpaClick: number | null; youtubeCost: number; youtubeShare: number; searchConv: number }
export interface BeforeAfter { mark: ChangeMark; days: number; before: WindowStats; after: WindowStats; lines: string[]; ready: boolean }
export const MIN_AFTER_DAYS = 7

export function compareWindows(before: WindowStats, after: WindowStats): string[] {
  const d = (a: number, b: number) => (a > 0 ? `${b >= a ? "+" : ""}${Math.round((b / a - 1) * 100)}%` : "—")
  return [
    `Chi PMax: ${vnd(before.cost)} → ${vnd(after.cost)} (${d(before.cost, after.cost)}); YouTube ${Math.round(before.youtubeShare * 100)}% → ${Math.round(after.youtubeShare * 100)}% chi.`,
    `Đơn từ lượt bấm: ${Math.round(before.convClick)} → ${Math.round(after.convClick)} (${d(before.convClick, after.convClick)}); CPA đơn bấm ${before.cpaClick ? vnd(before.cpaClick) : "—"} → ${after.cpaClick ? vnd(after.cpaClick) : "—"}.`,
    `Đơn sau lượt xem (Google tự ghi): ${Math.round(before.convEngaged)} → ${Math.round(after.convEngaged)}.`,
    `Đơn Search (không phải PMax): ${Math.round(before.searchConv)} → ${Math.round(after.searchConv)} (${d(before.searchConv, after.searchConv)}) — nếu đơn PMax giảm mà Search/đơn thật không giảm, phần mất là đơn "ghi công hộ".`,
  ]
}

export async function beforeAfter(company: Company, markId: string): Promise<BeforeAfter> {
  const mark = readMarks().find((m) => m.id === markId && m.company === company)
  if (!mark) throw new PmaxControlError("Không tìm thấy mốc", 404)
  const yesterday = addDays(vnDate(), -1)
  const afterFrom = addDays(mark.date, 1)
  const avail = Math.round((Date.parse(yesterday) - Date.parse(afterFrom)) / 86_400_000) + 1
  const days = Math.max(0, Math.min(28, avail))
  const win = async (from: string, to: string): Promise<WindowStats> => {
    const x = await pmaxXray(company, { from, to })
    const yt = x.account.channels.find((ch) => ch.network === "YOUTUBE")
    const c = getGoogleAdsCustomer(company)
    const s = (await c.query(`SELECT metrics.conversions FROM campaign WHERE campaign.advertising_channel_type = 'SEARCH' AND segments.date BETWEEN '${from}' AND '${to}'`)) as Row[]
    const t = x.account.totals
    return { from, to, cost: t.cost, convClick: t.convClick, convEngaged: t.convEngaged, cpaClick: t.convClick > 0 ? t.cost / t.convClick : null, youtubeCost: yt?.cost ?? 0, youtubeShare: t.cost > 0 ? (yt?.cost ?? 0) / t.cost : 0, searchConv: s.reduce((a, r) => a + (Number(r.metrics.conversions) || 0), 0) }
  }
  if (days < 1) {
    const empty = (from: string): WindowStats => ({ from, to: from, cost: 0, convClick: 0, convEngaged: 0, cpaClick: null, youtubeCost: 0, youtubeShare: 0, searchConv: 0 })
    return { mark, days: 0, before: empty(mark.date), after: empty(afterFrom), lines: [`Mốc ${mark.date}: chưa có ngày trọn nào sau mốc.`], ready: false }
  }
  const [before, after] = await Promise.all([win(addDays(mark.date, -days), addDays(mark.date, -1)), win(afterFrom, addDays(afterFrom, days - 1))])
  const lines = compareWindows(before, after)
  if (days < MIN_AFTER_DAYS) lines.unshift(`Mới ${days} ngày sau mốc — đọc sớm, nên chờ ≥ ${MIN_AFTER_DAYS} ngày (Google cần thời gian điều chỉnh).`)
  return { mark, days, before, after, lines, ready: days >= MIN_AFTER_DAYS }
}
