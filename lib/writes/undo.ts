// Đợt 23 (3c): Hoàn tác các lần "Áp ngay" bật/tắt + đổi ngân sách (decision-memory có field/valueBefore/valueAfter).
// Nguyên tắc: CHỈ hoàn tác khi giá trị hiện tại trên nền tảng vẫn đúng bằng giá trị đã áp — ai đó / luật tự động đã sửa
// tiếp thì KHÔNG đè (trả lý do). Việc ghi lại đi qua chính route bật/tắt / ngân sách cũ nên giữ nguyên mọi chốt quyền
// và lần hoàn tác cũng được ghi + đo 7/14 ngày như một thay đổi mới.
import { enums } from "google-ads-api"
import type { DecisionMemoryEntry } from "@/lib/decision-memory/types"

const GOOGLE_STATUS: Record<number, string> = Object.fromEntries(
  Object.entries(enums.CampaignStatus as unknown as Record<string, unknown>).filter(([, v]) => typeof v === "number").map(([k, v]) => [v as number, k]),
)
/** Trạng thái chiến dịch Google dạng chữ (thư viện trả số enum). */
export function googleStatusName(v: unknown): string | null {
  if (typeof v === "number") return GOOGLE_STATUS[v] ?? null
  return typeof v === "string" && v ? v : null
}

export type UndoPlan =
  | { ok: true; field: "status"; platform: "meta" | "google_ads"; entityId: string; company: string; current: string; restore: string }
  | { ok: true; field: "daily_budget"; platform: "meta" | "google_ads"; entityId: string; company: string; current: number; restore: number }
  | { ok: false; reason: string }

const STATUS_OK = { meta: ["ACTIVE", "PAUSED"], google_ads: ["ENABLED", "PAUSED"] } as const

/** HÀM THUẦN — bản ghi này có hoàn tác được không (chưa xét giá trị hiện tại). */
export function undoableReason(d: DecisionMemoryEntry): string | null {
  if (d.undoneAt) return "Đã hoàn tác rồi"
  const plat = d.target.platform
  if (plat !== "meta" && plat !== "google_ads") return "Nền tảng không hỗ trợ hoàn tác"
  const { field, valueBefore: b, valueAfter: a } = d.action
  if (field === "status") {
    const ok = STATUS_OK[plat] as readonly string[]
    if (typeof b !== "string" || typeof a !== "string" || !ok.includes(b) || !ok.includes(a)) return "Không có trạng thái trước đó để trả về"
    if (a === b) return "Trạng thái không đổi — không có gì để hoàn tác"
    return null
  }
  if (field === "daily_budget") {
    if (typeof b !== "number" || typeof a !== "number" || b < 10_000 || a <= 0) return "Không có ngân sách trước đó để trả về"
    if (a === b) return "Ngân sách không đổi — không có gì để hoàn tác"
    return null
  }
  return "Thay đổi này không lưu giá trị trước đó"
}

/** HÀM THUẦN — ghép bản ghi + giá trị đọc được trên nền tảng thành kế hoạch hoàn tác (hoặc lý do từ chối). */
export function planUndo(d: DecisionMemoryEntry, current: string | number | null): UndoPlan {
  const why = undoableReason(d)
  if (why) return { ok: false, reason: why }
  if (current == null) return { ok: false, reason: "Không đọc được giá trị hiện tại trên nền tảng" }
  const base = { platform: d.target.platform as "meta" | "google_ads", entityId: d.target.entityId, company: d.target.company }
  if (d.action.field === "status") {
    if (current !== d.action.valueAfter) return { ok: false, reason: `Trạng thái đã bị sửa sau đó (hiện là ${current}) — không hoàn tác để khỏi đè lên thay đổi mới` }
    return { ok: true, field: "status", ...base, current: String(current), restore: String(d.action.valueBefore) }
  }
  const cur = Number(current)
  if (Math.round(cur) !== Math.round(Number(d.action.valueAfter))) return { ok: false, reason: `Ngân sách đã bị sửa sau đó (hiện ₫${Math.round(cur).toLocaleString("vi-VN")}/ngày) — không hoàn tác để khỏi đè lên thay đổi mới` }
  return { ok: true, field: "daily_budget", ...base, current: cur, restore: Number(d.action.valueBefore) }
}
