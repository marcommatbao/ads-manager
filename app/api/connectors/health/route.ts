// GET  /api/connectors/health          — snapshot (fast, env-based, no live calls)
// POST /api/connectors/health          — refresh all (runs live checks, slower)
// Requires: authenticated + admin role (viewer roles should not trigger live tests)

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { snapshotAllConnectors, refreshAllConnectors } from "@/lib/connectors/engine";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";

// GET — fast config-based snapshot + stored check results
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // All authenticated users can VIEW connector health (but only admins can trigger tests)
  const records = snapshotAllConnectors();

  return NextResponse.json({
    records,
    connectors: CONNECTOR_REGISTRY.map(d => ({
      id: d.id,
      displayName: d.displayName,
      supportsLiveTest: d.supportsLiveTest,
      color: d.color,
      icon: d.icon,
    })),
    canTest: hasPermission(user.role, "can_view_credentials"),
  });
}

// POST — admin-triggered full refresh
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasPermission(user.role, "can_view_credentials")) {
    return NextResponse.json({ error: "Không có quyền kích hoạt kiểm tra kết nối" }, { status: 403 });
  }

  const records = await refreshAllConnectors();

  const summary = {
    healthy:        0,
    warning:        0,
    missing_config: 0,
    auth_error:     0,
    service_error:  0,
    disabled:       0,
  };
  for (const r of Object.values(records)) {
    summary[r.status] = (summary[r.status] ?? 0) + 1;
  }

  return NextResponse.json({ records, summary });
}
