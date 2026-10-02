// ============================================================
// Đợt 15c — Báo cáo quản lý tuần (team Ads)
// ============================================================
// Thứ Hai 08:30 VN: thẻ Teams (TEAMS_WEBHOOK_ADS) + trang /bao-cao-tuan (lưu từng tuần).
// SỐ TÍNH BẰNG MÃ — không để AI viết số. Nguồn nào đọc hỏng thì ghi "không đọc được", KHÔNG hiện 0 (0 giả = quyết định sai).
// composeWeeklyReport là hàm THUẦN nhận số đã đọc sẵn; gatherWeeklyInput đọc số thật.

import fs from "fs"
import path from "path"
import { writeFileAtomicSync } from "@/lib/fs-atomic"
import { withFileLock } from "@/lib/file-lock"
import type { Company } from "@/lib/case/types"
import { companyIds } from "@/lib/companies"

export interface WeekMoney {
  key: string; label: string
  MBC: { google: number | null; meta: number | null; revenue: number | null; orders: number | null }
  MBI: { google: number | null; meta: number | null; orders: number | null }
}
export interface WeeklyInput {
  weekKey: string; from: string; to: string; label: string
  /** [0] = tuần báo cáo, [1..4] = 4 tuần trước (có thể thiếu). */
  weeks: WeekMoney[]
  numbersCheck: { at: string; ok: number; lech: { company: Company; name: string; diff: number | null }[]; loi: number } | null
  leadFlows: { name: string; company: Company; status: string; hoursSinceLead: number | null }[]
  writes: { source: string; count: number; undone: number }[]
  outcomes: { tot: number; xau: number; khong_doi: number; chua_ro: number; bad: { label: string; note: string }[] }
  inbox: { builtAt: string | null; open: number; snoozed: number; dismissed: number; top: { title: string; money: number | null; moneyLabel: string | null; company: Company }[]; overdueTasks: number } | null
  experiments: { company: Company; label: string; week: number; weeks: number }[]
  realOrders: { company: Company; googleOn: boolean; metaOn: boolean; metaSent: number; metaFailed: number }[]
  errors: string[]
}

export interface ReportRow { label: string; value: string; note?: string; tone?: "good" | "bad" | "warn" }
export interface ReportSection { title: string; rows: ReportRow[] }
export interface WeeklyReport { weekKey: string; label: string; builtAt: string; sections: ReportSection[]; facts: { title: string; value: string }[]; level: "good" | "warning" | "danger"; errors: string[] }

