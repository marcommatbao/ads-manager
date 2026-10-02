"use client";

import { useState, useEffect } from "react";
import { useSettingsPermission } from "@/hooks/useSettingsPermission";
import { ReadOnlyBanner } from "@/components/settings/PermissionGate";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, CheckCircle2, AlertCircle, DollarSign, Link2 } from "lucide-react";
import NextLink from "next/link";
import type { CPLThresholds } from "@/lib/cpl-calculator";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface CompanyRevenue {
  monthly_target: number;
  cpl: CPLThresholds;
  /** MBC only — used to convert the revenue target into an order count so
   *  it's comparable to ad spend. Ignored for MBI (already order-denominated). */
  referenceAov?: number;
}

type RevenueConfig = Record<string, CompanyRevenue>;

// ─────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────

// Matches lib/cpl-calculator.ts's fallback numbers — only used if /api/cpl
// is completely unreachable; the real computed config always wins once loaded.
const DEFAULT_CONFIG: RevenueConfig = {
  MBC: {
    monthly_target: 500000000,
    referenceAov: 128792,
    cpl: {
      good: 20000,
      warning: 28000,
      critical: 29000,
      // Số tạm trước khi tải cấu hình thật — đánh dấu "fallback" cho đúng
      // nghĩa, không chỉ để khớp kiểu.
      source: "fallback" as const,
      labels: {
        good: "Tốt",
        warning: "Cần cải thiện",
        critical: "Nguy hiểm",
      },
    },
  },
  MBI: {
    monthly_target: 300000000,
    cpl: {
      good: 900000,
      warning: 1200000,
      critical: 1201000,
      source: "fallback" as const,
      labels: {
        good: "Tốt",
        warning: "Cần cải thiện",
        critical: "Nguy hiểm",
      },
    },
  },
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatVND(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);
}

function formatCount(n: number) {
  return `${new Intl.NumberFormat("vi-VN").format(n)} đơn`;
}

// ─────────────────────────────────────────────
// CPL Preview Row
// ─────────────────────────────────────────────

