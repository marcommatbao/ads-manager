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
import { Target, Info, Loader2, Save, CheckCircle2, AlertCircle } from "lucide-react";
import type { CPLThresholds } from "@/lib/cpl-calculator";

// ─────────────────────────────────────────────
// Types — mirrors the real /api/cpl contract (lib/cpl-calculator.ts).
// good/warning/critical are NEVER stored — they're recomputed server-side
// from the current month's KPI on every read/write. The only things an
// admin can actually persist are MBC's reference AOV and the display labels.
// ─────────────────────────────────────────────

interface CompanyCplConfig {
  /** MBC only — converts the revenue KPI target into an order count so it's
   *  comparable to ad spend. MBI needs no such conversion. */
  referenceAov?: number;
  cpl: CPLThresholds;
}

type CplPageConfig = Record<string, CompanyCplConfig>;

// Only used if /api/cpl is completely unreachable — matches lib/cpl-calculator.ts
// fallback numbers. The real computed config always overwrites this once loaded.
const DEFAULT_CONFIG: CplPageConfig = {
  MBC: {
    referenceAov: 128792,
    cpl: {
      good: 20000,
      warning: 28000,
      critical: 29000,
      // Số tạm trước khi tải cấu hình thật — đánh dấu "fallback" cho
      // đúng nghĩa, không chỉ để khớp kiểu.
      source: "fallback" as const,
      labels: { good: "Tốt", warning: "Cần cải thiện", critical: "Nguy hiểm" },
    },
  },
  MBI: {
    cpl: {
      good: 900000,
      warning: 1200000,
      critical: 1201000,
      // Số tạm trước khi tải cấu hình thật — đánh dấu "fallback" cho
      // đúng nghĩa, không chỉ để khớp kiểu.
      source: "fallback" as const,
      labels: { good: "Tốt", warning: "Cần cải thiện", critical: "Nguy hiểm" },
    },
  },
};

const MONTH_NAMES_VN = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

function formatVND(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
}

// ─────────────────────────────────────────────
// Computed threshold preview — read-only, real numbers currently used to
// classify campaigns (Improvements/Alerts), recomputed from KPI on load/save.
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

