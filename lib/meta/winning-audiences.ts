// ============================================================
// Đợt 26c — Kho "tệp thắng" (data/winning-audiences.json)
// ============================================================
// Lưu NGUYÊN cấu hình nhắm chọn Meta của nhóm thắng (đã bỏ trường app không ghi được — writableTargeting) + bằng chứng
// lúc lưu (khoảng ngày, chi phí, số kết quả, so với nhóm nào). Lần sau tạo nhóm mới thì chép đúng cấu hình này.
// Tệp thắng cũng cạn dần → có hạn KIỂM LẠI (REVIEW_AFTER_DAYS) — quá hạn thì giao diện nhắc so lại trước khi dùng.
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { withFileLock } from "@/lib/file-lock"
import { writeFileAtomicSync } from "@/lib/fs-atomic"
import { writableTargeting } from "@/lib/case/meta-placements"
import type { GoalKind } from "@/lib/case/goal-kind"
import type { CompareGroup, RankedAdset } from "./audience-compare"

export const REVIEW_AFTER_DAYS = 45

export interface WinningAudience {
  id: string
  name: string
  company: string
  goalKind: GoalKind
  note: string
  targeting: Record<string, unknown>
  /** Trường nhắm chọn bị bỏ vì app không ghi được (vd subscriber_universe) — nói rõ khi dùng lại. */
  droppedKeys: string[]
  summary: string
  source: { adsetId: string; adsetName: string; campaignId: string; campaignName: string; optEventLabel: string }
  evidence: {
    range: { from: string; to: string }
    verdict: CompareGroup["verdict"]
    spend: number; results: number; costPerResult: number | null; ctr: number | null; frequency: number | null
    comparedWith: { adsetName: string; campaignName: string; results: number; costPerResult: number | null }[]
    groupSummary: string
  }
  savedBy: string
  savedAt: string
  reviewBy: string
}

const FILE = () => path.join(process.cwd(), "data", "winning-audiences.json")
export function listWinning(company?: string): WinningAudience[] {
  try {
    const all = JSON.parse(fs.readFileSync(FILE(), "utf-8")) as WinningAudience[]
    return (Array.isArray(all) ? all : []).filter((w) => !company || w.company === company).sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  } catch { return [] }
}
export const getWinning = (id: string) => listWinning().find((w) => w.id === id) ?? null

/** Tóm tắt nhắm chọn dễ đọc — HÀM THUẦN. */
export function targetingSummary(t: Record<string, unknown>): string {
  const x = t as { age_min?: number; age_max?: number; genders?: number[]; geo_locations?: { countries?: string[]; regions?: { name?: string }[]; cities?: { name?: string }[] }; flexible_spec?: { interests?: { name: string }[]; behaviors?: { name: string }[] }[]; custom_audiences?: { name?: string; id: string }[]; targeting_automation?: { advantage_audience?: number } }
  const parts: string[] = []
  parts.push(`${x.age_min ?? 18}–${x.age_max ?? 65} tuổi`)
  const g = x.genders ?? []
  parts.push(g.length === 1 ? (g[0] === 1 ? "nam" : "nữ") : "mọi giới")
  const geo = [...(x.geo_locations?.cities ?? []).map((c) => c.name), ...(x.geo_locations?.regions ?? []).map((r) => r.name), ...(x.geo_locations?.countries ?? [])].filter(Boolean)
  if (geo.length) parts.push(geo.slice(0, 4).join(", ") + (geo.length > 4 ? ` +${geo.length - 4}` : ""))
  const interests = (x.flexible_spec ?? []).flatMap((f) => [...(f.interests ?? []), ...(f.behaviors ?? [])]).map((i) => i.name)
  if (interests.length) parts.push(`sở thích: ${interests.slice(0, 5).join(", ")}${interests.length > 5 ? ` +${interests.length - 5}` : ""}`)
  if (x.custom_audiences?.length) parts.push(`${x.custom_audiences.length} tệp tuỳ chỉnh/lookalike`)
  if (!interests.length && !x.custom_audiences?.length) parts.push("để rộng (không sở thích)")
  if (x.targeting_automation?.advantage_audience === 1) parts.push("Advantage+ mở rộng")
  return parts.join(" · ")
}

export function buildWinning(input: { name: string; note: string; company: string; range: { from: string; to: string }; group: CompareGroup; row: RankedAdset; actor: string; now?: Date }): WinningAudience {
  const now = input.now ?? new Date()
  const { body, dropped } = writableTargeting(input.row.targeting as never)
  const r = input.row
  return {
    id: `wa_${crypto.randomBytes(6).toString("hex")}`, name: input.name.trim().slice(0, 120) || r.name, company: input.company, goalKind: input.group.goalKind,
    note: input.note.trim().slice(0, 500), targeting: body as Record<string, unknown>, droppedKeys: dropped, summary: targetingSummary(body as Record<string, unknown>),
    source: { adsetId: r.id, adsetName: r.name, campaignId: r.campaignId, campaignName: r.campaignName, optEventLabel: r.optEventLabel },
    evidence: {
      range: input.range, verdict: input.group.verdict, spend: Math.round(r.spend), results: r.results, costPerResult: r.costPerResult ? Math.round(r.costPerResult) : null,
      ctr: r.ctr, frequency: r.frequency, groupSummary: input.group.summary,
      comparedWith: input.group.rows.filter((x) => x.id !== r.id).map((x) => ({ adsetName: x.name, campaignName: x.campaignName, results: x.results, costPerResult: x.costPerResult ? Math.round(x.costPerResult) : null })),
    },
    savedBy: input.actor, savedAt: now.toISOString(), reviewBy: new Date(now.getTime() + REVIEW_AFTER_DAYS * 86_400_000).toISOString(),
  }
}

export async function saveWinning(w: WinningAudience): Promise<void> {
  await withFileLock(FILE(), async () => {
    const all = listWinning()
    fs.mkdirSync(path.dirname(FILE()), { recursive: true })
    writeFileAtomicSync(FILE(), JSON.stringify([w, ...all.filter((x) => x.id !== w.id)], null, 1))
  })
}
export async function deleteWinning(id: string): Promise<boolean> {
  return withFileLock(FILE(), async () => {
    const all = listWinning()
    if (!all.some((x) => x.id === id)) return false
    writeFileAtomicSync(FILE(), JSON.stringify(all.filter((x) => x.id !== id), null, 1))
    return true
  })
}
