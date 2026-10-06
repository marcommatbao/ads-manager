// POST /api/meta/audience-compare/ai {company, ids[], from, to} — Đợt 26b: AI đánh giá bảng So sánh tệp đối tượng.
// Máy chủ TỰ dựng lại bảng (không tin số client gửi), chỉ đưa bảng đó cho Gemini, rồi soát từng con số AI viết ra.
// Đệm 10 phút theo (công ty, chiến dịch, khoảng ngày, giờ lấy số) — bấm lại không tốn thêm lượt AI.
import { NextRequest, NextResponse } from "next/server"
import { fail, requireCompany, requireUser } from "@/lib/case/http"
import { isYmd } from "@/lib/case/dates"
import { callGemini } from "@/lib/gemini"
import { compareAudiences } from "@/lib/meta/audience-compare-fetch"
import { buildAssessPrompt, parseAssessment, unsupportedNumbers, type AiAssessment } from "@/lib/meta/audience-compare-ai"
import { friendlyError, isNotConfigured } from "@/lib/not-configured"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const memo = new Map<string, { at: number; v: { assessment: AiAssessment; unsupported: number[]; fetchedAt: string } }>()

export async function POST(request: NextRequest) {
  const u = await requireUser()
  if (!u.ok) return u.response
  const b = (await request.json().catch(() => ({}))) as { company?: string; ids?: string[]; from?: string; to?: string }
  const co = requireCompany(u.value, b.company)
  if (!co.ok) return co.response
  if (!isYmd(b.from ?? "") || !isYmd(b.to ?? "") || b.from! > b.to!) return NextResponse.json({ success: false, error: "Khoảng ngày không hợp lệ" }, { status: 400 })
  const ids = Array.isArray(b.ids) ? b.ids.map(String) : []
  try {
    const res = await compareAudiences(co.value, ids, { from: b.from!, to: b.to! })
    const rows = res.groups.reduce((n, g) => n + g.rows.length, 0)
    if (!rows) return NextResponse.json({ success: false, error: "Chưa có nhóm quảng cáo nào có chi tiêu trong khoảng này để đánh giá" }, { status: 400 })
    const key = `${co.value}|${[...ids].sort().join(",")}|${b.from}|${b.to}|${res.fetchedAt}`
    const hit = memo.get(key)
    if (hit && Date.now() - hit.at < 600_000) return NextResponse.json({ success: true, cached: true, ...hit.v })
    const ai = await callGemini(buildAssessPrompt(res.groups, res.range), { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: "application/json", thinkingBudget: 0, timeoutMs: 45_000 })
    const assessment = parseAssessment(ai.text ?? "")
    if (!assessment) return NextResponse.json({ success: false, error: "AI trả về dữ liệu không đọc được — bấm lại sau ít giây" }, { status: 502 })
    const v = { assessment, unsupported: unsupportedNumbers(assessment, res.groups), fetchedAt: res.fetchedAt }
    memo.set(key, { at: Date.now(), v })
    return NextResponse.json({ success: true, cached: false, ...v })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (isNotConfigured(msg)) return NextResponse.json({ success: false, error: friendlyError(msg) }, { status: 400 })
    if (/^Chọn 2–|không thuộc công ty/.test(msg)) return NextResponse.json({ success: false, error: msg }, { status: 400 })
    return fail(e)
  }
}
