// Đợt 21a — GET /api/companies: danh sách công ty của bản cài cho giao diện (KHÔNG có mã tích hợp / khoá — chỉ tên, màu,
// quy tắc nhận biết chiến dịch, hậu tố biến). Cần đăng nhập. `accessible` = công ty người này được xem.
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/case/http"
import { canAccessCompany } from "@/lib/permissions"
import { companiesConfig, companyDef, companyIds } from "@/lib/companies"
import { setupEnabled, setupPending } from "@/lib/setup/state"

// Đợt 21 A4: mã CÔNG KHAI (đã hiện trên website khách: pixel, trang, GA4) để giao diện dùng khi bản build không có sẵn.
const PUBLIC_PREFIXES = ["NEXT_PUBLIC_META_PIXEL_ID", "NEXT_PUBLIC_META_PAGE_ID", "NEXT_PUBLIC_META_PIXEL_LABEL", "NEXT_PUBLIC_META_PAGE_LABEL", "NEXT_PUBLIC_GA4_PROPERTY_ID", "NEXT_PUBLIC_GA4_STREAM_ID", "NEXT_PUBLIC_GA4_MEASUREMENT_ID"]

export const dynamic = "force-dynamic"

export async function GET() {
  const u = await requireUser()
  if (!u.ok) return u.response
  const cfg = companiesConfig()
  const publicIds: Record<string, string> = {}
  for (const c of cfg.companies) for (const p of PUBLIC_PREFIXES) { const n = `${p}_${companyDef(c.id)?.envSuffix ?? c.id}`, v = (process.env[n] ?? "").trim(); if (v) publicIds[n] = v }
  return NextResponse.json({ success: true, config: cfg, publicIds, accessible: companyIds().filter((c) => canAccessCompany(u.value, c)), setup: { enabled: setupEnabled(), pending: setupPending() } })
}
