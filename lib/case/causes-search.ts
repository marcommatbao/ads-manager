// ============================================================
// Nguyên nhân "tốn tiền mà không ra đơn" — chiến dịch Google Search
// ============================================================
// Hàm thuần: bằng chứng vào → nguyên nhân xếp theo tiền + danh sách "đã kiểm,
// không phải nguyên nhân". Luật rút từ ca thật Search HĐĐT 20/7 (MBI, 25/09).
// Không có luật nào được kết luận trên phần dữ liệu KHÔNG thấy: Google ẩn
// một phần lượt tìm, tỉ lệ thấy được luôn đi kèm (`visibleTermShare`).

import { bucketByIntent, intentOf, type IntentLexicon } from "./intent"
import { stripDiacritics, tokens } from "./text"
import { blocks } from "./simulate-negatives"
import type { Cause, CheckedOk, Diagnosis, SearchEvidence } from "./types"

const SMART_BIDDING = new Set(["MAXIMIZE_CONVERSIONS", "TARGET_CPA", "MAXIMIZE_CONVERSION_VALUE", "TARGET_ROAS"])
/** Từ khoá "rộng" bị nêu tên khi ăn ≥ 5% chi phí chiến dịch với điểm chất lượng ≤ 4. */
const LOWQS_MAX = 4
const LOWQS_MIN_SHARE = 0.05
/** Một nhóm ý định chỉ thành nguyên nhân khi ≥ 2% phần chi phí thấy được. */
const BUCKET_MIN_SHARE = 0.02

export interface DiagnoseOptions {
  lexicon: IntentLexicon
  /** Trần chi phí/đơn (VND) nếu chấm theo CPA — để biết đã chi "đủ để kết luận" chưa. */
  ceilingCpa: number | null
  /** Đợt 23 (3d): chiến dịch thu lead — bỏ các kiểm "Mua hàng" (đặt giá theo lead là ĐÚNG mục tiêu). Mặc định sales. */
  goalKind?: "sales" | "leads"
}

const NETWORK_VI: Record<string, string> = {
  SEARCH: "Tìm kiếm", SEARCH_PARTNERS: "Đối tác tìm kiếm", CONTENT: "Hiển thị", YOUTUBE: "YouTube",
  GMAIL: "Gmail", DISCOVER: "Khám phá", MAPS: "Maps", MIXED: "Nhiều kênh", GOOGLE_TV: "Google TV",
}

