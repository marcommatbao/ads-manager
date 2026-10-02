// PATCH /api/meta/campaigns/[id]/budget
// This route never existed at all — components/EditBudgetModal.tsx's
// "Save" button has always PATCHed this exact URL for every campaign
// (Meta or Google), so every budget edit 404'd silently before this.
import { resolveMetaNodeOwner } from "@/lib/meta-campaign-company";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, canAccessCompany } from "@/lib/permissions";
import { detectCompany } from "@/lib/company-detect";
import { checkRecentCampaignMutation, recordCampaignMutation } from "@/lib/mutation-guard";
import { META_GRAPH_BASE } from "@/lib/meta/graph-version";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user.role, "can_manage_budget")) {
    return NextResponse.json({ success: false, error: "Không có quyền chỉnh ngân sách" }, { status: 403 });
  }

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ success: false, error: "META_ACCESS_TOKEN not configured" }, { status: 500 });

  try {
    const { id } = await params;
    const { dailyBudget } = await request.json() as { dailyBudget?: number };

    if (!dailyBudget || dailyBudget < 10000) {
      return NextResponse.json({ success: false, error: "Ngân sách tối thiểu ₫10,000/ngày" }, { status: 400 });
    }
    if (dailyBudget > 1_000_000_000) {
      return NextResponse.json({ success: false, error: "Ngân sách tối đa ₫1,000,000,000/ngày" }, { status: 400 });
    }

    // Meta has ONE shared ad account for both companies (unlike Google,
    // which has a separate customer account per company) — the only way to
    // know which company a campaign belongs to is its name prefix (see
    // lib/company-detect.ts). Derive it server-side from Meta itself,
    // never trust a client-supplied company value, before allowing the
    // mutation — was previously missing entirely (an admin_mbc could edit
    // any MBI campaign's budget and vice versa).
    // Đọc luôn daily_budget hiện tại để ghi lưu vết cho đọc được (trước → sau).
    // Audit 30/09: công ty lấy từ CHIẾN DỊCH CHA — tên nhóm quảng cáo không mang tiền tố công ty.
    let owner;
    try { owner = await resolveMetaNodeOwner(id, token, { withBudget: true }); }
    catch (e) { return NextResponse.json({ success: false, error: `Không xác minh được công ty: ${e instanceof Error ? e.message : String(e)}` }, { status: 403 }); }
    const nameData = { name: owner.name, daily_budget: owner.dailyBudget };
    const campaignCompany = detectCompany(owner.campaignName);
    if (!canAccessCompany(user.role, campaignCompany)) {
      return NextResponse.json({ success: false, error: "Access denied for this company" }, { status: 403 });
    }
    const campaignName = nameData.name ?? `Campaign ${id}`;
    const oldVnd = parseFloat(nameData.daily_budget ?? "0") || 0;

    // Đường có NGƯỜI bấm nên chỉ cảnh báo, không chặn (đúng cách auto-fix đang làm).
    const recent = checkRecentCampaignMutation(id, campaignCompany, "human_manual");

    const url = new URL(`${META_GRAPH_BASE}/${id}`);
    url.searchParams.set("access_token", token);
    // VND is a zero-decimal currency — Meta expects the amount directly,
    // no ×100 conversion (same fix already applied for campaign creation
    // in app/api/creative/launch-campaign/route.ts).
    url.searchParams.set("daily_budget", String(Math.round(dailyBudget)));

    const res = await fetch(url.toString(), { method: "POST" });
    const data = await res.json() as { success?: boolean; error?: { message: string } };

    if (!res.ok || data.error) {
      // A campaign without Campaign Budget Optimization (budget set at
      // the ad-set level instead) will correctly reject this with a real
      // Meta error — surfaced as-is rather than guessed at.
      throw new Error(data.error?.message ?? `Meta API error ${res.status}`);
    }

    // Khai báo vào kho dùng chung. Nhánh Facebook của rule engine nay ĐỌC kho này
    // trước khi tự đổi ngân sách (AUTOMATION-META-GUARDS-1) — không khai báo thì
    // engine mù với thay đổi của người và có thể đè lên trong lượt cron kế tiếp.
    recordCampaignMutation({
      source: { type: "human_manual", actor: user.email },
      event: dailyBudget > oldVnd ? "budget.increase" : "budget.decrease",
      company: campaignCompany,
      campaignId: id,
      campaignName,
      rationale: `Đổi ngân sách Facebook thủ công bởi ${user.email}`,
      notes: `₫${oldVnd.toLocaleString("vi-VN")}/ngày → ₫${Math.round(dailyBudget).toLocaleString("vi-VN")}/ngày`,
      platform: "meta",
    });

    return NextResponse.json({
      success: true,
      newBudget: dailyBudget,
      previousBudget: oldVnd,
      conflictWarning: recent.hasConflict ? recent.note : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
