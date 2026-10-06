// ============================================================
// Đợt 26b — AI đánh giá bảng So sánh tệp đối tượng (CHỈ dựa trên số trong bảng)
// ============================================================
// Nguyên tắc (bài học "phỏng đoán có sẵn lọt vào bằng chứng cho AI"): lời nhắc chỉ chứa SỐ đo được + cờ do tool tự tính —
// không gài sẵn nhận định. Mỗi ý AI trả về phải dẫn số; tool soát lại từng con số AI viết ra, số nào không có trong bảng thì
// gắn cảnh báo cho người đọc. Meta KHÔNG cho biết sở thích nào ra đơn → cấm AI khẳng định điều đó.
import type { CompareGroup, RankedAdset } from "./audience-compare"
import { targetingSummary } from "./winning-audiences-text"

export interface AiPoint { text: string; evidence: string[] }
export interface AiAssessment { conclusion: string; why: AiPoint[]; actions: AiPoint[]; caveats: string[] }

const r0 = (n: number) => Math.round(n)
const pct1 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 10)

function rowFacts(r: RankedAdset) {
  return {
    nhom: r.name, chien_dich: r.campaignName, hang: r.rank, su_kien_toi_uu: r.optEventLabel, trang_thai_hoc: r.learning ?? "không rõ",
    chi_phi_vnd: r0(r.spend), ket_qua_tu_luot_bam: r.results, meta_bao_tong: r.resultsAll ?? r.results, chi_xem: r.resultsView ?? 0,
    chi_phi_moi_ket_qua_vnd: r.costPerResult === null ? null : r0(r.costPerResult),
    khoang_tin_cay_95_vnd: r.cprLow !== null && r.cprHigh !== null ? [r0(r.cprLow), r0(r.cprHigh)] : null,
    ctr_phan_tram: pct1(r.ctr), click_ra_ket_qua_phan_tram: pct1(r.clickToResult), tan_suat: r.frequency === null ? null : Math.round(r.frequency * 10) / 10,
    nham_chon: targetingSummary(r.targeting), co_canh_bao: r.flags,
  }
}

export function buildAssessPrompt(groups: CompareGroup[], range: { from: string; to: string }): string {
  const data = groups.map((g) => ({ loai_ket_qua: g.goalKind === "leads" ? "lead" : "lượt mua", ket_luan_cua_tool: g.verdict, tom_tat_cua_tool: g.summary, cac_nhom: g.rows.map(rowFacts) }))
  return `Bạn là chuyên gia quảng cáo Meta đọc một BẢNG SO SÁNH NHÓM QUẢNG CÁO do công cụ đo (khoảng ${range.from} → ${range.to}).

LUẬT BẮT BUỘC:
1. CHỈ dùng số có trong DỮ LIỆU bên dưới. Không ước đoán số khác, không lấy số "trung bình ngành".
2. Mỗi ý trong "why" và "actions" phải có "evidence": các con số trích NGUYÊN từ dữ liệu (vd "₫9.888/lượt mua", "CTR 0,6%").
3. Kết quả đã tính theo LƯỢT BẤM 7 ngày ("ket_qua_tu_luot_bam"); "meta_bao_tong" gồm cả người chỉ xem — chỉ dùng để nhắc độ vênh, KHÔNG dùng để xếp hạng.
4. Không được nói sở thích/hạng mục nào "ra đơn" — Meta không cung cấp số theo sở thích. Chỉ được so cấu hình nhắm chọn ("nham_chon") giữa nhóm tốt và nhóm kém như một giả thuyết, ghi rõ là giả thuyết.
5. Tôn trọng "ket_luan_cua_tool" và "co_canh_bao": nhóm "đang học", "chưa đủ", "khác mẫu quảng cáo", "khác sự kiện tối ưu" thì KHÔNG được kết luận chắc chắn — nói rõ cần gì để chắc.
6. Đọc chỉ số để giải thích: CTR thấp = thông điệp/mẫu chưa hợp tệp; click→kết quả thấp = tệp hoặc trang đích chưa hợp; tần suất > 3,5 = tệp bắt đầu cạn.
7. "actions": việc cụ thể (giữ / tăng ngân sách / giảm / dừng / lưu làm tệp thắng / chạy thêm N ngày rồi so lại), mỗi việc gắn tên nhóm. Tối đa 5 việc.
8. Viết tiếng Việt, ngắn gọn, cho người làm marketing (không thuật ngữ thống kê).

DỮ LIỆU:
${JSON.stringify(data, null, 1)}

Trả về JSON đúng dạng:
{"conclusion": "1–2 câu", "why": [{"text": "...", "evidence": ["..."]}], "actions": [{"text": "...", "evidence": ["..."]}], "caveats": ["điều cần biết trước khi tin kết luận"]}`
}

