// GET  /api/google/pmax/controls?company=&from=&to= — Đợt 10b: việc nên làm + đề xuất kiểm soát + lịch sử + cài đặt tự động
// POST /api/google/pmax/controls {company, from, to, ids[], validateOnly, confirmText?} — Kiểm trước / áp dụng.
// Đề xuất TÍNH LẠI từ số tươi ở máy chủ; client chỉ gửi mã việc. Ghi thật cần "XAC NHAN" + quyền can_edit.
import { NextRequest, NextResponse } from "next/server"
import { actorOf, fail, requireCompany, requireUser } from "@/lib/case/http"
import { DEFAULT_VIEW_DAYS, MAX_RANGE_DAYS, parseRange } from "@/lib/case/dates"
import { hasPermission } from "@/lib/permissions"
import { pmaxXray } from "@/lib/pmax/xray"
import { controlLexicon, customerIdOf, listControlExecutions, PMAX_CONFIRM_TEXT, PmaxControlError, proposeControls, readControlData, runControls } from "@/lib/pmax/controls"
import { AUTO_KIND_LABEL, recommend } from "@/lib/pmax/recommend"
import { MAX_AUTO_PER_DAY, readAutoSettings } from "@/lib/pmax/auto"
import type { Company } from "@/lib/case/types"
import { friendlyError } from "@/lib/not-configured";

export const dynamic = "force-dynamic"
export const maxDuration = 120

async function build(company: Company, range: { from: string; to: string }, force = false) {
  const [x, d] = await Promise.all([pmaxXray(company, range, { force }), readControlData(company, range)])
  const proposals = proposeControls(x, d, controlLexicon(company))
  return { x, proposals, recommendations: recommend(x, proposals) }
}

export async function GET(request: NextRequest) {
  const u = await requireUser()
  if (!u.ok) return u.response
  const sp = request.nextUrl.searchParams
  const co = requireCompany(u.value, sp.get("company"))
  if (!co.ok) return co.response
  const pr = parseRange(sp.get("from"), sp.get("to"), { defaultDays: DEFAULT_VIEW_DAYS, maxDays: MAX_RANGE_DAYS })
  if (!pr.ok) return NextResponse.json({ success: false, error: pr.error }, { status: 400 })
  try {
    const { proposals, recommendations } = await build(co.value, pr.range, sp.get("force") === "1")
    return NextResponse.json({
      success: true, range: pr.range, recommendations, proposals, history: listControlExecutions(co.value).slice(0, 30),
      auto: { kinds: readAutoSettings().companies[co.value] ?? [], labels: AUTO_KIND_LABEL, maxPerDay: MAX_AUTO_PER_DAY },
      canEdit: hasPermission(u.value.role, "can_edit"), confirmText: PMAX_CONFIRM_TEXT,
    })
  } catch (err) { return fail(err) }
}

export async function POST(request: NextRequest) {
  const u = await requireUser("can_edit")
  if (!u.ok) return u.response
  const b = (await request.json().catch(() => ({}))) as { company?: string; from?: string; to?: string; ids?: unknown; validateOnly?: boolean; confirmText?: string }
  const co = requireCompany(u.value, b.company)
  if (!co.ok) return co.response
  const pr = parseRange(b.from, b.to, { defaultDays: DEFAULT_VIEW_DAYS, maxDays: MAX_RANGE_DAYS })
  if (!pr.ok) return NextResponse.json({ success: false, error: pr.error }, { status: 400 })
  const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string").slice(0, 300) : []
  try {
    const { proposals } = await build(co.value, pr.range)
    const execution = await runControls({ company: co.value, proposals, ids, actor: actorOf(u.value), validateOnly: b.validateOnly !== false, confirmText: b.confirmText, customerId: customerIdOf(co.value) })
    return NextResponse.json({ success: true, execution })
  } catch (err) {
    if (err instanceof PmaxControlError) return NextResponse.json({ success: false, error: friendlyError(err.message) }, { status: err.status })
    return fail(err)
  }
}
