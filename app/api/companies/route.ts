// Đợt 21a — GET /api/companies: danh sách công ty của bản cài cho giao diện (KHÔNG có mã tích hợp / khoá — chỉ tên, màu,
// quy tắc nhận biết chiến dịch, hậu tố biến). Cần đăng nhập. `accessible` = công ty người này được xem.
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/case/http"
import { canAccessCompany } from "@/lib/permissions"
import { companiesConfig, companyIds } from "@/lib/companies"

export const dynamic = "force-dynamic"

export async function GET() {
  const u = await requireUser()
  if (!u.ok) return u.response
  const cfg = companiesConfig()
  return NextResponse.json({ success: true, config: cfg, accessible: companyIds().filter((c) => canAccessCompany(u.value.role, c)) })
}
