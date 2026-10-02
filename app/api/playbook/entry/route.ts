// PATCH /api/playbook/entry {company, id, decision: "approved"|"rejected"|"suggested"} — người Duyệt / Bỏ / trả về Gợi ý.
// Cần can_edit_thresholds. Dòng đã duyệt được dùng như độ tin cậy cao; dòng đã bỏ không dùng.
import { NextRequest, NextResponse } from "next/server"
import { actorOf, requireCompany, requireUser } from "@/lib/case/http"
import { decideEntry } from "@/lib/playbook/store"

export const dynamic = "force-dynamic"

export async function PATCH(request: NextRequest) {
  const u = await requireUser("can_edit_thresholds")
  if (!u.ok) return u.response
  const b = (await request.json().catch(() => ({}))) as { company?: string; id?: string; decision?: string }
  const co = requireCompany(u.value, b.company)
  if (!co.ok) return co.response
  if (!b.id || !["approved", "rejected", "suggested"].includes(String(b.decision))) return NextResponse.json({ success: false, error: "Thiếu id hoặc quyết định" }, { status: 400 })
  const e = await decideEntry(co.value, b.id, b.decision as "approved" | "rejected" | "suggested", actorOf(u.value))
  if (!e) return NextResponse.json({ success: false, error: "Không tìm thấy dòng" }, { status: 404 })
  return NextResponse.json({ success: true, entry: e })
}
