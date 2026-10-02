// ============================================================
// Đợt 11b — "Việc nên làm" cho Search: từ X-quang + đề xuất → danh sách ưu tiên có nút làm (HÀM THUẦN)
// ============================================================
import type { SearchProposal } from "./controls"
import type { SearchXray } from "./xray"
import type { SplitRecord } from "./split"

export interface SearchRecommendation {
  id: string; priority: 1 | 2 | 3; title: string; why: string; moneyAtStake: number | null
  /** Mở luồng nào ở giao diện. */
  action: { type: "proposals"; ids: string[] } | { type: "split"; campaignId: string; split?: SplitStatus } | { type: "manual"; steps: string[] }
}
/** Bản tách ĐANG DÙNG của chiến dịch gốc — để thẻ "Tách lượt tìm chung" không hiện như việc chưa làm (user báo 01/10). */
export interface SplitStatus { id: string; name: string; step: "created" | "moved"; day: number | null; verdict: string | null }
const VERDICT: Record<string, string> = { tot: "Đạt", theo_doi: "Theo dõi tiếp", dung: "Nên hoàn tác" }
const DAY = 86_400_000

/** Bản tách mới nhất còn dùng (đã tạo / đã chuyển) theo chiến dịch gốc — HÀM THUẦN. */
export function activeSplitsBySource(splits: Pick<SplitRecord, "id" | "sourceId" | "name" | "step" | "at" | "movedAt" | "checkpoints">[], now: Date): Map<string, SplitStatus> {
  const m = new Map<string, SplitStatus & { at: string }>()
  for (const r of splits) {
    if (r.step !== "created" && r.step !== "moved") continue
    const prev = m.get(r.sourceId)
    if (prev && prev.at >= r.at) continue
    const cp = r.checkpoints?.["14"] ?? r.checkpoints?.["7"]
    m.set(r.sourceId, { id: r.id, name: r.name, step: r.step, at: r.at, day: r.step === "moved" && r.movedAt ? Math.max(0, Math.floor((now.getTime() - Date.parse(r.movedAt)) / DAY)) : null, verdict: cp ? VERDICT[cp.verdict] ?? cp.verdict : null })
  }
  return new Map([...m].map(([k, { at: _at, ...v }]) => [k, v])) // eslint-disable-line @typescript-eslint/no-unused-vars
}

