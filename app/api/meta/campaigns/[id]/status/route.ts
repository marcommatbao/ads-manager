import { NextRequest, NextResponse } from "next/server";
import { resolveMetaNodeOwner } from "@/lib/meta-campaign-company";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, canAccessCompany } from "@/lib/permissions";
import { detectCompany } from "@/lib/company-detect";
import { recordCampaignMutation } from "@/lib/mutation-guard";
import { META_GRAPH_BASE } from "@/lib/meta/graph-version";
import { friendlyError } from "@/lib/not-configured";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(user.role, "can_edit")) {
    return NextResponse.json({ success: false, error: "Không có quyền chỉnh sửa campaign" }, { status: 403 });
  }

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ success: false, error: friendlyError("META_ACCESS_TOKEN not configured") }, { status: 500 });

  try {
    const { action, campaignId } = await request.json() as {
      action: "PAUSE" | "ACTIVATE";
      campaignId: string;
    };

    const status = action === "PAUSE" ? "PAUSED" : "ACTIVE";
    const id = (await params).id;
    // Audit 30/09: không cho body.campaignId ghi đè id trên đường dẫn.
    if (campaignId && campaignId !== id) {
      return NextResponse.json({ success: false, error: "campaignId không khớp đường dẫn" }, { status: 400 });
    }

    // Same company-derivation-before-mutation as the sibling budget route —
    // was missing entirely (an admin_mbc could pause/activate any MBI
    // campaign and vice versa).
    // Công ty lấy từ CHIẾN DỊCH CHA (nhóm/quảng cáo không mang tiền tố công ty — audit 30/09).
    let owner;
    try { owner = await resolveMetaNodeOwner(id, token, { withStatus: true }); }
    catch (e) { return NextResponse.json({ success: false, error: `Không xác minh được công ty: ${e instanceof Error ? e.message : String(e)}` }, { status: 403 }); }
    const nameData = { name: owner.name };
    const campaignCompany = detectCompany(owner.campaignName);
    if (!canAccessCompany(user, campaignCompany)) {
      return NextResponse.json({ success: false, error: "Access denied for this company" }, { status: 403 });
    }

    const url = new URL(`${META_GRAPH_BASE}/${id}`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("status", status);

    const res = await fetch(url.toString(), { method: "POST" });
    const data = await res.json() as { success?: boolean; error?: { message: string } };

    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `Meta API error ${res.status}`);
    }
    // Đợt 15b: ghi dấu vết để đo lại 7/14 ngày.
    recordCampaignMutation({ source: { type: "human_manual", actor: user.email || user.name || user.id }, event: status === "PAUSED" ? "campaign.pause" : "campaign.resume", company: campaignCompany, campaignId: id, campaignName: nameData.name ?? id, rationale: "Bật/tắt chiến dịch từ bảng Campaigns", platform: "meta", change: owner.status ? { field: "status", before: owner.status, after: status } : undefined });

    return NextResponse.json({
      success: true,
      newStatus: status,
      message: status === "PAUSED" ? "⏸ Đã tạm dừng chiến dịch" : "▶ Đã kích hoạt chiến dịch",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: friendlyError(message) }, { status: 500 });
  }
}
