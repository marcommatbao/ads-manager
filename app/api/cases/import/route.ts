// POST /api/cases/import {cases: CampaignCase[]} — nhập phiên từ bản chạy khác (Đợt 6 · B1). Chỉ super_admin.
// Giữ nguyên id + lịch đo lại; trùng id → bỏ qua, KHÔNG ghi đè. Tối đa 50 phiên / 5MB mỗi lần.
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/case/http"
import { isSuperAdmin } from "@/lib/permissions"
import { importCase, validateImportedCase, type CampaignCase } from "@/lib/case/store"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const u = await requireUser()
  if (!u.ok) return u.response
  if (!isSuperAdmin(u.value.role)) return NextResponse.json({ success: false, error: "Chỉ Super Admin được nhập phiên" }, { status: 403 })
  const len = Number(request.headers.get("content-length") ?? 0)
  if (len > 5_000_000) return NextResponse.json({ success: false, error: "Tệp quá lớn (tối đa 5MB)" }, { status: 413 })
  const body = (await request.json().catch(() => null)) as { cases?: unknown } | null
  if (!body || !Array.isArray(body.cases)) return NextResponse.json({ success: false, error: "Tệp không đúng định dạng — cần {\"cases\": [...]}" }, { status: 400 })
  if (body.cases.length > 50) return NextResponse.json({ success: false, error: "Tối đa 50 phiên mỗi lần" }, { status: 400 })
  const results: { id: string; campaignName: string; status: "imported" | "exists" | "invalid"; reason?: string }[] = []
  for (const x of body.cases) {
    const c = x as CampaignCase
    const err = validateImportedCase(x)
    if (err) { results.push({ id: String(c?.id ?? "?"), campaignName: String(c?.campaignName ?? "?"), status: "invalid", reason: err }); continue }
    results.push({ id: c.id, campaignName: c.campaignName, status: await importCase(c) })
  }
  return NextResponse.json({ success: true, results })
}
