// ============================================================
// Tình trạng & cảnh báo (Đợt 5) — gộp phát hiện của Đợt 1–4 vào MỘT chỗ
// ============================================================
// Trang Tổng quan cũ chỉ có chi phí + Odoo; mọi phát hiện nằm rải ở /xu-ly,
// /do-luong, /xu-ly/theo-doi. Ở đây KHÔNG gọi API mới — chỉ gọi lại các hàm có
// sẵn (mỗi hàm có đệm 10–30 phút riêng), mỗi nguồn chạy độc lập: nguồn hỏng →
// thẻ đó "không đọc được", thẻ khác vẫn hiện, không bao giờ hiện số cũ như mới.
//
// Thứ tự "Sửa gì trước": (a) đo lường chặn mọi thứ khác → (b) tiền chi vượt
// trần → (c) việc giao người quá hạn. Số đo sai thì mọi kết luận về tiền sai theo.

import { caseBoard, remindersEnabled } from "@/lib/case/board"
import { googleOverview, metaOverview, type OverviewRow } from "@/lib/case/service"
import { lastDays } from "@/lib/case/dates"
import type { Company } from "@/lib/case/types"
import { metaHealth, type MetaHealth } from "@/lib/measure/meta-health"
import { tagDoctor, type TagDoctorReport } from "@/lib/measure/tag-doctor"
import { lastStatuses, type LeadFlowStatus } from "@/lib/monitor/lead-flow"
import { pmaxXray, type PmaxXray } from "@/lib/pmax/xray"

export type CardTone = "ok" | "warn" | "bad" | "unknown"
export interface StatusCard { id: string; title: string; tone: CardTone; text: string; href: string; error?: string }
export interface FixItem {
  id: string; rank: "measurement" | "money" | "overdue"; company: Company
  title: string; why: string; suggestion: string; href: string; hrefLabel: string; money?: number
}
export interface HealthOverview {
  companies: Company[]; generatedAt: string; cards: StatusCard[]; fixes: FixItem[]; notes: string[]
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: string }
const settle = async <T,>(p: Promise<T>): Promise<Settled<T>> => {
  try { return { ok: true, value: await p } } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}