const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`
const pct1 = (x: number) => (x * 100).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function diagnoseSearch(ev: SearchEvidence, opts: DiagnoseOptions): Diagnosis {
  const c = ev.campaign
  const causes: Cause[] = []
  const notCauses: CheckedOk[] = []
  const context: string[] = []

  const visible = ev.searchTerms.reduce((s, t) => s + t.cost, 0)
  // Pmax: lượt tìm chỉ phủ kênh Tìm kiếm — so với chi phí kênh đó, không với tổng chi Pmax.
  const searchSlice = ev.kind === "google_pmax" ? ev.network?.find((n) => n.network === "SEARCH") : undefined
  const termBase = searchSlice ? searchSlice.cost : c.cost
  const visibleTermShare = termBase > 0 ? Math.min(1, visible / termBase) : 0
  const buckets = bucketByIntent(ev.searchTerms, opts.lexicon)
  const bucket = (k: string) => buckets.find((b) => b.intent === k)

  // ── Đo lường ────────────────────────────────────────────────
  if (opts.goalKind === "leads") {
    notCauses.push({ id: "measurement-ok", text: `Chiến dịch thu lead — đang đặt giá theo: ${ev.biddableCategories.join(", ")}. Chấm theo chi phí mỗi lead.` })
  } else if (!ev.biddableCategories.includes("PURCHASE")) {
    causes.push({
      id: "goal-not-purchase",
      title: "Chiến dịch không đặt giá theo “Mua hàng”",
      detail: `Đang tối ưu theo: ${ev.biddableCategories.join(", ") || "không rõ"}. Google đang học sai mục tiêu.`,
      money: c.cost, share: 1, shareOf: "campaign_cost", evidence: [],
    })
  } else if (ev.purchasesElsewhere > 0) {
    notCauses.push({ id: "measurement-ok", text: `Đo lường: chiến dịch đặt giá theo “Mua hàng”; tag mua hàng vẫn ghi ${ev.purchasesElsewhere.toLocaleString("vi-VN")} đơn ở chiến dịch khác.` })
  } else {
    causes.push({
      id: "measurement-unverified",
      title: "Không chứng minh được tag “Mua hàng” đang chạy",
      detail: "Cả tài khoản không ghi đơn mua nào trong kỳ — kiểm tag trên trang cảm ơn trước khi sửa gì khác.",
      money: null, share: null, shareOf: null, evidence: [],
    })
  }

  // ── Pmax: phần kênh Tìm kiếm tốn tiền mà không ra đơn ─────────
  if (ev.kind === "google_pmax" && searchSlice && searchSlice.conversions === 0
      && (opts.ceilingCpa === null || searchSlice.cost >= opts.ceilingCpa)) {
    causes.push({
      id: "pmax-search-no-orders",
      title: "Phần chạy trên kênh Tìm kiếm tốn tiền mà 0 đơn",
      detail: `Đơn của chiến dịch đến từ kênh khác. Kênh Tìm kiếm: ${searchSlice.clicks.toLocaleString("vi-VN")} click, 0 đơn.`,
      money: searchSlice.cost, share: c.cost > 0 ? searchSlice.cost / c.cost : null, shareOf: "campaign_cost",
      evidence: (ev.network ?? []).filter((n) => n.cost > 0).map((n) => ({
        label: `${NETWORK_VI[n.network] ?? n.network} · ${n.conversions.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} đơn`, cost: n.cost, clicks: n.clicks,
      })),
    })
  }

  // ── Từ khoá rộng, điểm chất lượng thấp ───────────────────────
  const lowQs = ev.keywords
    .filter((k) => k.status === "ENABLED" && k.match !== "EXACT" && k.qualityScore !== null && k.qualityScore <= LOWQS_MAX)
    .filter((k) => c.cost > 0 && k.cost / c.cost >= LOWQS_MIN_SHARE)
    .sort((a, b) => b.cost - a.cost)
  if (lowQs.length) {
    const money = lowQs.reduce((s, k) => s + k.cost, 0)
    const lpBad = lowQs.some((k) => k.landingExperience === "BELOW_AVERAGE")
    const ctrBad = lowQs.some((k) => k.expectedCtr === "BELOW_AVERAGE")
    causes.push({
      id: "broad-lowqs",
      title: `${lowQs.length} từ khoá rộng, điểm chất lượng ≤ ${LOWQS_MAX}/10`,
      detail: [
        lpBad && "trải nghiệm trang đích dưới trung bình",
        ctrBad && "CTR dự kiến dưới trung bình",
      ].filter(Boolean).join(" · ") || "điểm chất lượng thấp",
      money, share: money / c.cost, shareOf: "campaign_cost",
      evidence: lowQs.map((k) => ({ label: `“${k.text}” (${k.match}) · QS ${k.qualityScore}/10`, cost: k.cost, clicks: k.clicks })),
    })
  }

  // ── Tiền rơi theo ý định lượt tìm ────────────────────────────
  const intentCause = (id: string, keys: string[], title: string, detail: string) => {
    const bs = keys.map(bucket).filter(Boolean) as NonNullable<ReturnType<typeof bucket>>[]
    const money = bs.reduce((s, b) => s + b.cost, 0)
    if (visible <= 0 || money / visible < BUCKET_MIN_SHARE) return
    const clicks = bs.reduce((s, b) => s + b.clicks, 0)
    const terms = bs.reduce((s, b) => s + b.terms, 0)
    const conv = bs.reduce((s, b) => s + b.conversions, 0)
    causes.push({
      id, title,
      detail: `${terms.toLocaleString("vi-VN")} cụm từ · ${clicks.toLocaleString("vi-VN")} click · ${conv.toLocaleString("vi-VN")} đơn. ${detail}`,
      money, share: money / visible, shareOf: "visible_terms",
      evidence: bs.flatMap((b) => b.examples).sort((a, z) => z.cost - a.cost).slice(0, 8)
        .map((e) => ({ label: e.term, cost: e.cost, clicks: e.clicks })),
    })
  }
  intentCause("competitor-spend", ["competitor"], "Tiền rơi vào người tìm tên đối thủ", "Phần lớn là khách của họ đi tra cứu hoặc tìm tổng đài.")
  intentCause("info-howto", ["info"], "Người tìm cách làm", "Hỏi kiến thức, chưa có ý định mua.")
  intentCause("existing-customer", ["own_brand", "own_other"], "Khách cũ tìm thương hiệu để tra cứu/đăng nhập, hoặc tìm sản phẩm khác của Mắt Bão", "Không phải khách mới cho sản phẩm này.")
  intentCause("lookup", ["lookup"], "Người tra cứu / gõ địa chỉ trang", "Điều hướng, không phải mua.")

  // ── Giá thầu tự động không có đơn để học ─────────────────────
  const judged = opts.ceilingCpa === null || c.cost >= opts.ceilingCpa
  if (SMART_BIDDING.has(c.biddingType) && c.orders === 0 && judged) {
    const single = ev.searchTerms.filter((t) => t.clicks === 1).sort((a, b) => b.cost - a.cost).slice(0, 4)
    const target = c.targetCpa ? ` · CPA mục tiêu ${vnd(c.targetCpa)}` : c.targetRoas ? ` · ROAS mục tiêu ${c.targetRoas}` : ""
    causes.push({
      id: "blind-bidding",
      title: "Giá thầu tự động “mù”: không có đơn nào để học",
      detail: `${c.biddingType}${target}. Không có đơn làm mẫu thì Google đặt giá cao để “thử” — khuếch đại các nguyên nhân khác.`,
      money: null, share: null, shareOf: null,
      evidence: single.map((t) => ({ label: `${t.term} (1 click)`, cost: t.cost })),
    })
  }

  // ── Phủ định mỏng / bỏ sót dạng không dấu / từ khoá đối thủ còn bật ──
  const negKws = ev.negatives.map((n) => ({ text: n.text, match: (n.match === "EXACT" || n.match === "BROAD" ? n.match : "PHRASE") as "PHRASE" | "EXACT" | "BROAD" }))
  const compNegs = ev.negatives.filter((n) => intentOf(n.text, opts.lexicon) === "competitor").length
  const accentGaps = negKws.filter((n) => stripDiacritics(n.text) !== tokens(n.text).join(" "))
    .filter((n) => !negKws.some((m) => tokens(m.text).join(" ") === stripDiacritics(n.text)))
    .filter((n) => ev.searchTerms.some((t) => blocks(t.term, { text: stripDiacritics(n.text), match: n.match }) && !blocks(t.term, n)))
    .map((n) => n.text)
  const compKws = ev.keywords.filter((k) => k.status === "ENABLED" && intentOf(k.text, opts.lexicon) === "competitor")
  const compKwImpr = compKws.reduce((s, k) => s + k.impressions, 0)
  const compKwCost = compKws.reduce((s, k) => s + k.cost, 0)
  const competitorMoney = bucket("competitor")?.cost ?? 0
  if ((compNegs === 0 && competitorMoney > 0) || accentGaps.length > 0 || compKws.length > 0) {
    const parts = [`${ev.negatives.length} phủ định, ${compNegs} tên đối thủ.`]
    if (accentGaps.length) parts.push(`Có phủ định có dấu nhưng lượt tìm không dấu vẫn lọt: ${accentGaps.map((a) => `“${a}”`).join(", ")}.`)
    if (compKws.length) parts.push(`Chiến dịch vẫn bật ${compKws.length} từ khoá chứa tên đối thủ (${compKwImpr.toLocaleString("vi-VN")} lượt hiển thị, ${vnd(compKwCost)} trong kỳ).`)
    causes.push({
      id: "thin-negatives", title: "Phủ định mỏng và bỏ sót dạng không dấu",
      detail: parts.join(" "), money: null, share: null, shareOf: null,
      evidence: compKws.slice(0, 8).map((k) => ({ label: `từ khoá đang bật: “${k.text}” (${k.match})`, cost: k.cost })),
    })
  }

  // ── Trang đích, quảng cáo ────────────────────────────────────
  const mainLp = [...ev.landingPages].sort((a, b) => b.clicks - a.clicks)[0]
  if (mainLp) {
    const acc = ev.landingConversionsAccount.find((l) => l.url === mainLp.url)
    if (acc && acc.conversions > 0) {
      notCauses.push({ id: "landing-alive", text: `Trang đích ${mainLp.url} vẫn ra ${acc.conversions.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} đơn ở chiến dịch khác → trang không hỏng.` })
    }
  }
  if (ev.ads.length && ev.ads.every((a) => a.approval === "APPROVED")) {
    notCauses.push({ id: "ads-approved", text: `Quảng cáo đã được duyệt (${ev.ads.length}).` })
  } else if (ev.ads.some((a) => a.approval === "DISAPPROVED")) {
    causes.push({ id: "ads-disapproved", title: "Có quảng cáo bị từ chối", detail: "Xem mục Chính sách quảng cáo.", money: null, share: null, shareOf: null, evidence: [] })
  }

  if (c.lostIsBudget !== null && c.lostIsBudget > 0.3) {
    context.push(`Mất ${pct1(c.lostIsBudget)}% lượt hiển thị vì ngân sách — tăng ngân sách lúc này chỉ mua thêm lượt tìm lạc đề.`)
  }
  if (ev.kind === "google_pmax" && ev.network?.length) {
    const top = ev.network.filter((n) => n.cost > 0).slice(0, 4)
      .map((n) => `${NETWORK_VI[n.network] ?? n.network} ${vnd(n.cost)} (${n.conversions.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} đơn)`)
    context.push(`Chi phí theo kênh: ${top.join(" · ")}.`)
  }
  if (visibleTermShare < 0.95) {
    context.push(`Google ẩn ${pct1(1 - visibleTermShare)}% chi phí từ khoá khách tìm${searchSlice ? " (của kênh Tìm kiếm)" : ""}; các nhóm ý định chỉ tính trên phần thấy được.`)
  }

  const withMoney = causes.filter((x) => x.money !== null).sort((a, b) => b.money! - a.money!)
  const noMoney = causes.filter((x) => x.money === null)
  return { causes: [...withMoney, ...noMoney], notCauses, visibleTermShare, context }
}
