// ============================================================
// POST /api/google/manual-bid/apply
// ============================================================
// Ghi giá thầu thủ công THẬT lên Google Ads.
//
// Nguyên tắc thiết kế quan trọng nhất: client chỉ được gửi DANH SÁCH TỪ KHOÁ
// muốn áp dụng, KHÔNG được gửi con số giá thầu. Server tự gọi lại Google, tự
// tính lại đề xuất, rồi ghi con số của chính mình. Nếu nhận số từ client thì
// một request sửa tay là đổi được giá thầu thành bất kỳ giá trị nào — mà đây
// là tiền quảng cáo thật, không phải một ô cấu hình.
//
// Body: { company, days?, campaignId, resourceNames: string[], dryRun?: boolean }

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, canAccessCompany } from "@/lib/permissions";
import { getGoogleAdsCustomer } from "@/lib/google-ads-client";
import { fetchManualBidRecommendations, MIN_CPC_VND } from "@/lib/google-manual-bid";
import { checkRecentCampaignMutation, recordCampaignMutation } from "@/lib/mutation-guard";

import { googleAdsErrorMessage } from "@/lib/google-ads-error";
import { pickCompany } from "@/lib/companies"
export const maxDuration = 60;

const MICROS = 1_000_000;

/** Biên đổi tối đa trong MỘT lần áp dụng.
 *
 *  Vì sao cần dù đề xuất đã được tính cẩn thận: giá thầu tụt 70% trong một
 *  nhát thường làm từ khoá rơi khỏi trang đầu và mất sạch dữ liệu để học —
 *  rồi lần sau không còn gì mà tính. Đi từng bước 40% thì vẫn về đích sau
 *  vài lần, mà mỗi bước còn quan sát được hậu quả. Cùng tinh thần với chốt
 *  chống bấm lặp ở Google Audit auto-fix. */
const MAX_CHANGE_RATIO = 0.4;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(user.role, "can_edit")) {
    return NextResponse.json({ success: false, error: "Không có quyền thay đổi giá thầu" }, { status: 403 });
  }

  let body: { company?: string; days?: number; campaignId?: string; resourceNames?: unknown; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body không phải JSON hợp lệ" }, { status: 400 });
  }

  const company = pickCompany(body.company);
  if (!canAccessCompany(user, company)) {
    return NextResponse.json({ success: false, error: `Không có quyền thao tác trên ${company}` }, { status: 403 });
  }

  const campaignId = String(body.campaignId ?? "");
  if (!/^\d+$/.test(campaignId)) {
    return NextResponse.json({ success: false, error: "Thiếu campaignId hợp lệ" }, { status: 400 });
  }

  const wanted = Array.isArray(body.resourceNames)
    ? body.resourceNames.filter((r): r is string => typeof r === "string" && r.startsWith("customers/"))
    : [];
  if (wanted.length === 0) {
    return NextResponse.json({ success: false, error: "Chưa chọn từ khoá nào" }, { status: 400 });
  }

  const dryRun = body.dryRun !== false; // mặc định AN TOÀN: không ghi trừ khi nói rõ

  try {
    // Tính LẠI từ đầu, ngay lúc áp dụng — số liệu và ước tính của Google đổi
    // theo ngày, nên không dùng lại kết quả người dùng đang nhìn trên màn hình.
    const { campaigns } = await fetchManualBidRecommendations(company, body.days ?? 30, campaignId);
    const camp = campaigns.find((c) => c.campaignId === campaignId);
    if (!camp) {
      return NextResponse.json({ success: false, error: "Không tìm thấy chiến dịch, hoặc chiến dịch không có từ khoá nào đang chạy" }, { status: 404 });
    }
    if (!camp.isManualCpc) {
      return NextResponse.json({
        success: false,
        error: `Chiến dịch đang chạy ${camp.biddingStrategy}, không phải Manual CPC — Google sẽ bỏ qua mọi giá thầu đặt tay. Phải đổi chiến lược chiến dịch trong Google Ads trước.`,
      }, { status: 409 });
    }

    const conflict = checkRecentCampaignMutation(campaignId, company, "human_manual");
    const warnings: string[] = [];
    if (conflict.hasConflict && conflict.note) warnings.push(conflict.note);

    const wantedSet = new Set(wanted);
    const ops: { resource_name: string; cpc_bid_micros: number }[] = [];
    const preview: Array<{ keyword: string; from: number; to: number; note: string }> = [];
    const skipped: Array<{ keyword: string; why: string }> = [];

    for (const kw of camp.keywords) {
      if (!wantedSet.has(kw.resourceName)) continue;

      if (kw.recommendedBid === null) {
        skipped.push({ keyword: kw.text, why: kw.verdict === "khong_dat_duoc" ? "không có giá thầu nào vừa đủ rẻ vừa hiện được" : "chưa đủ dữ liệu để tính" });
        continue;
      }
      if (kw.verdict === "giu") {
        skipped.push({ keyword: kw.text, why: "đang nằm trong biên ±15%, không cần đổi" });
        continue;
      }

      let target = kw.recommendedBid;
      let note = "";
      if (kw.currentBid > 0) {
        const maxUp = kw.currentBid * (1 + MAX_CHANGE_RATIO);
        const maxDown = kw.currentBid * (1 - MAX_CHANGE_RATIO);
        if (target > maxUp) { target = maxUp; note = `chặn ở mức tăng tối đa ${MAX_CHANGE_RATIO * 100}%/lần — chạy lại sau vài ngày để đi tiếp`; }
        if (target < maxDown) { target = maxDown; note = `chặn ở mức giảm tối đa ${MAX_CHANGE_RATIO * 100}%/lần — chạy lại sau vài ngày để đi tiếp`; }
      }
      target = Math.max(target, MIN_CPC_VND);
      const micros = Math.round(target * MICROS);

      // Làm tròn xong mà không đổi gì thì đừng gửi lên Google cho tốn lượt gọi.
      if (Math.round(kw.currentBid) === Math.round(target)) {
        skipped.push({ keyword: kw.text, why: "sau khi chặn biên thì bằng đúng giá cũ" });
        continue;
      }

      ops.push({ resource_name: kw.resourceName, cpc_bid_micros: micros });
      preview.push({ keyword: kw.text, from: Math.round(kw.currentBid), to: Math.round(target), note });
    }

    if (ops.length === 0) {
      return NextResponse.json({ success: true, dryRun, applied: 0, preview, skipped, warnings, message: "Không có từ khoá nào cần đổi." });
    }

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, applied: 0, preview, skipped, warnings });
    }

    const customer = getGoogleAdsCustomer(company);
    await customer.adGroupCriteria.update(ops);

    recordCampaignMutation({
      source: { type: "human_manual", actor: user.email ?? user.name ?? "unknown" },
      event: "adset.bid_strategy_change",
      company,
      campaignId,
      campaignName: camp.campaignName,
      rationale: `Đặt lại giá thầu thủ công cho ${ops.length} từ khoá theo trần chi trả (mục tiêu CPA × tỷ lệ chuyển đổi) và ước tính vị trí của Google.`,
      notes: preview.slice(0, 10).map((p) => `${p.keyword}: ${p.from}đ → ${p.to}đ`).join("; "),
      platform: "google_ads",
    });

    return NextResponse.json({ success: true, dryRun: false, applied: ops.length, preview, skipped, warnings });
  } catch (err) {
    const message = googleAdsErrorMessage(err);
    console.error("[google/manual-bid/apply]", message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
