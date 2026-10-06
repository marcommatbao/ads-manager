"use client";

import { useState, useEffect, useCallback } from "react";
import { resolveCompanyScope } from "@/lib/permissions";
import { Loader2, AlertTriangle, RefreshCw, Target, Monitor, MapPin, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/SessionProvider";
import { orderedCompanyIds } from "@/lib/companies/registry";

type SegmentType = "device" | "location" | "adschedule";
type Company = string;

interface SegmentRow {
  label: string;
  spend: number;
  clicks: number;
  impressions?: number;
  conversions: number;
  cpl: number | null;
  ctr?: number;
  pctSpend: number;
}

interface ApiResponse {
  success: boolean;
  segment: SegmentType;
  data: SegmentRow[];
  totalSpend: number;
  error?: string;
}

const SEGMENTS: { key: SegmentType; label: string; icon: typeof Monitor; desc: string }[] = [
  { key: "device",     label: "Thiết bị",     icon: Monitor,  desc: "Hiệu suất theo Mobile / Desktop / Tablet" },
  { key: "location",   label: "Vị trí",       icon: MapPin,   desc: "Hiệu suất theo địa điểm người dùng" },
  { key: "adschedule", label: "Lịch quảng cáo", icon: Calendar, desc: "Hiệu suất theo ngày trong tuần" },
];

function formatVND(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M₫`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K₫`;
  return `${v}₫`;
}

function BarRow({ row, max, rank }: { row: SegmentRow; max: number; rank: number }) {
  const barW = max > 0 ? (row.spend / max) * 100 : 0;
  const rankColor = rank === 1 ? "text-amber-500" : rank === 2 ? "text-slate-400" : rank === 3 ? "text-amber-700/70" : "text-slate-300";

  return (
    <div className="py-3 border-b border-slate-50 last:border-0">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("text-xs font-bold shrink-0 w-5 text-right", rankColor)}>#{rank}</span>
          <span className="text-sm font-medium text-slate-700 truncate">{row.label}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs">
          <span className="text-slate-500">{formatVND(row.spend)}</span>
          <span className="font-bold text-slate-800 w-8 text-right">{row.pctSpend}%</span>
        </div>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
        <div className="h-2 rounded-full bg-amber-500 transition-all" style={{ width: `${barW}%` }} />
      </div>
      <div className="flex items-center gap-4 text-[11px] text-slate-400">
        <span>{row.clicks.toLocaleString("vi-VN")} clicks</span>
        {row.ctr != null && <span>CTR: {row.ctr}%</span>}
        <span className="text-emerald-600 font-medium">
          {row.conversions > 0 ? `${row.conversions} conv` : "0 conv"}
        </span>
        {row.cpl != null && (
          <span className="text-amber-600">CPL: {formatVND(row.cpl)}</span>
        )}
      </div>
    </div>
  );
}

export default function SegmentsPage() {
  const [company, setCompany]   = useState<Company>(() => orderedCompanyIds(["MBC"])[0] ?? "MBC"); // Đợt 25: công ty theo bản cài (bản Mắt Bão y như cũ)
  // Chỉ hiện công ty người này được xem. Trước đây nút bấm cứng cả MBC lẫn MBI,
  // nên người chỉ có quyền một bên vẫn thấy nút bên kia và bấm vào là nhận 403.
  const { user } = useSession();
  // resolveCompanyScope, KHÔNG lọc thẳng trên user.companies: trường đó là
  // PHẠM VI và đang mang giá trị ["ALL"] cho mọi tài khoản → lọc thẳng ra rỗng,
  // rồi trang báo "Tài khoản của bạn chưa được gán công ty nào".
  const allowedCompanies = resolveCompanyScope(user?.companies, user?.role);
  // Mặc định "MBC" sai với người chỉ có MBI. Chỉnh state về công ty hợp lệ đầu
  // tiên thay vì dựng biến dẫn xuất — để mọi chỗ đang đọc `company` vẫn đúng.
  useEffect(() => {
    if (allowedCompanies.length > 0 && !allowedCompanies.includes(company)) {
      setCompany(allowedCompanies[0]);
    }
  }, [allowedCompanies, company]);

  const [segment, setSegment]   = useState<SegmentType>("device");
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [data, setData]         = useState<ApiResponse | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/google/toolkit/segments?company=${company}&segment=${segment}`);
      const json = await res.json() as ApiResponse;
      if (!json.success) throw new Error(json.error || "Lỗi tải dữ liệu");
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [company, segment]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const rows    = data?.data ?? [];
  const maxSpend = rows[0]?.spend ?? 1;
  const meta    = SEGMENTS.find(s => s.key === segment)!;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
            <Target className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Phân tích phân khúc</h1>
            <p className="text-sm text-slate-500">Hiệu suất theo thiết bị, vị trí, lịch chạy — cơ sở để điều chỉnh bid</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allowedCompanies.map(c => (
            <button key={c} onClick={() => setCompany(c)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold border-2 transition-all",
                company === c ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:border-slate-300")}>
              {c}
            </button>
          ))}
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Segment tabs */}
      <div className="flex gap-2 flex-wrap">
        {SEGMENTS.map(s => (
          <button key={s.key} onClick={() => setSegment(s.key)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border-2 transition-all",
              segment === s.key
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            )}>
            <s.icon className="h-4 w-4" />
            {s.label}
          </button>
        ))}
      </div>

      {/* Period note */}
      <p className="text-xs text-slate-400">Dữ liệu 30 ngày gần nhất — {meta.desc}</p>

      {loading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <p className="text-xs text-red-500 mt-1">Kiểm tra kết nối Google Ads trong Settings</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-10 text-center">
          <Target className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">Không có dữ liệu</p>
          <p className="text-xs text-slate-400 mt-1">Tài khoản {company} chưa có data cho phân khúc này trong 30 ngày qua.</p>
        </div>
      ) : (
        <Card className="border border-slate-200 bg-white shadow-sm rounded-xl">
          <CardHeader className="pb-2 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <meta.icon className="h-4 w-4 text-indigo-500" />
                {meta.label} — {company}
              </CardTitle>
              {data && (
                <span className="text-xs text-slate-400">
                  Tổng chi: {formatVND(data.totalSpend)}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {rows.map((row, i) => (
              <BarRow key={row.label} row={row} max={maxSpend} rank={i + 1} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Bid adjustment tips */}
      {rows.length > 0 && !loading && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-2">
          <p className="text-sm font-semibold text-indigo-800">Gợi ý điều chỉnh bid</p>
          <ul className="text-xs text-indigo-700 space-y-1 list-disc list-inside">
            {rows[0] && (
              <li>
                <span className="font-semibold">{rows[0].label}</span> chiếm {rows[0].pctSpend}% chi tiêu
                {rows[0].conversions > 0 ? ` với ${rows[0].conversions} conversions — tăng bid +10–20%` : " nhưng chưa có conversion — theo dõi thêm"}
              </li>
            )}
            {rows.filter(r => r.conversions === 0 && r.spend > 0).slice(0, 2).map(r => (
              <li key={r.label}>
                <span className="font-semibold">{r.label}</span> tốn {formatVND(r.spend)} ({r.pctSpend}%) nhưng 0 conversion — cân nhắc giảm bid -20%
              </li>
            ))}
            {rows.filter(r => r.cpl != null).sort((a, b) => (a.cpl ?? 0) - (b.cpl ?? 0)).slice(0, 1).map(r => (
              <li key={r.label + "_best"}>
                CPL thấp nhất: <span className="font-semibold">{r.label}</span> ({formatVND(r.cpl!)}) — ưu tiên ngân sách cho phân khúc này
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
