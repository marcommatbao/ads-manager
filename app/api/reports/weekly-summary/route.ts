// Đợt 15c — Báo cáo quản lý tuần.
// GET  ?week=YYYY-MM-DD   — một tuần đã lưu (mặc định tuần mới nhất) + danh sách tuần
// POST {op: "rebuild"}    — dựng lại tuần trọn gần nhất, CHỈ lưu (không gửi Teams)
// Báo cáo gộp MBC + MBI → cần quyền với cả hai công ty.
import { NextRequest, NextResponse } from "next/server"
import { fail, requireUser } from "@/lib/case/http"
import { canAccessCompany, hasPermission } from "@/lib/permissions"
import { readWeeklyHistory, runWeeklyReport } from "@/lib/reports/weekly"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const bothCompanies = (role: Parameters<typeof canAccessCompany>[0]) => canAccessCompany(role, "MBC") && canAccessCompany(role, "MBI")
const noAccess = () => NextResponse.json({ success: false, error: "Báo cáo tuần gồm số của cả MBC và MBI — cần quyền với cả hai công ty" }, { status: 403 })

export async function GET(request: NextRequest) {
  const u = await requireUser()
  if (!u.ok) return u.response
  if (!bothCompanies(u.value.role)) return noAccess()
  try {
    const all = readWeeklyHistory()
    const weeks = Object.keys(all).sort().reverse()
    const want = request.nextUrl.searchParams.get("week")
    const key = want && all[want] ? want : weeks[0]
    return NextResponse.json({ success: true, weeks: weeks.map((k) => ({ key: k, label: all[k].label })), report: key ? all[key] : null, canEdit: hasPermission(u.value.role, "can_edit") })
  } catch (e) { return fail(e) }
}

export async function POST(request: NextRequest) {
  const u = await requireUser("can_edit")
  if (!u.ok) return u.response
  if (!bothCompanies(u.value.role)) return noAccess()
  const b = (await request.json().catch(() => ({}))) as { op?: string }
  if (b.op !== "rebuild") return NextResponse.json({ success: false, error: "op không hợp lệ" }, { status: 400 })
  try { return NextResponse.json({ success: true, report: await runWeeklyReport(new Date(), { send: false }) }) } catch (e) { return fail(e) }
}
