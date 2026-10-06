import { checkPMaxImageCompleteness } from "./google-image-asset";
import { normalizeAdTexts, GOOGLE_PMAX_MAX } from "./creative-limits";
// ============================================================
// Launch Preflight Validation Engine
//
// Runs before any real platform action (Meta campaign create,
// Google Ads mutate) to catch misconfigurations early.
//
// Three-tier output:
//   ready_to_launch   — proceed immediately
//   ready_with_warnings — proceed with user acknowledgement
//   blocked           — hard-stop, cannot launch
// ============================================================

import type { LaunchConfig } from "@/lib/creative-pipeline";
import { checkCreativeLimits, GOOGLE_RSA_LIMITS, GOOGLE_PMAX_LIMITS } from "@/lib/creative-limits";
import { runGeneratedCompliance } from "@/lib/creative-brief/compliance";

// ── Types ─────────────────────────────────────────────────────

export type PreflightSeverity = "error" | "warning" | "info";
export type PreflightStatus   = "ready_to_launch" | "ready_with_warnings" | "blocked";

export interface PreflightCheck {
  field:    string;
  severity: PreflightSeverity;
  code:     string;
  message:  string;
  fix:      string;
  platform: "meta" | "google" | "both";
  company:  string;
}

export interface PreflightResult {
  status:   PreflightStatus;
  checks:   PreflightCheck[];
  errors:   PreflightCheck[];
  warnings: PreflightCheck[];
}

// ── Meta / Facebook preflight ─────────────────────────────────

const MIN_BUDGET_VND      = 100_000;
const WARN_BUDGET_CBO_VND = 200_000;
const WARN_BUDGET_ABO_VND = 150_000;

const GENERIC_NAME_PATTERNS = [
  /^(test|testing|thử|campaign|campaign mới|new campaign|untitled|draft|mới)\s*\d*$/i,
];

