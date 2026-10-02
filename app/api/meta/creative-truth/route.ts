// GET /api/meta/creative-truth?company=&from=&to=&force=1 — Đợt 17: xếp mẫu quảng cáo Meta theo ĐƠN THẬT. CHỈ ĐỌC.
// ~3–4 lượt gọi Meta (insights cấp quảng cáo + chuyển đổi tuỳ chỉnh + ảnh), nhớ 60 phút — app Meta ~60 lượt/giờ.
import { NextRequest, NextResponse } from "next/server"
import { fail, requireCompany, requireUser } from "@/lib/case/http"
import { DEFAULT_VIEW_DAYS, MAX_RANGE_DAYS, parseRange } from "@/lib/case/dates"
import { creativeTruth, TRUTH_LABEL, VERDICT_LABEL } from "@/lib/meta/creative-truth"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const u = await requireUser()
  if (!u.ok) return u.response
  const sp = request.nextUrl.searchParams
  const co = requireCompany(u.value, sp.get("company"))
  if (!co.ok) return co.response
  const pr = parseRange(sp.get("from"), sp.get("to"), { defaultDays: DEFAULT_VIEW_DAYS, maxDays: MAX_RANGE_DAYS })
  if (!pr.ok) return NextResponse.json({ success: false, error: pr.error }, { status: 400 })
  try {
    const x = await creativeTruth(co.value, pr.range, { force: sp.get("force") === "1" })
    return NextResponse.json({ success: true, ...x, verdictLabels: VERDICT_LABEL, truthLabels: TRUTH_LABEL })
  } catch (e) { return fail(e) }
}