const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`
const nf = (n: number) => Math.round(n).toLocaleString("vi-VN")
const NA = "không đọc được"

/** So tuần trước + trung bình các tuần trước có số (tối đa 4). null ở tuần nào thì tuần đó không tính. */
export function trend(cur: number | null, prev: (number | null)[]): string {
  if (cur == null) return ""
  const p1 = prev[0]
  const avg = prev.filter((x): x is number => x != null)
  const pct = (a: number, b: number) => (b === 0 ? (a === 0 ? "0%" : "mới") : `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}%`)
  const parts: string[] = []
  if (p1 != null) parts.push(`tuần trước ${pct(cur, p1)}`)
  if (avg.length >= 2) parts.push(`TB ${avg.length} tuần ${pct(cur, avg.reduce((s, x) => s + x, 0) / avg.length)}`)
  return parts.join(" · ")
}

const ratio = (a: number | null, b: number | null) => (a != null && b != null && b > 0 ? a / b : null)
const sum = (a: number | null, b: number | null) => (a != null && b != null ? a + b : null)

export function composeWeeklyReport(x: WeeklyInput, now = new Date()): WeeklyReport {
  const [w, ...prev] = x.weeks
  const sections: ReportSection[] = []
  const facts: { title: string; value: string }[] = []
  let level: WeeklyReport["level"] = "good"
  const worse = (l: WeeklyReport["level"]) => { if (l === "danger" || (l === "warning" && level === "good")) level = l }

  // 1. Tiền & kết quả
  const money: ReportRow[] = []
  if (!w) money.push({ label: "Số tiền", value: NA, tone: "bad" })
  else {
    const row = (label: string, cur: number | null, pv: (number | null)[], fmt: (n: number) => string, higherIsGood?: boolean) => {
      const t = trend(cur, pv)
      const tone = cur == null ? "bad" : higherIsGood == null || pv[0] == null ? undefined : (cur >= pv[0]!) === higherIsGood ? "good" : "warn"
      money.push({ label, value: cur == null ? NA : fmt(cur), note: t || undefined, tone })
    }
    const mbcSpend = sum(w.MBC.google, w.MBC.meta), mbiSpend = sum(w.MBI.google, w.MBI.meta)
    const mbcRoas = ratio(w.MBC.revenue, mbcSpend), mbiCpo = ratio(mbiSpend, w.MBI.orders)
    row("MBC · chi Google", w.MBC.google, prev.map((p) => p.MBC.google), vnd)
    row("MBC · chi Meta", w.MBC.meta, prev.map((p) => p.MBC.meta), vnd)
    row("MBC · doanh thu", w.MBC.revenue, prev.map((p) => p.MBC.revenue), vnd, true)
    row("MBC · ROAS", mbcRoas, prev.map((p) => ratio(p.MBC.revenue, sum(p.MBC.google, p.MBC.meta))), (n) => `${n.toFixed(2)}x`, true)
    row("MBI · chi Google", w.MBI.google, prev.map((p) => p.MBI.google), vnd)
    row("MBI · chi Meta", w.MBI.meta, prev.map((p) => p.MBI.meta), vnd)
    row("MBI · đơn đã thu tiền", w.MBI.orders, prev.map((p) => p.MBI.orders), nf, true)
    row("MBI · chi / đơn", mbiCpo, prev.map((p) => ratio(sum(p.MBI.google, p.MBI.meta), p.MBI.orders)), vnd, false)
    facts.push({ title: "MBC", value: `chi ${mbcSpend == null ? NA : vnd(mbcSpend)} · doanh thu ${w.MBC.revenue == null ? NA : vnd(w.MBC.revenue)} · ROAS ${mbcRoas == null ? NA : `${mbcRoas.toFixed(2)}x`}${mbcRoas != null ? ` (${trend(mbcRoas, prev.map((p) => ratio(p.MBC.revenue, sum(p.MBC.google, p.MBC.meta))))})` : ""}` })
    facts.push({ title: "MBI", value: `chi ${mbiSpend == null ? NA : vnd(mbiSpend)} · ${w.MBI.orders == null ? NA : `${nf(w.MBI.orders)} đơn`} · chi/đơn ${mbiCpo == null ? NA : vnd(mbiCpo)}` })
    if (money.some((r) => r.value === NA)) worse("warning")
  }
  sections.push({ title: "1. Tiền & kết quả", rows: money })

  // 2. Số đáng tin tới đâu
  const trust: ReportRow[] = []
  if (!x.numbersCheck) trust.push({ label: "Đối chiếu số hằng tuần", value: "chưa có lần chạy nào", tone: "warn" })
  else {
    const n = x.numbersCheck
    trust.push({ label: "Đối chiếu số hằng tuần", value: n.lech.length || n.loi ? `${n.lech.length} lệch · ${n.loi} không đọc được / ${n.ok + n.lech.length + n.loi}` : `khớp ${n.ok}/${n.ok}`, note: `chạy ${n.at.slice(0, 10).split("-").reverse().join("/")}`, tone: n.lech.length ? "bad" : n.loi ? "warn" : "good" })
    for (const l of n.lech) trust.push({ label: `  ${l.company} · ${l.name}`, value: l.diff == null ? "lệch" : `lệch ${Math.round(l.diff * 100)}%`, tone: "bad" })
    if (n.lech.length) worse("warning")
  }
  const broken = x.leadFlows.filter((f) => f.status === "broken" || f.status === "error")
  trust.push({ label: "Đường lead form → CRM", value: !x.leadFlows.length ? "chưa cấu hình" : broken.length ? `${broken.length}/${x.leadFlows.length} đứt/lỗi` : `${x.leadFlows.length}/${x.leadFlows.length} bình thường`, note: broken.map((b) => `${b.company} ${b.name}${b.hoursSinceLead != null ? ` (${Math.round(b.hoursSinceLead)} giờ không lead)` : ""}`).join("; ") || undefined, tone: broken.length ? "bad" : x.leadFlows.length ? "good" : "warn" })
  if (broken.length) worse("danger")
  for (const r of x.realOrders) trust.push({ label: `${r.company} · đơn thật → nền tảng`, value: `Google ${r.googleOn ? "bật" : "tắt"} · Meta ${r.metaOn ? `bật (${nf(r.metaSent)} đã gửi${r.metaFailed ? `, ${nf(r.metaFailed)} lỗi` : ""})` : "tắt"}`, tone: r.metaFailed ? "warn" : undefined })
  sections.push({ title: "2. Số đáng tin tới đâu", rows: trust })
  facts.push({ title: "Số liệu", value: `${x.numbersCheck ? (x.numbersCheck.lech.length ? `${x.numbersCheck.lech.length} chỗ lệch` : "đối chiếu khớp") : "chưa đối chiếu"} · lead ${broken.length ? `${broken.length} đường đứt` : "bình thường"}` })

  // 3. Tool đã làm gì
  const tool: ReportRow[] = []
  const totalWrites = x.writes.reduce((s, r) => s + r.count, 0)
  tool.push({ label: "Lần ghi lên tài khoản trong tuần", value: nf(totalWrites) })
  for (const r of [...x.writes].sort((a, b) => b.count - a.count)) tool.push({ label: `  ${r.source}`, value: nf(r.count), note: r.undone ? `${r.undone} đã hoàn tác` : undefined })
  const o = x.outcomes
  tool.push({ label: "Đo lại 7/14 ngày xong trong tuần", value: `Tốt ${o.tot} · Xấu ${o.xau} · Không đổi ${o.khong_doi} · Chưa rõ ${o.chua_ro}`, tone: o.xau ? "bad" : o.tot ? "good" : undefined })
  for (const b of o.bad.slice(0, 5)) tool.push({ label: `  Xấu: ${b.label}`, value: "", note: b.note, tone: "bad" })
  if (o.xau) worse("warning")
  sections.push({ title: "3. Tool đã làm gì", rows: tool })
  facts.push({ title: "Tool", value: `${nf(totalWrites)} lần ghi · đo lại: ${o.tot} tốt / ${o.xau} xấu` })

  // 4. Việc tồn
  const back: ReportRow[] = []
  if (!x.inbox) back.push({ label: "Hộp việc", value: "chưa dựng lần nào", tone: "warn" })
  else {
    back.push({ label: "Hộp việc", value: `${x.inbox.open} đang mở · ${x.inbox.snoozed} hoãn · ${x.inbox.dismissed} bỏ qua`, note: x.inbox.builtAt ? `dựng ${x.inbox.builtAt.slice(0, 16).replace("T", " ")} UTC` : undefined })
    for (const t of x.inbox.top.slice(0, 3)) back.push({ label: `  ${t.company} · ${t.title}`, value: t.money == null ? "" : vnd(t.money), note: t.moneyLabel ?? undefined })
    back.push({ label: "Việc giao người quá hạn (phiên xử lý)", value: nf(x.inbox.overdueTasks), tone: x.inbox.overdueTasks ? "warn" : "good" })
  }
  sections.push({ title: "4. Việc tồn", rows: back })
  if (x.inbox) facts.push({ title: "Việc tồn", value: `${x.inbox.open} việc mở${x.inbox.overdueTasks ? ` · ${x.inbox.overdueTasks} việc giao quá hạn` : ""}` })

  // 5. Đang thử nghiệm
  const exp: ReportRow[] = x.experiments.map((e) => ({ label: `${e.company} · ${e.label}`, value: `tuần ${Math.min(e.week, e.weeks)}/${e.weeks}`, tone: e.week > e.weeks ? "warn" : undefined, note: e.week > e.weeks ? "quá hạn — cần kết thúc & đọc kết quả" : undefined }))
  if (!exp.length) exp.push({ label: "Thí nghiệm đang chạy", value: "không có" })
  sections.push({ title: "5. Đang thử nghiệm", rows: exp })
  if (x.experiments.length) facts.push({ title: "Thử nghiệm", value: x.experiments.map((e) => `${e.label} tuần ${Math.min(e.week, e.weeks)}/${e.weeks}`).join(" · ") })

  if (x.errors.length) worse("warning")
  return { weekKey: x.weekKey, label: x.label, builtAt: now.toISOString(), sections, facts, level, errors: x.errors }
}

// ── Tuần báo cáo = tuần TRỌN gần nhất (thứ Hai → Chủ nhật, giờ VN) ──

export function lastFullWeek(now = new Date()): { weekKey: string; from: string; to: string; label: string } {
  const vn = new Date(now.getTime() + 7 * 3600_000)
  const dow = (vn.getUTCDay() + 6) % 7 // thứ Hai = 0
  const mon = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() - dow - 7))
  const sun = new Date(mon.getTime() + 6 * 864e5)
  const ymd = (d: Date) => d.toISOString().slice(0, 10)
  const dm = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`
  return { weekKey: ymd(mon), from: ymd(mon), to: ymd(sun), label: `Tuần ${dm(mon)} – ${dm(sun)}/${sun.getUTCFullYear()}` }
}
export const shiftWeek = (weekKey: string, n: number) => new Date(Date.parse(`${weekKey}T00:00:00Z`) + n * 7 * 864e5).toISOString().slice(0, 10)