const GENERIC_CREATIVE_PATTERNS = [
  /lorem ipsum/i,
  /sample text/i,
  /your headline here/i,
  /tiêu đề mẫu/i,
  /nội dung mẫu/i,
  /placeholder/i,
];

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function runPreflightMeta(config: LaunchConfig, company: string): PreflightResult {
  const checks: PreflightCheck[] = [];

  const add = (
    severity: PreflightSeverity,
    code:     string,
    field:    string,
    message:  string,
    fix:      string,
  ) => checks.push({ field, severity, code, message, fix, platform: "meta", company });

  // ── 1. Campaign name ─────────────────────────────────────────
  const name = config.campaignName?.trim() ?? "";
  if (!name) {
    add("error", "MISSING_CAMPAIGN_NAME", "campaignName",
      "Tên campaign trống",
      "Nhập tên campaign trước khi launch");
  } else if (name.length < 3) {
    add("error", "CAMPAIGN_NAME_TOO_SHORT", "campaignName",
      `Tên campaign quá ngắn (${name.length} ký tự)`,
      "Nhập tên campaign ít nhất 3 ký tự");
  } else if (GENERIC_NAME_PATTERNS.some(p => p.test(name))) {
    add("warning", "GENERIC_CAMPAIGN_NAME", "campaignName",
      `Tên campaign "${name}" có vẻ là placeholder`,
      "Đặt tên mô tả rõ campaign — ví dụ: MBC_Hosting_TOFU_Tháng6");
  }

  // ── 2. Facebook Page ─────────────────────────────────────────
  if (!config.pageId) {
    add("error", "MISSING_PAGE", "pageId",
      "Chưa chọn Facebook Page",
      "Chọn Page trong bước cấu hình campaign");
  }

  // ── 3. Creatives ─────────────────────────────────────────────
  const selected = (config.creatives ?? []).filter(c => c.selected);
  if (selected.length === 0) {
    add("error", "NO_CREATIVES", "creatives",
      "Chưa chọn creative nào",
      "Quay lại Step 3 và chọn ít nhất 1 creative");
  } else {
    const genericCount = selected.filter(c =>
      GENERIC_CREATIVE_PATTERNS.some(p => p.test(c.headline ?? "") || p.test(c.primaryText ?? ""))
    ).length;
    if (genericCount > 0) {
      add("warning", "GENERIC_CREATIVE", "creatives",
        `${genericCount} creative có nội dung giống placeholder (lorem ipsum, mẫu...)`,
        "Chỉnh sửa lại nội dung creative trước khi launch");
    }

    // Low-score creatives (use detailedScore if available, else raw 1-10 score)
    const lowCount = selected.filter(c => {
      if (c.detailedScore) return c.detailedScore.total < 40;
      if (c.score !== undefined) return c.score < 4;
      return false;
    }).length;
    if (lowCount > 0) {
      add("warning", "LOW_SCORE_CREATIVES", "creatives",
        `${lowCount} creative có điểm chất lượng thấp (< 40/100)`,
        "Dùng 'Improve' để cải thiện hoặc bỏ chọn creative yếu trước khi launch");
    }

    // Missing media — an "existing post" ad reuses the live post's own
    // image/video (object_story_id), but a standard creative only ever
    // sends link_data to Meta; without image_hash that's a bare text
    // link card, which Meta frequently rejects or renders broken.
    // launch-campaign/route.ts only sets image_hash "if present" — it
    // never enforced that it *be* present, so this was launchable before.
    const missingMedia = selected.filter(c => !c.isExistingPost && !c.objectStoryId && !c.imageHash);
    if (missingMedia.length > 0) {
      add("error", "MISSING_CREATIVE_MEDIA", "creatives",
        `${missingMedia.length} creative chưa có ảnh (image_hash) — Facebook sẽ từ chối hoặc chạy quảng cáo không có hình ảnh`,
        "Bấm Upload Image cho từng creative, hoặc chọn 'Existing Post' có sẵn media, trước khi launch");
    }

    // Re-check character limits against the actual current text — the AI
    // is only *asked* to respect these limits at generation time, and text
    // may have been hand-edited since. This is the last gate before the
    // real Facebook Ads API call, which truncates/rejects over-limit text.
    const overLimit = selected
      .map(c => ({ creative: c, violations: checkCreativeLimits(c.platform === "google" ? "google" : "facebook", c) }))
      .filter(r => r.violations.length > 0);
    if (overLimit.length > 0) {
      const detail = overLimit
        .slice(0, 3)
        .map(r => `"${r.creative.headline.slice(0, 24)}${r.creative.headline.length > 24 ? "…" : ""}": ${r.violations.map(v => `${v.field} ${v.length}/${v.limit}`).join(", ")}`)
        .join(" | ");
      // CẢNH BÁO, KHÔNG CHẶN — đo trực tiếp trên Meta 25/08/2026 bằng
      // validate_only (app/api/creative/diagnose-text-limits), 4 biến thể:
      //   A. trong hạn 40/125/30        → Meta CHẤP NHẬN  (đối chứng)
      //   B. primaryText 154/125        → Meta CHẤP NHẬN
      //   C. headline 45/40             → Meta CHẤP NHẬN
      //   D. description 33/30          → Meta CHẤP NHẬN
      //
      // Tức 125/40/30 là mức KHUYẾN NGHỊ HIỂN THỊ của Ads Manager, không phải
      // giới hạn API. Chú thích cũ trong lib/creative-limits.ts ("chỉ lộ ra khi
      // Facebook API từ chối lúc launch") là một khẳng định chưa từng được kiểm,
      // và nó khiến preflight CHẶN launch vì một giới hạn không tồn tại — người
      // dùng bị chặn nhiều lần trong ngày 25/08 vì đúng dòng này.
      //
      // Vẫn giữ cảnh báo: vượt mức khuyến nghị thì Facebook cắt chữ kèm "Xem
      // thêm", người lướt không đọc hết. Đó là lý do đáng để viết ngắn lại —
      // nhưng là lựa chọn của người viết, không phải rào chặn của hệ thống.
      //
      // LƯU Ý: giới hạn Google RSA (30/90) thì CỨNG THẬT — Google API từ chối.
      // Chỗ đó nằm ở runPreflightGoogleSearch, không đụng tới.
      add("warning", "CREATIVE_OVER_CHAR_LIMIT", "creatives",
        `${overLimit.length} creative vượt mức khuyến nghị hiển thị của Facebook — ${detail}${overLimit.length > 3 ? " …" : ""}`,
        "Facebook VẪN ĐĂNG được, nhưng phần vượt sẽ bị cắt kèm 'Xem thêm' — người lướt không đọc hết. Bấm 'Improve' nếu muốn gọn lại (khuyến nghị: headline 40, primary 125, description 30)");
    }

    // Re-check compliance against the actual current text — text may have
    // been hand-edited since generation. Only the BLOCK-severity rule
    // (uptime overclaim) hard-stops launch here; WARN-severity notes are
    // surfaced to the user at generation time but never blocked launch,
    // matching buildBrief()'s own behavior.
    const blockedCreatives = selected
      .map(c => ({
        creative: c,
        notes: runGeneratedCompliance({
          headline: c.headline, primaryText: c.primaryText, description: c.description, cta: c.cta,
          platform: c.platform === "google" ? "google" : "facebook",
          funnelStage: c.funnelStage,
          productKey: c.productKey,
        }).filter(n => n.severity === "block"),
      }))
      .filter(r => r.notes.length > 0);
    if (blockedCreatives.length > 0) {
      const detail = blockedCreatives
        .slice(0, 3)
        .map(r => `"${r.creative.headline.slice(0, 24)}${r.creative.headline.length > 24 ? "…" : ""}": ${r.notes.map(n => n.rule).join(", ")}`)
        .join(" | ");
      add("error", "CREATIVE_COMPLIANCE_BLOCK", "creatives",
        `${blockedCreatives.length} creative vi phạm compliance nghiêm trọng — ${detail}${blockedCreatives.length > 3 ? " …" : ""}`,
        "Sửa lại nội dung theo gợi ý compliance (xem badge trên creative) trước khi launch");
    }
  }

  // ── 4. Destination URL ───────────────────────────────────────
  if (!config.destinationUrl?.trim()) {
    add("error", "MISSING_DESTINATION_URL", "destinationUrl",
      "Destination URL trống",
      "Nhập URL trang đích hợp lệ (https://...)");
  } else if (!isValidUrl(config.destinationUrl)) {
    add("error", "INVALID_DESTINATION_URL", "destinationUrl",
      `URL không hợp lệ: ${config.destinationUrl.slice(0, 60)}`,
      "Kiểm tra định dạng URL — phải bắt đầu bằng https://");
  } else if (config.destinationUrl.startsWith("http://")) {
    add("warning", "INSECURE_DESTINATION_URL", "destinationUrl",
      "URL dùng http:// (không có SSL)",
      "Chuyển sang https:// — Facebook ưu tiên trang secure");
  }

  // ── 5. Budget ────────────────────────────────────────────────
  if (config.budgetType === "cbo") {
    const budget = config.dailyBudget ?? 0;
    if (budget < MIN_BUDGET_VND) {
      add("error", "LOW_CBO_BUDGET", "dailyBudget",
        `Budget CBO ₫${budget.toLocaleString("vi-VN")}/ngày thấp hơn mức tối thiểu (₫${MIN_BUDGET_VND.toLocaleString("vi-VN")})`,
        "Tăng budget tối thiểu lên ₫100.000/ngày");
    } else if (budget < WARN_BUDGET_CBO_VND) {
      add("warning", "LOW_CBO_BUDGET_WARN", "dailyBudget",
        `Budget CBO ₫${budget.toLocaleString("vi-VN")}/ngày — khuyến nghị ≥ ₫${WARN_BUDGET_CBO_VND.toLocaleString("vi-VN")} để thoát learning phase nhanh`,
        "Xem xét tăng budget để cải thiện tốc độ learning");
    }
  } else {
    const aboVal = config.adSetDailyBudget ?? (config.adsetBudget ?? 0);
    if (aboVal < MIN_BUDGET_VND) {
      add("error", "LOW_ABO_BUDGET", "adSetDailyBudget",
        `Budget ABO ₫${aboVal.toLocaleString("vi-VN")}/Ad Set thấp hơn tối thiểu`,
        "Tăng budget lên ₫100.000/ngày per Ad Set");
    } else if (aboVal < WARN_BUDGET_ABO_VND) {
      add("warning", "LOW_ABO_BUDGET_WARN", "adSetDailyBudget",
        `Budget ABO ₫${aboVal.toLocaleString("vi-VN")}/Ad Set — khuyến nghị ≥ ₫${WARN_BUDGET_ABO_VND.toLocaleString("vi-VN")}`,
        "Xem xét tăng budget per ad set");
    }
  }

  // ── 6. Bid strategy constraints ──────────────────────────────
  if (
    (config.bidStrategy === "COST_CAP" || config.bidStrategy === "BID_CAP") &&
    !config.bidAmount
  ) {
    add("error", "MISSING_BID_AMOUNT", "bidAmount",
      `Bid strategy ${config.bidStrategy} cần nhập bid amount (₫)`,
      "Nhập cost/bid cap target hoặc đổi sang LOWEST_COST_WITHOUT_CAP");
  }

  // ── 7. Date logic ────────────────────────────────────────────
  if (config.startDate) {
    const start = new Date(config.startDate);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 0);
    if (start < yesterday) {
      add("warning", "START_DATE_PAST", "startDate",
        `Start date ${config.startDate} là ngày trong quá khứ`,
        "Facebook sẽ tự dùng hôm nay — không phải lỗi nghiêm trọng");
    }
  }
  if (!config.continuous && config.endDate && config.startDate) {
    const start = new Date(config.startDate);
    const end   = new Date(config.endDate);
    if (end <= start) {
      add("error", "INVALID_DATE_RANGE", "endDate",
        "End date phải sau Start date",
        "Chọn lại khoảng thời gian hợp lệ");
    }
  }

  // ── 8. Pixel + objective alignment ──────────────────────────
  // OUTCOME_SALES and OUTCOME_LEADS both map to optimization_goal
  // OFFSITE_CONVERSIONS (see OBJECTIVE_MAP in lib/creative-pipeline.ts),
  // which Meta hard-requires a promoted_object (pixel) for — without it,
  // ad-set creation is rejected with a confusingly generic "select an
  // audience for the ad set" error (confirmed live) that has nothing to do
  // with targeting, but triggers the same fallback chain that ends in
  // broad Advantage+ targeting. Previously this check only ran for
  // OUTCOME_SALES, so OUTCOME_LEADS launches with no pixel got no warning
  // at all before hitting that confusing failure.
  if (config.objectiveKey === "OUTCOME_SALES" || config.objectiveKey === "OUTCOME_LEADS") {
    if (!config.pixelId) {
      add("warning", "MISSING_PIXEL_FOR_CONVERSIONS", "pixelId",
        "Chiến dịch Conversion nhưng chưa có Pixel — Meta sẽ từ chối tạo Ad Set (báo lỗi gây hiểu nhầm là do targeting) và tool sẽ tự chuyển sang nhân khẩu học rộng (Advantage+, bỏ qua targeting đã chọn)",
        "Thêm Pixel ID trong cài đặt hoặc đổi objective sang Traffic");
    } else if (!config.pixelEvent && config.objectiveKey === "OUTCOME_SALES") {
      add("warning", "MISSING_PIXEL_EVENT", "pixelEvent",
        "Có Pixel nhưng chưa chọn Pixel Event",
        "Chọn pixel event (Purchase, Lead, CompleteRegistration...)");
    }
  }

  // ── 9. Audience segments ────────────────────────────────────
  if (!config.segments || config.segments.length === 0) {
    add("error", "NO_SEGMENTS", "segments",
      "Chưa có Audience Segment nào được chọn",
      "Quay lại Step 2 và tạo/chọn segment");
  } else {
    const emptyInterestSegs = config.segments.filter(s =>
      !s.winningAudienceId && // Đợt 26c: tệp thắng mang sẵn nhắm chọn đã lưu
      (!s.interests        || s.interests.length === 0) &&
      (!s.behaviors        || s.behaviors.length === 0) &&
      (!s.customAudienceIds || s.customAudienceIds.length === 0) &&
      (!s.resolvedInterestIds || s.resolvedInterestIds.length === 0)
    );
    if (emptyInterestSegs.length > 0 && !config.useAdvantageAudience) {
      add("warning", "EMPTY_INTEREST_SEGMENTS", "segments",
        `${emptyInterestSegs.length} segment không có interests/behaviors — sẽ chạy với nhân khẩu học thuần (có thể rất rộng và tốn budget)`,
        "Thêm interests cho segment hoặc bật Advantage+ Audience để Facebook tự tối ưu targeting");
    }
  }

  // ── Derive final status ──────────────────────────────────────
  const errors   = checks.filter(c => c.severity === "error");
  const warnings = checks.filter(c => c.severity === "warning");
  const status: PreflightStatus =
    errors.length   > 0 ? "blocked" :
    warnings.length > 0 ? "ready_with_warnings" : "ready_to_launch";

  return { status, checks, errors, warnings };
}

