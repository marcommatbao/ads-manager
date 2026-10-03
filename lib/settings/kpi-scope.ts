import { canAccessCompany } from "@/lib/permissions";
import type { MonthKpi } from "@/lib/settings/kpi-store";

// Đợt 21 A5b: ô KPI thuộc công ty nào. Admin một công ty (admin_mbc…) trước đây sửa được CẢ ô của công ty kia.
const KPI_FIELD_COMPANY: Record<keyof MonthKpi, string> = {
  revenueMbc: "MBC", adSpendMbc: "MBC", adSpendMbcByChannel: "MBC",
  adSpendMbi: "MBI", ordersMbi: "MBI", adSpendMbiByChannel: "MBI",
};
/** Tên các ô bị đổi thuộc công ty người sửa KHÔNG được giao (rỗng = được lưu). */
export function kpiForbiddenChanges(user: Parameters<typeof canAccessCompany>[0], oldMonths: MonthKpi[], newMonths: MonthKpi[]): string[] {
  const out = new Set<string>();
  newMonths.forEach((m, i) => {
    for (const [field, co] of Object.entries(KPI_FIELD_COMPANY) as [keyof MonthKpi, string][]) {
      if (canAccessCompany(user, co)) continue;
      if (JSON.stringify(m?.[field] ?? null) !== JSON.stringify(oldMonths[i]?.[field] ?? null)) out.add(field);
    }
  });
  return [...out];
}