function CPLPreviewRow({ cpl }: { cpl: CPLThresholds }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {cpl.labels.good} — ≤ {formatVND(cpl.good)}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        {cpl.labels.warning} — ≤ {formatVND(cpl.warning)}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        {cpl.labels.critical} — &gt; {formatVND(cpl.warning)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Company Revenue Card
// ─────────────────────────────────────────────

function CompanyRevenueCard({
  company,
  accentColor,
  data,
  monthLabel,
  kpiValue,
  kpiLoading,
  onChange,
}: {
  company: string;
  accentColor: string;
  data: CompanyRevenue;
  monthLabel: string;
  kpiValue: number | null;
  kpiLoading: boolean;
  onChange: (patch: Partial<CompanyRevenue>) => void;
}) {
  const isMbi = company === "MBI";
  const targetLabel = isMbi ? "Mục tiêu đơn hàng tháng" : "Mục tiêu doanh thu tháng";
  const kpiFieldLabel = isMbi ? "Đơn hàng MBI" : "Doanh thu MBC";
  const cardTitle = isMbi ? "Đơn hàng & CPL — MBI" : "Doanh thu & CPL — MBC";
  const fmtTarget = isMbi ? formatCount : formatVND;

  const patchLabel = (key: keyof CPLThresholds["labels"], value: string) => {
    onChange({
      cpl: {
        ...data.cpl,
        labels: { ...data.cpl.labels, [key]: value },
      },
    });
  };

  return (
    <Card className="border border-slate-200 bg-white shadow-sm rounded-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-3 w-3 rounded-full ${accentColor}`} />
          <CardTitle className="text-lg font-semibold text-slate-800">
            {cardTitle}
          </CardTitle>
        </div>
        <CardDescription className="text-sm text-slate-500 mt-1">
          {targetLabel} và ngưỡng CPL phân loại hiệu suất cho {company}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Monthly target — read-only, synced from Settings → KPI */}
        {kpiLoading ? (
          <div className="h-16 rounded-lg bg-slate-100 animate-pulse" />
        ) : kpiValue === null || kpiValue <= 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            Chưa đặt {kpiFieldLabel} (KPI) tháng {monthLabel} —{" "}
            <NextLink href="/settings/kpi" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
              vào Settings → KPI để đặt <Link2 className="h-3 w-3" />
            </NextLink>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">{targetLabel}</label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
              {fmtTarget(kpiValue)}
            </div>
            <p className="text-xs text-slate-400">
              Tự động lấy từ {kpiFieldLabel} (KPI) tháng {monthLabel} —{" "}
              <NextLink href="/settings/kpi" className="underline underline-offset-2">sửa ở Settings → KPI</NextLink>
            </p>
          </div>
        )}

        <div className="h-px bg-slate-100" />

        {/* CPL thresholds — auto-computed from KPI every month, not typed in.
            By request: thresholds shift when the month's KPI target changes. */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Ngưỡng CPL</p>
          <span className="text-[11px] text-slate-400">Tự động tính lại theo KPI tháng {monthLabel}</span>
        </div>

        {isMbi ? null : (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">AOV tham chiếu MBC</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={data.referenceAov ?? 0}
                onChange={(e) => onChange({ referenceAov: Number(e.target.value) })}
                className="rounded-lg border-slate-200"
              />
              <span className="shrink-0 text-sm font-semibold text-slate-500">VND</span>
            </div>
            <p className="text-xs text-slate-400">
              Giá trị trung bình/đơn thật gần nhất — dùng để quy đổi Doanh thu KPI thành số đơn cần, vì MBC đo bằng doanh thu chứ không phải số đơn trực tiếp.
            </p>
          </div>
        )}

        {/* Nhãn — vẫn chỉnh tay được, chỉ là chữ hiển thị */}
        <div className="grid grid-cols-3 gap-2">
          {(["good", "warning", "critical"] as const).map((key) => (
            <div key={key} className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Nhãn {key === "good" ? "Tốt" : key === "warning" ? "Cần cải thiện" : "Nguy hiểm"}
              </label>
              <Input
                type="text"
                value={data.cpl.labels[key]}
                onChange={(e) => patchLabel(key, e.target.value)}
                className="rounded-lg border-slate-200"
              />
            </div>
          ))}
        </div>

        {/* Preview — giá trị thật đang dùng để phân loại, tính từ KPI + AOV */}
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ngưỡng đang áp dụng (tính từ KPI tháng {monthLabel})
          </p>
          <CPLPreviewRow cpl={data.cpl} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "success" | "error";

const MONTH_NAMES_VN = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export default function RevenueSettingsPage() {
  const perms = useSettingsPermission();
  const [config, setConfig] = useState<RevenueConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [kpiTarget, setKpiTarget] = useState<{ MBC: number; MBI: number } | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);

  const now = new Date();
  const monthIndex = now.getMonth();
  const year = now.getFullYear();
  const monthLabel = `${MONTH_NAMES_VN[monthIndex]}/${year}`;

  // Mục tiêu tháng (doanh thu MBC / đơn hàng MBI) luôn lấy từ Settings → KPI
  // — cùng 1 nguồn sự thật với KPI Tổng Quan, không nhập tay ở đây nữa.
  useEffect(() => {
    setKpiLoading(true);
    fetch(`/api/settings/kpi?year=${year}`)
      .then((r) => r.json())
      .then((data: { success?: boolean; months?: { revenueMbc?: number; ordersMbi?: number }[] }) => {
        const m = data.success && Array.isArray(data.months) ? data.months[monthIndex] : null;
        setKpiTarget({ MBC: m?.revenueMbc ?? 0, MBI: m?.ordersMbi ?? 0 });
      })
      .catch(() => setKpiTarget(null))
      .finally(() => setKpiLoading(false));
  }, [year, monthIndex]);

  useEffect(() => {
    fetch("/api/cpl")
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((data) => {
        if (data?.MBC?.cpl && data?.MBI?.cpl) {
          setConfig({
            MBC: {
              monthly_target: data.MBC.monthly_target ?? DEFAULT_CONFIG.MBC.monthly_target,
              cpl: data.MBC.cpl,
              referenceAov: data.MBC.referenceAov ?? DEFAULT_CONFIG.MBC.referenceAov,
            },
            MBI: {
              monthly_target: data.MBI.monthly_target ?? DEFAULT_CONFIG.MBI.monthly_target,
              cpl: data.MBI.cpl,
            },
          });
        }
      })
      .catch(() => {
        // Use defaults
      })
      .finally(() => setLoading(false));
  }, []);

  const patchCompany = (company: string, patch: Partial<CompanyRevenue>) => {
    setConfig((prev) => ({
      ...prev,
      [company]: { ...prev[company], ...patch },
    }));
  };

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      // good/warning/critical are never sent — computed server-side from
      // KPI on every read. Only referenceAov (MBC) and labels are real settings.
      const payload = {
        MBC: {
          monthly_target: kpiTarget?.MBC ?? config.MBC.monthly_target,
          referenceAov: config.MBC.referenceAov,
          labels: config.MBC.cpl.labels,
        },
        MBI: {
          monthly_target: kpiTarget?.MBI ?? config.MBI.monthly_target,
          labels: config.MBI.cpl.labels,
        },
      };
      const res = await fetch("/api/cpl", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      // good/warning/critical are recomputed server-side on save (they
      // depend on referenceAov, which just changed) — pull the fresh
      // numbers back into state so the preview doesn't show stale values.
      const saved = await res.json() as { data?: { MBC?: CompanyRevenue; MBI?: CompanyRevenue } };
      if (saved.data?.MBC && saved.data?.MBI) {
        setConfig({ MBC: saved.data.MBC, MBI: saved.data.MBI });
      }
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 4000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {!perms.isLoading && !perms.canEditThresholds && (
        <ReadOnlyBanner message="Chỉ Super Admin mới được chỉnh ngưỡng CPL và mục tiêu doanh thu. Bạn đang xem chế độ read-only." />
      )}
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-blue-600" />
        <div>
          <p className="text-sm font-medium text-slate-800">Mục tiêu doanh thu & ngưỡng CPL</p>
          <p className="text-xs text-slate-500">
            Thiết lập ngưỡng CPL xác định mức hiệu suất chiến dịch cho từng công ty.
          </p>
        </div>
      </div>

      <CompanyRevenueCard
        company="MBC"
        accentColor="bg-blue-500"
        data={config.MBC}
        monthLabel={monthLabel}
        kpiValue={kpiTarget?.MBC ?? null}
        kpiLoading={kpiLoading}
        onChange={(patch) => patchCompany("MBC", patch)}
      />

      <CompanyRevenueCard
        company="MBI"
        accentColor="bg-indigo-500"
        data={config.MBI}
        monthLabel={monthLabel}
        kpiValue={kpiTarget?.MBI ?? null}
        kpiLoading={kpiLoading}
        onChange={(patch) => patchCompany("MBI", patch)}
      />

      {saveStatus === "success" && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-sm text-emerald-700">Đã lưu cấu hình doanh thu & CPL.</p>
        </div>
      )}
      {saveStatus === "error" && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">Lưu thất bại. Vui lòng thử lại.</p>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saveStatus === "saving" || !perms.canEditThresholds}
          title={!perms.canEditThresholds ? "Chỉ Super Admin mới được lưu cài đặt này" : undefined}
          className="gap-2 rounded-lg bg-amber-500 text-amber-950 hover:bg-amber-600 disabled:opacity-40"
        >
          {saveStatus === "saving" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang lưu...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Lưu cài đặt
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
