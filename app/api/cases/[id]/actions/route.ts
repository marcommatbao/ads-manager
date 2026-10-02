// PATCH /api/cases/[id]/actions {selected: {actionId: boolean}, options?: {actionId: {event?, pauseSource?}}} — chọn/bỏ việc ở bước 5
import { NextRequest, NextResponse } from "next/server"
import { fail, requireCase } from "@/lib/case/http"
import { selectActions } from "@/lib/case/service"

export const dynamic = "force-dynamic"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireCase((await params).id, "can_edit")
  if (!g.ok) return g.response
  const { selected, options } = (await request.json().catch(() => ({}))) as { selected?: Record<string, boolean>; options?: Record<string, { event?: string; pauseSource?: boolean; lowSignalAck?: boolean }> }
  if (!selected || typeof selected !== "object") return NextResponse.json({ success: false, error: "Thiếu selected" }, { status: 400 })
  try {
    return NextResponse.json({ success: true, case: await selectActions(g.value.c.id, selected, options && typeof options === "object" ? options : {}) })
  } catch (err) {
    return fail(err)
  }
}
