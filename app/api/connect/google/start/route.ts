// GET /api/connect/google/start?next=settings|setup — bắt đầu kết nối Google Ads qua Cổng kết nối Mắt Bão.
// Sinh nonce (giữ trong cookie HttpOnly trên miền bản cài) → gửi SHA-256 của nó cho cổng → chuyển trình duyệt sang trang
// trung gian của cổng. Lúc quay về, chỉ trình duyệt có đúng nonce mới xác nhận được kết nối (mini-spec GATEWAY-CONNECT-1 §12A).
import crypto from "crypto"
import { NextResponse, type NextRequest } from "next/server"
import { gatewayFetch } from "@/lib/connect/gateway"
import { backPage, connectError, connectGuard, NEXT_COOKIE, NONCE_COOKIE } from "@/lib/connect/route-kit"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const g = await connectGuard()
  if ("res" in g) return g.res
  const nonce = crypto.randomBytes(32).toString("base64url")
  try {
    const { url } = await gatewayFetch<{ url: string }>("/api/v1/connect/start", {
      body: {
        provider: "google",
        returnPath: "/api/connect/google/return",
        createdBy: g.user.email,
        nonceHash: crypto.createHash("sha256").update(nonce).digest("hex"),
      },
    })
    const res = NextResponse.redirect(url, 303)
    const secure = process.env.NODE_ENV === "production"
    res.cookies.set(NONCE_COOKIE("google"), nonce, { httpOnly: true, sameSite: "lax", secure, path: "/api/connect", maxAge: 15 * 60 })
    res.cookies.set(NEXT_COOKIE, backPage(req.nextUrl.searchParams.get("next")) === "/setup" ? "setup" : "settings", { httpOnly: true, sameSite: "lax", secure, path: "/api/connect", maxAge: 15 * 60 })
    return res
  } catch (e) {
    return connectError(e)
  }
}
