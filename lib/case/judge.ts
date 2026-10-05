// ============================================================
// Đợt 23 — chấm kết quả ĐO LẠI của phiên xử lý (7 / 14 ngày) — HÀM THUẦN
// ============================================================
// Trước đây: "cải thiện" = CPA mới < CPA lúc mở phiên — giảm 1% cũng tính là xong; phiên chấm theo ROAS (MBC) vẫn bị đo
// bằng CPA; mốc 7 ngày chỉ ghi số, không báo gì. Nay:
//   CPA : đạt khi CPA ≤ trần, HOẶC giảm ≥ 10%, HOẶC trước 0 đơn nay có đơn. Xấu đi khi tăng > 10%, hoặc chi tiền mà 0 đơn.
//   ROAS: đạt khi ROAS ≥ mức tối thiểu (ceiling), HOẶC tăng ≥ 10%. Xấu đi khi giảm > 10%, hoặc chi tiền mà 0 doanh thu.
//   Còn lại = "chưa rõ" (không đủ để nói tốt hay xấu) — không đóng phiên là "đạt".

export type RemeasureVerdict = "improved" | "same" | "worse"
export interface PerfSnap { cost: number; orders: number; value: number }
export interface Goal { basis: "cpa" | "roas"; target: number; ceiling: number }

/** Ngưỡng thay đổi tối thiểu để coi là thật sự tốt / xấu hơn (tránh nhiễu). */
export const MIN_CHANGE = 0.1

export function judgeRemeasure(goal: Goal | null, before: PerfSnap | null, after: PerfSnap): { verdict: RemeasureVerdict; basis: "cpa" | "roas"; before: number | null; after: number | null } {
  const basis = goal?.basis ?? "cpa"
  if (basis === "roas") {
    const a = after.cost > 0 ? after.value / after.cost : null
    const b = before && before.cost > 0 ? before.value / before.cost : null
    if (a === null) return { verdict: "same", basis, before: b, after: a }
    if (after.cost > 0 && after.value <= 0) return { verdict: "worse", basis, before: b, after: 0 }
    if ((goal && a >= goal.ceiling) || (b !== null && b > 0 && a >= b * (1 + MIN_CHANGE))) return { verdict: "improved", basis, before: b, after: a }
    if (b !== null && b > 0 && a < b * (1 - MIN_CHANGE)) return { verdict: "worse", basis, before: b, after: a }
    return { verdict: "same", basis, before: b, after: a }
  }
  const a = after.orders > 0 ? after.cost / after.orders : null
  const b = before && before.orders > 0 ? before.cost / before.orders : null
  if (a === null) return { verdict: after.cost > 0 ? "worse" : "same", basis, before: b, after: null }
  if ((goal && a <= goal.ceiling) || b === null || a <= b * (1 - MIN_CHANGE)) return { verdict: "improved", basis, before: b, after: a }
  if (a > b * (1 + MIN_CHANGE)) return { verdict: "worse", basis, before: b, after: a }
  return { verdict: "same", basis, before: b, after: a }
}

/** Mã số lưu trong result (Record<string, number|null>): 1 đạt · 0 chưa rõ · -1 xấu đi. */
export const VERDICT_CODE: Record<RemeasureVerdict, number> = { improved: 1, same: 0, worse: -1 }
