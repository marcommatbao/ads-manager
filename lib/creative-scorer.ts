// ============================================================
// Creative Scorer — Score creatives before launch
// Evaluates hook strength, clarity, social proof, offer,
// CTA effectiveness, and visual presence
// Returns 0-100 total score with per-dimension breakdown
// ============================================================

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CreativeScoreBreakdown {
  hook: number;        // max 20
  clarity: number;     // max 20
  socialProof: number; // max 15
  offer: number;       // max 15
  cta: number;         // max 15
  imageText: number;   // max 15
}

export interface CreativeScore {
  total: number;
  scores: CreativeScoreBreakdown;
  suggestions: string[];
  ctrEstimate: string;
  grade: "A" | "B" | "C" | "D";
}

export interface CreativeInput {
  headline: string;
  primaryText: string;
  description: string;
  hasImage: boolean;
  usp: string;
  socialProof: string;
  offer: string;
  cta?: string;
}

// ─────────────────────────────────────────────
// Score Dimension Configs (for UI display)
// ─────────────────────────────────────────────

export const SCORE_DIMENSIONS: Array<{
  key: keyof CreativeScoreBreakdown;
  label: string;
  max: number;
  color: string;
}> = [
  { key: "hook",        label: "Hook mạnh",     max: 20, color: "bg-violet-500" },
  { key: "clarity",     label: "Rõ ràng",       max: 20, color: "bg-blue-500" },
  { key: "socialProof", label: "Social Proof",  max: 15, color: "bg-emerald-500" },
  { key: "offer",       label: "Offer",         max: 15, color: "bg-amber-500" },
  { key: "cta",         label: "CTA",           max: 15, color: "bg-rose-500" },
  { key: "imageText",   label: "Hình ảnh",      max: 15, color: "bg-cyan-500" },
];

// ─────────────────────────────────────────────
// Main Scoring Function
// ─────────────────────────────────────────────

