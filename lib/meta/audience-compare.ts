// ============================================================
// Đợt 26a — So sánh tệp đối tượng giữa các nhóm quảng cáo Meta (HÀM THUẦN, không gọi mạng)
// ============================================================
// Tệp đối tượng nằm ở NHÓM quảng cáo → chọn 2–3 chiến dịch, so mọi nhóm bên trong theo CHI PHÍ MỖI KẾT QUẢ (mua hoặc lead
// Meta ghi — user chốt 06/10), cùng khoảng ngày. Không kết luận khi chưa đủ số, và nói rõ khi hai nhóm KHÔNG so được
// (khác sự kiện tối ưu / khác mẫu quảng cáo / tệp gần trùng / đang học) — "thắng" lúc đó có thể do thứ khác chứ không phải tệp.
import { computeTargetingSimilarity } from "@/lib/audience-overlap"
import type { GoalKind } from "@/lib/case/goal-kind"

/** Dưới ngần này kết quả: chưa đủ để xếp hạng (vài lượt lẻ là may rủi). */
export const MIN_RESULTS_TO_RANK = 10
/** Hai nhóm dùng chung dưới tỉ lệ mẫu quảng cáo này = khác mẫu quảng cáo. */
export const MIN_SHARED_CREATIVES = 0.5
/** Cùng thang với lib/audience-overlap.ts (đo thật 117 nhóm: trên 75% mới là gần trùng). */
export const NEAR_DUPLICATE_PCT = 75
const Z95 = 1.96

export interface CompareAdset {
  id: string
  name: string
  campaignId: string
  campaignName: string
  goalKind: GoalKind
  status: string
  optEventKey: string
  optEventLabel: string
  learning: string | null
  targeting: Record<string, unknown>
  creativeIds: string[]
  spend: number
  impressions: number
  reach: number
  frequency: number | null
  linkClicks: number
  results: number
  value: number
}

export interface RankedAdset extends CompareAdset {
  costPerResult: number | null
  /** Khoảng tin cậy 95% của chi phí mỗi kết quả (Poisson). null khi 0 kết quả. */
  cprLow: number | null
  cprHigh: number | null
  ctr: number | null
  clickToResult: number | null
  enough: boolean
  rank: number | null
  flags: string[]
}

export type CompareVerdict = "winner" | "leaning" | "undecided" | "not_enough"

export interface CompareGroup {
  goalKind: GoalKind
  verdict: CompareVerdict
  winnerId: string | null
  summary: string
  rows: RankedAdset[]
}

/** Khoảng tin cậy 95% của một số đếm Poisson (Wilson–Hilferty) — HÀM THUẦN. */
export function poissonInterval(n: number): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 3.689 } // cận trên chính xác cho n=0
  const lo = n * Math.pow(1 - 1 / (9 * n) - Z95 / (3 * Math.sqrt(n)), 3)
  const m = n + 1
  const hi = m * Math.pow(1 - 1 / (9 * m) + Z95 / (3 * Math.sqrt(m)), 3)
  return { low: Math.max(0, lo), high: hi }
}

