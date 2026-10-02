// ============================================================
// Thực thi hướng xử lý lên Meta — đọc trước, kiểm, ghi, ĐỌC LẠI
// ============================================================
// Khác Google ở ba chỗ đã đo được (21/09):
//   1. validate_only của Meta chỉ kiểm DỮ LIỆU, không kiểm quyền ghi — "Kiểm
//      trước" qua mà ghi thật vẫn có thể hỏng. Nói rõ ở cảnh báo.
//   2. Sửa cùng một nhóm quảng cáo nhiều lần liên tiếp thì Meta chặn tạm
//      (#3) hơn 30 phút → nhóm vừa có thay đổi lớn < 30 phút thì bỏ qua.
//   3. Không ghi theo lô: từng đối tượng một, hỏng thì DỪNG các lượt sau
//      (đọc lại cho biết chính xác cái gì đã đổi).
// Hoàn tác chỉ đảo đối tượng còn đúng như lúc tool đặt; người khác đã sửa → giữ.

import { detectCompany } from "@/lib/company-detect"
import { checkRecentCampaignMutation, recordCampaignMutation } from "@/lib/mutation-guard"
import { metaGet, metaPost } from "./meta-graph"
import { excludePlacements, placementLabel, placementSummary, writableTargeting, type Targeting } from "./meta-placements"
import type { CaseAction, Execution, MetaChange, ReadbackRow } from "./store"
import type { Company, MetaEvidence } from "./types"
import { executeD5, undoD5 } from "./meta-new-adset"

/** Thay đổi đi qua luồng cũ (so trước/sau theo chiến dịch + nhóm). Đợt 5 (adset_created, ad_status) có luồng riêng. */
type ClassicChange = Exclude<MetaChange, { kind: "adset_created" } | { kind: "ad_status" }>
const isClassic = (c: MetaChange): c is ClassicChange => c.kind !== "adset_created" && c.kind !== "ad_status"
const D5_TYPES = new Set(["CREATE_ADSET_WITH_EVENT", "ACTIVATE_NEW_ADSET"])

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** Nhóm vừa có thay đổi lớn trong khoảng này → không sửa tiếp (Meta chặn tạm). */
export const ADSET_EDIT_GAP_MS = 30 * 60_000

