// Đợt 11b — Việc nên làm cho Search.
// GET  ?company=&from=&to=                                  — việc nên làm + đề xuất + lịch sử
// POST {company, from, to, ids[], validateOnly, confirmText?} — Kiểm trước / áp dụng (đề xuất TÍNH LẠI ở máy chủ)
// POST {company, op: "undo", id}
import { NextRequest, NextResponse } from "next/server"
import { actorOf, fail, requireCompany, requireUser } from "@/lib/case/http"
import { DEFAULT_VIEW_DAYS, MAX_RANGE_DAYS, parseRange } from "@/lib/case/dates"
import { hasPermission } from "@/lib/permissions"
import { lexiconFor } from "@/lib/case/targets"
import { searchXray } from "@/lib/search/xray"
import { listSearchExecutions, proposeSearch, readSearchNegatives, runSearchControls, SEARCH_CONFIRM_TEXT, undoSearchControls } from "@/lib/search/controls"
import { activeSplitsBySource, recommendSearch } from "@/lib/search/recommend"
import { allSplits, splitTargets } from "@/lib/search/split"
import { PmaxControlError } from "@/lib/pmax/controls"
import type { Company } from "@/lib/case/types"

export const dynamic = "force-dynamic"
export const maxDuration = 120
const err = (e: unknown) => (e instanceof PmaxControlError ? NextResponse.json({ success: false, error: e.message }, { status: e.status }) : fail(e))

async function build(company: Company, range: { from: string; to: string }) {
  const [x, negs] = await Promise.all([searchXray(company, range), readSearchNegatives(company)])
  const splits = activeSplitsBySource(allSplits().filter((r) => r.company === company), new Date())
  const proposals = proposeSearch(x, negs, lexiconFor(company), new Set(splits.keys()), splits.size ? await splitTargets(company) : new Map())
  return { x, proposals, recommendations: recommendSearch(x, proposals, splits) }
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
    const { proposals, recommendations } = await build(co.value, pr.range)
    return NextResponse.json({ success: true, range: pr.range, recommendations, proposals, history: listSearchExecutions(co.value), canEdit: hasPermission(u.value.role, "can_edit"), confirmText: SEARCH_CONFIRM_TEXT })
  } catch (e) { return err(e) }
}

export async function POST(request: NextRequest) {
  const u = await requireUser("can_edit")
  if (!u.ok) return u.response
  const b = (await request.json().catch(() => ({}))) as { company?: string; op?: string; id?: string; from?: string; to?: string; ids?: unknown; validateOnly?: boolean; confirmText?: string }
  const co = requireCompany(u.value, b.company)
  if (!co.ok) return co.response
  try {
    if (b.op === "undo" && b.confirmText?.trim() !== SEARCH_CONFIRM_TEXT) return NextResponse.json({ success: false, error: `Gõ “${SEARCH_CONFIRM_TEXT}” để hoàn tác trên tài khoản thật` }, { status: 428 })
    if (b.op === "undo") return NextResponse.json({ success: true, execution: await undoSearchControls(co.value, String(b.id ?? ""), actorOf(u.value)) })
    const pr = parseRange(b.from, b.to, { defaultDays: DEFAULT_VIEW_DAYS, maxDays: MAX_RANGE_DAYS })
    if (!pr.ok) return NextResponse.json({ success: false, error: pr.error }, { status: 400 })
    const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string").slice(0, 300) : []
    const { proposals } = await build(co.value, pr.range)
    return NextResponse.json({ success: true, execution: await runSearchControls({ company: co.value, proposals, ids, actor: actorOf(u.value), validateOnly: b.validateOnly !== false, confirmText: b.confirmText }) })
  } catch (e) { return err(e) }
}
