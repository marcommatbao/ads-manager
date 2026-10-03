// ============================================================
// POST /api/campaigns/ads-content/compare
// ============================================================
// So sánh 2 creative Facebook theo TOÀN BỘ vòng đời của từng ad, nên hai
// video chạy lệch nhau vài tháng vẫn đối đầu được — khác với danh sách Nội
// dung quảng cáo vốn chỉ cắt theo tháng đang xem.
//
// Body: { adIds: [string, string] }

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCompany } from "@/lib/permissions";
import { detectCompany } from "@/lib/company-detect";
import { fetchAdCompareSnapshots, fetchCampaignCompareSnapshots, buildComparison } from "@/lib/creative-compare";
import { buildNarrative } from "@/lib/creative-compare-narrative";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  let body: { ids?: unknown; adIds?: unknown; level?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body không phải JSON hợp lệ" }, { status: 400 });
  }

  const level = body.level === "campaign" ? "campaign" : "creative";
  // `adIds` giữ lại để bản giao diện cũ đang mở trong trình duyệt không gãy
  // ngay khi deploy — nó chỉ biết gửi khoá này.
  const rawIds = body.ids ?? body.adIds;
  if (!Array.isArray(rawIds) || rawIds.length !== 2 || rawIds.some((id) => typeof id !== "string" || !id.trim())) {
    return NextResponse.json(
      { success: false, error: level === "campaign" ? "Cần đúng 2 campaign ID" : "Cần đúng 2 ad ID" },
      { status: 400 }
    );
  }
  const ids: [string, string] = [rawIds[0] as string, rawIds[1] as string];

  try {
    const [a, b] = level === "campaign"
      ? await fetchCampaignCompareSnapshots(ids)
      : await fetchAdCompareSnapshots(ids);

    // Phân quyền theo công ty phải kiểm SAU khi biết ad thuộc chiến dịch nào —
    // tên chiến dịch là thứ duy nhất suy ra được công ty (lib/company-detect.ts),
    // và client thì không đáng tin để tự khai.
    for (const side of [a, b]) {
      const company = detectCompany(side.campaignName);
      if (!canAccessCompany(user, company)) {
        return NextResponse.json(
          { success: false, error: `Không có quyền xem dữ liệu của ${company}` },
          { status: 403 }
        );
      }
    }

    const data = buildComparison(a, b);
    // Đoạn diễn giải là phần THÊM: Gemini hỏng, chưa cấu hình, hay viết ra số
    // không có trong dữ liệu thì bảng vẫn trả về đầy đủ như thường.
    const narrative = await buildNarrative(data);
    return NextResponse.json({ success: true, data: { ...data, narrative } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ads-content/compare]", message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