const jaccard = (a: string[], b: string[]) => {
  if (!a.length && !b.length) return 1
  const B = new Set(b)
  const inter = a.filter((x) => B.has(x)).length
  return inter / new Set([...a, ...b]).size
}
const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`

export function rankAdsets(rows: CompareAdset[]): RankedAdset[] {
  return rows.map((r) => {
    const ci = poissonInterval(r.results)
    return {
      ...r,
      costPerResult: r.results > 0 ? r.spend / r.results : null,
      cprLow: r.results > 0 ? r.spend / ci.high : null,
      cprHigh: r.results > 0 && ci.low > 0 ? r.spend / ci.low : null,
      ctr: r.impressions > 0 ? r.linkClicks / r.impressions : null,
      clickToResult: r.linkClicks > 0 ? r.results / r.linkClicks : null,
      enough: r.results >= MIN_RESULTS_TO_RANK && !(r.learning === "LEARNING"),
      rank: null,
      flags: [],
    }
  })
}

/** So các nhóm CÙNG loại kết quả (mua với mua, lead với lead) — HÀM THUẦN. */
export function compareGroup(goalKind: GoalKind, input: CompareAdset[]): CompareGroup {
  const word = goalKind === "leads" ? "lead" : "lượt mua"
  const rows = rankAdsets(input.filter((r) => r.spend > 0))
  const eligible = rows.filter((r) => r.enough && r.costPerResult !== null).sort((a, b) => a.costPerResult! - b.costPerResult!)
  eligible.forEach((r, i) => { r.rank = i + 1 })
  for (const r of rows) {
    if (r.learning === "LEARNING") r.flags.push("Đang học — số còn dao động, chưa xếp hạng")
    else if (r.results < MIN_RESULTS_TO_RANK) r.flags.push(`Mới ${r.results} ${word} (cần ≥ ${MIN_RESULTS_TO_RANK}) — chưa xếp hạng`)
    if (r.learning === "FAIL") r.flags.push("Meta báo học thất bại")
  }
  const best = eligible[0]
  if (best) {
    for (const r of rows) {
      if (r === best) continue
      if (r.optEventKey !== best.optEventKey) r.flags.push(`Khác sự kiện tối ưu (${r.optEventLabel} so với ${best.optEventLabel}) — không so thẳng được`)
      if (jaccard(r.creativeIds, best.creativeIds) < MIN_SHARED_CREATIVES) r.flags.push("Khác mẫu quảng cáo với nhóm dẫn đầu — chênh lệch có thể do quảng cáo, không phải do tệp")
      const sim = computeTargetingSimilarity({ targeting: r.targeting } as never, { targeting: best.targeting } as never).overall * 100
      if (sim >= NEAR_DUPLICATE_PCT) r.flags.push(`Tệp gần trùng nhóm dẫn đầu (${Math.round(sim)}%) — hai nhóm đang tranh cùng người trong đấu giá`)
    }
  }
  const zeroBurn = rows.filter((r) => r.results === 0 && best?.costPerResult && r.spend >= 2 * best.costPerResult)
  for (const r of zeroBurn) r.flags.push(`Chi ${vnd(r.spend)} (≥ 2 lần chi phí/${word} của nhóm dẫn đầu) mà 0 ${word}`)

  if (eligible.length === 0) return { goalKind, verdict: "not_enough", winnerId: null, rows, summary: `Chưa nhóm nào đủ ${MIN_RESULTS_TO_RANK} ${word} (và ra khỏi giai đoạn học) để xếp hạng — chạy thêm rồi so lại.` }
  if (eligible.length === 1) {
    const losers = rows.filter((r) => r !== best && r.results === 0 && r.spend >= 2 * best.costPerResult!)
    return {
      goalKind, verdict: losers.length ? "winner" : "not_enough", winnerId: losers.length ? best.id : null, rows,
      summary: losers.length
        ? `“${best.name}” là nhóm duy nhất đủ số (${vnd(best.costPerResult!)}/${word}); ${losers.length} nhóm khác chi gấp đôi mức đó mà 0 ${word}.`
        : `Chỉ “${best.name}” đủ số (${vnd(best.costPerResult!)}/${word}) — các nhóm khác chưa đủ để so.`,
    }
  }
  const second = eligible[1]
  const clean = best.cprHigh !== null && eligible.slice(1).every((r) => r.cprLow !== null && best.cprHigh! < r.cprLow!)
  const comparable = !second.flags.some((f) => f.startsWith("Khác sự kiện") || f.startsWith("Khác mẫu"))
  const gap = Math.round((second.costPerResult! / best.costPerResult! - 1) * 100)
  if (clean && comparable) return { goalKind, verdict: "winner", winnerId: best.id, rows, summary: `“${best.name}” thắng: ${vnd(best.costPerResult!)}/${word}, rẻ hơn nhóm kế tiếp ${gap}% — khoảng tin cậy 95% không chồng nhau.` }
  if (clean) return { goalKind, verdict: "leaning", winnerId: best.id, rows, summary: `“${best.name}” rẻ nhất (${vnd(best.costPerResult!)}/${word}, hơn ${gap}%) và tách biệt về số — nhưng nhóm kế tiếp khác sự kiện hoặc mẫu quảng cáo nên chưa chắc là do tệp.` }
  return { goalKind, verdict: "leaning", winnerId: best.id, rows, summary: `“${best.name}” đang rẻ nhất (${vnd(best.costPerResult!)}/${word}, hơn ${gap}%) nhưng khoảng tin cậy còn chồng nhau — chưa đủ để chắc là tệp tốt hơn. Chạy thêm để so lại.` }
}
