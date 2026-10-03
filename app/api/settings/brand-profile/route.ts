// Đợt 21 A3 — Hồ sơ doanh nghiệp cho AI.
// GET ?company=          — hồ sơ đã lưu, hoặc mặc định (chưa lưu). `legacy` = MBC/MBI chưa lưu → AI đang dùng nội dung cũ trong mã.
// PUT {company, profile} — lưu (cần quyền sửa + quyền công ty). Lưu rồi thì AI dùng hồ sơ cho công ty đó.
import { NextRequest, NextResponse } from "next/server"
import { actorOf, fail, requireCompany, requireUser } from "@/lib/case/http"
import { hasPermission } from "@/lib/permissions"
import { BRAND_LIMITS, normalizeBrandProfile } from "@/lib/brand/types"
import { defaultBrandProfile, LEGACY_BRAND_COMPANIES, saveBrandProfile, savedBrandProfile } from "@/lib/brand/store"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const u = await requireUser()
  if (!u.ok) return u.response
  const co = requireCompany(u.value, request.nextUrl.searchParams.get("company"))
  if (!co.ok) return co.response
  const saved = savedBrandProfile(co.value)
  return NextResponse.json({
    success: true, profile: saved ?? defaultBrandProfile(co.value), saved: !!saved,
    legacy: !saved && LEGACY_BRAND_COMPANIES.includes(co.value), limits: BRAND_LIMITS, canEdit: hasPermission(u.value.role, "can_edit"),
  })
}

export async function PUT(request: NextRequest) {
  const u = await requireUser("can_edit")
  if (!u.ok) return u.response
  const b = (await request.json().catch(() => ({}))) as { company?: string; profile?: unknown }
  const co = requireCompany(u.value, b.company)
  if (!co.ok) return co.response
  try {
    const n = normalizeBrandProfile(co.value, b.profile)
    if (!n.profile) return NextResponse.json({ success: false, error: n.errors.join(" · ") }, { status: 400 })
    return NextResponse.json({ success: true, profile: await saveBrandProfile(n.profile, actorOf(u.value)) })
  } catch (e) { return fail(e) }
}
