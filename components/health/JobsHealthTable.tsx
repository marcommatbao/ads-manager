"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { HealthJob } from "./types";
import { Badge, JOB_STATUS_META, RISK_META, SCHEDULED_BY_LABEL } from "./badges";
import { relTime, absTime, truncate } from "./format";

const PROBLEM_STATUSES = new Set(["failed", "missed", "stale"]);

function JobDetailRow({ job }: { job: HealthJob }) {
  const lastText = job.lastError ?? job.lastSummary;
  return (
    <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
      <TableCell colSpan={7} className="whitespace-normal py-3">
        <div className="space-y-2 text-xs text-slate-600">
          <p>{job.description}</p>
          <p className="font-mono text-[11px] text-slate-400">cron: {job.cronExpr}</p>
          {lastText && (
            <p>
              <span className="font-medium text-slate-500">{job.lastError ? "Lỗi lần chạy cuối: " : "Tóm tắt lần chạy cuối: "}</span>
              <span className={job.lastError ? "text-red-600" : undefined}>{lastText}</span>
            </p>
          )}
          {job.lastTriggeredBy && (
            <p className="text-slate-400">Gọi bởi: {job.lastTriggeredBy}</p>
          )}
          {job.status === "missed" && job.missedAt && (
            <p className="text-red-700 font-medium">
              Lẽ ra chạy lúc {absTime(job.missedAt)} — chưa chạy lại từ đó.
            </p>
          )}
          {!job.enabled && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-800">
              {job.envDisabled ? (
                <p className="font-medium">Tắt bằng cấu hình JOBS_DISABLED</p>
              ) : (
                <>
                  {job.pauseReason && <p>{job.pauseReason}</p>}
                  {job.pausedBy && <p className="text-[11px] text-amber-600 mt-0.5">Bởi {job.pausedBy}</p>}
                </>
              )}
            </div>
          )}
          {job.riskLevel === "high" && job.riskNote && (
            <p className="text-red-600"><span className="font-semibold">Rủi ro: </span>{job.riskNote}</p>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function JobRow({ job }: { job: HealthJob }) {
  const [expanded, setExpanded] = useState(false);
  const meta = JOB_STATUS_META[job.status];
  const summary = truncate(job.lastError ?? job.lastSummary, 42);

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        <TableCell className="whitespace-normal max-w-[220px]">
          <p className="font-semibold text-slate-800 text-xs">{job.name}</p>
          <p className="text-[11px] text-slate-400 truncate" title={job.description}>{job.description}</p>
        </TableCell>
        <TableCell>
          <Badge cls={meta.cls}>{meta.label}</Badge>
          {job.status === "missed" && job.missedAt && (
            <p className="text-[10px] text-red-600 mt-0.5">từ {absTime(job.missedAt)}</p>
          )}
        </TableCell>
        <TableCell className="whitespace-normal max-w-[160px] text-xs text-slate-600">{job.intervalLabel}</TableCell>
        <TableCell className="text-xs text-slate-600">{SCHEDULED_BY_LABEL[job.scheduledBy]}</TableCell>
        <TableCell className="text-xs">
          <p className="text-slate-700">{relTime(job.lastRunAt)}</p>
          <p className="text-[11px] text-slate-400">{absTime(job.lastRunAt)}</p>
          {summary.short !== "—" && (
            <p className={cn("text-[11px] mt-0.5 truncate max-w-[180px]", job.lastError ? "text-red-500" : "text-slate-400")}>
              {summary.short}
            </p>
          )}
        </TableCell>
        <TableCell className="text-xs text-slate-600">{absTime(job.nextAt)}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <Badge cls={RISK_META[job.riskLevel].cls}>{RISK_META[job.riskLevel].label}</Badge>
            <button type="button" aria-label={expanded ? "Thu gọn" : "Xem chi tiết"} className="text-slate-400 hover:text-slate-600">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && <JobDetailRow job={job} />}
    </>
  );
}

export function JobsHealthTable({ jobs }: { jobs: HealthJob[] }) {
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(
    () => (showAll ? jobs : jobs.filter((j) => PROBLEM_STATUSES.has(j.status))),
    [jobs, showAll]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap p-4 pb-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className={cn("rounded-md px-2.5 py-1 font-medium transition-colors", !showAll ? "bg-white shadow-sm text-slate-800" : "text-slate-500")}
          >
            Có vấn đề
          </button>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={cn("rounded-md px-2.5 py-1 font-medium transition-colors", showAll ? "bg-white shadow-sm text-slate-800" : "text-slate-500")}
          >
            Tất cả ({jobs.length})
          </button>
        </div>
        <Link href="/settings/jobs" className="text-xs font-medium text-blue-600 hover:underline">
          Quản lý / chạy tay ở Cài đặt → Jobs
        </Link>
      </div>

      {filtered.length === 0 ? (
        !showAll ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Không có job nào đang gặp vấn đề.
          </div>
        ) : (
          <p className="px-4 py-8 text-sm text-slate-400">Chưa có job nào được đăng ký.</p>
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Lịch</TableHead>
              <TableHead>Ai gọi</TableHead>
              <TableHead>Lần chạy cuối</TableHead>
              <TableHead>Lần tới</TableHead>
              <TableHead>Rủi ro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((job) => <JobRow key={job.id} job={job} />)}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
