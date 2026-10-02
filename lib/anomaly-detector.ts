// ============================================================
// AdsCommand — Anomaly Detector
// Detects outliers by comparing today vs 7-day baseline
// ============================================================

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface DailyMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
  conversions: number;
  frequency: number;
  cpl: number;
}

export type AnomalySeverity = "critical" | "warning" | "info";

export interface Anomaly {
  metric: string;
  label: string;
  todayValue: number;
  baselineValue: number;
  changePct: number;         // e.g. +42 or -35
  severity: AnomalySeverity;
  direction: "increase" | "decrease";
  description: string;
  possibleCauses: string[];
}

// ─────────────────────────────────────────────
// Anomaly check configuration
// ─────────────────────────────────────────────

interface AnomalyCheck {
  metric: keyof DailyMetrics;
  label: string;
  threshold: number;        // fraction — 0.4 = 40%
  direction: "increase" | "decrease";
  severity: AnomalySeverity;
}

const ANOMALY_CHECKS: AnomalyCheck[] = [
  {
    metric: "cpc",
    label: "CPC",
    threshold: 0.4,
    direction: "increase",
    severity: "warning",
  },
  {
    metric: "impressions",
    label: "Lượt hiển thị",
    threshold: 0.5,
    direction: "decrease",
    severity: "critical",
  },
  {
    metric: "ctr",
    label: "CTR",
    threshold: 0.3,
    direction: "decrease",
    severity: "warning",
  },
  {
    metric: "spend",
    label: "Chi tiêu",
    threshold: 0.6,
    direction: "increase",
    severity: "warning",
  },
  {
    metric: "roas",
    label: "ROAS",
    threshold: 0.4,
    direction: "decrease",
    severity: "critical",
  },
  {
    metric: "frequency",
    label: "Frequency",
    threshold: 0.5,
    direction: "increase",
    severity: "warning",
  },
  {
    metric: "cpm",
    label: "CPM",
    threshold: 0.4,
    direction: "increase",
    severity: "info",
  },
  {
    metric: "cpl",
    label: "CPL",
    threshold: 0.3,
    direction: "increase",
    severity: "critical",
  },
];

// ─────────────────────────────────────────────
// Possible causes lookup
// ─────────────────────────────────────────────

function getPossibleCauses(metric: string, direction: string): string[] {
  const causes: Record<string, Record<string, string[]>> = {
    cpc: {
      increase: [
        "Audience saturation — frequency quá cao",
        "Đối thủ tăng bid, đẩy auction price lên",
        "Creative đã cũ, CTR giảm → CPC tăng",
        "Targeting quá hẹp, ít inventory",
      ],
      decrease: [
        "Creative mới hoạt động tốt",
        "Thị trường cạnh tranh giảm",
      ],
    },
    impressions: {
      decrease: [
        "Budget đã hết hoặc gần hết",
        "Campaign bị reject hoặc review",
        "Audience quá hẹp sau khi exclude",
        "Bid cap quá thấp so với auction",
        "Lỗi kỹ thuật — kiểm tra campaign status",
      ],
      increase: [
        "Budget tăng hoặc bid adjustment",
        "Seasonal spike trong ngành",
      ],
    },
    ctr: {
      decrease: [
        "Creative fatigue — audience đã xem quá nhiều lần",
        "Targeting sai đối tượng",
        "Ad copy/visual không phù hợp mùa",
        "Landing page mismatch với ad promise",
      ],
      increase: [
        "Creative mới hấp dẫn hơn",
        "Targeting chính xác hơn",
      ],
    },
    spend: {
      increase: [
        "Auto-bidding tăng spend để meet target",
        "Campaign vừa được scale budget",
        "Nhiều campaigns active hơn bình thường",
      ],
      decrease: [
        "Budget cap reached sớm trong ngày",
        "Fewer auction wins do to competitor pressure",
      ],
    },
    roas: {
      decrease: [
        "Conversion rate landing page giảm",
        "Sản phẩm hết hàng hoặc giá tăng",
        "Audience quality giảm (broad quá)",
        "Attribution window thay đổi",
      ],
      increase: [
        "Campaign scale tốt, tìm đúng audience",
        "Seasonal demand tăng",
      ],
    },
    frequency: {
      increase: [
        "Audience quá nhỏ cho budget hiện tại",
        "Campaign chạy quá lâu không refresh creative",
        "Cần mở rộng targeting hoặc lookalike",
      ],
      decrease: [
        "Đã mở rộng audience thành công",
      ],
    },
    cpm: {
      increase: [
        "Cạnh tranh auction tăng (cuối tháng/quý)",
        "Inventory premium placements đắt hơn",
        "Audience overlap cao giữa các campaigns",
      ],
      decrease: [
        "Thị trường bớt cạnh tranh",
        "Chuyển sang placement rẻ hơn",
      ],
    },
    cpl: {
      increase: [
        "CPC tăng kéo theo CPL (kiểm tra anomaly CPC cùng kỳ)",
        "Conversion rate giảm — landing page hoặc offer không còn hấp dẫn",
        "Audience/creative fatigue — chuyển đổi khó hơn dù traffic vẫn vào",
        "Budget bị giới hạn (search_budget_lost_impression_share cao) — thiếu impression chất lượng",
        "Tracking/pixel lỗi, đếm thiếu conversion thật",
      ],
      decrease: [
        "Tối ưu targeting/creative gần đây phát huy hiệu quả",
        "Offer hoặc mùa vụ thuận lợi hơn",
      ],
    },
  };

  return causes[metric]?.[direction] ?? ["Chưa xác định — cần kiểm tra thêm"];
}

