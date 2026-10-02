// POST /api/cases/[id]/goal {basis, target, ceiling, where, saveAsDefault?}
// Chốt mục tiêu → tính nguyên nhân + hướng xử lý (có mô phỏng). Lưu làm mặc định
// cho sản phẩm cần quyền can_edit_thresholds.
import { NextRequest, NextResponse } from "next/server"
import { actorOf, fail, requireCase } from "@/lib/case/http"
import { hasPermission } from "@/lib/permissions"
import { productGroupOf } from "@/lib/case/product"
import { confirmGoal } from "@/lib/case/service"
import { saveTargets, validateTarget } from "@/lib/case/targets"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireCase((await params).id)
  if (!g.ok) return g.response
  const { user, c } = g.value
  const b = (await request.json().catch(() => ({}))) as { basis?: string; target?: number; ceiling?: number; where?: string; saveAsDefault?: boolean }
  const group = productGroupOf(c.campaignName)
  const err = validateTarget({ company: c.company, group, basis: b.basis as "cpa" | "roas", target: b.target, ceiling: b.ceiling })
  if (err) return NextResponse.json({ success: false, error: err }, { status: 400 })
  if (b.saveAsDefault && !hasPermission(user.role, "can_edit_thresholds")) {
    return NextResponse.json({ success: false, error: "Cần quyền sửa ngưỡng để lưu làm mặc định cho sản phẩm" }, { status: 403 })
  }
  try {
    const goal = { basis: b.basis as "cpa" | "roas", target: Number(b.target), ceiling: Number(b.ceiling), where: String(b.where ?? "").slice(0, 300) }
    if (b.saveAsDefault) await saveTargets([{ company: c.company, group, basis: goal.basis, target: goal.target, ceiling: goal.ceiling }], actorOf(user))
    return NextResponse.json({ success: true, case: await confirmGoal(c.id, goal, actorOf(user)) })
  } catch (e) {
    return fail(e)
  }
}