// ── Google Search preflight ───────────────────────────────────

export interface GoogleSearchPreflightInput {
  company?:         string;
  googleCreativeId?: string;
  dailyBudgetVnd?:  number;
  campaignName?:    string;
  rsa?: {
    headlines?:    Array<{ text: string; isValid?: boolean }>;
    descriptions?: Array<{ text: string; isValid?: boolean }>;
  };
  keywords?: {
    keywords?: Array<{ keyword: string }>;
  };
}

export function runPreflightGoogleSearch(payload: GoogleSearchPreflightInput): PreflightResult {
  const checks: PreflightCheck[] = [];
  const company = payload.company ?? "MBC";

  const add = (
    severity: PreflightSeverity, code: string, field: string, message: string, fix: string,
  ) => checks.push({ field, severity, code, message, fix, platform: "google", company });

  if (!payload.googleCreativeId) {
    add("error", "MISSING_CREATIVE_ID", "googleCreativeId",
      "Chưa chọn Google Creative", "Chọn creative từ danh sách Google");
  }

  const name = payload.campaignName?.trim() ?? "";
  if (!name) {
    add("error", "MISSING_CAMPAIGN_NAME", "campaignName",
      "Tên campaign trống", "Nhập tên campaign Search");
  }

  const budget = payload.dailyBudgetVnd ?? 0;
  if (budget < MIN_BUDGET_VND) {
    add("error", "LOW_BUDGET", "dailyBudgetVnd",
      `Budget ₫${budget.toLocaleString("vi-VN")}/ngày thấp hơn mức tối thiểu Google Ads`,
      "Tăng budget lên ₫100.000/ngày");
  } else if (budget < WARN_BUDGET_CBO_VND) {
    add("warning", "LOW_BUDGET_WARN", "dailyBudgetVnd",
      `Budget ₫${budget.toLocaleString("vi-VN")}/ngày — Google Search cần ≥ ₫${WARN_BUDGET_CBO_VND.toLocaleString("vi-VN")} để đủ impressions`,
      "Xem xét tăng budget để có dữ liệu tối ưu");
  }

  if (payload.rsa) {
    // Recompute from actual text length rather than trusting the caller's
    // self-reported isValid — that flag comes from Gemini's own char count,
    // which is never verified (see lib/creative-limits.ts).
    const validHeadlines    = (payload.rsa.headlines    ?? []).filter(h => (h.text?.length ?? 0) <= GOOGLE_RSA_LIMITS.headline);
    const validDescriptions = (payload.rsa.descriptions ?? []).filter(d => (d.text?.length ?? 0) <= GOOGLE_RSA_LIMITS.description);

    if (validHeadlines.length < 3) {
      add("error", "RSA_INSUFFICIENT_HEADLINES", "rsa.headlines",
        `RSA cần ≥ 3 headlines hợp lệ, hiện có ${validHeadlines.length}`,
        "Thêm headlines trong Google Creative Generator");
    } else if (validHeadlines.length < 10) {
      add("warning", "RSA_FEW_HEADLINES", "rsa.headlines",
        `RSA có ${validHeadlines.length} headlines — khuyến nghị 10-15 để Google rotation tốt nhất`,
        "Thêm more headlines để A/B testing hiệu quả hơn");
    }

    if (validDescriptions.length < 2) {
      add("error", "RSA_INSUFFICIENT_DESCRIPTIONS", "rsa.descriptions",
        `RSA cần ≥ 2 descriptions hợp lệ, hiện có ${validDescriptions.length}`,
        "Thêm descriptions trong Google Creative Generator");
    }
  }

  if (payload.keywords) {
    const kwCount = (payload.keywords.keywords ?? []).length;
    if (kwCount === 0) {
      add("error", "NO_KEYWORDS", "keywords.keywords",
        "Chưa có từ khóa nào", "Thêm keywords trong Google Creative Generator");
    }
  }

  const errors   = checks.filter(c => c.severity === "error");
  const warnings = checks.filter(c => c.severity === "warning");
  const status: PreflightStatus =
    errors.length   > 0 ? "blocked" :
    warnings.length > 0 ? "ready_with_warnings" : "ready_to_launch";

  return { status, checks, errors, warnings };
}

