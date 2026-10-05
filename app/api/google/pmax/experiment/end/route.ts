// POST /api/google/pmax/experiment/end {company, id} — kết thúc thí nghiệm: gỡ loại trừ tool đã thêm + trả nhắm cũ.
import { NextRequest, NextResponse } from "next/server"
import { actorOf, fail, requireCompany, requireUser } from "@/lib/case/http"
import { endExperiment } from "@/lib/pmax/geo-experiment"
import { PmaxControlError } from "@/lib/pmax/controls"
import { friendlyError } from "@/lib/not-configured";

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const u = await requireUser("can_edit")
  if (!u.ok) return u.response
  const b = (await request.json().catch(() => ({}))) as { company?: string; id?: string }
  const co = requireCompany(u.value, b.company)
  if (!co.ok) return co.response
  try { return NextResponse.json({ success: true, experiment: await endExperiment(co.value, String(b.id ?? ""), actorOf(u.value)) }) } catch (err) {
    if (err instanceof PmaxControlError) return NextResponse.json({ success: false, error: friendlyError(err.message) }, { status: err.status })
    return fail(err)
  }
}
