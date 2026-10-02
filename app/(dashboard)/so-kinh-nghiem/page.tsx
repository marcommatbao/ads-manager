"use client";

// ============================================================
// Sổ kinh nghiệm — Đợt 7a
// ------------------------------------------------------------
// Học từ những gì đã thắng trong 180 ngày qua, dùng lại khi tạo chiến dịch
// mới (Facebook + Google). Trang chỉ điều phối: fetch (một lượt GET mỗi
// công ty được phép xem — /api/playbook chỉ nhận MỘT company/lượt) + lọc
// client-side + Duyệt/Bỏ/Trả về gợi ý. Thiết kế: docs/DESIGN-DOT7.md.
//
// BUILD RULE: đây là client component — KHÔNG import GIÁ TRỊ từ lib/playbook/*
// (kéo theo fs/meta-client vào bundle trình duyệt). Chỉ `import type` cho các
// kiểu; giá trị chỉ lấy từ lib/permissions, lib/utils, lib/case/dates (an toàn).
// ============================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { BookOpenCheck, Loader2, RefreshCw, Play, CloudDownload, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { resolveCompanyScope } from "@/lib/permissions";
import { getJson, patchJson, postJson, ApiError } from "@/components/case/api";
import { datetimeVN } from "@/components/case/format";
import { PlaybookTable } from "@/components/playbook/PlaybookTable";
import { PlaybookOutcomesSection, type OutcomesApiResponse } from "@/components/playbook/PlaybookOutcomesSection";
import { PLATFORM_LABEL, KIND_GROUP, KIND_GROUP_OPTIONS, STATUS_OPTIONS } from "@/components/playbook/labels";
import type { PlaybookFile, PlaybookEntry, EntryStatus } from "@/lib/playbook/store";
import type { Platform } from "@/lib/playbook/engine";
import type { Company } from "@/lib/case/types";

interface PlaybookApiResponse extends PlaybookFile {
  metaCoverage: { have: number; need: number };
  canDecide: boolean;
  canRunNow: boolean;
}

const DECISION_TOAST: Record<"approved" | "rejected" | "suggested", string> = {
  approved: "Đã duyệt — dùng như độ tin cậy Cao ở lần tạo chiến dịch tiếp theo",
  rejected: "Đã bỏ — sẽ không dùng/gợi ý lại trừ khi bằng chứng tăng gấp đôi",
  suggested: "Đã trả về Gợi ý",
};

