import { NextRequest, NextResponse } from "next/server";
import { metaClient, initMetaClient } from "@/lib/meta-client";
import { getCurrentUser } from "@/lib/auth";
import { getCompaniesForRole } from "@/lib/permissions";
import { detectCompany } from "@/lib/company-detect";
import { resolveConversionActionTypes, buildGoalByCampaignMap, sumConversionActions } from "@/lib/meta-conversion-goal";
import type { Campaign } from "@/types/ads.types";
import { friendlyError, isNotConfigured } from "@/lib/not-configured";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const info = await initMetaClient();
    const currency = info.currency;

    const statusFilter = statusParam
      ? [statusParam]
      : ["ACTIVE", "PAUSED", "ARCHIVED"];

    const rawCampaigns = await metaClient.getCampaigns({ status: statusFilter });

    /** true = không lấy được mục tiêu chuyển đổi → cột "Kết quả"/CPL đáng ngờ. */
    let conversionGoalsUnavailable = false;

    const insightsMap = new Map<string, { spend: number; revenue: number; impressions: number; clicks: number; roas: number; conversions: number }>();

    if (from && to) {
      const campaignIds = rawCampaigns.map((c) => c.id);
      // getAdSetsGoalInfo cho biết MỖI campaign đang tối ưu theo sự kiện nào.
      // Nuốt lỗi ở đây rất đắt: bản đồ rỗng thì resolveConversionActionTypes()
      // rơi về mặc định ["omni_purchase","purchase"] cho MỌI campaign — tức
      // campaign chạy lead bị đếm nhầm sự kiện, cột "Kết quả" và CPL sai mà
      // nhìn vẫn hợp lý. Đây đúng là bẫy đếm sai mà lib/meta-conversion-goal.ts
      // sinh ra để xử lý, nên để nó tái phát im lặng là hỏng cả mục đích.
      const [rawInsights, adSetGoals] = await Promise.all([
        metaClient.getCampaignInsights(campaignIds, { from, to }),
        metaClient.getAdSetsGoalInfo().catch((err: unknown) => {
          console.error("[meta/campaigns] getAdSetsGoalInfo failed:", err instanceof Error ? err.message : err);
          conversionGoalsUnavailable = true;
          return [];
        }),
      ]);
      const goalByCampaign = buildGoalByCampaignMap(adSetGoals);

      for (const ins of rawInsights) {
        const spend = parseFloat(ins.spend ?? "0");
        const revenue = (ins.action_values ?? [])
          .filter((a) => a.action_type === "purchase")
          .reduce((s, a) => s + parseFloat(a.value), 0);
        const impressions = parseInt(ins.impressions ?? "0", 10);
        const clicks = parseInt(ins.clicks ?? "0", 10);
        // "Kết quả"/conversions must match what THIS campaign is actually
        // optimizing for (see lib/meta-conversion-goal.ts) — not a blanket
        // "purchase" filter, which was reporting an unrelated event count
        // (and therefore a wrong CPL) for any campaign optimizing for
        // something else, e.g. add_payment_info, lead, complete_registration.
        const actionTypes = resolveConversionActionTypes(goalByCampaign.get(ins.campaign_id));
        // Trước đây cộng cả mảng actionTypes — mà mảng đó là danh sách ƯU
        // TIÊN: omni_purchase là tập cha của purchase nên cùng một lượt mua
        // bị đếm hai lần, làm "Kết quả" gấp đôi và CPL còn một nửa so với
        // Ads Manager. sumConversionActions() lấy đúng một loại.
        const conversions = sumConversionActions(ins.actions, actionTypes);
        const roas = spend > 0 ? revenue / spend : 0;

        insightsMap.set(ins.campaign_id, { spend, revenue, impressions, clicks, roas, conversions });
      }
    }

    // Meta has one shared ad account for both companies — tag each campaign
    // with its company (name-prefix heuristic, same as lib/finance/company-pnl.ts)
    // and drop whatever this role isn't allowed to see. Was previously
    // returned completely unfiltered/untagged to any authenticated user,
    // including viewer_mbc/viewer_mbi.
    const allowedCompanies = getCompaniesForRole(user);

    const campaigns: Campaign[] = rawCampaigns
      .map((c) => {
        const ins = insightsMap.get(c.id);
        const spend = ins?.spend ?? 0;
        const impressions = ins?.impressions ?? 0;
        const clicks = ins?.clicks ?? 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

        return {
          id:          c.id,
          name:        c.name,
          platform:    "facebook",
          status:      c.status === "ACTIVE" ? "ACTIVE" : c.status === "PAUSED" ? "PAUSED" : "ARCHIVED",
          objective:   c.objective ?? "",
          dailyBudget: parseInt(c.daily_budget ?? "0", 10),
          totalBudget: parseInt(c.lifetime_budget ?? "0", 10),
          startDate:   c.start_time?.split("T")[0] ?? "",
          endDate:     c.stop_time ? c.stop_time.split("T")[0] : null,
          company:     detectCompany(c.name),
          metrics: {
            impressions,
            clicks,
            spend,
            ctr,
            cpc,
            cpm,
            roas:        ins?.roas ?? 0,
            conversions: ins?.conversions ?? 0,
            revenue:     ins?.revenue ?? 0,
          },
        } satisfies Campaign;
      })
      .filter((c) => allowedCompanies.includes(c.company as string));

    // Nói ra cho giao diện biết cột "Kết quả"/CPL lần này đáng ngờ, thay vì
    // để người dùng tin một con số sai mà không có dấu hiệu gì.
    return NextResponse.json({
      success: true,
      data: campaigns,
      meta: { currency },
      conversionGoalsUnavailable,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (isNotConfigured(message)) {
      return NextResponse.json({ success: false, data: [] });
    }
    return NextResponse.json(
      { success: false, error: friendlyError(message) },
      { status: 500 }
    );
  }
}
