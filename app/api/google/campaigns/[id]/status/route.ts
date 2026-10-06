// POST /api/google/campaigns/[id]/status
// Real Google Ads campaign status toggle — was missing entirely.
// components/CampaignTable.tsx's toggle button existed for Google rows
// too, but always posted to /api/meta/campaigns/[id]/status regardless
// of platform, sending a Google Ads numeric campaign ID to the Meta
// Graph API. That call would fail (or worse, silently no-op) for every
// Google campaign — this is the real, working counterpart.
import { NextRequest, NextResponse } from "next/server";
import { getGoogleAdsCustomer } from "@/lib/google-ads-client";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, canAccessCompany } from "@/lib/permissions";

import { googleAdsErrorMessage } from "@/lib/google-ads-error";
import { recordCampaignMutation } from "@/lib/mutation-guard";
import { friendlyError } from "@/lib/not-configured";
import { googleStatusName } from "@/lib/writes/undo";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user.role, "can_edit")) {
    return NextResponse.json({ success: false, error: "Không có quyền chỉnh sửa campaign" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json() as {
      action?: "PAUSE" | "ACTIVE";
      company?: string;
    };
    const { action, company } = body;

    if (!company) {
      return NextResponse.json({ success: false, error: "Thiếu công ty" }, { status: 400 });
    }
    if (!canAccessCompany(user, company)) {
      return NextResponse.json({ success: false, error: "Không có quyền truy cập công ty này" }, { status: 403 });
    }
    const campaignId = parseInt(id, 10);
    if (!campaignId || isNaN(campaignId)) {
      return NextResponse.json({ success: false, error: "campaignId không hợp lệ" }, { status: 400 });
    }

    const customer = getGoogleAdsCustomer(company);

    // Resolve the real resource_name via GAQL rather than hand-building
    // "customers/{cid}/campaigns/{id}" — same pattern already proven in
    // app/api/google/audit/auto-fix/route.ts.
    const rows = await customer.query(`
      SELECT campaign.resource_name, campaign.name, campaign.status FROM campaign WHERE campaign.id = ${campaignId}
    `);
    const resourceName = rows[0]?.campaign?.resource_name as string | undefined;
    if (!resourceName) {
      return NextResponse.json({ success: false, error: "Không tìm thấy campaign trên Google Ads" }, { status: 404 });
    }

    // Google Ads' real enum is ENABLED/PAUSED — not Meta's ACTIVE/PAUSED.
    const googleStatus = action === "PAUSE" ? "PAUSED" : "ENABLED";
    await customer.campaigns.update([{
      resource_name: resourceName,
      status: googleStatus,
    }]);
    // Đợt 15b: bật/tắt chiến dịch trước đây KHÔNG để lại dấu vết → không đo lại được hiệu quả.
    recordCampaignMutation({ source: { type: "human_manual", actor: user.email || user.name || user.id }, event: googleStatus === "PAUSED" ? "campaign.pause" : "campaign.resume", company, campaignId: String(campaignId), campaignName: String(rows[0]?.campaign?.name ?? campaignId), rationale: "Bật/tắt chiến dịch từ bảng Campaigns", platform: "google_ads", change: googleStatusName(rows[0]?.campaign?.status) ? { field: "status", before: googleStatusName(rows[0]?.campaign?.status)!, after: googleStatus } : undefined });

    return NextResponse.json({
      success: true,
      newStatus: googleStatus === "ENABLED" ? "ACTIVE" : "PAUSED",
      message: googleStatus === "PAUSED" ? "⏸ Đã tạm dừng chiến dịch" : "▶ Đã kích hoạt chiến dịch",
    });
  } catch (error: unknown) {
    const message = googleAdsErrorMessage(error);
    return NextResponse.json({ success: false, error: friendlyError(message) }, { status: 500 });
  }
}
