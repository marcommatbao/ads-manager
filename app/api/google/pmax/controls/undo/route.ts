// POST /api/google/pmax/controls/undo {company, id} — hoàn tác một lần áp dụng (gỡ đúng tài nguyên tool tạo).
import { NextRequest, NextResponse } from "next/server"
import { actorOf, fail, requireCompany, requireUser } from "@/lib/case/http"
import { customerIdOf, PmaxControlError, undoControls } from "@/lib/pmax/controls"
import { friendlyError } from "@/lib/not-configured";

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const u = await requireUser("can_edit")
  if (!u.ok) return u.response
  const b = (await request.json().catch(() => ({}))) as { company?: string; id?: string }
  const co = requireCompany(u.value, b.company)
  if (!co.ok) return co.response
  if (!b.id || !/^pmaxc_[a-z0-9]+$/.test(b.id)) return NextResponse.json({ success: false, error: "Thiếu mã lần áp dụng" }, { status: 400 })
  try {
    return NextResponse.json({ success: true, report: await undoControls(co.value, b.id, actorOf(u.value), customerIdOf(co.value)) })
  } catch (err) {
    if (err instanceof PmaxControlError) return NextResponse.json({ success: false, error: friendlyError(err.message) }, { status: err.status })
    return fail(err)
  }
}