// ── Lưu lịch sử ──

const FILE = path.join(process.cwd(), "data", "weekly-report-history.json")
const KEEP = 60
type Store = Record<string, WeeklyReport & { sent?: { at: string; sent: boolean; notConfigured?: boolean; error?: string } }>
export function readWeeklyHistory(): Store { try { return JSON.parse(fs.readFileSync(FILE, "utf-8")) as Store } catch { return {} } }
export async function saveWeekly(r: WeeklyReport, sent?: Store[string]["sent"]): Promise<void> {
  await withFileLock(FILE, async () => {
    const all = readWeeklyHistory()
    all[r.weekKey] = { ...r, ...(sent ? { sent } : all[r.weekKey]?.sent ? { sent: all[r.weekKey].sent } : {}) }
    const keep = Object.keys(all).sort().slice(-KEEP)
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    writeFileAtomicSync(FILE, JSON.stringify(Object.fromEntries(keep.map((k) => [k, all[k]]))))
  })
}

// ── Đọc số thật ──

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200)

async function weekMoney(weekKey: string): Promise<WeekMoney> {
  const { getCompanyPnl } = await import("@/lib/finance/company-pnl")
  const p = await getCompanyPnl({ week: weekKey })
  return {
    key: weekKey, label: p.periodLabel,
    MBC: { google: p.MBC.spendGoogleError ? null : p.MBC.spendGoogle, meta: p.MBC.spendFacebookError ? null : p.MBC.spendFacebook, revenue: p.MBC.revenueSourceError ? null : p.MBC.revenue, orders: p.MBC.revenueSourceError ? null : p.MBC.orders },
    MBI: { google: p.MBI.spendGoogleError ? null : p.MBI.spendGoogle, meta: p.MBI.spendFacebookError ? null : p.MBI.spendFacebook, orders: p.MBI.ordersSourceError ? null : p.MBI.orders },
  }
}

