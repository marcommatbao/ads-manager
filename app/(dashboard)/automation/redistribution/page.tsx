"use client";

import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface BudgetEvent {
  date?: string;
  appliedAt?: string;
  campaignName?: string;
  campaign?: string;
  oldBudget?: number;
  newBudget?: number;
  platform?: string;
  [key: string]: unknown;
}

function PlatformBadge({ platform }: { platform?: string }) {
  const lower = (platform ?? "").toLowerCase();
  const isGoogle = lower.includes("google");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
        isGoogle
          ? "border border-red-100 bg-red-50 text-red-600"
          : "border border-blue-100 bg-blue-50 text-blue-600"
      )}
    >
      {isGoogle ? "Google" : "Facebook"}
    </span>
  );
}

function formatVND(value?: number): string {
  if (value == null) return "—";
  return value.toLocaleString("vi-VN") + "đ";
}

function formatDate(value?: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function RedistributionPage() {
  const [events, setEvents] = useState<BudgetEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/automation/google/budget-history")
      .then((res) => res.json())
      .then((json) => {
        const items: BudgetEvent[] = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
          ? json.data
          : [];
        setEvents(items);
      })
      .catch(() => {
        setEvents([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 shadow-lg shadow-emerald-200">
            <RefreshCw className="h-5 w-5 text-white" />
          </div>
          Budget Redistribution
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Lịch sử phân bổ ngân sách tự động giữa các chiến dịch
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden animate-pulse">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex gap-8">
            {["w-16", "w-32", "w-28", "w-20"].map((w, i) => (
              <div key={i} className={cn("h-3 rounded bg-slate-200", w)} />
            ))}
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="px-6 py-4 flex gap-8 border-b border-slate-50"
            >
              {["w-16", "w-40", "w-24", "w-16"].map((w, j) => (
                <div key={j} className={cn("h-3 rounded bg-slate-100", w)} />
              ))}
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50">
          <RefreshCw className="h-12 w-12 text-slate-300 mb-4" />
          <p className="text-sm font-semibold text-slate-500">
            Chưa có sự kiện phân bổ ngân sách nào
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Hệ thống sẽ ghi lại khi có thay đổi ngân sách tự động.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Ngày", "Chiến dịch", "Ngân sách", "Nền tảng"].map(
                  (col) => (
                    <th
                      key={col}
                      className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"
                    >
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {events.map((ev, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                    {formatDate(ev.date ?? ev.appliedAt)}
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-slate-800">
                    {ev.campaignName ?? ev.campaign ?? "—"}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400 line-through">
                        {formatVND(ev.oldBudget)}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className="font-bold text-amber-700">
                        {formatVND(ev.newBudget)}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <PlatformBadge platform={ev.platform} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