const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`

export function recommendSearch(x: Pick<SearchXray, "warnings" | "campaigns">, proposals: SearchProposal[], splits: Map<string, SplitStatus> = new Map()): SearchRecommendation[] {
  const out: SearchRecommendation[] = []
  for (const w of x.warnings.filter((w) => w.id === "brand_starved")) {
    const name = x.campaigns.find((c) => c.id === w.campaignId)?.name
    const sp = splits.get(w.campaignId!)
    // Đã tách: số trong cảnh báo là của kỳ đang xem (phần lớn TRƯỚC lúc tách) — hiện tiến độ bản tách thay vì việc chưa làm.
    if (sp?.step === "created") { out.push({ id: `rec_split_${w.campaignId}`, priority: 2, title: `Đã tách "${name}" → "${sp.name}" — còn bước bật + chuyển từ khoá`, why: `Chiến dịch mới đã tạo nhưng từ khoá chung VẪN chạy ở chiến dịch gốc (chưa bấm "Chuyển từ khoá chung — bước 3") nên chiến dịch gốc còn hụt tiền như cũ. Số dưới đây là của kỳ đang xem. ${w.text}`, moneyAtStake: w.money ?? null, action: { type: "split", campaignId: w.campaignId!, split: sp } }); continue }
    if (sp?.step === "moved") { out.push({ id: `rec_split_${w.campaignId}`, priority: 3, title: `✓ Đã tách "${name}" → "${sp.name}" — đang theo dõi${sp.day != null ? ` (ngày ${sp.day}/14)` : ""}`, why: `Đã chuyển từ khoá chung sang chiến dịch mới. Tool tự đo mốc 7 và 14 ngày${sp.verdict ? ` — mốc gần nhất: ${sp.verdict}` : " (chưa tới mốc 7 ngày)"}. Cảnh báo hụt ngân sách ở trên tính theo kỳ đang xem, gồm cả những ngày TRƯỚC khi tách.`, moneyAtStake: null, action: { type: "split", campaignId: w.campaignId!, split: sp } }); continue }
    out.push({ id: `rec_split_${w.campaignId}`, priority: 1, title: `Tách lượt tìm chung khỏi "${x.campaigns.find((c) => c.id === w.campaignId)?.name}"`, why: w.text, moneyAtStake: w.money ?? null, action: { type: "split", campaignId: w.campaignId! } })
  }
  const of = (k: SearchProposal["kind"]) => proposals.filter((p) => p.kind === k)
  const sum = (ps: SearchProposal[]) => ps.reduce((s, p) => s + (p.cost ?? 0), 0)
  const negs = of("neg_keyword")
  if (negs.length) out.push({ id: "rec_neg", priority: sum(negs) > 1_000_000 ? 1 : 2, title: `Phủ định ${negs.length} lượt tìm tên đối thủ / hỏi cách làm 0 đơn`, why: `${vnd(sum(negs))} đã chi trong kỳ; tool bỏ qua mọi phủ định chặn nhầm lượt tìm đã ra đơn.`, moneyAtStake: sum(negs), action: { type: "proposals", ids: negs.map((p) => p.id) } })
  const adds = of("add_keyword")
  if (adds.length) { const good = adds.filter((p) => p.defaultChecked); out.push({ id: "rec_add", priority: 2, title: `Thêm ${good.length || adds.length} lượt tìm đã ra đơn làm từ khoá khớp chính xác`, why: `${adds.length} lượt tìm ra đơn chưa có từ khoá khớp chính xác (${good.length} lượt ra ≥ 2 đơn với CPA không tệ hơn chiến dịch — tích sẵn). Từ khoá chính xác giúp kiểm soát giá và theo dõi riêng.`, moneyAtStake: null, action: { type: "proposals", ids: adds.map((p) => p.id) } }) }
  const pauses = of("pause_keyword")
  if (pauses.length) out.push({ id: "rec_pause", priority: 3, title: `Xem ${pauses.length} từ khoá chi ≥ 3× CPA mà 0 chuyển đổi`, why: `${vnd(sum(pauses))} trong kỳ. Không tích sẵn — kiểm lượt tìm của từng từ khoá trước.`, moneyAtStake: sum(pauses), action: { type: "proposals", ids: pauses.map((p) => p.id) } })
  for (const w of x.warnings.filter((w) => w.id === "lost_rank"))
    out.push({ id: `rec_rank_${w.campaignId}`, priority: 3, title: "Mất hiển thị vì hạng — tăng ngân sách không giúp", why: w.text, moneyAtStake: null, action: { type: "manual", steps: ["Xem Quality Score từng từ khoá (Toolkit → Quality Score): thành phần 'Dưới trung bình' là chỗ cần sửa", "Sửa quảng cáo yếu (mục RSA bên dưới) hoặc trang đích chậm", "Chỉ tăng giá thầu / mục tiêu CPA khi QS đã ≥ 7"] } })
  for (const w of x.warnings.filter((w) => w.id === "competitor_spend"))
    if (!negs.some((p) => p.campaignId === w.campaignId)) out.push({ id: `rec_comp_${w.campaignId}`, priority: 2, title: "Tiền vào tên đối thủ", why: w.text, moneyAtStake: w.money ?? null, action: { type: "manual", steps: ["Mở phiên Xử lý chiến dịch (/xu-ly) cho chiến dịch này — có mô phỏng phủ định + danh sách chặn đối thủ"] } })
  return out.sort((a, b) => a.priority - b.priority || (b.moneyAtStake ?? 0) - (a.moneyAtStake ?? 0))
}