export async function gatherWeeklyInput(now = new Date()): Promise<WeeklyInput> {
  const wk = lastFullWeek(now)
  const errors: string[] = []
  const inWeek = (iso: string) => { const d = new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10); return d >= wk.from && d <= wk.to }

  // Tiền: tuần báo cáo + 4 tuần trước. Tuần trước đã lưu ở lịch sử thì dùng lại (bớt lượt gọi Meta ~60/giờ).
  const weeks: WeekMoney[] = []
  const hist = readWeeklyHistory()
  for (let i = 0; i <= 4; i++) {
    const key = shiftWeek(wk.weekKey, -i)
    const saved = i > 0 ? (hist[key] as unknown as { money?: WeekMoney } | undefined)?.money : undefined
    if (saved) { weeks.push(saved); continue }
    try { weeks.push(await weekMoney(key)) } catch (e) { if (i === 0) errors.push(`Tiền tuần báo cáo: ${errText(e)}`); weeks.push({ key, label: key, MBC: { google: null, meta: null, revenue: null, orders: null }, MBI: { google: null, meta: null, orders: null } }) }
  }

  const safe = async <T>(name: string, f: () => Promise<T> | T, fallback: T): Promise<T> => { try { return await f() } catch (e) { errors.push(`${name}: ${errText(e)}`); return fallback } }

  const numbersCheck = await safe("Đối chiếu số", async () => {
    const { lastNumbersCheck } = await import("@/lib/jobs/numbers-check")
    const n = lastNumbersCheck()
    return n ? { at: n.at, ok: n.checks.filter((c) => c.status === "ok").length, lech: n.checks.filter((c) => c.status === "lech").map((c) => ({ company: c.company, name: c.name, diff: c.diff })), loi: n.checks.filter((c) => c.status === "loi").length } : null
  }, null)

  const leadFlows = await safe("Đường lead", async () => {
    const { lastStatuses } = await import("@/lib/monitor/lead-flow")
    return lastStatuses().map((s) => ({ name: s.flow.label || s.flow.id, company: s.flow.company, status: s.status, hoursSinceLead: s.hoursSinceLead }))
  }, [])

  const writes = await safe("Lần ghi", async () => {
    const { readFeedFile } = await import("@/lib/writes/feed")
    const by = new Map<string, { source: string; count: number; undone: number }>()
    for (const e of readFeedFile().filter((e) => inWeek(e.at))) { const k = e.sourceLabel.split(" · ")[0]; const r = by.get(k) ?? { source: k, count: 0, undone: 0 }; r.count++; if (e.undoneAt) r.undone++; by.set(k, r) }
    return [...by.values()]
  }, [])

  const outcomes = await safe("Đo lại", async () => {
    const { readOutcomes } = await import("@/lib/writes/job")
    const { readFeedFile } = await import("@/lib/writes/feed")
    const labels = new Map(readFeedFile().map((e) => [e.id, e.label]))
    const o = { tot: 0, xau: 0, khong_doi: 0, chua_ro: 0, bad: [] as { label: string; note: string }[] }
    for (const r of Object.values(readOutcomes())) {
      if ("skipped" in r || !r.measuredAt || !inWeek(r.measuredAt)) continue
      o[r.verdict]++
      if (r.verdict === "xau") o.bad.push({ label: `${labels.get(r.eventId) ?? r.eventId} (${r.days} ngày)`, note: r.note })
    }
    return o
  }, { tot: 0, xau: 0, khong_doi: 0, chua_ro: 0, bad: [] })

  const inbox = await safe("Hộp việc", async () => {
    const { readSnapshot, readStates, viewItems, isOpen } = await import("@/lib/inbox/store")
    const { caseBoard } = await import("@/lib/case/board")
    const snap = readSnapshot()
    const overdueTasks = caseBoard(companyIds(), now.getTime()).reduce((s, r) => s + r.tasks.overdue, 0)
    if (!snap) return { builtAt: null, open: 0, snoozed: 0, dismissed: 0, top: [], overdueTasks }
    const v = viewItems(snap.items, readStates(), now.getTime())
    const open = v.filter(isOpen)
    return {
      builtAt: snap.builtAt, open: open.length, snoozed: v.filter((i) => i.status === "snoozed").length, dismissed: v.filter((i) => i.status === "dismissed").length,
      top: [...open].sort((a, b) => (b.money ?? -1) - (a.money ?? -1)).slice(0, 3).map((i) => ({ title: i.title, money: i.money, moneyLabel: i.moneyLabel, company: i.company })), overdueTasks,
    }
  }, null)

  const experiments = await safe("Thử nghiệm", async () => {
    const { listExperiments } = await import("@/lib/pmax/geo-experiment")
    const pmax = companyIds().flatMap((co) => listExperiments(co).filter((e) => e.status === "running").map((e) => ({ company: co, label: e.label, weeks: e.weeks, week: Math.floor((now.getTime() - Date.parse(e.start)) / (7 * 864e5)) + 1 })))
    // Đợt 18i: bản tách Search đang đo (2 tuần sau lúc chuyển từ khoá) + kết luận mốc gần nhất.
    const { allSplits } = await import("@/lib/search/split")
    const VL: Record<string, string> = { tot: "Đạt", theo_doi: "Theo dõi", dung: "Nên hoàn tác" }
    const splits = allSplits().filter((r) => r.step === "moved" && r.movedAt).map((r) => {
      const last = r.checkpoints?.["14"] ? `mốc 14 ngày: ${VL[r.checkpoints["14"].verdict]}` : r.checkpoints?.["7"] ? `mốc 7 ngày: ${VL[r.checkpoints["7"].verdict]}` : "chưa tới mốc đo"
      return { company: r.company, label: `Tách "${r.name}" (${last})`, weeks: 2, week: Math.floor((now.getTime() - Date.parse(r.movedAt!)) / (7 * 864e5)) + 1 }
    })
    return [...pmax, ...splits]
  }, [])

  const realOrders = await safe("Đơn thật", async () => {
    const { orderSourceReason } = await import("@/lib/orders/sources")
    const { realOrderSettings } = await import("@/lib/conversions/sync")
    const { readMetaQueue } = await import("@/lib/conversions/meta-capi")
    return companyIds().filter((co) => !orderSourceReason(co)).map((co) => {
      const s = realOrderSettings(co), q = readMetaQueue(co)
      return { company: co, googleOn: !!s.google?.enabled, metaOn: !!s.meta?.enabled, metaSent: q.filter((e) => e.status === "sent" && e.sentAt && inWeek(e.sentAt)).length, metaFailed: q.filter((e) => e.status === "failed").length }
    })
  }, [])

  return { ...wk, weeks, numbersCheck, leadFlows, writes, outcomes, inbox, experiments, realOrders, errors }
}

