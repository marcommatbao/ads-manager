// GET /api/google/pmax/signals?company= — Đợt 10c: D2 ngưỡng học + C2 khách mới + C1 mốc thay đổi (chỉ đọc).
import { NextRequest, NextResponse } from "next/server"
import { fail, requireCompany, requireUser } from "@/lib/case/http"
import { hasPermission } from "@/lib/permissions"
import { listMarks, listNewCustomerChanges, MODE_LABEL, readLearning, readNewCustomer } from "@/lib/pmax/signals"
import { PMAX_CONFIRM_TEXT } from "@/lib/pmax/controls"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const u = await requireUser()
  if (!u.ok) return u.response
  const co = requireCompany(u.value, request.nextUrl.searchParams.get("company"))
  if (!co.ok) return co.response
  try {
    const [learning, newCustomer] = await Promise.all([readLearning(co.value), readNewCustomer(co.value)])
    return NextResponse.json({ success: true, learning, newCustomer, modeLabels: MODE_LABEL, newCustomerHistory: listNewCustomerChanges(co.value), marks: listMarks(co.value), canEdit: hasPermission(u.value.role, "can_edit"), confirmText: PMAX_CONFIRM_TEXT })
  } catch (err) { return fail(err) }
}
