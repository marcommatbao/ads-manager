import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { guardViewCredentials } from "@/lib/settings/guards";
import { META_GRAPH_BASE } from "@/lib/meta/graph-version";

// GET /api/settings/meta/test?token=xxx — verify a Meta access token is valid
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const credGuard = guardViewCredentials(user);
  if (credGuard) return credGuard;

  const token = request.nextUrl.searchParams.get("token") || process.env.META_ACCESS_TOKEN;
  const adAccountId = request.nextUrl.searchParams.get("adAccountId") || process.env.META_AD_ACCOUNT_ID;

  if (!token) {
    return NextResponse.json({ ok: false, error: "No access token configured" });
  }

  try {
    // Verify token via Graph API /me endpoint
    const meRes = await fetch(
      `${META_GRAPH_BASE}/me?fields=id,name&access_token=${token}`
    );
    const meData = await meRes.json() as { id?: string; name?: string; error?: { message: string; code: number } };

    if (meData.error) {
      return NextResponse.json({
        ok: false,
        error: meData.error.message,
        code: meData.error.code,
      });
    }

    // Check ad account access if provided
    let accountName = "";
    if (adAccountId) {
      const accountId = adAccountId.replace(/^act_/, "");
      const acctRes = await fetch(
        `${META_GRAPH_BASE}/act_${accountId}?fields=name,account_status,currency&access_token=${token}`
      );
      const acctData = await acctRes.json() as { name?: string; account_status?: number; currency?: string; error?: { message: string } };
      if (!acctData.error) accountName = acctData.name ?? "";
    }

    return NextResponse.json({
      ok: true,
      userId: meData.id,
      userName: meData.name,
      accountName,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Network error checking token" });
  }
}
