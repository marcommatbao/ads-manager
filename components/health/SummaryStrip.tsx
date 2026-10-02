"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock, Pause, PlugZap, SkipForward, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HealthJob, HealthConnector, HealthAlertChannel } from "./types";
import { absTime } from "./format";

interface StatChipProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  cls: string;
  title?: string;
}

function StatChip({ icon, label, count, cls, title }: StatChipProps) {
  return (
    <div
      title={title}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
        count > 0 ? cls : "border-slate-100 bg-slate-50 text-slate-400"
      )}
    >
      {icon}
      <span>{label}</span>
      <span className="font-bold tabular-nums">{count}</span>
    </div>
  );
}

export function SummaryStrip({
  jobs, connectors, alertChannel, bootAt,
}: {
  jobs: HealthJob[]; connectors: HealthConnector[]; alertChannel: HealthAlertChannel; bootAt: string;
}) {
  const counts = useMemo(() => {
    const c = { failed: 0, missed: 0, stale: 0, paused: 0, waiting: 0, ok: 0 };
    for (const j of jobs) {
      if (j.status in c) c[j.status as keyof typeof c]++;
    }
    return c;
  }, [jobs]);

  const brokenConnectors = useMemo(
    () => connectors.filter((c) => c.status === "auth_error" || c.status === "service_error").length,
    [connectors]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <StatChip icon={<XCircle className="h-3.5 w-3.5" />} label="Lỗi" count={counts.failed}
          cls="border-red-200 bg-red-50 text-red-700" title="Lần chạy gần nhất báo lỗi" />
        <StatChip icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Lỡ lịch" count={counts.missed}
          cls="border-red-200 bg-red-50 text-red-700" title="Lẽ ra chạy theo lịch mà chưa chạy" />
        <StatChip icon={<Clock className="h-3.5 w-3.5" />} label="Im lâu" count={counts.stale}
          cls="border-amber-200 bg-amber-50 text-amber-700" title="Đã im lâu hơn nhịp lịch dự kiến" />
        <StatChip icon={<Pause className="h-3.5 w-3.5" />} label="Đang tắt" count={counts.paused}
          cls="border-slate-200 bg-slate-100 text-slate-600" title="Job đang bị tạm dừng" />
        <StatChip icon={<SkipForward className="h-3.5 w-3.5" />} label="Chờ lần chạy đầu" count={counts.waiting}
          cls="border-sky-200 bg-sky-50 text-sky-700" title="Job tự động nhưng chưa từng chạy lần nào" />
        <StatChip icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Bình thường" count={counts.ok}
          cls="border-emerald-200 bg-emerald-50 text-emerald-700" />
        <StatChip icon={<PlugZap className="h-3.5 w-3.5" />} label="Kết nối hỏng" count={brokenConnectors}
          cls="border-red-200 bg-red-50 text-red-700" title="Kết nối lỗi xác thực hoặc lỗi dịch vụ" />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1 border-t border-slate-100">
        {alertChannel.teams ? (
          <span className="font-medium text-emerald-700">Teams ✓</span>
        ) : (
          <span className="font-semibold text-red-600">Chưa cấu hình kênh cảnh báo</span>
        )}
        <span>Server khởi động lúc {absTime(bootAt)}</span>
      </div>
    </div>
  );
}
