// POST /api/cases/[id]/collect — kéo lại bằng chứng từ Google (CHỈ ĐỌC)
import { NextRequest, NextResponse } from "next/server"
import { fail, requireCase } from "@/lib/case/http"
import { recollect } from "@/lib/case/service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireCase((await params).id)
  if (!g.ok) return g.response
  try {
    return NextResponse.json({ success: true, case: await recollect(g.value.c.id) })
  } catch (err) {
    return fail(err)
  }
}
