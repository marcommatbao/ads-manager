// ============================================================
// Chấm một chiến dịch so với mục tiêu + trần của sản phẩm
// ============================================================
// Hai cách chấm (chốt với user 25/09):
//   - "cpa":  MBI — chi phí/đơn. Mục tiêu = 50% giá trị đơn, trần do user đặt.
//   - "roas": MBC — doanh thu/chi phí. Mục tiêu 5, trần 3 (dưới 3 là đỏ).
// Xếp hạng theo "chi vượt trần" = số tiền đã chi vượt mức lẽ ra được chi:
//   cpa:  chi phí − trần × số đơn
//   roas: chi phí − doanh thu ÷ ROAS trần
// 0 đơn mà chưa chi đủ để kết luận → "chưa đủ dữ liệu", KHÔNG đánh đỏ vội.

export type TargetBasis = "cpa" | "roas"
/** Đợt 23 (3d): "cpl" = chi phí mỗi lead — chỉ cho phiên chiến dịch thu lead (dòng mục tiêu lưu CPL ở cplTarget/cplCeiling). */
export type CaseBasis = TargetBasis | "cpl"

export interface CaseTarget {
  basis: CaseBasis
  /** cpa: VND/đơn muốn đạt · roas: ROAS muốn đạt */
  target: number
  /** cpa: VND/đơn tối đa · roas: ROAS tối thiểu */
  ceiling: number
}

export interface CampaignPerf {
  cost: number
  clicks: number
  /** Đơn mua = chuyển đổi dùng để đặt giá (Mua hàng), KHÔNG phải all_conversions. */
  orders: number
  orderValue: number
}

export type VerdictStatus = "red" | "amber" | "green" | "grey" | "no_target"

export interface Verdict {
  status: VerdictStatus
  /** VND đã chi vượt trần; null khi không vượt hoặc chưa kết luận được. */
  overCeiling: number | null
  cpa: number | null
  roas: number | null
  label: string
  /** Cờ phụ, ví dụ tỉ lệ click→đơn cao bất thường (nghi đếm sai chuyển đổi). */
  flags: string[]
}

/** Click→đơn trên mức này hiếm khi thật với sản phẩm B2B — nghi đo lường. Đo 25/09: Workspace MBC 21%. */
export const SUSPICIOUS_CVR = 0.15
/** roas: 0 đơn chỉ kết luận khi đã chi ít nhất mức này. */
export const ROAS_MIN_SPEND_TO_JUDGE = 1_000_000

const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`
const times = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })

export function verdictOf(p: CampaignPerf, t: CaseTarget | null): Verdict {
  const cpa = p.orders > 0 ? p.cost / p.orders : null
  const roas = p.cost > 0 ? p.orderValue / p.cost : null
  const flags: string[] = []
  // Click → lead > 15% là bình thường với form trên Meta — cờ "nghi đếm sai" chỉ cho đơn mua.
  if (t?.basis !== "cpl" && p.clicks >= 50 && p.orders / p.clicks > SUSPICIOUS_CVR) {
    flags.push(`${Math.round((p.orders / p.clicks) * 100)}% click thành đơn — cần kiểm hành động chuyển đổi đang được đếm`)
  }
  const base = { cpa, roas, flags }

  if (!t) return { ...base, status: "no_target", overCeiling: null, label: "Chưa đặt mục tiêu cho sản phẩm này" }

  if (t.basis === "cpa" || t.basis === "cpl") {
    const w = t.basis === "cpl" ? "lead" : "đơn"
    if (p.orders === 0) {
      if (p.cost >= t.ceiling) {
        return { ...base, status: "red", overCeiling: p.cost, label: `0 ${w} · đã chi gấp ${times(p.cost / t.ceiling)} lần trần` }
      }
      return { ...base, status: "grey", overCeiling: null, label: `Chưa đủ dữ liệu — mới chi ${times(p.cost / t.ceiling)} lần trần` }
    }
    const over = p.cost - t.ceiling * p.orders
    if (over > 0) return { ...base, status: "red", overCeiling: over, label: `Vượt trần ${vnd(t.ceiling)}/${w}` }
    if (cpa! > t.target) return { ...base, status: "amber", overCeiling: null, label: "Trên mục tiêu, dưới trần" }
    return { ...base, status: "green", overCeiling: null, label: "Đạt mục tiêu" }
  }

  // roas
  if (p.orders === 0 || p.orderValue <= 0) {
    if (p.cost >= ROAS_MIN_SPEND_TO_JUDGE) {
      return { ...base, status: "red", overCeiling: p.cost, label: "Chưa có doanh thu dù đã chi đủ để kết luận" }
    }
    return { ...base, status: "grey", overCeiling: null, label: "Chưa đủ dữ liệu" }
  }
  const over = p.cost - p.orderValue / t.ceiling
  if (over > 0) return { ...base, status: "red", overCeiling: over, label: `ROAS dưới trần ${t.ceiling}` }
  if (roas! < t.target) return { ...base, status: "amber", overCeiling: null, label: "Dưới mục tiêu, trên trần" }
  return { ...base, status: "green", overCeiling: null, label: "Đạt mục tiêu" }
}

/** Thứ tự bảng tổng quan: đỏ theo tiền vượt trần giảm dần → vàng → xám → xanh → chưa đặt mục tiêu. */
export function compareVerdicts(a: { verdict: Verdict; perf: CampaignPerf }, b: { verdict: Verdict; perf: CampaignPerf }): number {
  const rank: Record<VerdictStatus, number> = { red: 0, amber: 1, grey: 2, green: 3, no_target: 4 }
  const r = rank[a.verdict.status] - rank[b.verdict.status]
  if (r !== 0) return r
  if (a.verdict.status === "red") return (b.verdict.overCeiling ?? 0) - (a.verdict.overCeiling ?? 0)
  return b.perf.cost - a.perf.cost
}