// ── Google PMax preflight ─────────────────────────────────────

const WARN_PMAX_BUDGET_VND = 300_000;

export interface GooglePMaxPreflightInput {
  company?:         string;
  googleCreativeId?: string;
  dailyBudgetVnd?:  number;
  campaignName?:    string;
  pmax?: {
    headlines?:      string[];
    longHeadlines?:  string[];
    descriptions?:   string[];
    businessName?:   string;
  };
  /** fieldType của các ảnh sẽ gắn vào nhóm tài sản (MARKETING_IMAGE,
   *  SQUARE_MARKETING_IMAGE, LOGO…). Thiếu ảnh bắt buộc thì campaign tạo
   *  xong Google KHÔNG chạy. */
  imageFieldTypes?: string[];
}

export function runPreflightGooglePMax(payload: GooglePMaxPreflightInput): PreflightResult {
  const checks: PreflightCheck[] = [];
  const company = payload.company ?? "MBC";

  const add = (
    severity: PreflightSeverity, code: string, field: string, message: string, fix: string,
  ) => checks.push({ field, severity, code, message, fix, platform: "google", company });

  if (!payload.googleCreativeId) {
    add("error", "MISSING_CREATIVE_ID", "googleCreativeId",
      "Chưa chọn Google Creative", "Chọn creative từ danh sách Google");
  }

  const name = payload.campaignName?.trim() ?? "";
  if (!name) {
    add("error", "MISSING_CAMPAIGN_NAME", "campaignName",
      "Tên campaign PMax trống", "Nhập tên campaign");
  }

  const budget = payload.dailyBudgetVnd ?? 0;
  if (budget < MIN_BUDGET_VND) {
    add("error", "LOW_PMAX_BUDGET", "dailyBudgetVnd",
      `Budget ₫${budget.toLocaleString("vi-VN")}/ngày quá thấp cho PMax`,
      "Tăng budget tối thiểu lên ₫100.000/ngày");
  } else if (budget < WARN_PMAX_BUDGET_VND) {
    add("warning", "LOW_PMAX_BUDGET_WARN", "dailyBudgetVnd",
      `Budget ₫${budget.toLocaleString("vi-VN")}/ngày — Google khuyến nghị ≥ ₫${WARN_PMAX_BUDGET_VND.toLocaleString("vi-VN")} để PMax thoát learning phase`,
      "Tăng budget hoặc chấp nhận learning phase sẽ kéo dài 2-4 tuần");
  }

  if (payload.pmax) {
    // Qua normalizeAdTexts vì dữ liệu lưu là mảng OBJECT {text,...}, không phải
    // mảng chuỗi. Bản cũ đọc `.length` của từng phần tử nên với object luôn ra
    // undefined → lọc sạch → chặn mọi lần launch với thông báo "hiện có 0".
    const nH  = normalizeAdTexts(payload.pmax.headlines,     GOOGLE_PMAX_LIMITS.headline,     GOOGLE_PMAX_MAX.headline);
    const nLH = normalizeAdTexts(payload.pmax.longHeadlines, GOOGLE_PMAX_LIMITS.longHeadline, GOOGLE_PMAX_MAX.longHeadline);
    const nD  = normalizeAdTexts(payload.pmax.descriptions,  GOOGLE_PMAX_LIMITS.description,  GOOGLE_PMAX_MAX.description);
    const headlines = nH.kept.length, longHeadlines = nLH.kept.length, descriptions = nD.kept.length;

    // Dòng vượt ký tự sẽ bị BỎ khi gửi lên Google. Trước đây chuyện đó xảy ra
    // lặng lẽ — người dùng thấy 5 mô tả trên màn hình, Google nhận 4.
    for (const [field, n] of [["headlines", nH], ["longHeadlines", nLH], ["descriptions", nD]] as const) {
      for (const t of n.tooLong) {
        add("warning", "PMAX_TEXT_TOO_LONG", `pmax.${field}`,
          `Vượt ${t.length - t.limit} ký tự (${t.length}/${t.limit}) nên sẽ KHÔNG được gửi lên Google: "${t.text.slice(0, 60)}${t.text.length > 60 ? "…" : ""}"`,
          "Sửa ngắn lại trong danh sách nội dung, hoặc chấp nhận mất dòng này");
      }
    }

    if (headlines < 3) {
      add("error", "PMAX_INSUFFICIENT_HEADLINES", "pmax.headlines",
        `PMax cần ≥ 3 short headlines, hiện có ${headlines}`,
        "Thêm headlines trong PMax Creative Generator");
    } else if (headlines < 5) {
      add("warning", "PMAX_FEW_HEADLINES", "pmax.headlines",
        `PMax có ${headlines} headlines — tối đa 5 cho coverage tốt nhất`,
        "Thêm more short headlines");
    }
    if (descriptions < 2) {
      add("error", "PMAX_INSUFFICIENT_DESCRIPTIONS", "pmax.descriptions",
        `PMax cần ≥ 2 descriptions, hiện có ${descriptions}`,
        "Thêm descriptions trong PMax Creative Generator");
    }
    if (longHeadlines < 1) {
      add("warning", "PMAX_NO_LONG_HEADLINE", "pmax.longHeadlines",
        "Chưa có Long Headline — PMax sẽ bỏ qua Display/YouTube placements",
        "Thêm ít nhất 1 long headline để reach được Display Network");
    }
    if (!payload.pmax.businessName) {
      add("warning", "PMAX_NO_BUSINESS_NAME", "pmax.businessName",
        "Chưa có Business Name — sẽ dùng tên công ty mặc định",
        "Thêm business name cụ thể nếu campaign dùng sub-brand hoặc tên campaign");
    }
  }

  // Ảnh: PMax thiếu logo / ảnh ngang / ảnh vuông thì Google KHÔNG phân phối.
  // Trước đây preflight bỏ qua hoàn toàn phần ảnh, nên người dùng tạo xong một
  // campaign hợp lệ về mặt kỹ thuật mà không bao giờ chạy — và chỉ biết điều
  // đó SAU KHI đã tạo, qua cờ `serviceable` trong phản hồi. Chặn trước rẻ hơn
  // giải thích sau.
  const imgCheck = checkPMaxImageCompleteness(payload.imageFieldTypes ?? []);
  if (!imgCheck.ok) {
    add("error", "PMAX_MISSING_REQUIRED_IMAGES", "imageAssets",
      `PMax thiếu ${imgCheck.missing.length} loại ảnh bắt buộc: ${imgCheck.missing.map(m => m.label).join(", ")}. Campaign sẽ được tạo nhưng Google KHÔNG phân phối.`,
      `Tải lên: ${imgCheck.missing.map(m => `${m.label} (${m.recommended})`).join(" · ")}`);
  }

  const errors   = checks.filter(c => c.severity === "error");
  const warnings = checks.filter(c => c.severity === "warning");
  const status: PreflightStatus =
    errors.length   > 0 ? "blocked" :
    warnings.length > 0 ? "ready_with_warnings" : "ready_to_launch";

  return { status, checks, errors, warnings };
}

// ── Shared helper: format for API response log ────────────────

export function preflightToLog(result: PreflightResult): string[] {
  const lines: string[] = [];
  if (result.status === "blocked") {
    lines.push(`🚫 Preflight BLOCKED — ${result.errors.length} lỗi cần sửa trước khi launch`);
  } else if (result.status === "ready_with_warnings") {
    lines.push(`⚠️ Preflight WARNING — ${result.warnings.length} cảnh báo cần xem xét`);
  } else {
    lines.push("✅ Preflight OK — sẵn sàng launch");
  }
  for (const c of result.errors)   lines.push(`❌ [${c.code}] ${c.field}: ${c.message} → ${c.fix}`);
  for (const c of result.warnings) lines.push(`⚠️ [${c.code}] ${c.field}: ${c.message}`);
  return lines;
}
