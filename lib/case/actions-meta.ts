// ============================================================
// Bước 5 (Facebook) — từ nguyên nhân ra việc cụ thể
// ============================================================
// Việc tool ghi được (user chốt 27/09): dừng chiến dịch, đổi ngân sách chiến
// dịch, dừng nhóm quảng cáo, loại vị trí hiển thị. KHÔNG việc nào chọn sẵn:
// dừng là cắt phân phối, còn đổi vị trí/đổi ngân sách lớn làm Meta RESET giai
// đoạn học — người duyệt phải tự tick khi đã đọc cảnh báo.
// Đổi sự kiện tối ưu KHÔNG có nút: Meta không cho sửa sự kiện của nhóm đã chạy,
// phải tạo nhóm mới → việc giao người.

import { bestLearnableEvent, EVENTS_PER_WEEK_TO_LEARN, judgePlacements } from "./causes-meta"
import { UNWRITABLE_TARGETING_KEYS } from "./meta-placements"
import { proposeCreateAdset } from "./meta-new-adset"
import { metaGoalKind, metaResults } from "./goal-kind"
import type { CaseAction, ManualTask } from "./store"
import type { Diagnosis, MetaEvidence } from "./types"
import { ROAS_MIN_SPEND_TO_JUDGE, type CaseTarget, type Verdict } from "./verdict"

let seq = 0
const aid = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`
/** Một lần loại vị trí dời tối đa ngần này chi phí của nhóm (quy ước của tool). */
export const MAX_EXCLUDED_SHARE = 0.5

const dec = (x: number) => x.toLocaleString("vi-VN", { maximumFractionDigits: 1 })
const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`

/** Ngân sách mới giữ chi tiêu ở mức trần: hệ số kẹp 50%–90% (không cắt quá nửa một lần), làm tròn nghìn. */
export function budgetToCeiling(ev: MetaEvidence, goal: CaseTarget): { after: number; ratio: number } | null {
  const c = ev.campaign
  if (!c.dailyBudget || c.cost <= 0) return null
  // cpl (Đợt 23 · 3d): như cpa nhưng nhân với số lead.
  const allowed = goal.basis === "roas" ? c.purchaseValue / goal.ceiling : goal.ceiling * metaResults(c, goal.basis === "cpl" ? "leads" : "sales")
  if (allowed <= 0) return null
  const ratio = Math.min(0.9, Math.max(0.5, allowed / c.cost))
  return { after: Math.round((c.dailyBudget * ratio) / 1000) * 1000, ratio }
}

