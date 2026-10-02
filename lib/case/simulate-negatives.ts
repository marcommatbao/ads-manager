// ============================================================
// Mô phỏng từ khoá phủ định TRƯỚC khi ghi
// ============================================================
// Trả lời 2 câu user cần trước khi bấm duyệt: chặn được bao nhiêu tiền, và
// có chặn nhầm người mua không. Ngữ nghĩa bám Google cho phủ định:
//   - PHRASE: dãy từ xuất hiện liền nhau, đúng thứ tự
//   - EXACT:  toàn bộ lượt tìm đúng bằng dãy từ
//   - BROAD:  mọi từ đều có mặt, thứ tự bất kỳ
//   - KHÔNG khớp biến thể — "tra cứu" không chặn "tra cuu". Vì thế
//     `withAccentVariants` sinh thêm bản không dấu cho từng phủ định.

import { containsSequence, stripDiacritics, tokens } from "./text"

export type NegMatch = "PHRASE" | "EXACT" | "BROAD"
export interface NegativeKw { text: string; match: NegMatch }

export interface SimTerm {
  term: string
  cost: number
  clicks: number
  /** Đơn mua (chuyển đổi dùng để đặt giá). */
  conversions: number
  allConversions: number
}

export interface SimKeyword { text: string; match: string; status: string; cost: number; impressions: number }

export function blocks(term: string, neg: NegativeKw): boolean {
  const t = tokens(term)
  const n = tokens(neg.text)
  if (n.length === 0) return false
  if (neg.match === "EXACT") return t.length === n.length && t.every((w, i) => w === n[i])
  if (neg.match === "BROAD") return n.every((w) => t.includes(w))
  return containsSequence(t, n)
}

/** Thêm bản không dấu của mỗi phủ định (nếu khác), bỏ trùng. Giữ thứ tự: bản gốc trước. */
export function withAccentVariants(list: NegativeKw[]): NegativeKw[] {
  const seen = new Set<string>()
  const out: NegativeKw[] = []
  const push = (n: NegativeKw) => {
    const key = `${n.match}|${tokens(n.text).join(" ")}`
    if (!seen.has(key)) { seen.add(key); out.push({ text: tokens(n.text).join(" "), match: n.match }) }
  }
  for (const n of list) {
    push(n)
    const bare = stripDiacritics(n.text)
    if (tokens(bare).join(" ") !== tokens(n.text).join(" ")) push({ text: bare, match: n.match })
  }
  return out
}

export interface SimulationResult {
  blockedTerms: number
  blockedCost: number
  /** Đơn mua sẽ mất — phải là 0 thì mới nên áp. */
  blockedConversions: number
  blockedAllConversions: number
  examples: { term: string; cost: number; by: string }[]
  /** Lượt tìm bị chặn mà CÓ đơn hoặc chuyển đổi phụ — cho người duyệt xem kỹ. */
  withConversions: { term: string; cost: number; conversions: number; allConversions: number; by: string }[]
  /** Từ khoá ĐANG BẬT của chính chiến dịch sẽ bị phủ định chặn luôn. */
  ownKeywordsBlocked: { text: string; match: string; cost: number; impressions: number; by: string }[]
}

export function simulateNegatives(terms: SimTerm[], negatives: NegativeKw[], keywords: SimKeyword[] = []): SimulationResult {
  const res: SimulationResult = {
    blockedTerms: 0, blockedCost: 0, blockedConversions: 0, blockedAllConversions: 0,
    examples: [], withConversions: [], ownKeywordsBlocked: [],
  }
  for (const t of terms) {
    const hit = negatives.find((n) => blocks(t.term, n))
    if (!hit) continue
    res.blockedTerms += 1
    res.blockedCost += t.cost
    res.blockedConversions += t.conversions
    res.blockedAllConversions += t.allConversions
    res.examples.push({ term: t.term, cost: t.cost, by: hit.text })
    if (t.conversions > 0 || t.allConversions > 0) {
      res.withConversions.push({ term: t.term, cost: t.cost, conversions: t.conversions, allConversions: t.allConversions, by: hit.text })
    }
  }
  res.examples.sort((a, b) => b.cost - a.cost)
  res.examples = res.examples.slice(0, 20)
  for (const k of keywords) {
    if (k.status !== "ENABLED") continue
    const hit = negatives.find((n) => blocks(k.text, { text: n.text, match: "PHRASE" }))
    if (hit) res.ownKeywordsBlocked.push({ text: k.text, match: k.match, cost: k.cost, impressions: k.impressions, by: hit.text })
  }
  return res
}
