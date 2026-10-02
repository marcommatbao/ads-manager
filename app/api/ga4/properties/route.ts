// GET /api/ga4/properties — list the GA4 properties the connected Google
// account can read, so Settings → GA4 can offer a real picker instead of
// asking someone to type a numeric property id by hand.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { guardViewCredentials } from "@/lib/settings/guards";
import {
  readGA4OAuth,
  getAccessToken,
  invalidateAccessToken,
  listGA4Properties,
} from "@/lib/ga4-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const guard = guardViewCredentials(user);
  if (guard) return guard;

  const oauth = readGA4OAuth();
  if (!oauth) {
    return NextResponse.json(
      { success: false, error: "Chưa kết nối Google Analytics", needsConnect: true },
      { status: 409 },
    );
  }

  try {
    const accessToken = await getAccessToken(oauth.refreshToken);
    const properties = await listGA4Properties(accessToken);
    return NextResponse.json({ success: true, properties });
  } catch (err) {
    // A revoked grant surfaces here first; drop the cached token so a
    // reconnect takes effect immediately rather than after an hour.
    invalidateAccessToken(oauth.refreshToken);
    const message = err instanceof Error ? err.message : "Không lấy được danh sách property";
    console.error("[ga4/properties]", err);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