export function proposeMetaActions(input: {
  evidence: MetaEvidence
  diagnosis: Diagnosis
  verdict: Verdict
  goal: CaseTarget
}): { actions: CaseAction[]; manualTasks: Omit<ManualTask, "id" | "createdAt">[] } {
  const { evidence: ev, diagnosis: dx, verdict, goal } = input
  const c = ev.campaign
  const has = (id: string) => dx.causes.some((x) => x.id === id)
  const actions: CaseAction[] = []
  const manualTasks: Omit<ManualTask, "id" | "createdAt">[] = []
  const campaignActive = c.status === "ACTIVE"
  // Đợt 23 (3d): chiến dịch thu lead — "kết quả" là lead; không tự dựng nhóm sự kiện mua hàng, không việc Odoo.
  const kind = metaGoalKind(c.objective)
  const leads = kind === "leads"
  const results = metaResults(c, kind)
  const resultWord = leads ? "lead" : "lượt mua"

  // Dừng nhóm quảng cáo: đã chi đủ để kết luận mà 0 đơn, và còn nhóm khác chạy tiếp.
  const judgeSpend = goal.basis === "roas" ? ROAS_MIN_SPEND_TO_JUDGE : goal.ceiling
  const active = ev.adsets.filter((a) => a.status === "ACTIVE" && a.cost > 0)
  const pausedAdsets = new Set<string>()
  const dead = active.filter((a) => metaResults(a, kind) === 0 && a.cost >= judgeSpend)
  if (dead.length && dead.length < active.length) {
    for (const a of dead) {
      pausedAdsets.add(a.id)
      actions.push({
        id: aid("pauseadset"), type: "PAUSE_ADSET", selected: false, adsetId: a.id, adsetName: a.name,
        reason: `Chi ${vnd(a.cost)} (≥ ${vnd(judgeSpend)}) mà 0 ${resultWord}; ${active.length - dead.length} nhóm khác vẫn chạy`,
        label: `Dừng nhóm quảng cáo “${a.name}”`,
      })
    }
  }

  // Loại vị trí đắt khỏi từng nhóm đang chạy nó (bỏ qua nhóm đã đề xuất dừng).
  if (has("placement-waste")) {
    const pl = judgePlacements(ev)
    const bad = pl.rows.filter((r) => r.flagged)
    const oversized: string[] = []
    for (const a of active) {
      if (pausedAdsets.has(a.id)) continue
      // Tệ nhất trước; dừng khi phần chi bị dời đi vượt trần — loại quá nhiều
      // thì thực chất là đổi cả nhóm, nên chọn "dừng nhóm" hoặc dựng nhóm mới.
      const costHere = (key: string) => ev.placements.filter((p) => p.adsetId === a.id && p.key === key).reduce((s, p) => s + p.cost, 0)
      const ranked = bad.filter((r) => r.adsetIds.includes(a.id))
        .sort((x, y) => (y.costPerResult ?? Infinity) - (x.costPerResult ?? Infinity) || y.cost - x.cost)
      if (!ranked.length) continue
      const mine: typeof ranked = []
      let moved = 0
      for (const r of ranked) {
        if (a.cost > 0 && (moved + costHere(r.key)) / a.cost > MAX_EXCLUDED_SHARE) break
        mine.push(r)
        moved += costHere(r.key)
      }
      const left = ranked.filter((r) => !mine.includes(r))
      if (!mine.length) {
        oversized.push(`${a.name}: ${ranked[0].label} chiếm ${Math.round((costHere(ranked[0].key) / Math.max(1, a.cost)) * 100)}% chi phí nhóm`)
        continue
      }
      const slices = ev.placements.filter((p) => p.adsetId === a.id && mine.some((r) => r.key === p.key))
      const warnings = ["Meta RESET giai đoạn học của nhóm này sau khi đổi vị trí — số 3–7 ngày đầu sẽ xấu hơn bình thường."]
      if (UNWRITABLE_TARGETING_KEYS.some((k) => k in a.targeting)) warnings.push("Nhóm có thiết lập tệp khách WhatsApp (subscriber_universe) mà app không ghi được — loại vị trí sẽ làm MẤT thiết lập đó, hoàn tác cũng không khôi phục được.")
      if (a.automaticPlacement) warnings.push("Nhóm đang để vị trí TỰ ĐỘNG (Advantage+). Loại một vị trí nghĩa là chuyển sang chọn vị trí thủ công: tool giữ đúng các vị trí đã phân phối trong kỳ, trừ vị trí bị loại.")
      if (left.length) warnings.push(`Chưa loại ${left.map((r) => r.label).join(", ")}: loại thêm sẽ dời quá ${Math.round(MAX_EXCLUDED_SHARE * 100)}% chi phí của nhóm — cân nhắc dừng nhóm hoặc dựng nhóm mới.`)
      if (a.optResultsApprox && pl.metric?.key === "optResults") warnings.push("Kết quả theo sự kiện tự đặt là số XẤP XỈ (Meta gộp mọi sự kiện tự đặt).")
      actions.push({
        id: aid("placement"), type: "EXCLUDE_PLACEMENT", selected: false, adsetId: a.id, adsetName: a.name,
        placements: mine.map((r) => r.key), placementLabels: mine.map((r) => r.label), automatic: a.automaticPlacement,
        cost: slices.reduce((s, p) => s + p.cost, 0), results: slices.reduce((s, p) => s + (pl.metric ? p[pl.metric.key] ?? 0 : 0), 0),
        resultLabel: pl.metric?.label ?? "kết quả", warnings,
        label: `Loại ${mine.map((r) => r.label).join(", ")} khỏi nhóm “${a.name}”`,
      })
    }
    if (oversized.length) {
      manualTasks.push({
        title: "Vị trí đắt chiếm quá nửa chi phí nhóm — dựng nhóm mới thay vì loại vị trí",
        detail: `${oversized.join("; ")}. Loại vị trí này là đổi gần hết cách nhóm phân phối; tool không tự làm.`,
        assignee: null, status: "open",
      })
    }
  }

  // Dừng chiến dịch: đỏ vì 0 đơn.
  if (verdict.status === "red" && results === 0 && campaignActive) {
    actions.push({ id: aid("pause"), type: "PAUSE_CAMPAIGN", selected: false, campaignId: c.id, label: `Dừng chiến dịch “${c.name}”` })
  }

  // Giảm ngân sách về mức trần: đỏ nhưng có đơn (còn đáng chạy, chỉ đang chi quá).
  if (verdict.status === "red" && results > 0 && campaignActive) {
    const b = budgetToCeiling(ev, goal)
    if (b && b.after < (c.dailyBudget ?? 0)) {
      actions.push({
        id: aid("budget"), type: "SET_CAMPAIGN_BUDGET", selected: false, campaignId: c.id, before: c.dailyBudget!, after: b.after,
        reason: `Giữ chi tiêu ở mức trần: ${Math.round(b.ratio * 100)}% ngân sách hiện tại (kẹp 50–90% mỗi lần). Giảm ngân sách nhiều cũng có thể reset giai đoạn học.`,
        label: `Giảm ngân sách ngày ${vnd(c.dailyBudget!)} → ${vnd(b.after)}`,
      })
    }
  }

  // Đợt 5: tool tự tạo nhóm mới với sự kiện chuẩn (không chọn sẵn). Có việc này thì không giao người việc trùng nghĩa.
  const newAdset = leads ? null : has("opt-event-not-purchase") || has("learning-fail") || has("view-through-heavy") ? proposeCreateAdset(ev, { viewHeavy: has("view-through-heavy") }) : null
  if (newAdset) actions.push(newAdset)

  // ── Việc giao người ──
  if ((has("opt-event-not-purchase") || has("learning-fail")) && (!newAdset || (newAdset.type === "CREATE_ADSET_WITH_EVENT" && newAdset.lowSignal))) {
    const best = bestLearnableEvent(ev)
    const purchasePerWeek = ev.peers.eventsPerWeek.purchase ?? 0
    const detail = !best
      ? `Chưa sự kiện chuẩn nào của nhóm sản phẩm đạt ${EVENTS_PER_WEEK_TO_LEARN}/tuần (Mua hàng: ${dec(purchasePerWeek)}/tuần). Đổi sự kiện lúc này chưa giúp Meta học được — gộp chiến dịch trước (việc bên dưới), đồng thời kiểm pixel có bắn đúng sự kiện chuẩn không.`
      : best.key === "purchase"
        ? `Nhóm sản phẩm có ${dec(best.perWeek)} lượt Mua hàng/tuần — đủ để tối ưu thẳng theo Mua hàng. Meta không cho sửa sự kiện nhóm đang chạy: tạo nhóm mới tối ưu Mua hàng, chạy song song rồi tắt nhóm cũ.`
        : `Mua hàng chỉ ${dec(purchasePerWeek)}/tuần, chưa đủ ${EVENTS_PER_WEEK_TO_LEARN}. Sự kiện sâu nhất đủ số là “${best.label}” (${dec(best.perWeek)}/tuần) — tạo nhóm mới tối ưu theo sự kiện này thay cho sự kiện hiện tại.`
    manualTasks.push({ title: best ? `Tạo nhóm quảng cáo mới tối ưu theo “${best.label}”` : "Chưa đổi sự kiện tối ưu — gộp chiến dịch và kiểm pixel trước", detail, assignee: null, status: "open" })
  }
  if (leads && has("opt-event-not-lead")) {
    manualTasks.push({ title: "Tạo nhóm quảng cáo mới tối ưu theo “Khách hàng tiềm năng”", detail: `Meta không cho sửa sự kiện của nhóm đang chạy: tạo nhóm mới tối ưu theo lead (form trên Meta hoặc sự kiện Lead của pixel), chạy song song rồi tắt nhóm cũ. Tool chưa tự dựng nhóm thu lead.`, assignee: null, status: "open" })
  }
  if (has("purchase-value-missing")) {
    manualTasks.push({ title: "Sửa pixel: sự kiện Mua hàng phải gửi giá trị đơn (value + currency VND)", detail: "Thiếu giá trị thì Meta không phân biệt được đơn to/nhỏ và không tối ưu theo doanh thu được.", assignee: null, status: "open" })
  }
  if (has("budget-thin")) {
    manualTasks.push({ title: `Gộp ${ev.peers.activeCampaigns} chiến dịch cùng sản phẩm`, detail: `Gộp về 1–2 chiến dịch để mỗi nhóm quảng cáo có đủ khoảng ${EVENTS_PER_WEEK_TO_LEARN} sự kiện/tuần. Xem số theo sự kiện ở nguyên nhân “chia nhau số sự kiện”.`, assignee: null, status: "open" })
  }
  if (!leads && (has("meta-vs-odoo") || !ev.odoo.checked)) {
    manualTasks.push({
      title: ev.odoo.tags.length ? "Đối chiếu đo lường Meta với Odoo"
        : !ev.odoo.readableAds && ev.odoo.unreadableAds ? "Kiểm tay utm trong bài viết đang chạy quảng cáo"
        : "Gắn utm_campaign vào liên kết quảng cáo",
      detail: ev.odoo.tags.length || (!ev.odoo.readableAds && ev.odoo.unreadableAds) ? ev.odoo.note
        : "Không có utm_campaign thì không nối được đơn Odoo về chiến dịch — chỉ còn số Meta tự báo. Dùng đúng link trong bảng link chuẩn.",
      assignee: null, status: "open",
    })
  }
  if (has("click-no-landing")) {
    manualTasks.push({ title: "Kiểm trang đích: pixel có ghi lượt xem trang không, trang tải có chậm không", detail: "Mở trang đích từ chính quảng cáo trên điện thoại, xem pixel (Meta Pixel Helper / Events Manager) có bắn PageView không và trang hiện sau bao lâu. Chưa rõ việc này thì mọi so sánh theo lượt xem trang đều không đáng tin.", assignee: null, status: "open" })
  }
  if (has("high-frequency")) {
    manualTasks.push({ title: "Mở rộng tệp hoặc thay mẫu quảng cáo", detail: "Tần suất cao: cùng người xem lặp lại nhiều lần. Tool không tự đổi nhắm chọn (đổi nhắm chọn reset giai đoạn học).", assignee: null, status: "open" })
  }
  return { actions, manualTasks }
}
