// ============================================================
// AdsCommand — Middleware (JWT Auth + RBAC)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, decodeSessionFromCookieValue } from "@/lib/auth";
import { canAccessRoute, getBlockedMessage } from "@/lib/permissions";
import { isHiddenPage } from "@/lib/hidden-pages";
import { csrfRejectReason } from "@/lib/csrf";

// Run in Node.js runtime so we can use crypto for full JWT signature verification
export const runtime = "nodejs";

// Auth pages that don't need login
const AUTH_PAGES = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── /api: chỉ chặn CSRF (xác thực vẫn do từng route tự làm) ──
  if (pathname.startsWith("/api")) {
    const why = csrfRejectReason({
      method: request.method,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
      host: request.headers.get("host"),
      forwardedHost: request.headers.get("x-forwarded-host"),
    });
    if (why) return NextResponse.json({ success: false, error: "Yêu cầu bị chặn (khác nguồn)" }, { status: 403 });
    return NextResponse.next();
  }

  // ── Skip static assets and _next ──
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ── Get session from cookie (full JWT signature verification) ──
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? decodeSessionFromCookieValue(token) : null;

  // ── Not logged in or invalid/tampered token ──
  if (!session || !session.role || !session.companies) {
    if (AUTH_PAGES.some(p => pathname.startsWith(p))) {
      return NextResponse.next();
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // Only allow relative paths as callbackUrl (prevent open redirect)
    if (pathname.startsWith("/") && !pathname.startsWith("//")) {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // ── Logged in but on auth page → redirect to dashboard ──
  if (AUTH_PAGES.some(p => pathname.startsWith(p))) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = "/";
    return NextResponse.redirect(dashUrl);
  }

  // ── Trang đang tạm ẩn → đưa về Dashboard ──
  // Đặt SAU bước kiểm đăng nhập (người lạ vẫn phải về trang đăng nhập trước,
  // không lộ việc app có những trang nào) và TRƯỚC kiểm quyền.
  if (isHiddenPage(pathname)) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  // ── Check route permission ──
  const role = session.role;
  if (!canAccessRoute(role, pathname)) {
    const message = getBlockedMessage(pathname);
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.searchParams.set("blocked", message);
    return NextResponse.redirect(redirectUrl);
  }

  // ── Inject verified user info headers for server components ──
  const response = NextResponse.next();
  response.headers.set("x-user-role", role);
  response.headers.set("x-user-companies", (session.companies || []).join(","));
  return response;

}

// ── Matcher: pages + /api (api chỉ để chặn CSRF, xem lib/csrf.ts) ──
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
