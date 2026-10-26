// ============================================================
// Bắt đầu / quay về một lượt kết nối qua cổng — dùng chung cho Google và Meta (app/api/connect/<provider>/{start,return}).
// Bắt đầu: sinh nonce (cookie HttpOnly trên miền bản cài) → gửi SHA-256 của nó cho cổng → sang trang trung gian của cổng.
// Quay về: chỉ trình duyệt có đúng nonce mới xác nhận được kết nối (mini-spec GATEWAY-CONNECT-1 §12A).
// ============================================================
import crypto from "crypto"
import { NextResponse, type NextRequest } from "next/server"
import type { SessionUser } from "@/lib/auth"
import { clearGatewayTokenCache, gatewayFetch } from "./gateway"
import { backPage, connectError, connectGuard, NEXT_COOKIE, NONCE_COOKIE } from "./route-kit"
import type { ConnectProvider } from "./store"

const LABEL: Record<ConnectProvider, string> = { google: "Google", meta: "Meta" }

function reasonText(provider: ConnectProvider, reason: string): string {
  const who = LABEL[provider]
  const map: Record<string, string> = {
    cancelled: "Bạn đã huỷ kết nối.",
    access_denied: `${who}: bạn chưa cho phép truy cập.`,
    scope_denied: provider === "google"
      ? "Bạn chưa tích quyền Google Ads trên màn hình Google — bấm kết nối lại và tích ô quản lý Google Ads."
      : "Bạn chưa cấp quyền quản lý quảng cáo trên hộp thoại Facebook — bấm kết nối lại và giữ nguyên các quyền được đề nghị.",
    no_refresh_token: "Google không trả quyền truy cập lâu dài — bấm kết nối lại.",
    session_mismatch: "Phiên kết nối không khớp trình duyệt — bấm kết nối lại trên cùng trình duyệt.",
    install_inactive: "Bản cài đang bị Mắt Bão tạm ngưng — liên hệ Mắt Bão.",
    misconfigured: "Cổng kết nối Mắt Bão đang thiếu cấu hình — liên hệ Mắt Bão.",
    provider_error: `${who} báo lỗi khi kết nối — thử lại sau ít phút.`,
  }
  return map[reason] ?? map.provider_error
}

export async function startConnect(req: NextRequest, provider: ConnectProvider): Promise<NextResponse> {
  const g = await connectGuard()
  if ("res" in g) return g.res
  const nonce = crypto.randomBytes(32).toString("base64url")
  try {
    const { url } = await gatewayFetch<{ url: string }>("/api/v1/connect/start", {
      body: {
        provider,
        returnPath: `/api/connect/${provider}/return`,
        createdBy: g.user.email,
        nonceHash: crypto.createHash("sha256").update(nonce).digest("hex"),
      },
    })
    const res = NextResponse.redirect(url, 303)
    const secure = process.env.NODE_ENV === "production"
    res.cookies.set(NONCE_COOKIE(provider), nonce, { httpOnly: true, sameSite: "lax", secure, path: "/api/connect", maxAge: 15 * 60 })
    res.cookies.set(NEXT_COOKIE, backPage(req.nextUrl.searchParams.get("next")) === "/setup" ? "setup" : "settings", { httpOnly: true, sameSite: "lax", secure, path: "/api/connect", maxAge: 15 * 60 })
    return res
  } catch (e) {
    return connectError(e)
  }
}

/** onConfirmed: ghi data/connect.json cho nhà cung cấp (kết nối mới thay kết nối cũ — cổng đã thu hồi cái cũ). */
export async function returnConnect(
  req: NextRequest,
  provider: ConnectProvider,
  onConfirmed: (cid: string, user: SessionUser) => Promise<void>,
): Promise<NextResponse> {
  const g = await connectGuard()
  if ("res" in g) return g.res
  const q = req.nextUrl.searchParams
  const page = backPage(req.cookies.get(NEXT_COOKIE)?.value)
  const back = (params: Record<string, string>) => {
    const u = new URL(page, req.nextUrl.origin)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    const res = NextResponse.redirect(u, 303)
    res.cookies.delete({ name: NONCE_COOKIE(provider), path: "/api/connect" })
    res.cookies.delete({ name: NEXT_COOKIE, path: "/api/connect" })
    return res
  }

  if (q.get("ok") !== "1") return back({ connect: provider, connect_error: reasonText(provider, q.get("reason") ?? "provider_error") })
  const cid = q.get("cid") ?? ""
  const nonce = req.cookies.get(NONCE_COOKIE(provider))?.value
  if (!/^c_[A-Za-z0-9_-]{12}$/.test(cid) || !nonce) return back({ connect: provider, connect_error: reasonText(provider, "session_mismatch") })

  try {
    await gatewayFetch(`/api/v1/connections/${cid}/confirm`, { body: { nonce } })
    clearGatewayTokenCache()
    await onConfirmed(cid, g.user)
  } catch (e) {
    return back({ connect: provider, connect_error: e instanceof Error ? e.message : String(e) })
  }
  return back({ connect: provider, connect_ok: "1" })
}
