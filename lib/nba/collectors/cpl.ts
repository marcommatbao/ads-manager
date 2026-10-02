// ============================================================
// NBA collector — CPL
// Nguồn: lib/cpl-calculator (ngưỡng riêng MBC/MBI).
// Emit: CPL_CRITICAL / CPL_WARNING / ZERO_CONV_SPEND.
// ============================================================

import type { Campaign } from "@/types/ads.types";
import { classifyCPL } from "@/lib/cpl-calculator";
import type { NbaSignal, NbaContext } from "../types";
import { detectCompany, platformOf, isActive } from "./helpers";

const ZERO_CONV_SPEND_FLOOR = 50_000; // ₫ — tiêu > mức này mà 0 conv = đáng báo

export function cplCollector(campaigns: Campaign[], ctx: NbaContext): NbaSignal[] {
  const allowed = new Set(ctx.companies);
  const out: NbaSignal[] = [];

  for (const c of campaigns) {
    if (!isActive(c)) continue;
    const company = detectCompany(c);
    if (!company || !allowed.has(company)) continue;

    const spend = c.metrics.spend ?? 0;
    const conv = c.metrics.conversions ?? 0;
    const platform = platformOf(c);

    // ── Tiêu tiền không chuyển đổi ──
    if (conv === 0 && spend > ZERO_CONV_SPEND_FLOOR) {
      out.push({
        reasonCode: "ZERO_CONV_SPEND",
        company, platform,
        entityType: "campaign",
        entityId: c.id,
        entityName: c.name,
        title: `"${c.name}" tiêu ₫${Math.round(spend).toLocaleString("vi-VN")} nhưng 0 chuyển đổi`,
        explanation: `Campaign đang chi tiêu mà chưa ghi nhận conversion nào trong kỳ. Cân nhắc tạm dừng hoặc rà soát tracking/targeting.`,
        evidence: [
          { metric: "spend", current: Math.round(spend), unit: "₫" },
          { metric: "conversions", current: 0, unit: "" },
        ],
        severity: "critical",
        sampleSize: c.metrics.clicks ?? 0,
        impactEstimate: { metric: "spend", direction: "reduce_waste", estMonthlySavingsVnd: Math.round(spend) },
        suggestedAction: { type: "PAUSE_CAMPAIGN" },
        sourceEngine: "cpl-calculator",
        _guardCampaign: c,
      });
      continue;
    }

    if (conv <= 0) continue;
    const cpl = spend / conv;
    const level = classifyCPL(cpl, company).level;

    if (level === "critical") {
      out.push({
        reasonCode: "CPL_CRITICAL",
        company, platform,
        entityType: "campaign",
        entityId: c.id,
        entityName: c.name,
        title: `CPL "${c.name}" = ₫${Math.round(cpl).toLocaleString("vi-VN")} (đỏ)`,
        explanation: `CPL vượt ngưỡng đỏ của ${company}. Rà soát targeting/creative hoặc giảm bid; nếu xấu kéo dài cân nhắc tạm dừng.`,
        evidence: [
          { metric: "CPL", current: Math.round(cpl), unit: "₫" },
          { metric: "conversions", current: conv, unit: "" },
          { metric: "spend", current: Math.round(spend), unit: "₫" },
        ],
        severity: "critical",
        sampleSize: conv,
        impactEstimate: { metric: "CPL", direction: "save", estMonthlySavingsVnd: Math.round(spend * 0.2) },
        suggestedAction: { type: "REVIEW_OR_PAUSE" },
        sourceEngine: "cpl-calculator",
        _guardCampaign: c,
      });
    } else if (level === "warning") {
      out.push({
        reasonCode: "CPL_WARNING",
        company, platform,
        entityType: "campaign",
        entityId: c.id,
        entityName: c.name,
        title: `CPL "${c.name}" = ₫${Math.round(cpl).toLocaleString("vi-VN")} (theo dõi)`,
        explanation: `CPL ở vùng theo dõi của ${company}. Quan sát thêm, tối ưu nhẹ targeting/creative trước khi can thiệp mạnh.`,
        evidence: [
          { metric: "CPL", current: Math.round(cpl), unit: "₫" },
          { metric: "conversions", current: conv, unit: "" },
        ],
        severity: "warning",
        sampleSize: conv,
        impactEstimate: { metric: "CPL", direction: "save", estMonthlySavingsVnd: Math.round(spend * 0.1) },
        sourceEngine: "cpl-calculator",
        _guardCampaign: c,
      });
    }
  }

  return out;
}
