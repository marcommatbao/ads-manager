// GET /api/connect/google/return?provider=google&ok=1&cid=…  (hoặc ok=0&reason=…) — cổng chuyển trình duyệt về đây.
// Xác nhận kết nối bằng nonce trong cookie (chỉ trình duyệt đã bấm "Kết nối" mới có), lưu mã kết nối vào data/connect.json.
import { NextResponse, type NextRequest } from "next/server"
import { clearGatewayTokenCache, gatewayFetch } from "@/lib/connect/gateway"
import { readConnect, writeConnect } from "@/lib/connect/store"
import { backPage, connectGuard, NEXT_COOKIE, NONCE_COOKIE } from "@/lib/connect/route-kit"
import { writeAuditEntry } from "@/lib/settings/audit"

export const dynamic = "force-dynamic"

const REASON_VI: Record<string, string> = {
  cancelled: "Bạn đã huỷ kết nối.",
  access_denied: "Google: bạn chưa cho phép truy cập.",
  scope_denied: "Bạn chưa tích quyền Google Ads trên màn hình Google — bấm kết nối lại và tích ô quản lý Google Ads.",
  no_refresh_token: "Google không trả quyền truy cập lâu dài — bấm kết nối lại.",
  session_mismatch: "Phiên kết nối không khớp trình duyệt — bấm kết nối lại trên cùng trình duyệt.",
  install_inactive: "Bản cài đang bị Mắt Bão tạm ngưng — liên hệ Mắt Bão.",
  misconfigured: "Cổng kết nối Mắt Bão đang thiếu cấu hình — liên hệ Mắt Bão.",
  provider_error: "Google báo lỗi khi kết nối — thử lại sau ít phút.",
}

export async function GET(req: NextRequest) {
  const g = await connectGuard()
  if ("res" in g) return g.res
  const q = req.nextUrl.searchParams
  const page = backPage(req.cookies.get(NEXT_COOKIE)?.value)
  const back = (params: Record<string, string>) => {
    const u = new URL(page, req.nextUrl.origin)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    const res = NextResponse.redirect(u, 303)
    res.cookies.delete({ name: NONCE_COOKIE("google"), path: "/api/connect" })
    res.cookies.delete({ name: NEXT_COOKIE, path: "/api/connect" })
    return res
  }

  if (q.get("ok") !== "1") {
    const reason = q.get("reason") ?? "provider_error"
    return back({ connect: "google", connect_error: REASON_VI[reason] ?? REASON_VI.provider_error })
  }
  const cid = q.get("cid") ?? ""
  const nonce = req.cookies.get(NONCE_COOKIE("google"))?.value
  if (!/^c_[A-Za-z0-9_-]{12}$/.test(cid) || !nonce) return back({ connect: "google", connect_error: REASON_VI.session_mismatch })

  try {
    await gatewayFetch(`/api/v1/connections/${cid}/confirm`, { body: { nonce } })
  } catch (e) {
    return back({ connect: "google", connect_error: e instanceof Error ? e.message : String(e) })
  }
  const prev = readConnect()
  // Kết nối mới thay kết nối cũ (cổng đã thu hồi kết nối cũ). Giữ các tài khoản đã chọn — trang chọn tài khoản kiểm lại.
  writeConnect({ ...prev, google: { connectionId: cid, createdAt: new Date().toISOString(), createdBy: g.user.email, accounts: prev.google?.accounts ?? [] } })
  clearGatewayTokenCache()
  await writeAuditEntry("credentials_google", g.user, "update", "gateway_connect", null, null, "ALL")
  return back({ connect: "google", connect_ok: "1" })
}
