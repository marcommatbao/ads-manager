import { NextRequest, NextResponse } from "next/server";
import { GoogleAuditEngine } from "@/lib/google-audit-engine";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCompany } from "@/lib/permissions";
import { pickCompany } from "@/lib/companies"

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const company = pickCompany(searchParams.get("company"));
    if (!canAccessCompany(user, company)) {
      return NextResponse.json({ error: "Access denied for this company" }, { status: 403 });
    }

    const customerId = company === "MBI"
      ? process.env.GOOGLE_ADS_CUSTOMER_ID_MBI
      : process.env.GOOGLE_ADS_CUSTOMER_ID_MBC;

    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "Google Ads customer ID not configured" },
        { status: 500 }
      );
    }

    const engine = new GoogleAuditEngine();
    const data = await engine.runAudit(customerId);

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
