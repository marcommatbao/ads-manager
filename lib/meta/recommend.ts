// ============================================================
// Đợt 12 (D) — "Việc nên làm" Meta: từ X-quang → mở phiên xử lý đúng chiến dịch / sửa đo lường (HÀM THUẦN)
// ============================================================
// Việc GHI đi qua phiên /xu-ly có sẵn (Kiểm trước → xác nhận → đọc lại → hoàn tác): nguyên nhân "view-through-heavy" →
// tạo nhóm mới CHỈ tính lượt bấm 7 ngày; "opt-event-not-purchase" → nhóm mới tối ưu Mua hàng (Meta cấm sửa cả hai trên nhóm cũ).
import type { MetaXray } from "./xray"

export interface MetaRecommendation {
  id: string; priority: 1 | 2 | 3; title: string; why: string; moneyAtStake: number | null
  action: { type: "open_case"; campaignId: string; campaignName: string } | { type: "link"; href: string; label: string } | { type: "manual"; steps: string[] }
}
const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`
export const CASE_MIN_SPEND = 1_000_000

export function recommendMeta(x: Pick<MetaXray, "campaigns" | "warnings" | "totals">): MetaRecommendation[] {
  const out: MetaRecommendation[] = []
  for (const c of x.campaigns.filter((c) => c.flags.length && c.spend >= CASE_MIN_SPEND)) {
    const view = c.viewShare != null && c.purchases >= 10 && c.viewShare >= 0.6
    const opt = !!c.optEvent && c.optEvent !== "PURCHASE" && c.optEvent !== "LEAD"
    if (!view && !opt) continue
    out.push({ id: `rec_case_${c.id}`, priority: view ? 1 : 2, moneyAtStake: c.spend,
      title: `${c.name}: ${view ? `${Math.round((c.viewShare ?? 0) * 100)}% "mua hàng" là chỉ xem` : `tối ưu theo "${c.optEventLabel}"`}`,
      why: `${c.flags.join(" · ")}. Mở phiên xử lý → tool đề xuất tạo nhóm mới${opt ? " tối ưu Mua hàng" : ""}${view && c.includesView ? " CHỈ tính lượt bấm 7 ngày" : ""} (tạm dừng, dùng lại quảng cáo cũ, hoàn tác được).`,
      action: { type: "open_case", campaignId: c.id, campaignName: c.name } })
  }
  if (x.warnings.some((w) => w.id === "utm_source_chaos") || x.campaigns.some((c) => !c.utm.length && c.spend >= CASE_MIN_SPEND))
    out.push({ id: "rec_utm", priority: 2, moneyAtStake: null, title: "Chuẩn hoá utm cho quảng cáo Meta", why: `${x.warnings.find((w) => w.id === "utm_source_chaos")?.text ?? ""} Có utm chuẩn thì X-quang đối chiếu được đơn GA4 của TỪNG chiến dịch (hiện nhiều chiến dịch dùng chung utm hoặc không có).`.trim(), action: { type: "link", href: "/do-luong?tab=tags", label: "Mở bảng link chuẩn" } })
  if (x.totals.purchases >= 20 && x.totals.view / Math.max(x.totals.purchases, 1) >= 0.6)
    out.push({ id: "rec_report", priority: 3, moneyAtStake: null, title: "Chấm Meta theo đơn từ lượt bấm (và GA4), không theo số Meta mặc định", why: `Số mặc định gồm cả chỉ-xem 1 ngày: CPA ${vnd(x.totals.spend / Math.max(x.totals.purchases, 1))} trên giấy vs ${x.totals.click ? vnd(x.totals.spend / x.totals.click) : "—"} theo lượt bấm.`,
      action: { type: "manual", steps: ["Ads Manager → Cột → Tuỳ chỉnh → So sánh cửa sổ ghi nhận: bật \"7 ngày sau khi nhấp\" và \"1 ngày sau khi xem\" để thấy tách riêng", "Báo cáo/quyết định ngân sách dùng cột 7 ngày sau khi nhấp (X-quang này đã tách sẵn)", "Chiến dịch mới: khi tạo nhóm chọn cài đặt ghi nhận \"7 ngày sau khi nhấp\" (không kèm xem)"] } })
  return out.sort((a, b) => a.priority - b.priority || (b.moneyAtStake ?? 0) - (a.moneyAtStake ?? 0))
}
