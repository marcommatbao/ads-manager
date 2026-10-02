// GET /api/cases/overview?company=MBI&from=YYYY-MM-DD&to=YYYY-MM-DD
// Bảng tổng quan "Xử lý chiến dịch": chiến dịch có chi tiêu trong kỳ, chấm theo
// mục tiêu sản phẩm, xếp theo tiền chi vượt trần. &platform=google|facebook (Facebook chấm theo số Meta).
import { NextRequest, NextResponse } from "next/server"
import { fail, requireCompany, requireUser } from "@/lib/case/http"
import { googleOverview, metaOverview } from "@/lib/case/service"
import { DEFAULT_VIEW_DAYS, MAX_RANGE_DAYS, parseRange } from "@/lib/case/dates"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const u = await requireUser()
  if (!u.ok) return u.response
  const sp = request.nextUrl.searchParams
  const co = requireCompany(u.value, sp.get("company"))
  if (!co.ok) return co.response
  const platform = sp.get("platform") ?? "google"
  if (platform !== "google" && platform !== "facebook") {
    return NextResponse.json({ success: false, error: "platform phải là google hoặc facebook" }, { status: 400 })
  }
  const pr = parseRange(sp.get("from"), sp.get("to"), { defaultDays: DEFAULT_VIEW_DAYS, maxDays: MAX_RANGE_DAYS })
  if (!pr.ok) return NextResponse.json({ success: false, error: pr.error }, { status: 400 })
  const range = pr.range
  try {
    const data = platform === "facebook" ? await metaOverview(co.value, range) : await googleOverview(co.value, range)
    return NextResponse.json({ success: true, platform, ...data })
  } catch (err) {
    return fail(err)
  }
}
