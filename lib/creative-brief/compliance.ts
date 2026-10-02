// ============================================================
// Creative Brief — Compliance Checker
// Sequential rules → ComplianceNote[]
// Called last; BLOCK notes = errors; WARN notes = annotations.
// ============================================================

import type { BriefFunnelStage, BriefPlatform, ComplianceNote, CreativeBrief } from "./types";

// Shared regexes — used both by the brief-intent RULES below and by
// runGeneratedCompliance(), which re-checks the same policy risks against
// AI-generated ad copy (the thing that actually gets published) for flows
// that don't go through the full CreativeBrief pipeline.
const SUPERLATIVE_RE      = /tốt nhất|rẻ nhất|số 1|đứng đầu|hàng đầu/;
const UPTIME_OVERCLAIM_RE = /uptime\s*100%|không bao giờ lỗi|downtime 0/i;
const DISCOUNT_NO_PROMO_RE = /giảm\s*\d+%|ưu đãi.*%|tiết kiệm.*%/;
const TOFU_HARD_CTA_RE    = /đăng ký ngay|mua ngay|đặt ngay|order ngay/i;
const FB_COMPETITOR_RE    = /PA Vietnam|Tenten|Nhanhoa|Mắt Bão competitor|FPT/i;

interface Rule {
  id:    string;
  check: (brief: Partial<CreativeBrief>) => ComplianceNote | null;
}

// ── Rules ─────────────────────────────────────────────────────