export default function SoKinhNghiemPage() {
  const { user } = useSession();
  const { toast } = useToast();

  const allowedCompanies = useMemo(
    () => resolveCompanyScope(user?.companies, user?.role),
    [user],
  );

  const swrKey =
    user && allowedCompanies.length > 0
      ? `playbook:${[...allowedCompanies].sort().join(",")}`
      : null;
  const { data, error, isLoading, mutate } = useSWR<PlaybookApiResponse[]>(swrKey, () =>
    Promise.all(allowedCompanies.map((co) => getJson(`/api/playbook?company=${co}`))),
  );

  // Kết quả áp dụng (Đợt 9 · 4 / 7c) — nguồn RIÊNG (/api/playbook/outcomes), route không trả lại
  // `company` nên ghép vào ngay lúc fetch.
  const outcomesKey =
    user && allowedCompanies.length > 0
      ? `playbook-outcomes:${[...allowedCompanies].sort().join(",")}`
      : null;
  const { data: outcomesData, error: outcomesError, isLoading: outcomesLoading, mutate: mutateOutcomes } = useSWR<OutcomesApiResponse[]>(outcomesKey, () =>
    Promise.all(allowedCompanies.map((co) => getJson(`/api/playbook/outcomes?company=${co}`).then((r) => ({ ...r, company: co })))),
  );

  const [companyFilter, setCompanyFilter] = useState<Company | "">("");
  const [platformFilter, setPlatformFilter] = useState<Platform | "">("");
  const [productFilter, setProductFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<EntryStatus | "">("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [running, setRunning] = useState<"playbook_extract" | "playbook_meta_sync" | null>(null);

  const companies = data ?? [];
  const allEntries = companies.flatMap((c) => c.entries);
  const updatedAt = companies.reduce<string | null>(
    (latest, c) => (!c.updatedAt ? latest : !latest || c.updatedAt > latest ? c.updatedAt : latest),
    null,
  );
  const metaCoverage = companies[0]?.metaCoverage ?? { have: 0, need: 12 };
  const canDecide = companies.some((c) => c.canDecide);
  const canRunNow = companies.some((c) => c.canRunNow);
  const neverRan = companies.length > 0 && companies.every((c) => !c.updatedAt);
  const hasAnyEntry = allEntries.length > 0;

  const productOptions = useMemo(
    () => Array.from(new Set(allEntries.map((e) => e.product))).sort(),
    [allEntries],
  );

  const filtered = allEntries.filter(
    (e) =>
      (!companyFilter || e.company === companyFilter) &&
      (!platformFilter || e.platform === platformFilter) &&
      (!productFilter || e.product === productFilter) &&
      (!kindFilter || KIND_GROUP[e.kind] === kindFilter) &&
      (!statusFilter || e.status === statusFilter),
  );
  const useEntries = filtered.filter((e) => e.direction === "use");
  const avoidEntries = filtered.filter((e) => e.direction === "avoid");
  const hasActiveFilters = !!(companyFilter || platformFilter || productFilter || kindFilter || statusFilter);

  async function decide(entry: PlaybookEntry, decision: "approved" | "rejected" | "suggested") {
    setActingId(entry.id);
    try {
      await patchJson("/api/playbook/entry", { company: entry.company, id: entry.id, decision });
      await mutate();
      toast({ title: DECISION_TOAST[decision], variant: "success" });
    } catch (e) {
      toast({
        title: "Không lưu được quyết định",
        description: e instanceof ApiError ? e.message : "Có lỗi xảy ra, thử lại.",
        variant: "error",
      });
    } finally {
      setActingId(null);
    }
  }

  async function runJob(jobId: "playbook_extract" | "playbook_meta_sync") {
    setRunning(jobId);
    try {
      const res = await postJson(`/api/jobs/${jobId}/trigger`);
      await mutate();
      toast({
        title: res?.success ? "Đã chạy xong" : "Job báo lỗi — xem chi tiết ở /settings/jobs",
        description:
          jobId === "playbook_extract"
            ? "Sổ kinh nghiệm đã chấm/bóc lại 180 ngày gần nhất."
            : "Đã tải thêm một khoảng 15 ngày số Meta.",
        variant: res?.success ? "success" : "error",
      });
    } catch (e) {
      toast({
        title: "Không chạy được job",
        description: e instanceof ApiError ? e.message : "Có lỗi xảy ra, thử lại.",
        variant: "error",
      });
    } finally {
      setRunning(null);
    }
  }

  const resetFilters = () => {
    setCompanyFilter("");
    setPlatformFilter("");
    setProductFilter("");
    setKindFilter("");
    setStatusFilter("");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <BookOpenCheck className="h-5 w-5 text-blue-600" aria-hidden="true" /> Sổ kinh nghiệm
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Học từ những gì đã thắng — dùng khi tạo chiến dịch mới.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Cập nhật mỗi thứ Hai 04:00 · đọc 180 ngày · lần cuối{" "}
            <b className="text-slate-500">{updatedAt ? datetimeVN(updatedAt) : "Chưa chạy lần nào"}</b>
          </p>
        </div>
        {canRunNow && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => runJob("playbook_meta_sync")} disabled={!!running}>
              {running === "playbook_meta_sync" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CloudDownload className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Tải thêm số Meta
            </Button>
            <Button size="sm" onClick={() => runJob("playbook_extract")} disabled={!!running}>
              {running === "playbook_extract" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Chạy lại bây giờ
            </Button>
          </div>
        )}
      </div>

      {metaCoverage.have < metaCoverage.need && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          ⚠ Meta đang tải dần: {metaCoverage.have}/{metaCoverage.need} khoảng — kinh nghiệm Meta dựa trên{" "}
          {metaCoverage.have * 15} ngày.
        </div>
      )}

      {companies.some((c) => c.notes.length > 0) && (
        <ul className="space-y-0.5 text-xs text-slate-400">
          {companies.flatMap((c) =>
            c.notes.map((n, i) => (
              <li key={`${c.company}-${i}`}>
                <span className="font-medium text-slate-500">{c.company}:</span> {n}
              </li>
            )),
          )}
        </ul>
      )}

      {isLoading && <div className="h-40 animate-pulse rounded-xl bg-slate-100" />}

      {error && !isLoading && (
        <EmptyState
          icon={AlertCircle}
          title="Chưa tải được Sổ kinh nghiệm"
          description={error instanceof ApiError ? error.message : "Không kết nối được API."}
          action={
            <Button variant="outline" size="sm" onClick={() => mutate()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Thử lại
            </Button>
          }
        />
      )}

      {!isLoading && !error && neverRan && (
        <EmptyState
          icon={BookOpenCheck}
          title="Chưa chạy lần nào — job chạy thứ Hai 04:00"
          description="Đợi đến kỳ chạy tự động, hoặc bấm chạy tay nếu bạn là Super Admin."
          action={
            canRunNow ? (
              <Button size="sm" onClick={() => runJob("playbook_extract")} disabled={!!running}>
                {running === "playbook_extract" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Chạy lại bây giờ
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && !error && !neverRan && (
        <>
          <div>
            <h2 className="mb-1 text-sm font-semibold text-slate-700">Lọc</h2>
            <div className="flex flex-wrap gap-3">
              {allowedCompanies.length > 1 && (
                <div>
                  <div className="mb-1 text-xs font-medium text-slate-400">Công ty</div>
                  <div role="tablist" aria-label="Công ty" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                    {(["", ...allowedCompanies] as (Company | "")[]).map((c) => (
                      <button
                        key={c || "all"}
                        role="tab"
                        aria-selected={companyFilter === c}
                        onClick={() => setCompanyFilter(c)}
                        className={
                          companyFilter === c
                            ? "rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
                            : "rounded-md px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                        }
                      >
                        {c || "Tất cả"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="min-w-[150px]">
                <div className="mb-1 text-xs font-medium text-slate-400">Nền tảng</div>
                <Select value={platformFilter || "ALL"} onValueChange={(v) => setPlatformFilter((v && v !== "ALL" ? v : "") as Platform | "")}>
                  <SelectTrigger aria-label="Nền tảng">
                    <SelectValue>{(v: string) => (v === "ALL" ? "Tất cả" : PLATFORM_LABEL[v as Platform] ?? v)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[200px]">
                <div className="mb-1 text-xs font-medium text-slate-400">Sản phẩm</div>
                <Select value={productFilter || "ALL"} onValueChange={(v) => setProductFilter(v && v !== "ALL" ? v : "")}>
                  <SelectTrigger aria-label="Sản phẩm">
                    <SelectValue>{(v: string) => (v === "ALL" ? "Tất cả" : v)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả</SelectItem>
                    {productOptions.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[210px]">
                <div className="mb-1 text-xs font-medium text-slate-400">Loại</div>
                <Select value={kindFilter || "ALL"} onValueChange={(v) => setKindFilter(v && v !== "ALL" ? v : "")}>
                  <SelectTrigger aria-label="Loại">
                    <SelectValue>{(v: string) => (v === "ALL" ? "Tất cả" : v)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả</SelectItem>
                    {KIND_GROUP_OPTIONS.map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[160px]">
                <div className="mb-1 text-xs font-medium text-slate-400">Trạng thái</div>
                <Select value={statusFilter || "ALL"} onValueChange={(v) => setStatusFilter((v && v !== "ALL" ? v : "") as EntryStatus | "")}>
                  <SelectTrigger aria-label="Trạng thái">
                    <SelectValue>
                      {(v: string) => (v === "ALL" ? "Tất cả" : STATUS_OPTIONS.find((s) => s.value === v)?.label ?? v)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <div className="flex items-end">
                  <Button variant="outline" size="sm" onClick={resetFilters}>Xoá bộ lọc</Button>
                </div>
              )}
            </div>
          </div>

          <PlaybookTable
            title="Nên dùng"
            description="Đặc điểm lặp lại ở nhiều đơn vị thắng — bấm “Bằng chứng” để xem chiến dịch/nhóm cụ thể."
            entries={useEntries}
            accent="use"
            canDecide={canDecide}
            actingId={actingId}
            onDecide={decide}
            emptyTitle="Chưa đủ dữ liệu cho lựa chọn này — cần ≥ 2 đơn vị thắng"
            emptyDescription={
              hasAnyEntry
                ? "Đổi lại bộ lọc ở trên, hoặc chờ Sổ kinh nghiệm cập nhật thêm vào thứ Hai tới."
                : "Sản phẩm/công ty này chưa có đủ số lượng nhóm/chiến dịch thắng độc lập để ghi kinh nghiệm. Tiếp tục chạy quảng cáo — Sổ kinh nghiệm cập nhật mỗi thứ Hai 04:00."
            }
          />

          <PlaybookTable
            title="Nên tránh"
            description="Đặc điểm có nhiều đơn vị thua, tiêu tiền mà 0 kết quả — cảnh báo khi chọn đúng điều này lúc tạo chiến dịch mới."
            entries={avoidEntries}
            accent="avoid"
            canDecide={canDecide}
            actingId={actingId}
            onDecide={decide}
            emptyTitle="Chưa có đặc điểm nào bị đánh dấu nên tránh trong bộ lọc này"
            emptyDescription="Đổi lại bộ lọc ở trên để xem nhóm khác, hoặc đây là tin tốt — chưa phát hiện đặc điểm nào đáng tránh."
          />

          <PlaybookOutcomesSection
            responses={outcomesData ?? []}
            loading={outcomesLoading}
            error={outcomesError}
            onReload={mutateOutcomes}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            <span>Dùng kinh nghiệm này khi tạo chiến dịch mới:</span>
            <Button render={<Link href="/creative" />}>Tạo chiến dịch Meta →</Button>
          </div>
        </>
      )}
    </div>
  );
}