/** Bóc số trong một câu tiếng Việt ("₫9.888", "79,2%", "1.957.882", "2.5") → số thực. */
export function numbersIn(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/(?<![\d.,])\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g)) {
    const raw = m[0]
    const n = /\d\.\d{3}(?:\.|,|$)/.test(raw) && !/^\d+\.\d{1,2}$/.test(raw) ? Number(raw.replace(/\./g, "").replace(",", ".")) : Number(raw.replace(",", "."))
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

/** Số mà AI viết ra nhưng KHÔNG có trong bảng (sai lệch ≤ 1% hoặc ≤ 0,15 coi là khớp). Bỏ qua số nhỏ ≤ 14 (ngày, số nhóm…). */
export function unsupportedNumbers(a: AiAssessment, groups: CompareGroup[]): number[] {
  const allowed: number[] = []
  for (const g of groups) {
    for (const r of g.rows) {
      const f = rowFacts(r)
      for (const v of [f.chi_phi_vnd, f.ket_qua_tu_luot_bam, f.meta_bao_tong, f.chi_xem, f.chi_phi_moi_ket_qua_vnd, ...(f.khoang_tin_cay_95_vnd ?? []), f.ctr_phan_tram, f.click_ra_ket_qua_phan_tram, f.tan_suat]) if (typeof v === "number") allowed.push(v)
    }
    for (const n of numbersIn(g.summary)) allowed.push(n)
    for (const r of g.rows) for (const fl of r.flags) for (const n of numbersIn(fl)) allowed.push(n)
  }
  // Tỉ lệ chênh giữa các nhóm (AI hay nói "rẻ hơn 15%", "gấp 3 lần") — tính sẵn mọi cặp chi phí/kết quả.
  for (const g of groups) {
    const c = g.rows.map((r) => r.costPerResult).filter((x): x is number => !!x)
    for (const x of c) for (const y of c) if (x !== y) { allowed.push(Math.round((y / x - 1) * 100), Math.round((1 - x / y) * 100), Math.round((y / x) * 10) / 10) }
  }
  const text = [a.conclusion, ...a.why.flatMap((p) => [p.text, ...p.evidence]), ...a.actions.flatMap((p) => [p.text, ...p.evidence])].join(" \n ")
  const bad = new Set<number>()
  for (const n of numbersIn(text)) {
    if (Math.abs(n) <= 14) continue
    const ok = allowed.some((v) => Math.abs(v - n) <= Math.max(0.15, Math.abs(v) * 0.01))
    if (!ok) bad.add(n)
  }
  return [...bad]
}

/** Đọc JSON AI trả về; thiếu trường → mặc định rỗng (không vỡ trang). */
export function parseAssessment(raw: string): AiAssessment | null {
  try {
    const j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Partial<AiAssessment>
    const pts = (x: unknown): AiPoint[] => (Array.isArray(x) ? x : []).filter((p) => p && typeof p.text === "string").map((p) => ({ text: String(p.text).slice(0, 600), evidence: (Array.isArray(p.evidence) ? p.evidence : []).map(String).slice(0, 6) })).slice(0, 6)
    if (typeof j.conclusion !== "string" || !j.conclusion.trim()) return null
    return { conclusion: j.conclusion.slice(0, 600), why: pts(j.why), actions: pts(j.actions).slice(0, 5), caveats: (Array.isArray(j.caveats) ? j.caveats : []).map(String).slice(0, 5) }
  } catch { return null }
}