function ThresholdCard({
  company,
  color,
  data,
  monthLabel,
  canEdit,
  onChange,
}: {
  company: string;
  color: string;
  data: CompanyCplConfig;
  monthLabel: string;
  canEdit: boolean;
  onChange: (patch: Partial<CompanyCplConfig>) => void;
}) {
  const patchLabel = (key: keyof CPLThresholds["labels"], value: string) => {
    onChange({ cpl: { ...data.cpl, labels: { ...data.cpl.labels, [key]: value } } });
  };

  return (
    <Card className="border border-slate-200 bg-white shadow-sm rounded-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-3 w-3 rounded-full ${color}`} />
          <CardTitle className="text-lg font-semibold text-slate-800">
            Ngưỡng CPL — {company}
          </CardTitle>
        </div>
        <CardDescription className="text-sm text-slate-500 mt-1">
          Cấu hình các thông số dùng để phân loại hiệu suất CPL cho công ty {company}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {company === "MBC" && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">AOV tham chiếu MBC</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                step={1000}
                disabled={!canEdit}
                value={data.referenceAov ?? 0}
                onChange={(e) => onChange({ referenceAov: Number(e.target.value) })}
                className="rounded-lg border-slate-200 disabled:opacity-50"
              />
              <span className="shrink-0 text-sm font-semibold text-slate-500">VND</span>
            </div>
            <p className="text-xs text-slate-400">
              Giá trị trung bình/đơn thật gần nhất — dùng để quy đổi Doanh thu KPI thành số đơn
              cần, vì MBC đo bằng doanh thu chứ không phải số đơn trực tiếp.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Nhãn hiển thị</p>
          <span className="text-[11px] text-slate-400">
            Giá trị ngưỡng tự động tính lại theo KPI tháng {monthLabel}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(["good", "warning", "critical"] as const).map((key) => (
            <div key={key} className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Nhãn {key === "good" ? "Tốt" : key === "warning" ? "Cần cải thiện" : "Nguy hiểm"}
              </label>
              <Input
                type="text"
                disabled={!canEdit}
                value={data.cpl.labels[key]}
                onChange={(e) => patchLabel(key, e.target.value)}
                className="rounded-lg border-slate-200 disabled:opacity-50"
              />
            </div>
          ))}
        </div>

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

export default function CplThresholdsPage() {
  const perms = useSettingsPermission();
  const [config, setConfig] = useState<CplPageConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const now = new Date();
  const monthLabel = `${MONTH_NAMES_VN[now.getMonth()]}/${now.getFullYear()}`;

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
              referenceAov: data.MBC.referenceAov ?? DEFAULT_CONFIG.MBC.referenceAov,
              cpl: data.MBC.cpl,
            },
            MBI: { cpl: data.MBI.cpl },
          });
        }
      })
      .catch(() => {
        // Keep defaults — real config will overwrite them once reachable.
      })
      .finally(() => setLoading(false));
  }, []);

  const patchCompany = (company: string, patch: Partial<CompanyCplConfig>) => {
    setConfig((prev) => ({
      ...prev,
      [company]: { ...prev[company], ...patch },
    }));
  };

  const handleSave = async () => {
    setSaveStatus("saving");
    setErrorMsg(null);
    try {
      // good/warning/critical are never sent — always recomputed server-side
      // from KPI. Only referenceAov (MBC) and labels are real, stored settings.
      const payload = {
        MBC: {
          referenceAov: config.MBC.referenceAov,
          labels: config.MBC.cpl.labels,
        },
        MBI: {
          labels: config.MBI.cpl.labels,
        },
      };
      const res = await fetch("/api/cpl", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json() as {
        success?: boolean;
        error?: string;
        errors?: { field: string; message: string }[];
        data?: { MBC?: CompanyCplConfig; MBI?: CompanyCplConfig };
      };
      if (!res.ok || !body.success) {
        const msg = body.errors?.map((e) => e.message).join("; ") ?? body.error ?? "Lưu thất bại";
        throw new Error(msg);
      }
      // good/warning/critical are recomputed server-side (they depend on
      // referenceAov, which may have just changed) — pull fresh values back
      // so the preview never shows stale numbers.
      if (body.data?.MBC && body.data?.MBI) {
        setConfig({ MBC: body.data.MBC, MBI: body.data.MBI });
      }
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Lưu thất bại. Vui lòng thử lại.");
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
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
          <Target className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">CPL Thresholds</h1>
          <p className="text-sm text-slate-500">Cấu hình ngưỡng chi phí mỗi lead theo công ty</p>
        </div>
      </div>

      {!perms.isLoading && !perms.canEditThresholds && (
        <ReadOnlyBanner message="Chỉ Super Admin mới được chỉnh ngưỡng CPL. Bạn đang xem chế độ read-only." />
      )}

      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
        <Info className="mt-0.5 h-5 w-5 text-blue-500 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-800">Ngưỡng CPL được tính tự động</p>
          <p className="mt-0.5 text-xs text-blue-600">
            Giá trị Tốt / Cần cải thiện / Nguy hiểm được tính lại mỗi tháng từ KPI đặt ở{" "}
            <span className="font-medium">Settings → KPI</span> — không nhập tay trực tiếp. Ở đây
            bạn chỉnh AOV tham chiếu (MBC) và nhãn hiển thị; ngưỡng thật dùng cho
            Improvements/Alerts luôn khớp với số hiển thị bên dưới.
          </p>
        </div>
      </div>

      <ThresholdCard
        company="MBC"
        color="bg-blue-500"
        data={config.MBC}
        monthLabel={monthLabel}
        canEdit={perms.canEditThresholds}
        onChange={(patch) => patchCompany("MBC", patch)}
      />

      <ThresholdCard
        company="MBI"
        color="bg-indigo-500"
        data={config.MBI}
        monthLabel={monthLabel}
        canEdit={perms.canEditThresholds}
        onChange={(patch) => patchCompany("MBI", patch)}
      />

      {saveStatus === "success" && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-sm text-emerald-700">Đã lưu ngưỡng CPL.</p>
        </div>
      )}
      {saveStatus === "error" && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{errorMsg ?? "Lưu thất bại. Vui lòng thử lại."}</p>
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