const RULES: Rule[] = [

  // 1. Superlative ban without proof
  {
    id: "superlative-ban",
    check(brief) {
      const probe = [
        brief.usp ?? "",
        brief.valueProposition ?? "",
        ...(brief.toneStrategy?.avoid ?? []),
      ].join(" ").toLowerCase();
      if (SUPERLATIVE_RE.test(probe)) {
        const hasProof = (brief.proofPoints ?? []).some(p => p.type === "stat" || p.type === "award");
        if (!hasProof) {
          return {
            severity:   "warn",
            rule:       "SUPERLATIVE_WITHOUT_PROOF",
            suggestion: "Tránh 'tốt nhất', 'rẻ nhất', 'số 1' nếu không có dẫn chứng cụ thể (giải thưởng, số liệu thực). Thay bằng lợi ích cụ thể.",
          };
        }
      }
      return null;
    },
  },

  // 2. Uptime guarantee claim for hosting products (MBC)
  {
    id: "uptime-claim",
    check(brief) {
      if (brief.product?.key !== "hosting") return null;
      const allText = [
        brief.usp ?? "",
        ...(brief.proofPoints ?? []).map(p => p.text),
      ].join(" ");
      if (UPTIME_OVERCLAIM_RE.test(allText)) {
        return {
          severity:   "block",
          rule:       "UPTIME_OVERCLAIM",
          suggestion: "Không claim 'uptime 100%' hoặc 'không bao giờ lỗi'. Dùng 'uptime 99.9% theo SLA' và dẫn link SLA.",
        };
      }
      return null;
    },
  },

  // 3. Discount without promo context
  {
    id: "discount-no-promo",
    check(brief) {
      const ctaText = (brief.ctaStrategy?.primaryCta ?? "").toLowerCase();
      const hasPromo = !!brief.promotionContext;
      if (!hasPromo && DISCOUNT_NO_PROMO_RE.test(ctaText)) {
        return {
          severity:   "warn",
          rule:       "DISCOUNT_NO_PROMO",
          suggestion: "CTA đề cập đến giảm giá cụ thể nhưng không có promotionContext. Thêm promo hoặc dùng CTA chung hơn.",
        };
      }
      return null;
    },
  },

  // 4. TOFU + hard conversion CTA mismatch
  {
    id: "tofu-hard-cta",
    check(brief) {
      if (brief.funnelStage !== "top") return null;
      const cta = brief.ctaStrategy?.primaryCta ?? "";
      if (TOFU_HARD_CTA_RE.test(cta)) {
        return {
          severity:   "warn",
          rule:       "TOFU_HARD_CTA",
          suggestion: "CTA 'đăng ký ngay' / 'mua ngay' quá cứng cho TOFU audience chưa warm. Dùng 'Tìm hiểu thêm', 'Khám phá', hoặc 'Xem ngay'.",
        };
      }
      return null;
    },
  },

  // 5. Facebook policy — competitor name in headline
  {
    id: "fb-competitor-name",
    check(brief) {
      if (brief.platform !== "facebook" && brief.platform !== "both") return null;
      const allText = [
        ...(brief.painPoints ?? []).map(p => p.text),
        brief.usp ?? "",
      ].join(" ");
      if (FB_COMPETITOR_RE.test(allText)) {
        return {
          severity:   "warn",
          rule:       "FB_COMPETITOR_MENTION",
          suggestion: "Facebook hạn chế quảng cáo nhắc đến tên đối thủ trực tiếp. Dùng 'nhà cung cấp khác' hoặc so sánh thuộc tính thay vì tên.",
        };
      }
      return null;
    },
  },

  // 6. Empty proof points for BOFU
  {
    id: "bofu-no-proof",
    check(brief) {
      if (brief.funnelStage !== "bottom") return null;
      if ((brief.proofPoints ?? []).length === 0) {
        return {
          severity:   "warn",
          rule:       "LOW_PROOF_BOFU",
          suggestion: "Quảng cáo chốt đơn (BOFU) chạy tốt hơn khi có bằng chứng: số khách hàng, đánh giá, case study. Điền vào ô \"Social proof\" ở Bước 1 (mở phần mở rộng dưới Sản phẩm & Mục tiêu) rồi tạo lại. Đây là CẢNH BÁO, không chặn — vẫn tạo được nếu bạn chấp nhận.",
        };
      }
      return null;
    },
  },

  // 7. Promo on TOFU waste warning
  {
    id: "promo-tofu-waste",
    check(brief) {
      if (brief.funnelStage !== "top") return null;
      if (brief.promotionContext) {
        return {
          severity:   "warn",
          rule:       "PROMO_ON_TOFU",
          suggestion: "Chạy promotion offer cho TOFU (cold audience) thường tốn ngân sách không hiệu quả. Cân nhắc giữ promo cho MOFU/BOFU retargeting.",
        };
      }
      return null;
    },
  },

  // 8. Low budget for conversion objective
  {
    id: "budget-conversion-floor",
    check(brief) {
      if (brief.objective !== "conversion") return null;
      const budget = brief.launchConstraints?.dailyBudgetVnd ?? 0;
      if (budget > 0 && budget < 200_000) {
        return {
          severity:   "warn",
          rule:       "LOW_BUDGET_CONVERSION",
          suggestion: `Ngân sách ${budget.toLocaleString("vi-VN")}₫/ngày có thể quá thấp cho conversion objective. Facebook/Google cần ít nhất 5×CPL/ngày để học tốt. Khuyến nghị: ≥200.000₫/ngày.`,
        };
      }
      return null;
    },
  },
];

export function runCompliance(brief: Partial<CreativeBrief>): ComplianceNote[] {
  return RULES.map(r => r.check(brief)).filter((n): n is ComplianceNote => n !== null);
}

export function getSensitiveTerms(platform: BriefPlatform, funnelStage: BriefFunnelStage): string[] {
  const base = ["đảm bảo hoàn toàn", "chắc chắn 100%", "không rủi ro"];
  const metaExtra = platform !== "google" ? ["số 1 thị trường", "tốt nhất Việt Nam"] : [];
  const bofu = funnelStage === "bottom" ? ["cam kết hoàn tiền (nếu không có policy)"] : [];
  return [...base, ...metaExtra, ...bofu];
}