const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`
const worst = (ts: CardTone[]): CardTone => (ts.includes("bad") ? "bad" : ts.includes("warn") ? "warn" : ts.includes("unknown") ? "unknown" : "ok")

/** Hàm thuần: kết quả từng nguồn → thẻ + danh sách ưu tiên + lưu ý. */
export function buildHealthOverview(input: {
  companies: Company[]
  meta: Record<string, Settled<MetaHealth>>
  tags: Record<string, Settled<TagDoctorReport>>
  campaigns: Record<string, Settled<OverviewRow[]>>
  board: Settled<ReturnType<typeof caseBoard>>
  remindersOn: boolean
  /** Đợt 9 · 1 — kết quả lần canh đường lead gần nhất (job lead_flow_watch). */
  leadFlows?: LeadFlowStatus[]
  /** Đợt 10a — PMax X-quang 30 ngày theo công ty. */
  pmax?: Record<string, Settled<PmaxXray>>
  now?: Date
}): HealthOverview {
  const cards: StatusCard[] = []
  const fixes: FixItem[] = []
  const notes: string[] = []
  const cos = input.companies

  // ── PMax: kênh ăn tiền nhờ đơn sau lượt xem, ăn lượt tìm thương hiệu ──
  if (input.pmax) {
    const parts: string[] = [], tones: CardTone[] = []
    let err: string | undefined
    for (const co of cos) {
      const r = input.pmax[co]
      if (!r) continue
      if (!r.ok) { tones.push("unknown"); err = r.error; continue }
      const x = r.value
      if (!x.account.totals.cost) continue
      const bad = x.account.warnings.filter((w) => w.level === "bad")
      const brand = x.cannibalization.pmaxClicks >= 30 ? x.cannibalization.brandShare : 0
      tones.push(bad.length ? "bad" : brand >= 0.4 ? "warn" : "ok")
      parts.push(`${co}: chi ₫${Math.round(x.account.totals.cost).toLocaleString("vi-VN")} · ${Math.round(x.account.totals.convClick)} đơn từ lượt bấm, ${Math.round(x.account.totals.convEngaged)} sau lượt xem${brand >= 0.4 ? ` · ${Math.round(brand * 100)}% lượt bấm tìm kiếm là tìm thương hiệu` : ""}`)
      for (const w of bad) fixes.push({
        id: `pmax_${co}_${w.id}`, rank: "money", company: co, money: 0,
        title: `${co} · PMax: ${w.text.split(";")[0]}`, why: w.text,
        suggestion: "Xem PMax X-quang; đo tăng thật bằng thí nghiệm trước khi đổi cách tính đơn (Đợt 10c).",
        href: "/google-pmax?tab=xray", hrefLabel: "Mở PMax X-quang",
      })
    }
    if (parts.length || err) cards.push({ id: "pmax", title: "PMax", tone: worst(tones.length ? tones : ["unknown"]), text: parts.join(" · ") || "Không đọc được", href: "/google-pmax?tab=xray", error: err })
  }

  // ── Đường lead: form trên web ↔ lead trong CRM ──
  {
    const flows = (input.leadFlows ?? []).filter((f) => cos.includes(f.flow.company))
    if (flows.length) {
      const tone = worst(flows.map((f) => (f.status === "broken" ? "bad" : f.status === "error" ? "unknown" : "ok")))
      cards.push({ id: "leads", title: "Đường lead", tone, href: "/?tab=health#duong-lead",
        text: flows.map((f) => `${f.flow.label}: ${f.status === "broken" ? "✕ " : f.status === "error" ? "? " : "✓ "}${f.message}`).join(" · ") })
      for (const f of flows.filter((x) => x.status === "broken")) fixes.push({
        id: `lead_flow_${f.flow.id}`, rank: "measurement", company: f.flow.company,
        title: `Lead có thể đang mất — ${f.flow.label}`,
        why: f.message, suggestion: "Báo đội web/CRM kiểm đường gửi form → CRM ngay và lấy lại các lượt gửi form từ lúc đứt.",
        href: "/?tab=health#duong-lead", hrefLabel: "Xem đường lead",
      })
    }
  }

  // ── Đo lường Meta ──
  {
    const parts: string[] = [], tones: CardTone[] = []
    let err: string | undefined
    for (const co of cos) {
      const m = input.meta[co]
      if (!m?.ok) { tones.push("unknown"); err = m?.error; parts.push(`${co}: không đọc được`); continue }
      const probs = m.value.products.flatMap((p) => p.optEvents.map((e) => ({ p, e }))).filter(({ e }) => e.status === "dead" || e.status === "low" || e.allFail || e.adsLow)
      const landing = m.value.landing.filter((l) => l.flagged).length
      const nv = m.value.noValue.length
      tones.push(probs.length || nv ? "bad" : landing ? "warn" : "ok")
      parts.push(`${co}: ${probs.length} sự kiện tối ưu có vấn đề · ${nv} chiến dịch lượt mua ₫0 · ${landing} chiến dịch click→trang < 30%`)
      for (const { p, e } of probs.slice(0, 3)) {
        fixes.push({
          id: `meta_opt_${co}_${p.group}_${e.label}`, rank: "measurement", company: co,
          title: `${co} · ${p.label}: nhóm quảng cáo tối ưu theo “${e.label}”${e.custom ? " (tự đặt)" : ""} — Meta chỉ tính ${e.adsAttributed} lượt từ quảng cáo`,
          why: "Meta không có đủ tín hiệu để học → phân phối gần như mò, mọi con số chi phí/đơn đều kém tin cậy.",
          suggestion: e.custom ? "Tạo nhóm mới tối ưu theo sự kiện CHUẨN đủ số (mở phiên xử lý → bước 5 “Tạo nhóm mới”)." : "Gộp nhóm/chiến dịch để đủ ~50 sự kiện/tuần, hoặc tạo nhóm mới theo sự kiện chuẩn sâu nhất đủ số.",
          href: "/xu-ly", hrefLabel: "Mở phiên xử lý",
        })
      }
      if (m.value.links.postUnreadable > 0) notes.push(`${co}: ${m.value.links.postUnreadable} quảng cáo bài viết chưa đọc được link — Trang chưa có token (Cài đặt → Kết nối → Trang Facebook).`)
    }
    cards.push({ id: "meta", title: "Đo lường Meta", tone: worst(tones), text: parts.join(" · "), href: "/do-luong", error: err })
  }

  // ── Đo lường Google + Gắn thẻ (cùng nguồn Chẩn đoán gắn thẻ) ──
  {
    const gParts: string[] = [], gTones: CardTone[] = [], tParts: string[] = [], tTones: CardTone[] = []
    let err: string | undefined
    for (const co of cos) {
      const t = input.tags[co]
      if (!t?.ok) { gTones.push("unknown"); tTones.push("unknown"); err = t?.error; gParts.push(`${co}: không đọc được`); tParts.push(`${co}: không đọc được`); continue }
      const gIssues = t.value.issues.filter((i) => i.platform === "google")
      const tIssues = t.value.issues.filter((i) => i.platform !== "google")
      gTones.push(gIssues.some((i) => i.severity === "bad") ? "bad" : gIssues.length ? "warn" : "ok")
      tTones.push(tIssues.some((i) => i.severity === "bad") ? "bad" : tIssues.length ? "warn" : "ok")
      gParts.push(gIssues.length ? `${co}: ${gIssues[0].title}` : `${co}: ✓ không có lỗi`)
      tParts.push(tIssues.length ? `${co}: ${tIssues.length} vấn đề (${tIssues.filter((i) => i.severity === "bad").length} nghiêm trọng)` : `${co}: ✓ sạch`)
      // Google: sửa trigger/hành động chính TRƯỚC, đổi mục tiêu SAU.
      const silent = gIssues.filter((i) => i.id.startsWith("google_primary_silent_"))
      const goal = gIssues.find((i) => i.id === "google_goal_not_purchase")
      for (const i of silent) fixes.push({ id: `${co}_${i.id}`, rank: "measurement", company: co, title: `${co} · ${i.title}`, why: "Hành động Mua hàng chính không ghi nhận → Google không có tín hiệu đơn thật.", suggestion: i.steps[0] ?? i.detail, href: "/do-luong?tab=tags", hrefLabel: "Chẩn đoán gắn thẻ" })
      if (goal) fixes.push({
        id: `${co}_${goal.id}`, rank: "measurement", company: co, title: `${co} · ${goal.title}`,
        why: "Mọi chiến dịch dùng mục tiêu tài khoản đang tối ưu để có người thêm giỏ/bắt đầu thanh toán, không phải người mua.",
        suggestion: silent.length ? "Sửa lỗi hành động Mua hàng chính ở trên TRƯỚC; khi có số ổn định ≥ 7 ngày mới đổi mục tiêu (nút Sửa trên Google)." : "Đổi mục tiêu đặt giá sang Mua hàng (nút Sửa trên Google, có Kiểm trước và hoàn tác).",
        href: "/do-luong?tab=tags", hrefLabel: "Sửa trên Google",
      })
      for (const i of tIssues.filter((x) => x.severity === "bad").slice(0, 2)) fixes.push({ id: `${co}_${i.id}`, rank: "measurement", company: co, title: `${co} · ${i.title}`, why: i.detail, suggestion: i.steps[0] ?? "", href: "/do-luong?tab=tags", hrefLabel: "Chẩn đoán gắn thẻ" })
    }
    cards.push({ id: "google", title: "Đo lường Google", tone: worst(gTones), text: gParts.join(" · "), href: "/do-luong?tab=google", error: err })
    cards.push({ id: "tags", title: "Gắn thẻ", tone: worst(tTones), text: tParts.join(" · "), href: "/do-luong?tab=tags", error: err })
  }

  // ── Chiến dịch (Google + Facebook, chấm theo mục tiêu sản phẩm) ──
  {
    const tones: CardTone[] = [], parts: string[] = []
    let err: string | undefined
    const reds: (OverviewRow & { company: Company; platform: string })[] = []
    let judged = 0, noTarget = 0
    for (const co of cos) for (const pf of ["google", "facebook"]) {
      const r = input.campaigns[`${co}|${pf}`]
      if (!r?.ok) { tones.push("unknown"); err = r?.error; parts.push(`${co} ${pf === "google" ? "Google" : "Facebook"}: không đọc được`); continue }
      const red = r.value.filter((x) => x.verdict.status === "red")
      noTarget += r.value.filter((x) => x.verdict.status === "no_target").length
      judged += r.value.filter((x) => x.verdict.status !== "no_target").length
      reds.push(...red.map((x) => ({ ...x, company: co, platform: pf })))
      tones.push(red.length ? "bad" : r.value.some((x) => x.verdict.status === "amber") ? "warn" : "ok")
    }
    const over = reds.reduce((s, x) => s + (x.verdict.overCeiling ?? 0), 0)
    // Chưa đặt mục tiêu sản phẩm = KHÔNG chấm được — báo "ổn" lúc đó là sai (đo 27/09: prod chưa nhập mục tiêu).
    if (noTarget) tones.push("warn") // đọc được, chỉ là chưa có mục tiêu để chấm — không phải "không đọc được"
    parts.unshift(reds.length ? `${reds.length} chiến dịch vượt trần · chi vượt ${vnd(over)} (30 ngày)`
      : judged ? "Không chiến dịch nào vượt trần (30 ngày)" : "Chưa chấm được — chưa đặt mục tiêu sản phẩm")
    if (noTarget) parts.push(`${noTarget} chiến dịch chưa có mục tiêu sản phẩm`)
    cards.push({ id: "campaigns", title: "Chiến dịch", tone: worst(tones), text: parts.join(" · "), href: noTarget && !judged ? "/xu-ly/muc-tieu" : "/xu-ly", error: err })
    if (noTarget) fixes.push({
      id: "set_targets", rank: "money", company: cos[0], money: 0,
      title: `${noTarget} chiến dịch chưa có mục tiêu sản phẩm (chi phí/đơn hoặc ROAS)`,
      why: "Không có mục tiêu thì tool không biết chiến dịch nào đang chi vượt — mọi thẻ “vượt trần” đều trống.",
      suggestion: "Nhập mục tiêu + trần cho từng nhóm sản phẩm (cần quyền sửa ngưỡng).", href: "/xu-ly/muc-tieu", hrefLabel: "Đặt mục tiêu",
    })
    for (const x of reds.sort((a, b) => (b.verdict.overCeiling ?? 0) - (a.verdict.overCeiling ?? 0)).slice(0, 5)) {
      fixes.push({
        id: `money_${x.platform}_${x.campaignId}`, rank: "money", company: x.company, money: x.verdict.overCeiling ?? 0,
        title: `${x.company} · ${x.platform === "google" ? "Google" : "Facebook"} · ${x.name}`,
        why: `${x.verdict.label} — chi vượt ${vnd(x.verdict.overCeiling ?? 0)} trong 30 ngày.`,
        suggestion: x.latestCase ? "Tiếp tục phiên xử lý đang mở." : "Mở phiên xử lý để xem nguyên nhân và việc tool làm được.",
        href: x.latestCase ? `/xu-ly/${x.latestCase.id}` : "/xu-ly", hrefLabel: x.latestCase ? "Mở phiên" : "Tổng quan xử lý",
      })
    }
  }

  // ── Phiên xử lý ──
  if (!input.board.ok) cards.push({ id: "cases", title: "Phiên xử lý", tone: "unknown", text: "Không đọc được", href: "/xu-ly/theo-doi", error: input.board.error })
  else {
    const rows = input.board.value
    const n = (s: string) => rows.filter((r) => r.state === s).length
    const overdue = rows.reduce((s, r) => s + r.tasks.overdue, 0)
    const pending = rows.flatMap((r) => r.remeasure.filter((m) => m && !m.done).map((m) => m!.due)).sort()
    cards.push({
      id: "cases", title: "Phiên xử lý", tone: n("reopened") || overdue ? "warn" : "ok", href: "/xu-ly/theo-doi",
      text: `${n("working")} đang xử lý · ${n("waiting")} chờ đo lại${pending.length ? ` (gần nhất ${pending[0]})` : ""} · ${n("reopened")} mở lại · ${overdue} việc quá hạn`,
    })
    for (const r of rows.filter((x) => x.tasks.overdue > 0)) {
      fixes.push({ id: `overdue_${r.id}`, rank: "overdue", company: r.company, title: `${r.company} · ${r.campaignName}: ${r.tasks.overdue} việc giao người quá 3 ngày`, why: "Việc ngoài khả năng của tool chưa ai làm → nguyên nhân vẫn còn.", suggestion: "Giao người / đánh dấu xong trong phiên.", href: `/xu-ly/${r.id}`, hrefLabel: "Mở phiên" })
    }
  }

  // ── Lưu ý khi đọc số (không phải lỗi) ──
  notes.unshift(
    "Chiến dịch Facebook chấm theo số Meta tự báo — Meta thường báo cao hơn Odoo nhiều lần.",
    "Odoo không lưu utm_source và utm_campaign dùng chung giữa Facebook và Google → doanh thu theo thẻ không tách được theo nền tảng.",
  )
  notes.push(input.remindersOn ? "Nhắc việc giao người quá 3 ngày qua Microsoft Teams: ĐANG BẬT." : "Nhắc việc qua Microsoft Teams: CHƯA BẬT (đặt CASE_TASK_TEAMS_WEBHOOK).")

  const order = { measurement: 0, money: 1, overdue: 2 }
  fixes.sort((a, b) => order[a.rank] - order[b.rank] || (b.money ?? 0) - (a.money ?? 0))
  return { companies: cos, generatedAt: (input.now ?? new Date()).toISOString(), cards, fixes, notes }
}

export async function healthOverview(companies: Company[], opts: { force?: boolean } = {}): Promise<HealthOverview> {
  const range = lastDays(30)
  const meta: Record<string, Settled<MetaHealth>> = {}, tags: Record<string, Settled<TagDoctorReport>> = {}, campaigns: Record<string, Settled<OverviewRow[]>> = {}
  // Tuần tự theo công ty để không nện hạn mức Meta cùng lúc; trong một công ty chạy song song.
  for (const co of companies) {
    const [m, t, g, f] = await Promise.all([
      settle(metaHealth(co, { force: opts.force })), settle(tagDoctor(co, { force: opts.force })),
      settle(googleOverview(co, range).then((r) => r.rows)), settle(metaOverview(co, range).then((r) => r.rows)),
    ])
    meta[co] = m; tags[co] = t; campaigns[`${co}|google`] = g; campaigns[`${co}|facebook`] = f
  }
  const board = await settle(Promise.resolve(caseBoard(companies)))
  const pmax: Record<string, Settled<PmaxXray>> = {}
  for (const co of companies) pmax[co] = await settle(pmaxXray(co, lastDays(30)))
  return buildHealthOverview({ companies, meta, tags, campaigns, board, remindersOn: remindersEnabled(), leadFlows: lastStatuses(), pmax })
}
