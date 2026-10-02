// KPI monthly targets validator
// All monetary/count values must be non-negative integers
//
// Phân bổ theo kênh: tổng các kênh KHÔNG được vượt tổng chi QC của tháng đó.
// Nhỏ hơn thì hợp lệ — phần chênh là tiền chưa phân bổ.

import {
  KPI_CHANNELS, KPI_CHANNEL_LABEL, sumChannelBudget,
  type MonthKpi, type ChannelBudget,
} from "@/lib/settings/kpi-store";

export interface ValidationError {
  field: string;
  message: string;
}

export function validateMonthKpi(month: number, kpi: Partial<MonthKpi>): ValidationError[] {
  const errors: ValidationError[] = [];
  const pfx = `month[${month}]`;

  const fields: (keyof MonthKpi)[] = ["revenueMbc", "adSpendMbc", "adSpendMbi", "ordersMbi"];
  for (const key of fields) {
    const v = kpi[key];
    if (v !== undefined) {
      const n = Number(v);
      if (isNaN(n) || n < 0 || !Number.isFinite(n)) {
        errors.push({
          field: `${pfx}.${key}`,
          message: `KPI ${key} tháng ${month} phải là số không âm`,
        });
      }
    }
  }

  for (const side of [
    { key: "adSpendMbcByChannel", total: "adSpendMbc", label: "MBC" },
    { key: "adSpendMbiByChannel", total: "adSpendMbi", label: "MBI" },
  ] as const) {
    const byChannel = kpi[side.key] as Partial<ChannelBudget> | undefined;
    if (byChannel === undefined) continue;

    for (const ch of KPI_CHANNELS) {
      const v = byChannel[ch];
      if (v === undefined) continue;
      const n = Number(v);
      if (isNaN(n) || n < 0 || !Number.isFinite(n)) {
        errors.push({
          field: `${pfx}.${side.key}.${ch}`,
          message: `Ngân sách ${KPI_CHANNEL_LABEL[ch]} (${side.label}) tháng ${month} phải là số không âm`,
        });
      }
    }

    // Tổng phân bổ > tổng chi QC nghĩa là đã hứa nhiều tiền hơn số có. Chặn ở
    // đây, vì lưu được thì mọi thanh tiến độ trên Dashboard đều nói dối: từng
    // kênh trong hạn mức mà cộng lại đã vượt KPI tháng.
    const allocated = sumChannelBudget(byChannel);
    const total = Math.max(0, Number(kpi[side.total]) || 0);
    if (allocated > total) {
      errors.push({
        field: `${pfx}.${side.key}`,
        message:
          `Tháng ${month}: phân bổ theo kênh của ${side.label} đang là ` +
          `${allocated.toLocaleString("vi-VN")}đ, vượt ${(allocated - total).toLocaleString("vi-VN")}đ ` +
          `so với Chi QC ${side.label} (${total.toLocaleString("vi-VN")}đ)`,
      });
    }
  }

  return errors;
}

export function validateKpiYear(months: MonthKpi[]): ValidationError[] {
  const errors: ValidationError[] = [];
  months.forEach((m, i) => {
    errors.push(...validateMonthKpi(i + 1, m));
  });
  return errors;
}
