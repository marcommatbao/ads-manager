// GET /api/overview/lead-flows — cấu hình + lần kiểm gần nhất của các đường lead (Đợt 9 · 1)
// PUT {flows} — sửa cấu hình (can_edit_thresholds)
import { NextRequest, NextResponse } from "next/server"
import { actorOf, requireUser } from "@/lib/case/http"
import { canAccessCompany, hasPermission, isSuperAdmin } from "@/lib/permissions"
import { lastStatuses, readFlows, saveFlows, validateFlows, type LeadFlow } from "@/lib/monitor/lead-flow"

export const dynamic = "force-dynamic"

export async function GET() {
  const u = await requireUser()
  if (!u.ok) return u.response
  const can = (c: string) => canAccessCompany(u.value.role, c)
  return NextResponse.json({
    success: true, flows: readFlows().filter((f) => can(f.company)), statuses: lastStatuses().filter((s) => can(s.flow.company)),
    canEdit: hasPermission(u.value.role, "can_edit_thresholds"), canRunNow: isSuperAdmin(u.value.role), jobId: "lead_flow_watch",
  })
}

export async function PUT(request: NextRequest) {
  const u = await requireUser("can_edit_thresholds")
  if (!u.ok) return u.response
  const b = (await request.json().catch(() => ({}))) as { flows?: unknown }
  const err = validateFlows(b.flows)
  if (err) return NextResponse.json({ success: false, error: err }, { status: 400 })
  const flows = (b.flows as LeadFlow[]).map((f) => ({ ...f, pixelEvents: f.pixelEvents.map((e) => e.trim()), minForms: Number(f.minForms), minExpectedLeads: Number(f.minExpectedLeads ?? 4), quietHours: Number(f.quietHours), enabled: f.enabled !== false }))
  saveFlows(flows)
  console.log(`[lead-flows] cấu hình đổi bởi ${actorOf(u.value)}`)
  return NextResponse.json({ success: true, flows })
}
