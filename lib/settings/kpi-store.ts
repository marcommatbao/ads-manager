// ============================================================
// KPI targets store — chỉ tiêu 12 tháng/năm (JSON + file-lock, không DB)
// Mỗi tháng: DT MBC, Chi QC MBC, Chi QC MBI, Đơn MBI.
// Tự tính: Tổng Chi QC = MBC+MBI; DT Quý = tổng 3 tháng.
//
// Chi QC mỗi công ty còn PHÂN BỔ được theo kênh (Google/Facebook/TikTok/Zalo).
// Phân bổ là TUỲ CHỌN và chỉ được ≤ tổng chi QC tháng đó: kênh để 0 nghĩa là
// "chưa đặt trần", không phải "trần bằng 0". Phần chênh giữa tổng và các kênh
// là tiền chưa phân bổ — hiện ra để không ai hiểu nhầm là đã chia hết.
// ============================================================

import { promises as fsp, readFileSync, existsSync } from "fs";
import { writeFileAtomic } from "@/lib/fs-atomic";
import path from "path";
import { withFileLock } from "@/lib/file-lock";

const FILE = path.join(process.cwd(), "data", "kpi-targets.json");
const LOCK_KEY = "kpi-targets";

/** Các kênh đặt được trần ngân sách. Danh sách đóng — để không sinh ra 5 biến
 *  thể "Tiktok / TikTok / tik tok" như chỗ khai chi phí tay từng suýt gặp. */
export const KPI_CHANNELS = ["google", "facebook", "tiktok", "zalo"] as const;
export type KpiChannel = (typeof KPI_CHANNELS)[number];

export const KPI_CHANNEL_LABEL: Record<KpiChannel, string> = {
  google: "Google",
  facebook: "Facebook",
  tiktok: "TikTok",
  zalo: "Zalo",
};

/** Trần ngân sách theo kênh (₫). 0 = chưa đặt trần cho kênh đó. */
export type ChannelBudget = Record<KpiChannel, number>;

export const EMPTY_CHANNEL_BUDGET: ChannelBudget = { google: 0, facebook: 0, tiktok: 0, zalo: 0 };

export interface MonthKpi {
  revenueMbc: number;  // doanh thu MBC mục tiêu (₫)
  adSpendMbc: number;  // chi QC MBC mục tiêu (₫)
  adSpendMbi: number;  // chi QC MBI mục tiêu (₫)
  ordersMbi: number;   // đơn MBI mục tiêu
  /** Phân bổ adSpendMbc theo kênh. Tổng các kênh ≤ adSpendMbc. */
  adSpendMbcByChannel: ChannelBudget;
  /** Phân bổ adSpendMbi theo kênh. Tổng các kênh ≤ adSpendMbi. */
  adSpendMbiByChannel: ChannelBudget;
}

export const EMPTY_MONTH: MonthKpi = {
  revenueMbc: 0, adSpendMbc: 0, adSpendMbi: 0, ordersMbi: 0,
  adSpendMbcByChannel: { ...EMPTY_CHANNEL_BUDGET },
  adSpendMbiByChannel: { ...EMPTY_CHANNEL_BUDGET },
};

/** Tổng tiền đã phân bổ cho các kênh. */
export function sumChannelBudget(b: Partial<ChannelBudget> | undefined): number {
  return KPI_CHANNELS.reduce((s, ch) => s + (Number(b?.[ch]) || 0), 0);
}

interface YearKpi { months: Record<string, MonthKpi>; updatedAt?: string; updatedBy?: string }
interface KpiDB { [year: string]: YearKpi }

export interface QuarterKpi { quarter: number; revenueMbc: number }

export interface KpiYearView {
  year: number;
  months: MonthKpi[];        // index 0..11 = tháng 1..12
  quarters: QuarterKpi[];    // tổng DT MBC 3 tháng
  updatedAt?: string;
  updatedBy?: string;
}

function readDB(): KpiDB {
  try {
    if (!existsSync(FILE)) return {};
    return JSON.parse(readFileSync(FILE, "utf8")) as KpiDB;
  } catch {
    return {};
  }
}

function normChannels(b: Partial<ChannelBudget> | undefined): ChannelBudget {
  const out = { ...EMPTY_CHANNEL_BUDGET };
  for (const ch of KPI_CHANNELS) out[ch] = Math.max(0, Math.round(Number(b?.[ch]) || 0));
  return out;
}

function normMonth(m: Partial<MonthKpi> | undefined): MonthKpi {
  return {
    revenueMbc: Math.max(0, Math.round(Number(m?.revenueMbc) || 0)),
    adSpendMbc: Math.max(0, Math.round(Number(m?.adSpendMbc) || 0)),
    adSpendMbi: Math.max(0, Math.round(Number(m?.adSpendMbi) || 0)),
    ordersMbi:  Math.max(0, Math.round(Number(m?.ordersMbi)  || 0)),
    // Tháng lưu từ trước khi có phân bổ kênh không có hai trường này — đọc ra
    // là toàn 0, tức "chưa phân bổ", đúng như trước khi có tính năng.
    adSpendMbcByChannel: normChannels(m?.adSpendMbcByChannel),
    adSpendMbiByChannel: normChannels(m?.adSpendMbiByChannel),
  };
}

/** View đầy đủ 12 tháng + 4 quý (tự cộng) cho 1 năm. */
export function getKpiYear(year: number): KpiYearView {
  const db = readDB();
  const y = db[String(year)];
  const months: MonthKpi[] = Array.from({ length: 12 }, (_, i) =>
    normMonth(y?.months?.[String(i + 1)])
  );
  const quarters: QuarterKpi[] = [0, 1, 2, 3].map(q => ({
    quarter: q + 1,
    revenueMbc: months.slice(q * 3, q * 3 + 3).reduce((s, m) => s + m.revenueMbc, 0),
  }));
  return { year, months, quarters, updatedAt: y?.updatedAt, updatedBy: y?.updatedBy };
}

/** KPI 1 tháng (year, month 1-12) — cho Dashboard đối chiếu. */
export function getMonthKpi(year: number, month1to12: number): MonthKpi {
  const db = readDB();
  return normMonth(db[String(year)]?.months?.[String(month1to12)]);
}

/** Lưu 12 tháng cho 1 năm. */
export async function saveKpiYear(year: number, months: MonthKpi[], updatedBy?: string): Promise<KpiYearView> {
  await withFileLock(LOCK_KEY, async () => {
    const db = readDB();
    const monthMap: Record<string, MonthKpi> = {};
    for (let i = 0; i < 12; i++) monthMap[String(i + 1)] = normMonth(months[i]);
    db[String(year)] = { months: monthMap, updatedAt: new Date().toISOString(), updatedBy };
    await fsp.mkdir(path.dirname(FILE), { recursive: true });
    await writeFileAtomic(FILE, JSON.stringify(db, null, 2));
  });
  return getKpiYear(year);
}
