// Đợt 10a · F2 — kiểm tra PMax trong Google Audit, dùng CHUNG dữ liệu X-quang (hàm thuần).
// Trước đây audit engine chỉ chấm Search; PMax chỉ có điểm riêng trong PMax Insights → hai nơi có thể nói trái nhau.
import type { AuditCheck } from "@/lib/google-audit-engine"
import type { PmaxXray } from "./xray"

type Status = AuditCheck["status"]
const pct = (x: number) => `${Math.round(x * 100)}%`

export function pmaxAuditChecks(x: PmaxXray | null, readError: string | null): AuditCheck[] {
  const base = { fixable: false }
  if (!x) return ["pmax_engaged_view", "pmax_brand_share", "pmax_asset_groups"].map((id) => ({
    ...base, id, name: id, description: "PMax", score: 0, status: "WARNING" as Status, recommendation: "Không đọc được dữ liệu PMax.", dataStatus: "UNREADABLE" as const, dataNote: readError ?? undefined,
  }))
  if (!x.account.totals.cost && !x.assetGroups.length) return [] // tài khoản không chạy PMax → không chấm
  const partial = x.errors.length ? { dataStatus: "PARTIAL" as const, dataNote: x.errors.join(" · ") } : { dataStatus: "OK" as const }
  const out: AuditCheck[] = []

  // 1. Kênh ăn tiền nhờ đơn sau lượt xem
  {
    const bad = x.account.warnings.filter((w) => w.level === "bad")
    const t = x.account.totals, conv = t.convClick + t.convEngaged
    const engaged = conv ? t.convEngaged / conv : 0
    let score = 9, status: Status = "PASS", rec = `Đơn PMax chủ yếu từ lượt bấm (${pct(1 - engaged)}).`
    if (bad.length) { score = 3; status = "FAIL"; rec = bad.map((w) => w.text).join(" ") }
    else if (engaged >= 0.5) { score = 6; status = "WARNING"; rec = `${pct(engaged)} đơn PMax là sau lượt xem (không bấm) — Smart Bidding vẫn tính, dễ đẩy tiền vào YouTube/Display.` }
    out.push({ ...base, ...partial, id: "pmax_engaged_view", name: "PMax — Đơn thật theo kênh", description: "Kênh nào ăn tiền nhờ đơn sau lượt xem (engaged-view) thay vì đơn từ lượt bấm.", score, status, recommendation: rec })
  }
  // 2. PMax ăn lượt tìm thương hiệu / trùng Search
  {
    const c = x.cannibalization
    let score = 9, status: Status = "PASS", rec = `Lượt tìm thương hiệu chiếm ${pct(c.brandShare)} lượt bấm tìm kiếm của PMax.`
    if (c.pmaxClicks < 30) { score = 7; status = "PASS"; rec = "Chưa đủ lượt bấm tìm kiếm PMax để kết luận." }
    else if (c.brandShare >= 0.4) { score = 4; status = "FAIL"; rec = `${pct(c.brandShare)} lượt bấm tìm kiếm của PMax là người tìm THƯƠNG HIỆU mình (khách cũ, đằng nào cũng tới) · ${c.overlapClicks}/${c.pmaxClicks} lượt bấm trùng từ khoá Search đang chạy. Cân nhắc loại trừ thương hiệu khỏi PMax khi đã có Search thương hiệu.` }
    else if (c.brandShare >= 0.2) { score = 6; status = "WARNING"; rec = `${pct(c.brandShare)} lượt bấm tìm kiếm PMax là tìm thương hiệu mình.` }
    out.push({ ...base, ...partial, id: "pmax_brand_share", name: "PMax — Ăn lượt tìm thương hiệu", description: "Tỉ lệ lượt bấm tìm kiếm của PMax vào tên thương hiệu mình / trùng từ khoá Search.", score, status, recommendation: rec })
  }
  // 3. Asset group
  {
    const ags = x.assetGroups
    const weak = ags.filter((a) => a.adStrength === "POOR" || a.adStrength === "AVERAGE")
    const blocked = ags.filter((a) => a.status === "NOT_ELIGIBLE" || a.status === "LIMITED")
    let score = 9, status: Status = "PASS", rec = `${ags.length} asset group đang chạy, độ mạnh quảng cáo ổn.`
    if (!ags.length) { score = 5; status = "WARNING"; rec = "Không có asset group PMax nào đang bật." }
    else if (blocked.length) { score = 4; status = "FAIL"; rec = `${blocked.length} asset group bị hạn chế/không đủ điều kiện phục vụ: ${blocked.slice(0, 4).map((a) => `${a.campaignName} › ${a.name} (${a.status})`).join("; ")}.` }
    else if (weak.length) { score = 6; status = "WARNING"; rec = `${weak.length}/${ags.length} asset group độ mạnh Kém/Trung bình: ${weak.slice(0, 4).map((a) => `${a.name} (${a.adStrength})`).join("; ")} — thêm tiêu đề/ảnh/video.` }
    out.push({ ...base, ...partial, id: "pmax_asset_groups", name: "PMax — Asset group", description: "Độ mạnh quảng cáo + trạng thái phục vụ của asset group đang bật.", score, status, recommendation: rec })
  }
  return out
}