const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`
const STATUS_VI: Record<string, string> = { ACTIVE: "Đang chạy", PAUSED: "Tạm dừng" }
const vi = (s: string) => STATUS_VI[s] ?? s

export interface MetaCampaignState { id: string; name: string; status: string; dailyBudget: number | null }
export interface MetaAdSetState { id: string; name: string; campaignId: string; status: string; targeting: Targeting; lastSigEditMs: number | null }

export interface MetaOp { id: string; body: Record<string, unknown>; change: ClassicChange; label: string }
export interface MetaPlan { ops: MetaOp[]; skipped: string[]; warnings: string[] }

/** Hàm thuần: trạng thái hiện tại + việc được chọn → các lượt ghi. */
export function planMetaOps(input: {
  campaign: MetaCampaignState | null
  adsets: MetaAdSetState[]
  actions: CaseAction[]
  evidence: MetaEvidence
  now?: number
}): MetaPlan {
  const { campaign, adsets, evidence } = input
  const now = input.now ?? Date.now()
  const sel = input.actions.filter((a) => a.selected)
  const out: MetaPlan = { ops: [], skipped: [], warnings: [] }
  const byId = new Map(adsets.map((a) => [a.id, a]))
  const pausingCampaign = sel.some((a) => a.type === "PAUSE_CAMPAIGN")
  const pausingAdsets = new Set(sel.flatMap((a) => (a.type === "PAUSE_ADSET" ? [a.adsetId] : [])))

  for (const a of sel) {
    if (a.type === "PAUSE_CAMPAIGN") {
      if (!campaign) throw new Error("Không đọc được chiến dịch")
      if (campaign.status !== "ACTIVE") { out.skipped.push(`Chiến dịch đang ${vi(campaign.status)} — không cần dừng.`); continue }
      out.ops.push({ id: campaign.id, body: { status: "PAUSED" }, label: `Dừng chiến dịch ${campaign.name}`, change: { kind: "campaign_status", id: campaign.id, name: campaign.name, before: campaign.status, after: "PAUSED" } })
    } else if (a.type === "SET_CAMPAIGN_BUDGET") {
      if (!campaign) throw new Error("Không đọc được chiến dịch")
      if (pausingCampaign) { out.skipped.push("Đã chọn dừng chiến dịch — bỏ qua việc đổi ngân sách."); continue }
      if (campaign.dailyBudget === null) { out.skipped.push("Chiến dịch không đặt ngân sách ngày ở cấp chiến dịch — bỏ qua đổi ngân sách."); continue }
      if (Math.round(campaign.dailyBudget) !== Math.round(a.before)) {
        out.skipped.push(`Ngân sách đã đổi từ ${vnd(a.before)} thành ${vnd(campaign.dailyBudget)} sau lúc đề xuất — bỏ qua, thu thập lại để tính lại.`)
        continue
      }
      out.ops.push({ id: campaign.id, body: { daily_budget: String(Math.round(a.after)) }, label: `Ngân sách ngày ${vnd(a.before)} → ${vnd(a.after)}`, change: { kind: "campaign_budget", id: campaign.id, name: campaign.name, before: campaign.dailyBudget, after: Math.round(a.after) } })
    } else if (a.type === "PAUSE_ADSET" || a.type === "EXCLUDE_PLACEMENT") {
      const s = byId.get(a.adsetId)
      if (!s) { out.skipped.push(`Nhóm quảng cáo “${a.adsetName}” không còn trong chiến dịch — bỏ qua.`); continue }
      if (a.type === "PAUSE_ADSET") {
        if (s.status !== "ACTIVE") { out.skipped.push(`Nhóm “${s.name}” đang ${vi(s.status)} — không cần dừng.`); continue }
        out.ops.push({ id: s.id, body: { status: "PAUSED" }, label: `Dừng nhóm ${s.name}`, change: { kind: "adset_status", id: s.id, name: s.name, before: s.status, after: "PAUSED" } })
        continue
      }
      if (pausingAdsets.has(s.id)) { out.skipped.push(`Nhóm “${s.name}” sẽ bị dừng — bỏ qua việc loại vị trí.`); continue }
      if (s.lastSigEditMs && now - s.lastSigEditMs < ADSET_EDIT_GAP_MS) {
        const mins = Math.ceil((ADSET_EDIT_GAP_MS - (now - s.lastSigEditMs)) / 60_000)
        out.skipped.push(`Nhóm “${s.name}” vừa có thay đổi lớn — Meta hay chặn tạm khi sửa liên tiếp. Thử lại sau khoảng ${mins} phút.`)
        continue
      }
      const delivered = [...new Set(evidence.placements.filter((p) => p.adsetId === s.id).map((p) => p.key))]
      const r = excludePlacements(s.targeting, a.placements, delivered)
      if (r.unsupported.length) out.warnings.push(`Tool chưa biết tên targeting của ${r.unsupported.map(placementLabel).join(", ")} — không loại được vị trí này.`)
      if (!r.changed) { out.skipped.push(`Nhóm “${s.name}” đã không còn ${a.placementLabels.join(", ")} — không cần đổi.`); continue }
      const w = writableTargeting(r.next)
      if (w.dropped.length) out.warnings.push(`Nhóm “${s.name}”: app không ghi được ${w.dropped.join(", ")} (tệp khách WhatsApp) — thiết lập này sẽ mất sau khi loại vị trí, hoàn tác cũng không khôi phục được.`)
      out.ops.push({ id: s.id, body: { targeting: w.body }, label: `Loại ${a.placementLabels.join(", ")} khỏi ${s.name}`, change: { kind: "adset_targeting", id: s.id, name: s.name, before: s.targeting, after: r.next } })
    }
  }
  return out
}

async function readCampaign(id: string): Promise<MetaCampaignState> {
  const r = await metaGet<Row>(id, { fields: "id,name,status,daily_budget" })
  return { id: String(r.id), name: String(r.name ?? ""), status: String(r.status ?? ""), dailyBudget: r.daily_budget ? Number(r.daily_budget) : null }
}

async function readAdsets(ids: string[]): Promise<MetaAdSetState[]> {
  if (!ids.length) return []
  const r = await metaGet<Record<string, Row>>("", { ids: ids.join(","), fields: "id,name,status,campaign_id,targeting,learning_stage_info" })
  return Object.values(r).map((a) => ({
    id: String(a.id), name: String(a.name ?? ""), campaignId: String(a.campaign_id ?? ""), status: String(a.status ?? ""),
    targeting: (a.targeting ?? {}) as Targeting,
    lastSigEditMs: a.learning_stage_info?.last_sig_edit_ts ? Number(a.learning_stage_info.last_sig_edit_ts) * 1000 : null,
  }))
}

/** Giá trị có thể so của một thay đổi, đọc từ trạng thái hiện tại. */
function currentOf(ch: ClassicChange, campaign: MetaCampaignState | null, adsets: MetaAdSetState[]): string {
  const a = adsets.find((x) => x.id === ch.id)
  switch (ch.kind) {
    case "campaign_status": return campaign?.status ?? "?"
    case "campaign_budget": return campaign?.dailyBudget === null || !campaign ? "?" : String(Math.round(campaign.dailyBudget))
    case "adset_status": return a?.status ?? "?"
    case "adset_targeting": return a ? placementSummary(a.targeting) : "?"
  }
}
function valueOf(ch: ClassicChange, side: "before" | "after"): string {
  if (ch.kind === "adset_targeting") return placementSummary(ch[side])
  if (ch.kind === "campaign_budget") return String(Math.round(ch[side]))
  return ch[side]
}
function show(ch: ClassicChange, v: string): string {
  if (ch.kind === "campaign_budget") return /^\d+$/.test(v) ? vnd(Number(v)) : v
  if (ch.kind === "adset_targeting") return v
  return vi(v)
}

function emptyExec(input: { actor: string; idempotencyKey: string; validateOnly: boolean }): Execution {
  return {
    id: `exec_${Date.now().toString(36)}`, at: new Date().toISOString(), by: input.actor, idempotencyKey: input.idempotencyKey,
    mode: input.validateOnly ? "validate" : "write", status: "failed", warnings: [], errors: [],
    created: [], removed: [], paused: [], metaChanges: [], readback: [],
  }
}

async function readAll(evidence: MetaEvidence, needCampaign: boolean, adsetIds: string[]) {
  const campaign = needCampaign ? await readCampaign(evidence.campaign.id) : null
  const adsets = await readAdsets(adsetIds)
  return { campaign, adsets }
}

/** Luồng cũ (Đợt 3) + việc Đợt 5 (tạo/bật nhóm mới) — gộp một lần thực hiện. */
export async function executeMetaActions(input: {
  company: Company; evidence: MetaEvidence; actions: CaseAction[]; actor: string; idempotencyKey: string; validateOnly: boolean
}): Promise<Execution> {
  const classicSel = input.actions.some((a) => a.selected && !D5_TYPES.has(a.type))
  const d5Sel = input.actions.some((a) => a.selected && D5_TYPES.has(a.type))
  const exec = classicSel || !d5Sel
    ? await executeClassic({ ...input, actions: input.actions.map((a) => (D5_TYPES.has(a.type) ? { ...a, selected: false } : a)) })
    : { ...emptyExec(input), status: "done" as const }
  if (!d5Sel || exec.errors.length) return exec
  const r = await executeD5(input.actions.filter((a) => D5_TYPES.has(a.type)), input.evidence.campaign.id, input.validateOnly)
  exec.metaChanges = [...(exec.metaChanges ?? []), ...r.changes]
  exec.readback = [...exec.readback, ...r.readback]
  exec.errors.push(...r.errors)
  exec.warnings.push(...r.warnings)
  exec.warnings = exec.warnings.filter((w) => w !== "Không còn việc nào cần ghi.")
  exec.status = !exec.errors.length && exec.readback.every((x) => x.ok) ? "done" : "failed"
  return exec
}

async function executeClassic(input: {
  company: Company; evidence: MetaEvidence; actions: CaseAction[]; actor: string; idempotencyKey: string; validateOnly: boolean
}): Promise<Execution> {
  const { company, evidence, actor } = input
  const exec = emptyExec(input)
  const sel = input.actions.filter((a) => a.selected)
  const needCampaign = sel.some((a) => a.type === "PAUSE_CAMPAIGN" || a.type === "SET_CAMPAIGN_BUDGET")
  const adsetIds = [...new Set(sel.flatMap((a) => (a.type === "PAUSE_ADSET" || a.type === "EXCLUDE_PLACEMENT" ? [a.adsetId] : [])))]

  let before: Awaited<ReturnType<typeof readAll>>
  let plan: MetaPlan
  try {
    before = await readAll(evidence, needCampaign, adsetIds)
    if (before.campaign && detectCompany(before.campaign.name) !== company) throw new Error("Chiến dịch không thuộc công ty của phiên")
    const foreign = before.adsets.filter((a) => a.campaignId !== evidence.campaign.id)
    if (foreign.length) throw new Error(`Nhóm quảng cáo ${foreign.map((a) => a.name).join(", ")} không thuộc chiến dịch của phiên`)
    plan = planMetaOps({ campaign: before.campaign, adsets: before.adsets, actions: input.actions, evidence })
  } catch (e) {
    exec.errors.push(`Không đọc được trạng thái trước khi ghi: ${e instanceof Error ? e.message : String(e)}`)
    return exec
  }
  exec.warnings.push(...plan.skipped, ...plan.warnings)
  const chk = checkRecentCampaignMutation(evidence.campaign.id, company, "human_manual")
  if (chk.hasConflict && chk.note) exec.warnings.push(chk.note)
  if (!plan.ops.length) {
    exec.status = "done"
    exec.warnings.unshift("Không còn việc nào cần ghi.")
    return exec
  }

  for (const op of plan.ops) {
    try {
      await metaPost(op.id, op.body, true)
    } catch (e) {
      exec.errors.push(`Meta từ chối khi kiểm “${op.label}” — CHƯA ghi gì: ${e instanceof Error ? e.message : String(e)}`)
      return exec
    }
  }
  if (input.validateOnly) {
    exec.status = "done"
    exec.readback = plan.ops.map((op) => ({ label: `Dự kiến · ${op.label}`, before: show(op.change, valueOf(op.change, "before")), after: "chưa ghi", expected: show(op.change, valueOf(op.change, "after")), ok: true }))
    exec.warnings.unshift(`Chỉ kiểm: Meta chấp nhận dữ liệu của ${plan.ops.length} thay đổi. Chưa ghi gì. Lưu ý: bước kiểm của Meta KHÔNG kiểm quyền ghi — ghi thật vẫn có thể bị từ chối.`)
    return exec
  }

  for (const op of plan.ops) {
    try {
      await metaPost(op.id, op.body, false)
      exec.metaChanges!.push(op.change)
      if (op.change.kind === "campaign_status") exec.paused.push({ campaignId: op.id, before: op.change.before })
    } catch (e) {
      exec.errors.push(`Lỗi khi ghi “${op.label}” — dừng các việc sau: ${e instanceof Error ? e.message : String(e)}`)
      break
    }
  }
  for (const ch of exec.metaChanges!) {
    if (ch.kind === "campaign_status" || ch.kind === "campaign_budget") {
      recordCampaignMutation({
        source: { type: "human_manual", actor }, platform: "meta", company, campaignId: ch.id, campaignName: ch.name,
        event: ch.kind === "campaign_status" ? "campaign.pause" : ch.after > ch.before ? "budget.increase" : "budget.decrease",
        rationale: "Xử lý chiến dịch — sau khi chẩn đoán",
      })
    }
  }

  try {
    const after = await readAll(evidence, needCampaign, adsetIds)
    exec.readback = plan.ops.map((op): ReadbackRow => {
      const now = currentOf(op.change, after.campaign, after.adsets)
      const want = valueOf(op.change, "after")
      return { label: op.label, before: show(op.change, valueOf(op.change, "before")), after: show(op.change, now), expected: show(op.change, want), ok: now === want }
    })
  } catch (e) {
    exec.errors.push(`Đã ghi nhưng không đọc lại được để xác nhận: ${e instanceof Error ? e.message : String(e)}`)
  }
  exec.status = exec.errors.length === 0 && exec.readback.every((r) => r.ok) ? "done" : "failed"
  return exec
}

export async function undoMetaExecution(input: { company: Company; evidence: MetaEvidence; exec: Execution; actor: string }): Promise<string[]> {
  const all = input.exec.metaChanges ?? []
  if (!all.length) return ["Lần thực hiện này không đổi gì trên Meta."]
  // Đợt 5 trước (quảng cáo/nhóm mới), rồi mới trả nhóm/chiến dịch cũ về như trước.
  const d5 = all.filter((c) => !isClassic(c))
  const report: string[] = d5.length ? await undoD5(d5) : []
  const changes = all.filter(isClassic)
  if (!changes.length) return report
  const needCampaign = changes.some((c) => c.kind === "campaign_status" || c.kind === "campaign_budget")
  const adsetIds = [...new Set(changes.filter((c) => c.kind === "adset_status" || c.kind === "adset_targeting").map((c) => c.id))]
  const now = await readAll(input.evidence, needCampaign, adsetIds)

  for (const ch of [...changes].reverse()) {
    const cur = currentOf(ch, now.campaign, now.adsets)
    if (cur !== valueOf(ch, "after")) {
      report.push(`${ch.name}: hiện là “${show(ch, cur)}”, khác mức tool đã đặt — đã có người đổi sau đó, giữ nguyên.`)
      continue
    }
    const body = ch.kind === "adset_targeting" ? { targeting: writableTargeting(ch.before).body }
      : ch.kind === "campaign_budget" ? { daily_budget: String(Math.round(ch.before)) }
      : { status: ch.before }
    try {
      await metaPost(ch.id, body, false)
      report.push(`${ch.name}: đã trả về “${show(ch, valueOf(ch, "before"))}”.${ch.kind === "adset_targeting" ? " Giai đoạn học của nhóm lại bị reset." : ""}`)
      if (ch.kind === "campaign_status" || ch.kind === "campaign_budget") {
        recordCampaignMutation({
          source: { type: "human_manual", actor: input.actor }, platform: "meta", company: input.company, campaignId: ch.id, campaignName: ch.name,
          event: ch.kind === "campaign_status" ? "campaign.resume" : ch.before > ch.after ? "budget.increase" : "budget.decrease",
          rationale: "Xử lý chiến dịch — hoàn tác",
        })
      }
    } catch (e) {
      report.push(`${ch.name}: hoàn tác thất bại — ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  // Đọc lại xác nhận.
  try {
    const after = await readAll(input.evidence, needCampaign, adsetIds)
    const wrong = changes.filter((ch) => currentOf(ch, after.campaign, after.adsets) !== valueOf(ch, "before"))
    report.push(wrong.length ? `Đọc lại: ${wrong.length} mục chưa về trạng thái cũ (${wrong.map((w) => w.name).join(", ")}).` : "Đọc lại: mọi mục đã về trạng thái cũ.")
  } catch (e) {
    report.push(`Không đọc lại được để xác nhận hoàn tác: ${e instanceof Error ? e.message : String(e)}`)
  }
  return report
}
