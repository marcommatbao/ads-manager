// GET /api/dashboard/trends/breakdown?company=&platform=all|meta|google&from=&to=&force=1 — Đợt 28d: tách theo đối tượng /
// vị trí cho tab "Diễn biến". CHỈ ĐỌC, chỉ gọi khi người dùng bấm "Xem tách" (đệm 30 phút).
import { NextRequest, NextResponse } from "next/server"
import { requireCompany, requireUser } from "@/lib/case/http"
import { isYmd } from "@/lib/case/dates"
import { friendlyError } from "@/lib/not-configured"
import { googleBreakdown, metaBreakdown } from "@/lib/trends/breakdown-fetch"
import type { BTable } from "@/lib/trends/breakdown"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const u = await requireUser()
  if (!u.ok) return u.response
  const q = request.nextUrl.searchParams
  const co = requireCompany(u.value, q.get("company"))
  if (!co.ok) return co.response
  const from = q.get("from") ?? "", to = q.get("to") ?? ""
  if (!isYmd(from) || !isYmd(to) || from > to) return NextResponse.json({ success: false, error: "Khoảng ngày không hợp lệ" }, { status: 400 })
  const platform = q.get("platform") === "meta" ? "meta" : q.get("platform") === "google" ? "google" : "all"
  const force = q.get("force") === "1"
  const wanted: ("meta" | "google")[] = platform === "all" ? ["meta", "google"] : [platform]
  const tables: BTable[] = [], errors: { platform: string; error: string }[] = []
  for (const p of wanted) {
    try { tables.push(...(p === "meta" ? await metaBreakdown(co.value, { from, to }, force) : await googleBreakdown(co.value, { from, to }, force))) }
    catch (e) { errors.push({ platform: p, error: friendlyError(e instanceof Error ? e.message : String(e)) }) }
  }
  return NextResponse.json({ success: true, tables, errors })
}
