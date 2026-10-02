// PATCH /api/cases/[id]/tasks/[taskId] {status?, assignee?} — việc giao người (tool không ghi được)
import { NextRequest, NextResponse } from "next/server"
import { fail, requireCase } from "@/lib/case/http"
import { updateManualTask } from "@/lib/case/service"

export const dynamic = "force-dynamic"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params
  const g = await requireCase(id, "can_edit")
  if (!g.ok) return g.response
  const b = (await request.json().catch(() => ({}))) as { status?: string; assignee?: string | null }
  if (b.status !== undefined && b.status !== "open" && b.status !== "done") {
    return NextResponse.json({ success: false, error: "status phải là open hoặc done" }, { status: 400 })
  }
  try {
    const patch = { status: b.status as "open" | "done" | undefined, assignee: b.assignee === undefined ? undefined : (b.assignee ? String(b.assignee).slice(0, 120) : null) }
    return NextResponse.json({ success: true, case: await updateManualTask(id, taskId, patch) })
  } catch (err) {
    return fail(err)
  }
}
