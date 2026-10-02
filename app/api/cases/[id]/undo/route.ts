// POST /api/cases/[id]/undo {executionId} — hoàn tác đúng những gì lần thực hiện đó đã đổi
import { NextRequest, NextResponse } from "next/server"
import { actorOf, fail, requireCase } from "@/lib/case/http"
import { undoExecution } from "@/lib/case/service"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireCase((await params).id, "can_edit")
  if (!g.ok) return g.response
  const { executionId } = (await request.json().catch(() => ({}))) as { executionId?: string }
  if (!executionId) return NextResponse.json({ success: false, error: "Thiếu executionId" }, { status: 400 })
  try {
    return NextResponse.json({ success: true, ...(await undoExecution(g.value.c.id, executionId, actorOf(g.value.user))) })
  } catch (err) {
    return fail(err)
  }
}