// ─────────────────────────────────────────────
// Calculate baseline from historical data
// ─────────────────────────────────────────────

export function calculateBaseline(historicalDays: DailyMetrics[]): DailyMetrics {
  const n = historicalDays.length;
  if (n === 0) {
    return { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, roas: 0, conversions: 0, frequency: 0, cpl: 0 };
  }

  const sum = (fn: (d: DailyMetrics) => number) => historicalDays.reduce((s, d) => s + fn(d), 0);

  return {
    spend: sum(d => d.spend) / n,
    impressions: sum(d => d.impressions) / n,
    clicks: sum(d => d.clicks) / n,
    ctr: sum(d => d.ctr) / n,
    cpc: sum(d => d.cpc) / n,
    cpm: sum(d => d.cpm) / n,
    roas: sum(d => d.roas) / n,
    conversions: sum(d => d.conversions) / n,
    frequency: sum(d => d.frequency) / n,
    cpl: sum(d => d.cpl) / n,
  };
}

// ─────────────────────────────────────────────
// Main detector
// ─────────────────────────────────────────────

export function detectAnomalies(
  todayMetrics: DailyMetrics,
  historicalMetrics: DailyMetrics[]
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (historicalMetrics.length === 0) return anomalies;

  const baseline = calculateBaseline(historicalMetrics);

  for (const check of ANOMALY_CHECKS) {
    const todayVal = todayMetrics[check.metric];
    const baselineVal = baseline[check.metric];

    // Skip if baseline is 0 or near-zero (can't compute meaningful change)
    if (baselineVal === 0 || Math.abs(baselineVal) < 0.001) continue;

    const changePct = (todayVal - baselineVal) / baselineVal;

    const isAnomaly =
      check.direction === "increase"
        ? changePct > check.threshold
        : changePct < -check.threshold;

    if (isAnomaly) {
      const arrow = check.direction === "increase" ? "tăng" : "giảm";
      const absPct = Math.abs(Math.round(changePct * 100));

      anomalies.push({
        metric: check.metric,
        label: check.label,
        todayValue: todayVal,
        baselineValue: baselineVal,
        changePct: Math.round(changePct * 100),
        severity: check.severity,
        direction: changePct > 0 ? "increase" : "decrease",
        description: `${check.label} ${arrow} ${absPct}% so với TB 7 ngày`,
        possibleCauses: getPossibleCauses(check.metric, check.direction),
      });
    }
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<AnomalySeverity, number> = { critical: 0, warning: 1, info: 2 };
  anomalies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return anomalies;
}

// ─────────────────────────────────────────────
// Severity helpers (for UI)
// ─────────────────────────────────────────────

export const SEVERITY_CONFIG: Record<AnomalySeverity, { icon: string; color: string; bg: string; border: string; label: string }> = {
  critical: { icon: "🔴", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", label: "Nghiêm trọng" },
  warning:  { icon: "🟡", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", label: "Cảnh báo" },
  info:     { icon: "🔵", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", label: "Thông tin" },
};