export function scoreCreative(creative: CreativeInput): CreativeScore {
  const scores: CreativeScoreBreakdown = {
    hook: 0,
    clarity: 0,
    socialProof: 0,
    offer: 0,
    cta: 0,
    imageText: 0,
  };

  // ── Hook mạnh không? (max 20đ) ──
  const hookPatterns: Array<{ pattern: RegExp; points: number }> = [
    { pattern: /^\d+/, points: 5 },                                    // Bắt đầu bằng số
    { pattern: /\?$/, points: 5 },                                     // Câu hỏi
    { pattern: /đừng|cảnh báo|sai lầm|bí quyết|bí mật|hé lộ/i, points: 5 },  // Trigger words
    { pattern: /miễn phí|free|tặng|0đ|0₫/i, points: 5 },             // Free offer
  ];
  for (const { pattern, points } of hookPatterns) {
    if (pattern.test(creative.headline) || pattern.test(creative.primaryText.slice(0, 80))) {
      scores.hook += points;
    }
  }
  scores.hook = Math.min(scores.hook, 20);

  // ── Rõ ràng không? (max 20đ) ──
  if (creative.headline.length > 0 && creative.headline.length <= 40) {
    scores.clarity += 10;
  } else if (creative.headline.length > 0 && creative.headline.length <= 60) {
    scores.clarity += 5;
  }

  if (creative.description.length > 0 && creative.description.length <= 30) {
    scores.clarity += 10;
  } else if (creative.description.length > 0 && creative.description.length <= 50) {
    scores.clarity += 5;
  }

  // ── Có social proof? (max 15đ) ──
  if (creative.socialProof && creative.socialProof.trim().length > 0) {
    scores.socialProof += 8;
    if (/\d+/.test(creative.socialProof)) {
      // Có số liệu cụ thể → thuyết phục hơn
      scores.socialProof += 7;
    }
  }

  // ── Có offer hấp dẫn? (max 15đ) ──
  if (creative.offer && creative.offer.trim().length > 0) {
    scores.offer += 8;
    if (/%|giảm|miễn phí|tặng|free|\d+/i.test(creative.offer)) {
      scores.offer += 7;
    }
  }

  // ── CTA rõ không? (max 15đ) ──
  const allText = `${creative.primaryText} ${creative.headline} ${creative.cta || ""}`.toLowerCase();
  const ctaPatterns = [
    { words: ["ngay", "liên hệ ngay", "đăng ký ngay", "mua ngay"], points: 8 },
    { words: ["đăng ký", "mua", "nhận", "xem", "tải", "trải nghiệm", "khám phá"], points: 7 },
  ];
  for (const { words, points } of ctaPatterns) {
    if (words.some(w => allText.includes(w))) {
      scores.cta += points;
    }
  }
  scores.cta = Math.min(scores.cta, 15);

  // ── Có ảnh? (max 15đ) ──
  if (creative.hasImage) {
    scores.imageText = 15;
  }

  // ── Total ──
  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  // ── Gợi ý cải thiện — contextual, non-repetitive ──
  const suggestions: string[] = [];

  if (scores.hook < 10) {
    const headlineHasNumber = /\d/.test(creative.headline);
    const headlineHasQuestion = /\?/.test(creative.headline);
    if (!headlineHasNumber && !headlineHasQuestion) {
      suggestions.push("💡 Mở đầu bằng con số cụ thể hoặc câu hỏi gây tò mò để tăng CTR ngay từ dòng đầu");
    } else if (!headlineHasNumber) {
      suggestions.push("💡 Thêm số liệu thực tế (tỉ lệ %, thời gian, giá trị) để headline đáng tin và hấp dẫn hơn");
    } else {
      suggestions.push("💡 Thêm trigger word (\"Bí quyết\", \"Cảnh báo\", \"Sai lầm\") để kéo sự chú ý tốt hơn");
    }
  }

  if (scores.clarity < 10) {
    if (creative.headline.length > 60) {
      suggestions.push("💡 Headline đang quá dài — cắt xuống ≤ 40 ký tự, giữ lại ý mạnh nhất");
    } else if (creative.description.length > 50) {
      suggestions.push("💡 Description nên ≤ 30 ký tự — một cụm từ chốt lợi ích là đủ");
    } else {
      suggestions.push("💡 Tách headline và description rõ ràng hơn: headline = hook, description = benefit cụ thể");
    }
  }

  if (scores.socialProof < 8) {
    const spOptions = [
      "Thêm bằng chứng xã hội: số lượng khách hàng, năm hoạt động, hoặc giải thưởng đã đạt được",
      "Thêm quote/review thực từ khách hàng vào primary text để tăng độ tin cậy",
      "Dẫn chứng tỉ lệ thành công hoặc kết quả cụ thể (VD: \"95% khách hàng gia hạn\")",
      "Thêm tên thương hiệu uy tín đã dùng dịch vụ để xây dựng trust nhanh hơn",
    ];
    suggestions.push("💡 " + spOptions[Math.floor((total + creative.headline.length) % spOptions.length)]);
  }

  if (scores.offer === 0) {
    const offerOptions = [
      "Thêm offer rõ ràng: giảm X%, tặng kèm Y miễn phí, hoặc dùng thử Z ngày không mất phí",
      "Thêm ưu đãi có thời hạn (\"Chỉ còn hôm nay\", \"Ưu đãi tháng này\") để tạo urgency",
      "Tạo offer bundle: mua A tặng B — khách hàng cảm thấy được lời hơn giảm giá thẳng",
    ];
    suggestions.push("💡 " + offerOptions[Math.floor(creative.headline.length % offerOptions.length)]);
  }

  if (scores.cta < 8) {
    const ctaOptions = [
      "\"Nhận tư vấn miễn phí\"",
      "\"Đăng ký ngay hôm nay\"",
      "\"Xem chi tiết ngay\"",
      "\"Nhận ưu đãi ngay\"",
      "\"Bắt đầu miễn phí\"",
    ];
    const ctaPick = ctaOptions[Math.floor((total + creative.primaryText.length) % ctaOptions.length)];
    suggestions.push(`💡 Thêm CTA hành động rõ ràng — gợi ý: ${ctaPick}`);
  }

  if (!creative.hasImage) {
    suggestions.push("💡 Thêm ảnh/video — quảng cáo có visual đạt CTR cao hơn 2-3× so với chỉ có text");
  }

  // ── CTR estimate ──
  const ctrEstimate =
    total >= 80 ? "2.5-3.5%" :
    total >= 60 ? "1.8-2.5%" :
    total >= 40 ? "1.0-1.8%" : "0.5-1.0%";

  // ── Grade ──
  const grade: CreativeScore["grade"] =
    total >= 80 ? "A" :
    total >= 60 ? "B" :
    total >= 40 ? "C" : "D";

  return { total, scores, suggestions, ctrEstimate, grade };
}

// ─────────────────────────────────────────────
// Score Color Helpers (for UI)
// ─────────────────────────────────────────────

export function getScoreColor(total: number): {
  bg: string; text: string; border: string; gradient: string;
} {
  if (total >= 80) return {
    bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-300",
    gradient: "from-emerald-500 to-emerald-600",
  };
  if (total >= 60) return {
    bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-300",
    gradient: "from-blue-500 to-blue-600",
  };
  if (total >= 40) return {
    bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-300",
    gradient: "from-amber-500 to-amber-600",
  };
  return {
    bg: "bg-red-50", text: "text-red-700", border: "border-red-300",
    gradient: "from-red-500 to-red-600",
  };
}

export function getGradeEmoji(grade: CreativeScore["grade"]): string {
  return grade === "A" ? "🏆" : grade === "B" ? "👍" : grade === "C" ? "⚠️" : "❌";
}
