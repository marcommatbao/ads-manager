// ============================================================
// Đợt 11+ — ĐÁNH GIÁ & LỘ TRÌNH tách lượt tìm chung khỏi chiến dịch thương hiệu (user 29/09: "đưa hướng giải quyết … cho ổn định")
// ============================================================
// Không chỉ có nút làm: nói rõ HIỆN TRẠNG (số), CẤU TRÚC ĐÍCH, CHIA NGÂN SÁCH (2 phương án: giữ tổng / tăng tổng), ĐẶT GIÁ cho
// chiến dịch Chung, LỘ TRÌNH theo ngày (không đụng gì 14 ngày học), TIÊU CHÍ THÀNH CÔNG / DỪNG, HOÀN TÁC. Hàm thuần — số từ
// X-quang Search + kế hoạch tách. Ước tính nhu cầu thương hiệu là THÔ (từ tỉ lệ mất hiển thị cấp chiến dịch) — ghi rõ.
import { BRAND_INTENTS, type SearchCampaign } from "./xray"
import type { SplitPlan } from "./split"

export interface SplitAssessment {
  now: string[]
  structure: { name: string; role: string; keywords: string; budgetPerDay: number; bidding: string }[]
  budgetOptions: { id: "keep_total" | "grow"; label: string; brandBudget: number; genericBudget: number; total: number; note: string }[]
  recommendedOption: "keep_total" | "grow"
  bidding: string[]
  timeline: { when: string; what: string }[]
  success: string[]
  abort: string[]
  caveats: string[]
}
const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`
const round10k = (n: number) => Math.max(50_000, Math.round(n / 10_000) * 10_000)

export function assessSplit(input: { plan: SplitPlan; campaign: SearchCampaign; days: number; targetCpa?: number | null }): SplitAssessment {
  const { plan, campaign: c } = input
  const days = Math.max(1, input.days)
  const brand = c.intents.filter((i) => BRAND_INTENTS.includes(i.intent)), other = c.intents.filter((i) => !BRAND_INTENTS.includes(i.intent))
  const s = (xs: typeof brand, f: "cost" | "purchases") => xs.reduce((a, x) => a + x[f], 0)
  const bCost = s(brand, "cost"), bP = s(brand, "purchases"), oCost = s(other, "cost"), oP = s(other, "purchases")
  const bCpa = bP ? bCost / bP : null, oCpa = oP ? oCost / oP : null
  const bDay = bCost / days
  const lostB = c.lostBudget ?? 0, is = c.impressionShare ?? null
  // Ước tính THÔ nhu cầu thương hiệu nếu hết mất vì ngân sách: chi thương hiệu × (IS + mất-vì-ngân-sách) / IS.
  const brandNeed = is && is > 0 ? Math.min(bDay * ((is + lostB) / is), c.budget * 2) : bDay * 1.5
  const genericBudget = plan.budgetPerDay
  const keepBrand = Math.max(round10k(bDay * 1.2), round10k(c.budget - genericBudget))
  const options: SplitAssessment["budgetOptions"] = [
    { id: "keep_total", label: "Giữ tổng ngân sách", brandBudget: round10k(c.budget - genericBudget) > round10k(bDay * 1.2) ? round10k(c.budget - genericBudget) : keepBrand, genericBudget, total: 0, note: "" },
    { id: "grow", label: "Giữ thương hiệu nguyên ngân sách cũ", brandBudget: round10k(c.budget), genericBudget, total: 0, note: "" },
  ]
  for (const o of options) { o.total = o.brandBudget + o.genericBudget; o.note = o.brandBudget >= brandNeed ? `Đủ cho nhu cầu thương hiệu ước tính ~${vnd(brandNeed)}/ngày.` : `Thấp hơn nhu cầu thương hiệu ước tính ~${vnd(brandNeed)}/ngày — vẫn hơn hiện tại (${vnd(bDay)}/ngày) vì hết bị lượt tìm chung ăn.` }
  options[0].note += ` Tổng ${vnd(options[0].total)}/ngày (hiện ${vnd(c.budget)}).`
  options[1].note += ` Tổng tăng lên ${vnd(options[1].total)}/ngày — đổi lại có thêm dư địa thương hiệu rẻ (CPA ${bCpa ? vnd(bCpa) : "—"}).`
  const recommended = bCpa && oCpa && oCpa >= 2 * bCpa ? "grow" : "keep_total"
  const target = input.targetCpa ?? null
  return {
    now: [
      `${c.name}: ${vnd(c.cost)} trong ${days} ngày — lượt tìm THƯƠNG HIỆU ${vnd(bCost)} → ${Math.round(bP)} đơn (CPA ${bCpa ? vnd(bCpa) : "—"}); lượt tìm CHUNG/MUA ${vnd(oCost)} → ${Math.round(oP)} đơn (CPA ${oCpa ? vnd(oCpa) : "—"}).`,
      `Chung một ngân sách ${vnd(c.budget)}/ngày → mất ${Math.round(lostB * 100)}% hiển thị vì ngân sách: lượt tìm chung (đắt${bCpa && oCpa ? ` gấp ${(oCpa / bCpa).toFixed(1)} lần` : ""}) ăn trước, lượt tìm thương hiệu (rẻ, khách tìm đúng mình) bị hụt.`,
      `Tách ra để MỖI loại có ngân sách + mục tiêu riêng — không phải cắt lượt tìm chung (vẫn ra ${Math.round(oP)} đơn).`,
    ],
    structure: [
      { name: c.name, role: "Thương hiệu", keywords: `${plan.brandKeywords} từ khoá thương hiệu (giữ nguyên)`, budgetPerDay: options.find((o) => o.id === recommended)!.brandBudget, bidding: "Giữ nguyên đặt giá hiện tại" },
      { name: plan.newName, role: "Lượt tìm chung", keywords: `${plan.adGroups.reduce((a, g) => a + g.keywords.length, 0)} từ khoá chung chuyển sang + phủ định ${plan.brandNegatives.length} cụm thương hiệu`, budgetPerDay: genericBudget, bidding: `${plan.bidding} — 2 tuần đầu KHÔNG đặt mục tiêu CPA` },
    ],
    budgetOptions: options,
    recommendedOption: recommended,
    bidding: [
      "Chiến dịch Chung: 2 tuần đầu để Google học (Tối đa hoá chuyển đổi, không mục tiêu CPA) — đặt mục tiêu sớm khi chưa đủ số làm chiến dịch chạy hụt.",
      `Sau 14 ngày (khi ≥ 30 đơn): đặt mục tiêu CPA ≈ CPA thực tế của chiến dịch Chung${oCpa ? ` (hiện ~${vnd(oCpa)})` : ""}${target ? `, rồi hạ dần 10%/tuần về mục tiêu sản phẩm ${vnd(target)}` : " — nhập mục tiêu CPA sản phẩm ở Xử lý chiến dịch → Mục tiêu để tool so"}.`,
      "Chiến dịch Thương hiệu: không đổi đặt giá. Nếu 14 ngày sau chi thực tế < 80% ngân sách → hạ ngân sách về chi thực tế × 1,2.",
    ],
    timeline: [
      { when: "Ngày 0", what: "Tab X-quang → Tách lượt tìm chung → Kiểm trước → Tạo (chiến dịch Chung TẠM DỪNG). Xem lại từ khoá/quảng cáo đã chép." },
      { when: "Ngày 0 (cùng lúc)", what: "Bật chiến dịch Chung → bấm \"Chuyển từ khoá chung\" (tạm dừng từ khoá chung ở chiến dịch Thương hiệu). Làm CÙNG buổi để không có khoảng trống." },
      { when: "Ngày 0", what: `Đặt ngân sách theo phương án đã chọn (Thương hiệu ${vnd(options.find((o) => o.id === recommended)!.brandBudget)}/ngày).` },
      { when: "Ngày 1–14", what: "KHÔNG sửa ngân sách > 20%, KHÔNG sửa quảng cáo/mục tiêu — mỗi lần sửa lớn Google học lại từ đầu." },
      { when: "Ngày 7", what: "Mở bản tách → Đo lại (mốc 7 ngày): xem các tiêu chí bên dưới. Chỉ dừng nếu chạm tiêu chí DỪNG." },
      { when: "Ngày 14", what: "Đo lại mốc 14 ngày. Đạt → đặt mục tiêu CPA cho chiến dịch Chung, chỉnh ngân sách Thương hiệu theo chi thực tế." },
    ],
    success: [
      "Chiến dịch Thương hiệu: mất hiển thị vì ngân sách < 15% (hiện " + Math.round(lostB * 100) + "%), CPA thương hiệu không tăng quá 20%.",
      "Chiến dịch Chung: CPA không tệ hơn CPA lượt tìm chung trước khi tách" + (oCpa ? ` (~${vnd(oCpa)})` : "") + ".",
      "Tổng đơn Mua hàng của 2 chiến dịch ≥ trước khi tách (cùng số ngày).",
    ],
    abort: [
      "Tổng đơn 7 ngày giảm > 20% so với 7 ngày trước khi tách → Hoàn tác chuyển từ khoá + tạm dừng chiến dịch Chung (tool làm được, 1 chạm).",
      "Chiến dịch Chung không chi được (< 30% ngân sách) sau 5 ngày → kiểm từ khoá/quảng cáo bị từ chối.",
    ],
    caveats: [
      "Nhu cầu thương hiệu ước tính THÔ từ tỉ lệ mất hiển thị cấp chiến dịch (Google không tách theo từ khoá).",
      "Từ khoá chung mới ở chiến dịch mới không mang theo lịch sử điểm chất lượng — vài ngày đầu giá có thể cao hơn.",
      ...plan.notes,
    ],
  }
}

/** Đo lại theo mốc — HÀM THUẦN: so N ngày trước lúc chuyển với N ngày sau, gộp 2 chiến dịch. */
/** Đợt 19d (18j): đơn THẬT (nguồn đơn → hành động phụ "Lead chốt đơn") của gốc + bản tách. Đủ số thì kết luận theo đơn thật. */
export const REAL_MIN_FOR_VERDICT = 10
export function checkpoint(before: { brand: SearchCampaign | null; generic: SearchCampaign | null }, after: { brand: SearchCampaign | null; generic: SearchCampaign | null }, days: number, real: { before: number; after: number } | null = null): { lines: string[]; verdict: "tot" | "theo_doi" | "dung"; basis?: "google" | "real" } {
  const p = (x: { brand: SearchCampaign | null; generic: SearchCampaign | null }) => (x.brand?.purchases ?? 0) + (x.generic?.purchases ?? 0)
  const cost = (x: { brand: SearchCampaign | null; generic: SearchCampaign | null }) => (x.brand?.cost ?? 0) + (x.generic?.cost ?? 0)
  const pb = p(before), pa = p(after), change = pb > 0 ? pa / pb - 1 : null
  const lost = after.brand?.lostBudget ?? null
  const lines = [
    `Tổng đơn Mua hàng ${days} ngày: ${Math.round(pb)} → ${Math.round(pa)}${change != null ? ` (${change >= 0 ? "+" : ""}${Math.round(change * 100)}%)` : ""}; chi ${vnd(cost(before))} → ${vnd(cost(after))}.`,
    `Thương hiệu: mất hiển thị vì ngân sách ${before.brand?.lostBudget != null ? Math.round(before.brand.lostBudget * 100) + "%" : "—"} → ${lost != null ? Math.round(lost * 100) + "%" : "—"}; CPA ${before.brand?.cpa ? vnd(before.brand.cpa) : "—"} → ${after.brand?.cpa ? vnd(after.brand.cpa) : "—"}.`,
    `Chung: chi ${vnd(after.generic?.cost ?? 0)} · ${Math.round(after.generic?.purchases ?? 0)} đơn · CPA ${after.generic?.cpa ? vnd(after.generic.cpa) : "—"}.`,
  ]
  const useReal = !!real && real.before + real.after >= REAL_MIN_FOR_VERDICT && real.before > 0
  const rc = useReal ? real!.after / real!.before - 1 : null
  if (real) lines.push(`Đơn THẬT (đã thu tiền, Google khớp được): ${Math.round(real.before)} → ${Math.round(real.after)}${rc != null ? ` (${rc >= 0 ? "+" : ""}${Math.round(rc * 100)}%)` : ""}${useReal ? " — kết luận theo đơn thật." : ` — chưa đủ ${REAL_MIN_FOR_VERDICT} đơn, kết luận theo đơn Google tự báo.`}`)
  const ch = useReal ? rc : change
  const verdict = ch != null && ch < -0.2 ? "dung" : ch != null && ch >= 0 && (lost == null || lost < 0.15) ? "tot" : "theo_doi"
  const what = useReal ? "Đơn thật" : "Tổng đơn"
  lines.push(verdict === "dung" ? `✕ ${what} giảm > 20% — cân nhắc HOÀN TÁC chuyển từ khoá.` : verdict === "tot" ? `✓ Đạt: ${what.toLowerCase()} không giảm, thương hiệu hết bị hụt ngân sách.` : "○ Theo dõi tiếp — chưa chạm tiêu chí dừng.")
  return { lines, verdict, basis: useReal ? "real" : "google" }
}
