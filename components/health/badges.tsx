// ============================================================
// Badge màu + nhãn dùng chung cho các bảng ở /settings/health.
// Cùng phong cách với hàm Badge() cục bộ trong components/search/SearchXrayTab.tsx.
// ============================================================

import { cn } from "@/lib/utils";
import type {
  JobHealthStatus, ConnectorHealthStatus, JobRiskLevel, JobScheduledBy,
} from "./types";
import type { NumberCheck } from "@/lib/jobs/numbers-check";

export function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold", cls)}>
      {children}
    </span>
  );
}

export const JOB_STATUS_META: Record<JobHealthStatus, { label: string; cls: string }> = {
  failed:  { label: "Lỗi",                    cls: "bg-red-50 text-red-700 border-red-200" },
  missed:  { label: "Lỡ lịch",                cls: "bg-red-50 text-red-700 border-red-200" },
  stale:   { label: "Im lâu",                 cls: "bg-amber-50 text-amber-700 border-amber-200" },
  paused:  { label: "Đang tắt",               cls: "bg-slate-100 text-slate-600 border-slate-200" },
  waiting: { label: "Chờ lần chạy đầu",       cls: "bg-sky-50 text-sky-700 border-sky-200" },
  never:   { label: "Chưa từng chạy",         cls: "bg-slate-100 text-slate-500 border-slate-200" },
  ok:      { label: "Bình thường",            cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export const CONNECTOR_STATUS_META: Record<ConnectorHealthStatus, { label: string; cls: string }> = {
  healthy:         { label: "Khoẻ",             cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  auth_error:      { label: "Lỗi xác thực",     cls: "bg-red-50 text-red-700 border-red-200" },
  service_error:   { label: "Dịch vụ lỗi",      cls: "bg-red-50 text-red-700 border-red-200" },
  missing_config:  { label: "Chưa cấu hình",    cls: "bg-slate-100 text-slate-500 border-slate-200" },
  disabled:        { label: "Đã tắt",           cls: "bg-slate-100 text-slate-500 border-slate-200" },
  warning:         { label: "Cần kiểm lại",     cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

export const RISK_META: Record<JobRiskLevel, { label: string; cls: string }> = {
  low:    { label: "LOW",    cls: "bg-slate-100 text-slate-600" },
  medium: { label: "MEDIUM", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
  high:   { label: "HIGH",   cls: "bg-red-50 text-red-700 border border-red-200" },
};

export const NUMBERS_STATUS_META: Record<NumberCheck["status"], { label: string; cls: string }> = {
  ok:   { label: "Khớp",              cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  lech: { label: "Lệch",              cls: "bg-red-50 text-red-700 border-red-200" },
  loi:  { label: "Không đọc được",    cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

export const SCHEDULED_BY_LABEL: Record<JobScheduledBy, string> = {
  entrypoint: "Crontab",
  tick: "Nhịp điều phối",
  manual: "Chạy tay",
};
