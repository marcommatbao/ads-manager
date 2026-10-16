// ============================================================
// 14/10/2026 — "Nên làm gì tiếp" sau khi đo lại phiên xử lý — HÀM THUẦN
// ============================================================
// Trước đây trang phiên chỉ hiện "₫354k → ₫707k ▲ xấu hơn" mà không nói vì sao, cũng không nói làm gì. Hàm này đọc lần đo gần
// nhất (mốc 7/14 ngày hoặc "Kiểm tra ngay") và trả:
//   • kết luận — tôn trọng "chưa đủ dữ liệu" (lib/case/judge.ts): mẫu nhỏ thì KHÔNG khuyên hoàn tác / làm lại;
//   • "vì sao" — so TỈ LỆ (CPC, CTR, tỉ lệ chuyển đổi, tỉ lệ hiển thị…) với lúc mở phiên. Không so số tuyệt đối vì hai kỳ dài
//     khác nhau (lúc mở phiên thường 30 ngày, kỳ đo = từ ngày thực hiện tới hôm nay);
//   • nguyên nhân mới phát sinh — bộ tìm nguyên nhân bước 4 chạy lại trên số kỳ đo (lưu sẵn trong remeasure[].diag);
//   • việc nên làm + nút: Mở lại ở bước 4 (tính lại hướng xử lý cụ thể), Hoàn tác (chỉ khi XẤU HƠN), Kiểm tra ngay.

import type { CampaignCase, RemeasureDiag, RemeasureEntry } from "./store"
import { judgeRemeasure, VERDICT_CODE } from "./judge"
import { metaGoalKind, metaResults } from "./goal-kind"

export type NextVerdict = "improved" | "same" | "worse" | "insufficient"
const CODE: Record<number, NextVerdict> = { 1: "improved", 0: "same", [-1]: "worse", 2: "insufficient" }

