// GET /api/google/pmax/experiment/status?company=&id= — đo lại kết quả thí nghiệm (khác-biệt-trong-khác-biệt theo tuần).
import { NextRequest, NextResponse } from "next/server"
import { fail, requireCompany, requireUser } from "@/lib/case/http"
import { experimentStatus } from "@/lib/pmax/geo-experiment"
import { PmaxControlError } from "@/lib/pmax/controls"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const u = await requireUser()
  if (!u.ok) return u.response
  const sp = request.nextUrl.searchParams
  const co = requireCompany(u.value, sp.get("company"))
  if (!co.ok) return co.response
  try { return NextResponse.json({ success: true, experiment: await experimentStatus(co.value, String(sp.get("id") ?? "")) }) } catch (err) {
    if (err instanceof PmaxControlError) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    return fail(err)
  }
}