export const WEEKLY_WEBHOOK_HINT = "Báo cáo tuần KHÔNG gửi Teams vì thiếu biến TEAMS_WEBHOOK_ADS (webhook kênh team Ads). Báo cáo vẫn lưu ở trang Báo cáo tuần."

/** Dựng + lưu + gửi. send=false: chỉ dựng lại (nút trên trang). */
export async function runWeeklyReport(now = new Date(), opts: { send?: boolean } = {}): Promise<WeeklyReport & { sent?: { sent: boolean; notConfigured?: boolean; error?: string } }> {
  const input = await gatherWeeklyInput(now)
  const report = composeWeeklyReport(input, now)
  const withMoney = { ...report, money: input.weeks[0] } as WeeklyReport
  if (opts.send === false) { await saveWeekly(withMoney); return report }
  const { sendTeamsAlert } = await import("@/lib/teams-alert")
  const base = process.env.NEXTAUTH_URL ?? ""
  const res = await sendTeamsAlert({
    title: `📊 Báo cáo tuần Ads — ${report.label}`, level: report.level === "good" ? "good" : report.level === "danger" ? "danger" : "warning",
    facts: [...report.facts, ...(report.errors.length ? [{ title: "Không đọc được", value: report.errors.join(" · ").slice(0, 400) }] : [])],
    action: `Chi tiết từng dòng: ${base}/bao-cao-tuan?week=${report.weekKey}`,
    webhookUrl: process.env.TEAMS_WEBHOOK_ADS ?? "", setupHint: WEEKLY_WEBHOOK_HINT,
  })
  const sent = { at: now.toISOString(), sent: res.sent, ...(res.notConfigured ? { notConfigured: true } : {}), ...(res.error && !res.notConfigured ? { error: res.error } : {}) }
  await saveWeekly(withMoney, sent)
  return { ...report, sent }
}
