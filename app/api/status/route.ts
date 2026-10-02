// Status API — returns connection status for sidebar + header
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { META_GRAPH_BASE } from "@/lib/meta/graph-version";

// `facebook: !!process.env.META_ACCESS_TOKEN` used to mean "a token string
// exists" — not "the token still works". Meta access tokens expire; an
// expired one still shows a green "Connected" dot forever while every real
// Meta fetch (spend split, CPL, alerts...) fails silently underneath,
// showing as ₫0 spend with no obvious explanation (see lib/finance/
// company-pnl.ts's spendSplit — gatherMeta() catches the failure and just
// returns [], no error surfaces to the UI). Does a real (cached) token
// check instead so a dead token shows as disconnected within minutes,
// not indefinitely.
const META_CHECK_TTL_MS = 5 * 60 * 1000;
let metaCheckCache: { ok: boolean; expires: number } | null = null;

async function isMetaTokenValid(): Promise<boolean> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return false;

  if (metaCheckCache && metaCheckCache.expires > Date.now()) return metaCheckCache.ok;

  let ok = false;
  try {
    const res = await fetch(
      `${META_GRAPH_BASE}/me?fields=id&access_token=${token}`,
      { signal: AbortSignal.timeout(5_000) }
    );
    const data = await res.json() as { id?: string; error?: { message: string } };
    ok = !data.error && !!data.id;
  } catch {
    ok = false; // network error / timeout — treat as not-connected, never throw
  }

  metaCheckCache = { ok, expires: Date.now() + META_CHECK_TTL_MS };
  return ok;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const googleConfigured = !!(
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    (process.env.GOOGLE_ADS_CUSTOMER_ID_MBC || process.env.GOOGLE_ADS_CUSTOMER_ID_MBI)
  );

  const facebookConnected = await isMetaTokenValid();

  // Return only boolean connection status — never expose customer IDs or account names
  return NextResponse.json({
    facebook: facebookConnected,
    ga4: !!(process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID),
    google: googleConfigured,
    gemini: !!process.env.GEMINI_API_KEY,
    telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    googleAccounts: googleConfigured
      ? user.companies
          .filter(c => c !== "ALL")
          .map(c => ({ company: c, connected: true }))
      : [],
  });
}
