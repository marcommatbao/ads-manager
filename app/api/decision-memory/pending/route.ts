// ============================================================
// GET /api/decision-memory/pending
// Returns entries with overdue evaluation windows (both companies).
// Used by morning briefing and cron health dashboard.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getPendingEvaluations } from "@/lib/decision-memory/query";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user.role, "can_view_credentials")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const mbc = getPendingEvaluations("MBC");
  const mbi = getPendingEvaluations("MBI");

  return NextResponse.json({
    success: true,
    data: {
      MBC: { entries: mbc, count: mbc.length },
      MBI: { entries: mbi, count: mbi.length },
      total: mbc.length + mbi.length,
    },
  });
}
