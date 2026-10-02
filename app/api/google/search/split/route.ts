// Đợt 11b — Tách lượt tìm chung khỏi chiến dịch thương hiệu.
// GET  ?company=&campaignId=&from=&to=                                        — kế hoạch tách + các bản tách đã có
// POST {company, op: "create", campaignId, from, to, budgetPerDay?, targetCpa?, validateOnly, confirmText?} — dựng chiến dịch TẠM DỪNG
// POST {company, op: "action", id, action: enable|pause|move|unmove|remove, confirmText}
// POST {company, op: "assets", id, validateOnly, confirmText?}  — Đợt 18c: bổ sung tài sản (sitelink, ảnh…) từ chiến dịch gốc
// GET  ?company=&series=<id>                                     — Đợt 18h: diễn biến theo ngày của 2 chiến dịch
import { NextRequest, NextResponse } from "next/server"
import { actorOf, fail, requireCompany, requireUser } from "@/lib/case/http"
import { DEFAULT_VIEW_DAYS, MAX_RANGE_DAYS, parseRange } from "@/lib/case/dates"
import { hasPermission } from "@/lib/permissions"
import { createSplit, listSplits, planSplit, splitAction, splitAds, splitCheckpoint, supplementSplitAssets } from "@/lib/search/split"
import { splitSeries } from "@/lib/search/split-tracking"
import { assessSplit } from "@/lib/search/split-assessment"
import { searchXray } from "@/lib/search/xray"
import { targetFor } from "@/lib/case/targets"
import { productGroupOf } from "@/lib/case/product"
import { rangeDays } from "@/lib/case/dates"
import { SEARCH_CONFIRM_TEXT } from "@/lib/search/controls"
import { PmaxControlError } from "@/lib/pmax/controls"

export const dynamic = "force-dynamic"
export const maxDuration = 120
const err = (e: unknown) => (e instanceof PmaxControlError ? NextResponse.json({ success: false, error: e.message }, { status: e.status }) : fail(e))

export async function GET(request: NextRequest) {
  const u = await requireUser()
  if (!u.ok) return u.response
  const sp = request.nextUrl.searchParams
  const co = requireCompany(u.value, sp.get("company"))
  if (!co.ok) return co.response
  const pr = parseRange(sp.get("from"), sp.get("to"), { defaultDays: DEFAULT_VIEW_DAYS, maxDays: MAX_RANGE_DAYS })
  if (!pr.ok) return NextResponse.json({ success: false, error: pr.error }, { status: 400 })
  const cid = sp.get("campaignId")
  const adsOf = sp.get("adsOf")
  if (adsOf) { try { return NextResponse.json({ success: true, adGroups: await splitAds(co.value, adsOf) }) } catch (e) { return err(e) } }
  const checkId = sp.get("checkpoint")
  try {
    if (checkId) return NextResponse.json({ success: true, checkpoint: await splitCheckpoint(co.value, checkId) })
    const seriesId = sp.get("series")
    if (seriesId) {
      const rec = listSplits(co.value).find((x) => x.id === seriesId)
      if (!rec?.newCampaign) return NextResponse.json({ success: false, error: "Không tìm thấy bản tách" }, { status: 404 })
      return NextResponse.json({ success: true, series: await splitSeries(co.value, rec) })
    }
    let plan = null, assessment = null
    if (cid && /^\d+$/.test(cid)) {
      const [p, x] = await Promise.all([planSplit(co.value, cid, pr.range), searchXray(co.value, pr.range)])
      plan = p
      const camp = x.campaigns.find((c) => c.id === cid)
      const t = targetFor(co.value, productGroupOf(p.sourceName))
      if (camp) assessment = assessSplit({ plan: p, campaign: camp, days: rangeDays(pr.range), targetCpa: t?.basis === "cpa" ? t.target : null })
    }
    return NextResponse.json({ success: true, plan, assessment, splits: listSplits(co.value).filter((r) => !cid || r.sourceId === cid), canEdit: hasPermission(u.value.role, "can_edit"), confirmText: SEARCH_CONFIRM_TEXT })
  } catch (e) { return err(e) }
}

export async function POST(request: NextRequest) {
  const u = await requireUser("can_edit")
  if (!u.ok) return u.response
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const co = requireCompany(u.value, b.company)
  if (!co.ok) return co.response
  try {
    if (b.op === "create") {
      const pr = parseRange(b.from, b.to, { defaultDays: DEFAULT_VIEW_DAYS, maxDays: MAX_RANGE_DAYS })
      if (!pr.ok) return NextResponse.json({ success: false, error: pr.error }, { status: 400 })
      if (!/^\d+$/.test(String(b.campaignId ?? ""))) return NextResponse.json({ success: false, error: "Thiếu chiến dịch" }, { status: 400 })
      const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined)
      return NextResponse.json({ success: true, validated: b.validateOnly !== false, record: await createSplit({ company: co.value, campaignId: String(b.campaignId), range: pr.range, budgetPerDay: num(b.budgetPerDay), targetCpa: num(b.targetCpa), cpaMode: ["none", "keep", "set"].includes(String(b.cpaMode)) ? (b.cpaMode as "none") : undefined, sourceBudgetPerDay: num(b.sourceBudgetPerDay), actor: actorOf(u.value), validateOnly: b.validateOnly !== false, confirmText: typeof b.confirmText === "string" ? b.confirmText : undefined }) })
    }
    if (b.op === "assets") {
      if (typeof b.id !== "string") return NextResponse.json({ success: false, error: "Thiếu bản tách" }, { status: 400 })
      return NextResponse.json({ success: true, validated: b.validateOnly !== false, ...(await supplementSplitAssets(co.value, b.id, { validateOnly: b.validateOnly !== false, actor: actorOf(u.value), confirmText: typeof b.confirmText === "string" ? b.confirmText : undefined })) })
    }
    if (b.op === "action") {
      const a = String(b.action)
      if (!["enable", "pause", "move", "unmove", "remove", "clear_tcpa", "source_budget"].includes(a)) return NextResponse.json({ success: false, error: "action không hợp lệ" }, { status: 400 })
      return NextResponse.json({ success: true, record: await splitAction(co.value, String(b.id ?? ""), a as "enable", actorOf(u.value), typeof b.confirmText === "string" ? b.confirmText : undefined, { amount: Number(b.amount) }) })
    }
    return NextResponse.json({ success: false, error: "op không hợp lệ" }, { status: 400 })
  } catch (e) { return err(e) }
}
