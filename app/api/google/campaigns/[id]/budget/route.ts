// PATCH /api/google/campaigns/[id]/budget
// Real Google Ads campaign daily-budget edit — was missing entirely.
// components/EditBudgetModal.tsx's "Save" button always PATCHed
// /api/meta/campaigns/[id]/budget for every campaign, Meta or Google —
// and that route never existed either (see the sibling Meta fix in this
// same commit). This is the real Google Ads counterpart.
import { NextRequest, NextResponse } from "next/server";
import { getGoogleAdsCustomer } from "@/lib/google-ads-client";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, canAccessCompany } from "@/lib/permissions";
import { checkRecentCampaignMutation, recordCampaignMutation } from "@/lib/mutation-guard";

import { googleAdsErrorMessage } from "@/lib/google-ads-error";
import { friendlyError } from "@/lib/not-configured";
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user.role, "can_manage_budget")) {
    return NextResponse.json({ success: false, error: "Không có quyền chỉnh ngân sách" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json() as {
      dailyBudget?: number; // VND
      company?: string;
    };
    const { dailyBudget, company } = body;

    if (!company) {
      return NextResponse.json({ success: false, error: "Thiếu company (MBC/MBI)" }, { status: 400 });
    }
    if (!canAccessCompany(user, company)) {
      return NextResponse.json({ success: false, error: "Không có quyền truy cập công ty này" }, { status: 403 });
    }
    if (!dailyBudget || dailyBudget < 10000) {
      return NextResponse.json({ success: false, error: "Ngân sách tối thiểu ₫10,000/ngày" }, { status: 400 });
    }
    if (dailyBudget > 1_000_000_000) {
      return NextResponse.json({ success: false, error: "Ngân sách tối đa ₫1,000,000,000/ngày" }, { status: 400 });
    }
    const campaignId = parseInt(id, 10);
    if (!campaignId || isNaN(campaignId)) {
      return NextResponse.json({ success: false, error: "campaignId không hợp lệ" }, { status: 400 });
    }

    const customer = getGoogleAdsCustomer(company);

    // Hệ thống tự động khác vừa đổi ngân sách campaign này chưa? Đây là đường có
    // NGƯỜI bấm nên chỉ CẢNH BÁO, không chặn — đúng như mutation-guard đã dặn và
    // đúng cách google/audit/auto-fix đang làm. Chặn cứng ở đây sẽ khiến người ta
    // không sửa được ngân sách trong 12 giờ sau mỗi lần cron chạy.
    const recent = checkRecentCampaignMutation(String(campaignId), company, "human_manual");

    // Budget lives on a separate campaign_budget resource in Google Ads,
    // not directly on the campaign — resolve its real resource_name first.
    // Lấy luôn tên campaign và mức cũ để ghi lưu vết cho đọc được.
    const rows = await customer.query(`
      SELECT campaign_budget.resource_name, campaign_budget.amount_micros, campaign.name
      FROM campaign WHERE campaign.id = ${campaignId}
    `);
    const budgetResourceName = rows[0]?.campaign_budget?.resource_name as string | undefined;
    if (!budgetResourceName) {
      return NextResponse.json({ success: false, error: "Không tìm thấy ngân sách của campaign này" }, { status: 404 });
    }
    const oldMicros = Number(rows[0]?.campaign_budget?.amount_micros ?? 0);
    const oldVnd = Math.round(oldMicros / 1_000_000);
    const campaignName = String(rows[0]?.campaign?.name ?? `Campaign ${campaignId}`);

    await customer.campaignBudgets.update([{
      resource_name: budgetResourceName,
      amount_micros: Math.round(dailyBudget) * 1_000_000,
    }]);

    // Khai báo thay đổi vào kho dùng chung. Trước bản này, MỌI đường tự động
    // (pmax/apply-budget, improvements/apply, budget-optimizer, audit/auto-fix,
    // rule engine) đều khai báo, riêng đường đổi TAY thì không — nên các chốt chặn
    // xung đột đó đều mù với thay đổi của người. Đổi tay lúc 9h, cron chạy lúc 12h
    // không thấy gì và đổi tiếp: thay đổi của người bị ghi đè mà không ai được cảnh
    // báo. Lịch sử quyết định cũng khuyết đúng trường hợp phổ biến nhất.
    recordCampaignMutation({
      source: { type: "human_manual", actor: user.email },
      event: dailyBudget > oldVnd ? "budget.increase" : "budget.decrease",
      company,
      campaignId: String(campaignId),
      campaignName,
      rationale: `Đổi ngân sách thủ công bởi ${user.email}`,
      notes: `₫${oldVnd.toLocaleString("vi-VN")}/ngày → ₫${Math.round(dailyBudget).toLocaleString("vi-VN")}/ngày`,
      platform: "google_ads",
    });

    return NextResponse.json({
      success: true,
      newBudget: dailyBudget,
      previousBudget: oldVnd,
      // Cảnh báo hậu kiểm: đã ghi rồi mới nói, vì đây là quyết định của người —
      // nhưng phải nói, để họ biết mình vừa ghi đè lên thay đổi của hệ thống khác.
      conflictWarning: recent.hasConflict ? recent.note : null,
    });
  } catch (error: unknown) {
    const message = googleAdsErrorMessage(error);
    return NextResponse.json({ success: false, error: friendlyError(message) }, { status: 500 });
  }
}
