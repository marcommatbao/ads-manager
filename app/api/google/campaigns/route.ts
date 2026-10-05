import { NextRequest, NextResponse } from "next/server";
import { googleAdsClient, convertMicros } from "@/lib/google-client";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCompany, getCompaniesForRole } from "@/lib/permissions";
import type { Campaign } from "@/types/ads.types";
import { GOOGLE_CUSTOMER_IDS } from "@/lib/google-ads-client"
import { friendlyError, isNotConfigured } from "@/lib/not-configured";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const company = searchParams.get("company") as string | null;
    if (company && !canAccessCompany(user, company)) {
      return NextResponse.json({ error: "Access denied for this company" }, { status: 403 });
    }
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // No explicit company → scope to every company the role is allowed to
    // see (never "no filter at all", which used to leak both MBC and MBI
    // campaigns to a plain viewer_mbc/viewer_mbi request).
    const allowedAccountIds = (company ? [company] : getCompaniesForRole(user))
      .map((c) => GOOGLE_CUSTOMER_IDS[c])
      .filter((id): id is string => !!id);

    // getUniqueUsersByCampaign không bao giờ ném lỗi (xem lib/google-client.ts):
    // hỏng thì trả map rỗng kèm lý do, nên đặt chung Promise.all vẫn an toàn —
    // một cột hụt số KHÔNG được phép làm hỏng cả bảng campaign.
    const [allCampaigns, allInsights, uniqueUsers] = await Promise.all([
      googleAdsClient.getCampaigns(),
      from && to ? googleAdsClient.getCampaignInsights({ from, to }) : Promise.resolve([]),
      from && to
        ? googleAdsClient.getUniqueUsersByCampaign({ from, to })
        : Promise.resolve({ byCampaign: new Map<string, number>(), error: "Chưa chọn khoảng thời gian." }),
    ]);

    const filteredCampaigns = allCampaigns.filter((c) => allowedAccountIds.includes(c.accountId));
    const filteredInsights = allInsights.filter((i) => allowedAccountIds.includes(i.accountId));

    const campaigns: Campaign[] = filteredCampaigns.map((c) => {
      const campaignInsights = filteredInsights.filter((i) => i.campaignId === c.id);
      const totalClicks      = campaignInsights.reduce((s, i) => s + i.clicks, 0);
      const totalImpressions = campaignInsights.reduce((s, i) => s + i.impressions, 0);
      const totalCostMicros  = campaignInsights.reduce((s, i) => s + i.costMicros, 0);
      const totalConv        = campaignInsights.reduce((s, i) => s + i.conversions, 0);
      const totalRevenue     = campaignInsights.reduce((s, i) => s + i.conversionsValue, 0);
      const spend            = convertMicros(totalCostMicros);
      const ctr              = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const cpc              = totalClicks > 0 ? spend / totalClicks : 0;
      const cpm              = totalImpressions > 0 ? (spend / totalImpressions) * 1000 : 0;
      const roas             = spend > 0 ? totalRevenue / spend : 0;

      return {
        id:          c.id,
        name:        c.name,
        platform:    "google",
        status:      c.status === "ENABLED" ? "ACTIVE" : c.status === "PAUSED" ? "PAUSED" : "ARCHIVED",
        objective:   c.advertisingChannelType ?? "",
        dailyBudget: convertMicros(c.dailyBudgetMicros),
        totalBudget: 0,
        startDate:   c.startDate ?? "",
        endDate:     c.endDate ?? null,
        company:     company ?? null,
        accountId:   c.accountId,
        accountName: c.accountName,
        metrics: {
          impressions: totalImpressions,
          clicks:      totalClicks,
          spend,
          ctr,
          cpc,
          cpm,
          roas:        Math.round(roas * 100) / 100,
          conversions: totalConv,
          revenue:     totalRevenue,
          // Không có khoá trong map = Google không trả cho chiến dịch này
          // (Search/PMax). Để null chứ không hạ về 0.
          uniqueUsers: uniqueUsers.byCampaign.has(c.id)
            ? uniqueUsers.byCampaign.get(c.id)!
            : null,
        },
      };
    });

    // uniqueUsersError đi kèm để giao diện nói được VÌ SAO cột trống, thay vì
    // để người dùng đoán giữa "không ai xem" và "không lấy được".
    return NextResponse.json({ success: true, data: campaigns, uniqueUsersError: uniqueUsers.error });
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