export interface WhyRow { label: string; before: string; after: string; change: string | null; tone: "bad" | "good" | "neutral" }
export interface TodoItem { kind: "reopen" | "undo" | "wait" | "check" | "settings" | "info"; text: string; href?: string }
export interface NextStepsView {
  source: { kind: "remeasure" | "check"; at: string; from: string | null; to: string | null } | null
  verdict: NextVerdict | null
  basis: "cpa" | "roas" | "cpl"
  orders: { before: number | null; after: number | null }
  headline: string
  why: WhyRow[]
  newCauses: RemeasureDiag["causes"]
  persistingCauses: RemeasureDiag["causes"]
  todo: TodoItem[]
  undoable: { executionId: string; at: string; summary: string }[]
  canReopen: boolean
  canCheck: boolean
  /** Lần đo không có ảnh chụp chẩn đoán (đo trước 14/10) — chỉ có kết luận, chưa giải thích được "vì sao". */
  missingDiag: boolean
}

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`
const pct1 = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString("vi-VN")}%`
const rel = (a: number | null, b: number | null) => (a !== null && b !== null && b > 0 ? a / b - 1 : null)
const div = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null && b > 0 ? a / b : null)
const signed = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`
/** Thay đổi tương đối đủ lớn để nêu ra (dưới mức này coi như không đổi — tránh liệt kê nhiễu). */
export const WHY_REL = 0.15
/** Thay đổi tỉ lệ hiển thị (điểm phần trăm) đủ lớn để nêu ra. */
export const WHY_PT = 0.05

interface Measured { kind: "remeasure" | "check"; at: string; verdict: number | null; result: Record<string, number | null>; diag: RemeasureDiag | null }

/** Lần đo gần nhất: mốc đo đã xong mới nhất, hoặc "Kiểm tra ngay" nếu mới hơn. */
export function latestMeasure(c: CampaignCase): Measured | null {
  const done = c.remeasure.filter((r) => r.status === "done" && r.result)
  const last = done[done.length - 1]
  const fromRm: Measured | null = last ? { kind: "remeasure", at: last.due, verdict: rejudge(c, last), result: last.result!, diag: last.diag ?? null } : null
  const chk = c.latestCheck
  const fromCheck: Measured | null = chk ? { kind: "check", at: chk.at.slice(0, 10), verdict: rejudge(c, { due: chk.at.slice(0, 10), result: chk.result }), result: chk.result, diag: chk.diag } : null
  if (fromRm && fromCheck) return fromCheck.at >= fromRm.at ? fromCheck : fromRm
  return fromRm ?? fromCheck
}
const num = (v: unknown) => (typeof v === "number" ? v : null)

/** 14/10: chấm LẠI một lần đo đã lưu theo luật hiện hành (lib/case/judge.ts) — lần đo trước 14/10 lưu "xấu hơn" dù chỉ vài đơn.
 *  Cần đủ cost + orders trong result và bằng chứng lúc mở phiên. Lần đo của vòng TRƯỚC khi mở lại (mốc so sánh đã đổi) → giữ kết
 *  luận đã lưu. Hàm thuần. */
export function rejudge(c: CampaignCase, r: Pick<RemeasureEntry, "due" | "result">): number | null {
  const res = r.result
  const stored = num(res?.verdict)
  const ev = c.evidence
  if (!res || !ev || typeof res.cost !== "number" || typeof res.orders !== "number") return stored
  if (c.reopenedAt && r.due < c.reopenedAt.slice(0, 10)) return stored
  const before = ev.kind === "meta"
    ? { cost: ev.campaign.cost, orders: metaResults(ev.campaign, metaGoalKind(ev.campaign.objective)), value: res.leads ? 0 : ev.campaign.purchaseValue }
    : { cost: ev.campaign.cost, orders: ev.campaign.orders, value: ev.campaign.orderValue ?? 0 }
  const after = { cost: res.cost, orders: res.orders, value: res.orderValue ?? 0 }
  const goal = c.goal ? { basis: c.goal.basis, target: c.goal.target, ceiling: c.goal.ceiling } : null
  return VERDICT_CODE[judgeRemeasure(goal, before, after).verdict]
}

function executionSummary(e: CampaignCase["executions"][number]): string {
  const parts: string[] = []
  if (e.created.length) parts.push(`thêm ${e.created.length} mục`)
  if (e.removed.length) parts.push(`gỡ ${e.removed.length} mục`)
  if (e.paused.length) parts.push(`tạm dừng ${e.paused.length} chiến dịch`)
  if (e.sharedCreated?.length) parts.push(`tạo ${e.sharedCreated.length} danh sách phủ định`)
  if (e.attached?.length) parts.push(`gắn ${e.attached.length} danh sách`)
  if (e.metaChanges?.length) parts.push(`${e.metaChanges.length} thay đổi trên Meta`)
  return parts.join(", ") || "thay đổi đã thực hiện"
}

/** Bảng "vì sao": tỉ lệ lúc mở phiên → kỳ đo. Chỉ nêu dòng đổi đủ lớn. */
export function whyRows(c: CampaignCase, m: Measured): WhyRow[] {
  const ev = c.evidence
  const f = m.diag?.facts
  if (!ev || !f) return []
  const out: WhyRow[] = []
  const push = (label: string, b: number | null, a: number | null, fmt: (x: number) => string, badWhenUp: boolean, mode: "rel" | "pt" = "rel") => {
    if (b === null || a === null) return
    const change = mode === "rel" ? rel(a, b) : a - b
    if (change === null || Math.abs(change) < (mode === "rel" ? WHY_REL : WHY_PT)) return
    const bad = badWhenUp ? change > 0 : change < 0
    out.push({ label, before: fmt(b), after: fmt(a), change: mode === "rel" ? signed(change) : `${change > 0 ? "+" : ""}${Math.round(change * 100)} điểm`, tone: bad ? "bad" : "good" })
  }
  const cost = m.result.cost ?? f.cost ?? null
  if (ev.kind === "meta") {
    const b = ev.campaign
    push("Chi phí mỗi 1.000 lượt hiển thị", div(b.cost * 1000, b.impressions), div((cost ?? 0) * 1000, f.impressions), vnd, true)
    push("Tỉ lệ bấm vào liên kết", div(b.linkClicks || b.clicks, b.impressions), div(f.linkClicks || f.clicks, f.impressions), pct1, false)
    push("Tỉ lệ vào được trang sau khi bấm", div(b.landingViews, b.linkClicks), div(f.landingViews, f.linkClicks), pct1, false)
    push("Tần suất (lần thấy / người)", b.frequency, f.frequency ?? null, (x) => x.toFixed(1), true)
    return out
  }
  const b = ev.campaign
  push("Giá mỗi lượt bấm (CPC)", div(b.cost, b.clicks), div(cost, f.clicks), vnd, true)
  push("Tỉ lệ bấm (CTR)", div(b.clicks, b.impressions), div(f.clicks, f.impressions), pct1, false)
  push("Tỉ lệ chuyển đổi (đơn / lượt bấm)", div(b.orders, b.clicks), div(m.result.orders ?? f.orders, f.clicks), pct1, false)
  push("Tỉ lệ hiển thị giành được", b.impressionShare, f.impressionShare ?? null, pct1, false, "pt")
  push("Mất hiển thị do THỨ HẠNG", b.lostIsRank, f.lostIsRank ?? null, pct1, true, "pt")
  push("Mất hiển thị do NGÂN SÁCH", b.lostIsBudget, f.lostIsBudget ?? null, pct1, true, "pt")
  return out
}

export function nextSteps(c: CampaignCase): NextStepsView {
  const basis = c.goal?.basis ?? "cpa"
  const m = latestMeasure(c)
  const liveExec = c.executions.filter((e) => e.status === "done" && !e.undoneAt && e.mode !== "validate")
  const base: NextStepsView = {
    source: null, verdict: null, basis, orders: { before: null, after: null }, headline: "", why: [], newCauses: [], persistingCauses: [],
    todo: [], undoable: [], canReopen: false, canCheck: liveExec.length > 0, missingDiag: false,
  }
  if (!m) return { ...base, headline: liveExec.length ? "Chưa tới mốc đo lại." : "Phiên chưa thực hiện thay đổi nào." }

  const verdict = m.verdict !== null ? CODE[m.verdict] ?? null : null
  const ev = c.evidence
  const ordersBefore = ev ? (ev.kind === "meta" ? (ev.campaign.leads && basis === "cpl" ? ev.campaign.leads : ev.campaign.purchases) : ev.campaign.orders) : null
  const ordersAfter = m.result.orders ?? null
  const unit = basis === "cpl" ? "lead" : "đơn"
  const why = whyRows(c, m)
  const known = new Set((c.diagnosis?.causes ?? []).map((x) => x.id))
  const causes = m.diag?.causes ?? []
  const view: NextStepsView = {
    ...base,
    source: { kind: m.kind, at: m.at, from: m.diag?.from ?? null, to: m.diag?.to ?? null },
    verdict, orders: { before: ordersBefore, after: ordersAfter }, why,
    newCauses: causes.filter((x) => !known.has(x.id)),
    persistingCauses: causes.filter((x) => known.has(x.id)),
    missingDiag: !m.diag,
  }
  const todo: TodoItem[] = []

  if (verdict === "improved") {
    view.headline = "Đang tốt lên so với lúc mở phiên — giữ nguyên các thay đổi, chờ mốc đo tiếp."
    view.todo = todo
    return view
  }
  if (verdict === "insufficient") {
    const extensionsLeft = c.remeasure.some((r) => r.status === "pending")
    view.headline = `Chưa đủ dữ liệu để kết luận: kỳ đo chỉ có ${ordersAfter ?? 0} ${unit}. Thêm hoặc bớt 1 ${unit} là chi phí/${unit} đã đổi rất nhiều.`
    todo.push({ kind: "wait", text: extensionsLeft
      ? `Chưa nên hoàn tác hay làm lại phiên. Tool tự đo thêm ở mốc kế tiếp để có đủ ${unit}.`
      : `Đã đo thêm mà chiến dịch vẫn quá ít ${unit} để đo theo chi phí/${unit}. Cân nhắc gộp với chiến dịch cùng sản phẩm, hoặc theo dõi theo lượt bấm / tỉ lệ chuyển đổi bên dưới.` })
    for (const w of why.filter((x) => x.tone === "bad")) todo.push({ kind: "info", text: `Đáng để ý: ${w.label.toLowerCase()} ${w.before} → ${w.after} (${w.change}).` })
    view.todo = todo
    return view
  }

  // worse / same (hoặc lần đo cũ không có kết luận)
  view.headline = verdict === "worse"
    ? `Kết quả XẤU HƠN lúc mở phiên (${ordersBefore ?? "?"} → ${ordersAfter ?? "?"} ${unit} trong hai kỳ).`
    : verdict === "same"
      ? "Chưa thấy cải thiện rõ (thay đổi dưới 10% và chưa về mục tiêu)."
      : "Lần đo này chưa có kết luận."
  if (!m.diag) {
    todo.push({ kind: "check", text: "Lần đo này làm trước khi tool lưu chẩn đoán — bấm “Kiểm tra ngay” để biết vì sao và nên sửa gì." })
  }
  const byLabel = (s: string) => why.find((w) => w.label.startsWith(s) && w.tone === "bad")
  if (ev?.kind !== "meta") {
    const cvr = byLabel("Tỉ lệ chuyển đổi"), cpc = byLabel("Giá mỗi lượt bấm"), ctr = byLabel("Tỉ lệ bấm"), rank = byLabel("Mất hiển thị do THỨ HẠNG"), budget = byLabel("Mất hiển thị do NGÂN SÁCH")
    if (cvr) todo.push({ kind: "info", text: `Tỉ lệ chuyển đổi giảm (${cvr.before} → ${cvr.after}): kiểm trang đích (tốc độ tải, form, giá hiển thị), kiểm thẻ đo chuyển đổi còn ghi nhận đơn, và xem từ khoá tìm kiếm mới phát sinh khi mở lại phiên.` })
    if (cpc) {
      const bid = ev?.kind === "google_search" || ev?.kind === "google_pmax" ? ev.campaign : null
      const bidNote = bid?.biddingType === "TARGET_CPA" && bid.targetCpa ? ` Chiến dịch đang đặt giá theo CPA mục tiêu ${vnd(bid.targetCpa)} — nếu cao hơn trần ${c.goal ? vnd(c.goal.ceiling) : ""}, hạ về sát trần.` : ""
      todo.push({ kind: "info", text: `Giá mỗi lượt bấm tăng (${cpc.before} → ${cpc.after}): cạnh tranh tăng hoặc giá thầu bị đẩy lên.${bidNote}` })
    }
    if (rank) todo.push({ kind: "info", text: `Mất hiển thị do thứ hạng tăng (${rank.before} → ${rank.after}): cải thiện độ khớp từ khoá – quảng cáo – trang đích (điểm chất lượng); tăng ngân sách KHÔNG giải quyết được.` })
    if (ctr) todo.push({ kind: "info", text: `Tỉ lệ bấm giảm (${ctr.before} → ${ctr.after}): làm mới tiêu đề / mô tả quảng cáo cho sát ý định tìm kiếm.` })
    if (budget) todo.push({ kind: "info", text: `Bị giới hạn ngân sách nhiều hơn (${budget.before} → ${budget.after}), nhưng chi phí/${unit} đang xấu đi — chưa nên tăng ngân sách, cắt từ khoá kém trước.` })
  } else {
    const freq = byLabel("Tần suất"), land = byLabel("Tỉ lệ vào được trang"), cpm = byLabel("Chi phí mỗi 1.000"), ctr = byLabel("Tỉ lệ bấm")
    if (freq) todo.push({ kind: "info", text: `Tần suất tăng (${freq.before} → ${freq.after}): một nhóm người đang thấy quảng cáo quá nhiều lần — làm mới mẫu quảng cáo hoặc mở rộng tệp.` })
    if (ctr) todo.push({ kind: "info", text: `Tỉ lệ bấm giảm (${ctr.before} → ${ctr.after}): mẫu quảng cáo đang nhàm — thay hình / video / câu mở đầu.` })
    if (land) todo.push({ kind: "info", text: `Ít người vào được trang sau khi bấm (${land.before} → ${land.after}): trang tải chậm hoặc liên kết lỗi — kiểm trên điện thoại.` })
    if (cpm) todo.push({ kind: "info", text: `Chi phí hiển thị tăng (${cpm.before} → ${cpm.after}): cạnh tranh / mùa vụ — so với các chiến dịch khác cùng kỳ trước khi kết luận do thay đổi của phiên.` })
  }
  for (const x of view.newCauses.slice(0, 4)) todo.push({ kind: "info", text: `Phát sinh mới: ${x.title}${x.money ? ` (~${vnd(x.money)})` : ""}.` })
  if (!why.some((w) => w.tone === "bad") && !view.newCauses.length && m.diag) {
    todo.push({ kind: "info", text: "Các tỉ lệ chính không đổi đáng kể — chênh lệch chủ yếu do số đơn ít hoặc mùa vụ. So với các chiến dịch khác cùng kỳ trước khi đổi tiếp." })
  }
  todo.push({ kind: "reopen", text: "Mở lại phiên ở bước 4: tool thu số 30 ngày gần nhất, tính lại nguyên nhân và đề xuất việc cụ thể (phủ định nào, tạm dừng gì…) — chưa ghi gì lên tài khoản cho tới khi bạn duyệt." })
  view.canReopen = !!c.goal && c.status !== "reopened"
  if (verdict === "worse") {
    view.undoable = liveExec.map((e) => ({ executionId: e.id, at: e.at.slice(0, 10), summary: executionSummary(e) }))
    if (view.undoable.length) todo.push({ kind: "undo", text: "Nếu chắc thay đổi của phiên làm xấu đi: hoàn tác để trả tài khoản về như trước (từng lần thực hiện)." })
  }
  if (c.goal && verdict === "same") todo.push({ kind: "settings", text: "Nếu mục tiêu quá chặt so với thị trường, xem lại trần chi phí ở trang Mục tiêu.", href: "/xu-ly/muc-tieu" })
  view.todo = todo
  return view
}
