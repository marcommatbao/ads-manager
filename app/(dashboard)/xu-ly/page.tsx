"use client";

// ============================================================
// Tổng quan "Xử lý chiến dịch" — chiến dịch nào đang tiêu vượt mục tiêu,
// xếp theo số tiền chi vượt trần (API đã sắp; trang chỉ hiển thị).
// ============================================================

import { Suspense, useState } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Loader2, RefreshCw, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useSession } from "@/components/SessionProvider";
import { resolveCompanyScope } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/case/StatusPill";
import { vnd, num, roas as fmtRoas } from "@/components/case/format";
import { getJson, postJson, ApiError } from "@/components/case/api";
import { metaObjectiveLabel } from "@/components/case/meta-copy";
import { DateRangeControl, type DateRangeValue } from "@/components/DateRangeControl";
import { DEFAULT_VIEW_DAYS, MAX_RANGE_DAYS, MIN_CASE_DAYS, isYmd, lastDays, rangeDays } from "@/lib/case/dates";
import type { Company } from "@/lib/case/types";
import type { OverviewRow, Platform } from "@/lib/case/service";
import { orderedCompanyIds, companyLabel } from "@/lib/companies/registry";

/** Đọc `?from=&to=` từ URL ở LẦN RENDER ĐẦU (reload/back) — không hợp lệ thì về mặc định 30 ngày. */
function initialRange(sp: ReturnType<typeof useSearchParams>): DateRangeValue {
  const from = sp.get("from");
  const to = sp.get("to");
  if (isYmd(from) && isYmd(to) && from <= to) return { from, to };
  return lastDays(DEFAULT_VIEW_DAYS);
}

export default function XuLyOverviewPage() {
  // useSearchParams bắt buộc Suspense boundary khi build tĩnh (xem
  // node_modules/next/dist/docs/.../use-search-params.md) — bọc ở default export.
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl p-6"><OverviewSkeleton /></div>}>
      <XuLyOverviewPageInner />
    </Suspense>
  );
}

function XuLyOverviewPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useSession();
  const allowedCompanies = resolveCompanyScope(user?.companies, user?.role);
  const [company, setCompany] = useState<Company>(() => orderedCompanyIds(["MBI"])[0] ?? "MBI"); // Đợt 25: công ty theo bản cài (bản Mắt Bão y như cũ)
  const [channel, setChannel] = useState<Platform>("google");
  const [range, setRange] = useState<DateRangeValue>(() => initialRange(searchParams));
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openErr, setOpenErr] = useState<Record<string, string>>({});

  const effectiveCompany = allowedCompanies.includes(company) ? company : allowedCompanies[0];
  const channelLabel = channel === "facebook" ? "Meta" : "Google Ads";
  const rangeTooShortForCase = rangeDays(range) < MIN_CASE_DAYS;

  function handleRangeChange(next: DateRangeValue) {
    setRange(next);
    router.replace(`/xu-ly?from=${next.from}&to=${next.to}`, { scroll: false });
  }

  const { data, error, isLoading, mutate } = useSWR<{
    success: true; company: Company; range: { from: string; to: string };
    rows: OverviewRow[]; totals: { cost: number; orders: number; leads?: number; orderValue: number; overCeiling: number; redCount: number };
  }>(
    effectiveCompany ? `/api/cases/overview?company=${effectiveCompany}&from=${range.from}&to=${range.to}&platform=${channel}` : null,
    getJson,
  );

  const rows = data?.rows ?? [];
  const showRoas = rows.filter((r) => r.target?.basis === "roas").length > rows.filter((r) => r.target?.basis === "cpa").length;

  async function openCase(row: OverviewRow) {
    if (rangeTooShortForCase) {
      setOpenErr((prev) => ({ ...prev, [row.campaignId]: `Mở phiên cần khoảng ít nhất ${MIN_CASE_DAYS} ngày — khoảng này được lưu làm mốc "trước" để so với đo lại 7/14 ngày.` }));
      return;
    }
    setOpeningId(row.campaignId);
    setOpenErr((prev) => { const n = { ...prev }; delete n[row.campaignId]; return n; });
    try {
      const json = await postJson("/api/cases", { company: effectiveCompany, campaignId: row.campaignId, platform: channel, from: range.from, to: range.to });
      router.push(`/xu-ly/${json.case.id}`);
    } catch (e) {
      setOpenErr((prev) => ({ ...prev, [row.campaignId]: e instanceof ApiError ? e.message : "Không mở được phiên" }));
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Stethoscope className="h-5 w-5 text-blue-600" aria-hidden="true" /> Xử lý chiến dịch
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Chiến dịch nào đang tiêu tiền vượt mục tiêu — xếp theo số tiền chi vượt trần, lớn nhất lên đầu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeControl value={range} onChange={handleRangeChange} maxDays={MAX_RANGE_DAYS} />
          <Button className="h-10" variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} aria-hidden="true" /> Tải lại
          </Button>
        </div>
      </div>

      {rangeTooShortForCase && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          Khoảng đang xem chỉ {rangeDays(range)} ngày — mở phiên xử lý cần ít nhất {MIN_CASE_DAYS} ngày (khoảng này được lưu làm mốc &quot;trước&quot; để so với đo lại 7/14 ngày). Chọn khoảng dài hơn để mở phiên.
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div>
          <div className="mb-1 text-xs font-medium text-slate-400">Kênh</div>
          <div role="tablist" aria-label="Kênh" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              role="tab"
              aria-selected={channel === "google"}
              onClick={() => setChannel("google")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                channel === "google" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              Google Ads
            </button>
            <button
              role="tab"
              aria-selected={channel === "facebook"}
              onClick={() => setChannel("facebook")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                channel === "facebook" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              Facebook
            </button>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-400">Công ty</div>
          <div role="tablist" aria-label="Công ty" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(orderedCompanyIds(["MBI", "MBC"]) as Company[]).map((v) => {
              const allowed = allowedCompanies.includes(v);
              return (
                <button
                  key={v}
                  role="tab"
                  aria-selected={effectiveCompany === v}
                  disabled={!allowed}
                  onClick={() => setCompany(v)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                    effectiveCompany === v ? "bg-blue-600 text-white" : allowed ? "text-slate-600 hover:bg-slate-50" : "cursor-not-allowed text-slate-300",
                  )}
                >
                  {v === "MBC" || v === "MBI" ? v : companyLabel(v)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {allowedCompanies.length === 0 && (
        <EmptyState icon={AlertTriangle} title="Tài khoản của bạn chưa được gán công ty nào" description="Liên hệ quản trị để được cấp quyền MBI hoặc MBC." />
      )}

      {allowedCompanies.length > 0 && isLoading && <OverviewSkeleton />}

      {allowedCompanies.length > 0 && !isLoading && error && (
        <EmptyState
          icon={AlertTriangle}
          title={`Không đọc được số liệu ${channelLabel}`}
          description={error instanceof ApiError ? error.message : "Có lỗi khi tải dữ liệu — số liệu cũ không được hiển thị để tránh xử lý trên dữ liệu lỗi thời."}
          action={<Button className="h-10" onClick={() => mutate()}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Thử lại</Button>}
        />
      )}

      {allowedCompanies.length > 0 && !isLoading && !error && data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Tổng chi" value={vnd(data.totals.cost)} sub={`${rows.length} chiến dịch có chi tiêu`} />
            <Kpi label="Đơn mua" value={num(data.totals.orders)} sub={data.totals.leads ? `Mục tiêu cuối: Mua hàng · thêm ${num(data.totals.leads)} lead (chấm riêng theo CPL)` : "Mục tiêu cuối: Mua hàng"} />
            {showRoas ? (
              <Kpi label="ROAS chung" value={data.totals.cost > 0 ? fmtRoas(data.totals.orderValue / data.totals.cost) : "—"} sub={`Giá trị ${vnd(data.totals.orderValue)}`} />
            ) : (
              <Kpi label="Chi phí/đơn" value={data.totals.orders > 0 ? vnd(data.totals.cost / data.totals.orders) : "—"} bad={data.totals.orders === 0 && data.totals.cost > 0} />
            )}
            <Kpi label="Chi vượt trần" value={vnd(data.totals.overCeiling)} sub={`Ở ${data.totals.redCount} chiến dịch cần xử lý`} bad={data.totals.overCeiling > 0} />
          </div>

          {channel === "facebook" && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              Chấm theo số Meta tự báo. Số Odoo đối chiếu trong từng phiên — Meta thường báo cao hơn Odoo nhiều lần.
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState title="Chưa có chiến dịch nào chi tiêu trong kỳ" description={`Đổi kỳ dữ liệu hoặc kiểm lại tài khoản ${channelLabel}.`} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Chiến dịch</th>
                    <th className="px-3 py-2.5 text-right font-medium">Chi</th>
                    <th className="px-3 py-2.5 text-right font-medium">Click</th>
                    <th className="px-3 py-2.5 text-right font-medium">Đơn</th>
                    <th className="px-3 py-2.5 text-right font-medium">Chi phí/đơn</th>
                    <th className="px-3 py-2.5 text-right font-medium">ROAS</th>
                    <th className="px-3 py-2.5 text-right font-medium">Chi vượt trần</th>
                    <th className="px-3 py-2.5 font-medium">Tình trạng</th>
                    <th className="px-3 py-2.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.campaignId} className="border-b border-slate-50 last:border-0 align-top">
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-800">{r.name}</div>
                        <div className="text-xs text-slate-400">{channel === "facebook" ? metaObjectiveLabel(r.channel) : r.channel} · {r.groupLabel}{r.status === "PAUSED" && <span className="font-semibold text-slate-600"> · Đã dừng</span>}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{vnd(r.perf.cost)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{num(r.perf.clicks)}</td>
                      {/* Đợt 23 (3d): chiến dịch thu lead (Google + Meta) — cột này là số LEAD, chấm theo chi phí mỗi lead; không có ROAS. */}
                      <td className="px-3 py-2.5 text-right tabular-nums">{num(r.perf.orders)}{r.goalKind === "leads" && <span className="ml-1 text-xs font-normal text-slate-400">lead</span>}</td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", r.verdict.status === "red" && "font-semibold text-red-600")}>
                        {r.verdict.cpa !== null ? vnd(r.verdict.cpa) : "—"}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", r.verdict.status === "red" && "font-semibold text-red-600")}>
                        {r.verdict.roas !== null && r.goalKind !== "leads" ? fmtRoas(r.verdict.roas) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-red-600">
                        {r.verdict.overCeiling !== null ? vnd(r.verdict.overCeiling) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill status={r.verdict.status} label={r.verdict.label} />
                        {r.verdict.flags.map((f, i) => (
                          <div key={i} className="mt-1 text-xs text-amber-600">⚠ {f}</div>
                        ))}
                      </td>
                      <td className="px-3 py-2.5">
                        <RowAction
                          row={r}
                          platform={channel}
                          busy={openingId === r.campaignId}
                          rangeTooShort={rangeTooShortForCase}
                          onOpen={() => openCase(r)}
                        />
                        {openErr[r.campaignId] && <div className="mt-1 max-w-[180px] text-xs text-red-600">{openErr[r.campaignId]}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
            <b>Cách xếp hạng:</b> &quot;Chi vượt trần&quot; = chi phí − (trần × số đơn). Chiến dịch 0 đơn chỉ bị đánh đỏ khi đã chi ≥ 1 lần trần; ít hơn thì ghi &quot;Chưa đủ dữ liệu&quot; thay vì kết luận vội.
          </div>
        </>
      )}
    </div>
  );
}

function RowAction({ row, platform, busy, rangeTooShort, onOpen }: { row: OverviewRow; platform: Platform; busy: boolean; rangeTooShort: boolean; onOpen: () => void }) {
  if (row.latestCase) {
    return (
      <Button className="h-10" size="sm" variant="outline" render={<Link href={`/xu-ly/${row.latestCase.id}`} />}>
        Xem phiên
      </Button>
    );
  }
  if (row.verdict.status === "no_target") {
    return (
      <Button className="h-10" size="sm" variant="outline" render={<Link href="/xu-ly/muc-tieu" />}>
        Đặt mục tiêu
      </Button>
    );
  }
  if (row.canOpenCase) {
    return (
      <Button
        className="h-10"
        size="sm"
        onClick={onOpen}
        disabled={busy || rangeTooShort}
        title={rangeTooShort ? `Mở phiên cần khoảng ít nhất ${MIN_CASE_DAYS} ngày` : undefined}
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Mở phiên xử lý
      </Button>
    );
  }
  return <span className="text-xs text-slate-400">{platform === "facebook" ? "Mục tiêu chưa hỗ trợ mở phiên" : "Pmax — đợt 2"}</span>;
}

function Kpi({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("mt-1 text-lg font-bold tabular-nums", bad ? "text-red-600" : "text-slate-900")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}