// ── Generated-copy compliance check ─────────────────────────────
// The RULES above check brief *intent* (before generation) and require a
// full CreativeBrief. The main Creative AI Studio wizard (/creative) never
// builds a CreativeBrief — it calls /api/creative/generate-text directly
// with a handful of loose fields — so those checks never ran on its output.
// This re-applies the same policy risks directly to the generated ad copy,
// which is what actually gets published regardless of which flow made it.

export interface GeneratedComplianceInput {
  headline:     string;
  primaryText:  string;
  description:  string;
  cta:          string;
  platform:     "facebook" | "google";
  funnelStage?: string; // "TOFU" | "MOFU" | "BOFU"
  usp?:         string;
  /** Product key, e.g. "hosting" — inferred from the product display name when unknown */
  productKey?:  string;
  hasProof?:    boolean;
  hasPromo?:    boolean;
}

export function runGeneratedCompliance(input: GeneratedComplianceInput): ComplianceNote[] {
  const notes: ComplianceNote[] = [];
  const allText = `${input.headline} ${input.primaryText} ${input.description} ${input.usp ?? ""}`.toLowerCase();

  // 1. Superlative ban without proof
  if (SUPERLATIVE_RE.test(allText) && !input.hasProof) {
    notes.push({
      severity:   "warn",
      rule:       "SUPERLATIVE_WITHOUT_PROOF",
      suggestion: "Tránh 'tốt nhất', 'rẻ nhất', 'số 1' nếu không có dẫn chứng cụ thể (giải thưởng, số liệu thực). Thay bằng lợi ích cụ thể.",
    });
  }

  // 2. Uptime guarantee overclaim (hosting only) — the only BLOCK-severity rule
  if (input.productKey === "hosting" && UPTIME_OVERCLAIM_RE.test(allText)) {
    notes.push({
      severity:   "block",
      rule:       "UPTIME_OVERCLAIM",
      suggestion: "Không claim 'uptime 100%' hoặc 'không bao giờ lỗi'. Dùng 'uptime 99.9% theo SLA' và dẫn link SLA.",
    });
  }

  // 3. Discount CTA without promo context
  if (!input.hasPromo && DISCOUNT_NO_PROMO_RE.test(input.cta.toLowerCase())) {
    notes.push({
      severity:   "warn",
      rule:       "DISCOUNT_NO_PROMO",
      suggestion: "CTA đề cập đến giảm giá cụ thể nhưng không có promotion context. Thêm offer hoặc dùng CTA chung hơn.",
    });
  }

  // 4. TOFU + hard conversion CTA mismatch
  if (input.funnelStage === "TOFU" && TOFU_HARD_CTA_RE.test(input.cta)) {
    notes.push({
      severity:   "warn",
      rule:       "TOFU_HARD_CTA",
      suggestion: "CTA 'đăng ký ngay' / 'mua ngay' quá cứng cho TOFU audience chưa warm. Dùng 'Tìm hiểu thêm', 'Khám phá', hoặc 'Xem ngay'.",
    });
  }

  // 5. Facebook policy — competitor name mention
  if (input.platform === "facebook" && FB_COMPETITOR_RE.test(allText)) {
    notes.push({
      severity:   "warn",
      rule:       "FB_COMPETITOR_MENTION",
      suggestion: "Facebook hạn chế quảng cáo nhắc đến tên đối thủ trực tiếp. Dùng 'nhà cung cấp khác' hoặc so sánh thuộc tính thay vì tên.",
    });
  }

  // 6. Empty proof points for BOFU
  if (input.funnelStage === "BOFU" && !input.hasProof) {
    notes.push({
      severity:   "warn",
      rule:       "LOW_PROOF_BOFU",
      suggestion: "Quảng cáo chốt đơn (BOFU) chạy tốt hơn khi có bằng chứng: số khách hàng, đánh giá, case study. Điền vào ô \"Social proof\" ở Bước 1 (mở phần mở rộng dưới Sản phẩm & Mục tiêu) rồi tạo lại. Đây là CẢNH BÁO, không chặn — vẫn tạo được nếu bạn chấp nhận.",
    });
  }

  return notes;
}
