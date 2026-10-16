"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { recentMonths } from "@/lib/ads-content/month-range";
import type { AdsContentFilters } from "@/lib/ads-content/filtering";
import { orderedCompanyIds, companyLabel } from "@/lib/companies/registry";

// Đợt 25: công ty theo bản cài (bản Mắt Bão y như cũ)
const coText = (id: string) => (id === "MBC" || id === "MBI" ? id : companyLabel(id));

interface AdsContentFilterBarProps {
  month: string;
  onMonthChange: (month: string) => void;
  filters: AdsContentFilters;
  onFiltersChange: (filters: AdsContentFilters) => void;
  objectiveOptions: string[];
  productOptions: string[];
}

// Base UI Select hiện GIÁ TRỊ thô ("all", "recent") trên nút nếu không có hàm đổi sang nhãn (crawl 15/10/2026).
const SORT_LABEL: Record<string, string> = { recent: "Hoạt động gần nhất", spend_desc: "Chi tiêu cao nhất", clicks_desc: "Clicks cao nhất", name_asc: "Tên A → Z" };

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `Tháng ${m}/${y}`;
}

export function AdsContentFilterBar({
  month,
  onMonthChange,
  filters,
  onFiltersChange,
  objectiveOptions,
  productOptions,
}: AdsContentFilterBarProps) {
  function set<K extends keyof AdsContentFilters>(key: K, value: AdsContentFilters[K]) {
    onFiltersChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400"
        >
          {recentMonths(12).map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>

        <Select value={filters.platform} onValueChange={(v) => set("platform", v as AdsContentFilters["platform"])}>
          <SelectTrigger className="h-9 w-[160px] border-slate-200 text-sm"><SelectValue placeholder="Platform">{(v: string) => ({ all: "Tất cả Platform", facebook: "Facebook", google: "Google" } as Record<string, string>)[v] ?? v}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả Platform</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="google">Google</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.creativeType} onValueChange={(v) => set("creativeType", v as AdsContentFilters["creativeType"])}>
          <SelectTrigger className="h-9 w-[150px] border-slate-200 text-sm"><SelectValue placeholder="Loại creative">{(v: string) => ({ all: "Tất cả loại", facebook: "Facebook", google_search: "Google Search", google_pmax: "Google PMax" } as Record<string, string>)[v] ?? v}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="google_search">Google Search</SelectItem>
            <SelectItem value="google_pmax">Google PMax</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.company} onValueChange={(v) => set("company", v as AdsContentFilters["company"])}>
          <SelectTrigger className="h-9 w-[140px] border-slate-200 text-sm"><SelectValue placeholder="Công ty">{(v: string) => (v === "all" ? orderedCompanyIds(["MBC", "MBI"]).map(coText).join(" + ") : coText(v))}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{orderedCompanyIds(["MBC", "MBI"]).map(coText).join(" + ")}</SelectItem>
            {orderedCompanyIds(["MBC", "MBI"]).map((c) => (
              <SelectItem key={c} value={c}>{coText(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.status} onValueChange={(v) => set("status", v as AdsContentFilters["status"])}>
          <SelectTrigger className="h-9 w-[150px] border-slate-200 text-sm"><SelectValue placeholder="Trạng thái">{(v: string) => ({ all: "Mọi trạng thái", ACTIVE: "Active", PAUSED: "Paused", ARCHIVED: "Archived" } as Record<string, string>)[v] ?? v}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi trạng thái</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filters.objective} onValueChange={(v) => set("objective", v ?? "all")}>
          <SelectTrigger className="h-9 w-[160px] border-slate-200 text-sm"><SelectValue placeholder="Objective">{(v: string) => (v === "all" ? "Mọi objective" : v)}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi objective</SelectItem>
            {objectiveOptions.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.product} onValueChange={(v) => set("product", v ?? "all")}>
          <SelectTrigger className="h-9 w-[200px] border-slate-200 text-sm"><SelectValue placeholder="Campaign / Product">{(v: string) => (v === "all" ? "Mọi campaign" : v)}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi campaign</SelectItem>
            {productOptions.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Tìm campaign hoặc creative..."
            className="h-9 pl-8 text-sm border-slate-200"
          />
        </div>

        <Select value={filters.sort} onValueChange={(v) => set("sort", v as AdsContentFilters["sort"])}>
          <SelectTrigger className="h-9 w-[190px] border-slate-200 text-sm"><SelectValue placeholder="Sắp xếp">{(v: string) => SORT_LABEL[v] ?? v}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Hoạt động gần nhất</SelectItem>
            <SelectItem value="spend_desc">Chi tiêu cao nhất</SelectItem>
            <SelectItem value="clicks_desc">Clicks cao nhất</SelectItem>
            <SelectItem value="name_asc">Tên A → Z</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
