// POST /api/connectors/[id]/test — live test one connector
// Requires can_view_credentials (admin+)

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { runLiveCheck } from "@/lib/connectors/engine";
import { CONNECTORS_BY_ID } from "@/lib/connectors/registry";
import type { ConnectorId } from "@/lib/connectors/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(user.role, "can_view_credentials")) {
    return NextResponse.json({ error: "Không có quyền test kết nối" }, { status: 403 });
  }

  const { id } = await params;

  if (!(id in CONNECTORS_BY_ID)) {
    return NextResponse.json({ error: `Unknown connector: ${id}` }, { status: 400 });
  }

  const descriptor = CONNECTORS_BY_ID[id as ConnectorId];
  if (!descriptor.supportsLiveTest) {
    return NextResponse.json({
      error: `${descriptor.displayName} does not support live test — use the health snapshot instead`,
    }, { status: 400 });
  }

  try {
    const record = await runLiveCheck(id as ConnectorId);
    return NextResponse.json({ record });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
