"use client";

// ============================================================
// Liên kết quảng cáo sai quy ước utm (Đợt 4 · B, mở rộng Google 27/09)
// ------------------------------------------------------------
// Meta không cho sửa nội dung quảng cáo đã chạy; Google cho sửa URL đích
// nhưng thay đổi làm quảng cáo bị duyệt lại → cả hai nền tảng tool chỉ PHÁT
// HIỆN + giao việc, không có nút áp trực tiếp. Bảng link chuẩn do người dùng
// nhập tay (readStandardLinks/writeStandardLinks ở lib/measure/utm-links.ts),
// tách theo CÔNG TY và NỀN TẢNG (lib/measure/utm-rules.ts).
// ============================================================

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { AlertTriangle, Copy, Info, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { resolveCompanyScope, hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { vnd, num } from "@/components/case/format";
import { getJson, putJson, ApiError } from "@/components/case/api";
import { Pill, type PillTone } from "@/components/measure/Pill";
import { UTM_RULES, linksOfCompany, type AdPlatform, type LinkProblem, type StandardLink } from "@/lib/measure/utm-rules";
import { DateRangeControl, type DateRangeValue } from "@/components/DateRangeControl";
import { DEFAULT_VIEW_DAYS, MAX_RANGE_DAYS, isYmd, lastDays, rangeDays } from "@/lib/case/dates";
import type { Company } from "@/lib/case/types";
import type { MetaHealth } from "@/lib/measure/meta-health";
import type { GoogleHealth } from "@/lib/measure/google-health";
import type { LinkSuggestion } from "@/lib/measure/utm-suggest";
import { orderedCompanyIds, companyLabel } from "@/lib/companies/registry";

type Platform = AdPlatform;
type HealthResponse =
  | ({ success: true; platform: "facebook" } & MetaHealth)
  | ({ success: true; platform: "google" } & GoogleHealth);
type LinksResponse = { success: true; links: StandardLink[]; updatedBy: string | null; updatedAt: string | null; isDefault: boolean; rules: { source: string; medium: string } };

const PROBLEM_COPY: Record<LinkProblem, { tone: PillTone; text: string }> = {
  missing_utm: { tone: "red", text: "✕ Thiếu utm" },
  wrong_source_medium: { tone: "amber", text: "⚠ Sai source/medium" },
  campaign_not_standard: { tone: "amber", text: "⚠ utm_campaign không có trong bảng chuẩn" },
};

/** Đọc `?from=&to=` từ URL ở LẦN RENDER ĐẦU (reload) — không hợp lệ thì về mặc định 30 ngày. */
function initialRange(sp: ReturnType<typeof useSearchParams>): DateRangeValue {
  const from = sp.get("from");
  const to = sp.get("to");
  if (isYmd(from) && isYmd(to) && from <= to) return { from, to };
  return lastDays(DEFAULT_VIEW_DAYS);
}

export default function DoLuongUtmPage() {
  // useSearchParams bắt buộc Suspense boundary khi build tĩnh (xem
  // node_modules/next/dist/docs/.../use-search-params.md) — bọc ở default export.
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl p-6"><div className="h-64 animate-pulse rounded-xl bg-slate-100" /></div>}>
      <DoLuongUtmPageInner />
    </Suspense>
  );
}

function DoLuongUtmPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useSession();
  const { toast } = useToast();
  const allowedCompanies = resolveCompanyScope(user?.companies, user?.role);
  const canEdit = !!user && hasPermission(user.role, "can_edit_thresholds");
  const [company, setCompany] = useState<Company>(() => orderedCompanyIds(["MBI"])[0] ?? "MBI") // Đợt 25: công ty theo bản cài (bản Mắt Bão y như cũ);
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [range, setRange] = useState<DateRangeValue>(() => initialRange(searchParams));
  const effectiveCompany = allowedCompanies.includes(company) ? company : allowedCompanies[0];
  const rule = UTM_RULES[platform];

  function handleRangeChange(next: DateRangeValue) {
    setRange(next);
    router.replace(`/do-luong/utm?from=${next.from}&to=${next.to}`, { scroll: false });
  }

  const { data: linksMeta, error: linksMetaError, isLoading: linksMetaLoading, mutate: mutateLinksMeta } = useSWR<LinksResponse>("/api/measure/utm-links", getJson);

  const healthUrl = effectiveCompany ? `/api/measure/health?platform=${platform}&company=${effectiveCompany}&from=${range.from}&to=${range.to}` : null;
  const { data: health, error: healthError, isLoading: healthLoading, mutate: mutateHealth } = useSWR<HealthResponse>(healthUrl, getJson);
  const rangeLabel = `${rangeDays(health?.range ?? range)} ngày`;
  const fbHealth = health && health.platform === "facebook" ? health : null;
  const googleHealthData = health && health.platform === "google" ? health : null;
  const googleRows = googleHealthData
    ? googleHealthData.utm.campaigns.flatMap((c) =>
        c.linkIssues.map((li, idx) => ({ key: `${c.campaignId}-${idx}`, campaignName: c.name, url: li.url, check: li.check })),
      )
    : [];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<StandardLink[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function startEdit() {
    setDraft((linksMeta?.links ?? []).map((l) => ({ ...l })));
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError(null);
  }

  function addRow() {
    setDraft((d) => [...d, { company: effectiveCompany ?? (orderedCompanyIds(["MBI"])[0] ?? "MBI"), platform, label: "", url: "" }]);
  }

  function removeRow(idx: number) {
    setDraft((d) => d.filter((_, i) => i !== idx));
  }

  function patchRow(idx: number, patch: Partial<StandardLink>) {
    setDraft((d) => d.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const json = await putJson("/api/measure/utm-links", { links: draft });
      mutateLinksMeta(json, { revalidate: false });
      await mutateHealth(); // tableConfigured/bad phụ thuộc bảng link chuẩn — kéo lại cho khớp
      setEditing(false);
      toast({ title: "✅ Đã lưu bảng link chuẩn" });
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "Không lưu được bảng link chuẩn");
    } finally {
      setSaving(false);
    }
  }

  async function copyTaskText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "✅ Đã sao chép nội dung giao việc" });
    } catch {
      toast({ title: "❌ Không sao chép được", variant: "error" });
    }
  }

  const rowsForCompany = effectiveCompany ? linksOfCompany(linksMeta?.links ?? [], effectiveCompany, platform) : [];
  const draftRowsForCompany = draft.map((r, i) => ({ ...r, i })).filter((r) => r.company === effectiveCompany && (r.platform ?? "facebook") === platform);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <Link href="/do-luong" className="text-sm text-blue-600 hover:underline">← Sức khoẻ đo lường</Link>

      <div>
        <h1 className="text-xl font-bold text-slate-900">Liên kết quảng cáo sai quy ước utm</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Một số quảng cáo đang chạy có liên kết sai quy ước utm — thiếu hẳn, sai <code>utm_source</code>/<code>utm_medium</code>, hoặc <code>utm_campaign</code> không khớp bảng link chuẩn bên dưới. Đơn từ các quảng cáo này không đối chiếu đúng được với Odoo.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="mb-1 text-xs font-medium text-slate-400">Khoảng ngày</div>
          <DateRangeControl value={range} onChange={handleRangeChange} maxDays={MAX_RANGE_DAYS} />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-400">Nền tảng</div>
          <div role="tablist" aria-label="Nền tảng" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {([
              { value: "facebook", label: "Facebook" },
              { value: "google", label: "Google Ads" },
            ] as const).map((p) => (
              <button
                key={p.value}
                role="tab"
                aria-selected={platform === p.value}
                onClick={() => setPlatform(p.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                  platform === p.value ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                {p.label}
              </button>
            ))}
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

      {allowedCompanies.length > 0 && (
      <>
      {/* Bảng link chuẩn */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-800">Bảng link chuẩn (do anh/chị nhập) — {effectiveCompany} · {platform === "facebook" ? "Facebook" : "Google Ads"}</span>
          {canEdit && !editing && (
            <Button size="sm" variant="outline" onClick={startEdit} disabled={linksMetaLoading}>Sửa bảng</Button>
          )}
          {editing && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>Huỷ</Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Lưu
              </Button>
            </div>
          )}
        </div>
        {saveError && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{saveError}</div>}
        {linksMetaLoading && <div className="p-4 text-sm text-slate-400">Đang tải…</div>}
        {linksMetaError && !linksMetaLoading && <div className="p-4 text-sm text-red-600">{linksMetaError instanceof ApiError ? linksMetaError.message : "Không tải được bảng link chuẩn"}</div>}
        {!linksMetaLoading && !linksMetaError && !editing && (
          rowsForCompany.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">Chưa có link chuẩn nào cho {effectiveCompany} · {platform === "facebook" ? "Facebook" : "Google Ads"}.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="px-4 py-2 font-medium">Sản phẩm</th>
                    <th className="px-3 py-2 font-medium">Link chuẩn (utm)</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsForCompany.map((l, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">{l.label}</td>
                      <td className="px-3 py-2.5"><code className="break-all text-xs text-slate-600">{l.url}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        {editing && (
          <div className="space-y-2 p-4">
            {draftRowsForCompany.length === 0 && <div className="text-sm text-slate-400">Chưa có dòng nào — bấm &quot;Thêm dòng&quot; để tạo.</div>}
            {draftRowsForCompany.map((r) => (
              <div key={r.i} className="flex flex-wrap items-center gap-2">
                <Input
                  className="w-48"
                  placeholder="Tên sản phẩm"
                  value={r.label}
                  onChange={(e) => patchRow(r.i, { label: e.target.value })}
                />
                <Input
                  className="min-w-[320px] flex-1 font-mono text-xs"
                  placeholder={`https://matbao.in/...?utm_source=${rule.source}&utm_medium=${rule.media[0]}&utm_campaign=...`}
                  value={r.url}
                  onChange={(e) => patchRow(r.i, { url: e.target.value })}
                />
                <Button size="icon-sm" variant="ghost" aria-label="Xoá dòng" onClick={() => removeRow(r.i)}>
                  <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addRow}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Thêm dòng</Button>
          </div>
        )}
      </div>

      {/* Gợi ý bổ sung bảng link chuẩn (Đợt 9 · 3) */}
      {effectiveCompany && (
        <LinkSuggestSection
          company={effectiveCompany}
          platform={platform}
          canEdit={canEdit}
          existingLinks={linksMeta?.links ?? []}
          onSaved={(json) => { mutateLinksMeta(json, { revalidate: false }); mutateHealth(); }}
        />
      )}

      {/* Quy tắc kiểm */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-sm font-semibold text-slate-800">Quy tắc kiểm — {platform === "facebook" ? "Facebook" : "Google Ads"}</div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"><code>utm_source</code> phải là <b>{rule.source}</b></span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"><code>utm_medium</code> phải là <b>{rule.media.join(" hoặc ")}</b></span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"><code>utm_campaign</code> phải có và nằm trong bảng link chuẩn ở trên</span>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {platform === "facebook" ? (
          <span><b>Vì sao không tự sửa:</b> Meta không cho sửa nội dung quảng cáo đã chạy — thay nội dung (kể cả link) sẽ bị đẩy vào duyệt lại và có thể mất lịch sử tối ưu. Tool chỉ <b>phát hiện</b> và <b>giao việc</b>; gắn đúng link chuẩn khi tạo quảng cáo mới thay thế.</span>
        ) : (
          <span><b>Vì sao không tự sửa:</b> Google cho sửa URL đích nhưng thay đổi làm quảng cáo bị duyệt lại — tool chỉ <b>phát hiện</b> và <b>giao việc</b>.</span>
        )}
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Nhiều chiến dịch dùng chung một <code>utm_campaign</code> (theo sản phẩm) → doanh thu Odoo đọc được theo <b>SẢN PHẨM</b>, không chia riêng cho từng chiến dịch.</span>
      </div>

      {healthLoading && <div className="h-64 animate-pulse rounded-xl bg-slate-100" />}

      {!healthLoading && healthError && (
        <EmptyState
          icon={AlertTriangle}
          title={healthError instanceof ApiError ? healthError.message : "Không đọc được số liệu liên kết"}
          description="Số cũ không hiển thị để tránh xử lý trên dữ liệu lỗi thời."
          action={<Button className="h-10" onClick={() => mutateHealth()}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Thử lại</Button>}
        />
      )}

      {!healthLoading && !healthError && fbHealth && (
        <>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
            {num(fbHealth.links.onPlatform)} liên kết trỏ về Facebook — không kiểm · {num(fbHealth.links.postRead)} quảng cáo bài viết đọc được link bằng token Trang.
          </div>
          {fbHealth.links.postUnreadable > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {num(fbHealth.links.postUnreadable)} quảng cáo bài viết chưa đọc được link — Trang chưa có token: {fbHealth.links.postNoToken.map((p) => p.pageId).join(", ")}.{" "}
                <Link href="/settings#ket-noi" className="font-medium underline underline-offset-2">Thêm token Trang</Link>
              </span>
            </div>
          )}
          {fbHealth.links.postTokenErrors.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Token Trang hết hiệu lực: {fbHealth.links.postTokenErrors.map((p) => p.name ?? p.pageId).join(", ")}.{" "}
                <Link href="/settings#ket-noi" className="font-medium underline underline-offset-2">Thêm token Trang</Link>
              </span>
            </div>
          )}

          {!fbHealth.links.tableConfigured ? (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">
                Chưa có bảng link chuẩn cho {effectiveCompany} — tool chưa chấm
              </div>
              <p className="px-4 pt-3 text-sm text-slate-500">
                Đây là các bộ (utm_source, utm_medium, utm_campaign) đang thấy trên quảng cáo đang chạy. Thêm link chuẩn ở bảng phía trên để tool bắt đầu chấm đúng/sai.
              </p>
              {fbHealth.links.observed.length === 0 ? (
                <div className="p-4 text-sm text-slate-400">Chưa đọc được utm nào trên quảng cáo đang chạy.</div>
              ) : (
                <div className="overflow-x-auto p-4 pt-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                        <th className="py-2 font-medium">utm_source</th>
                        <th className="py-2 font-medium">utm_medium</th>
                        <th className="py-2 font-medium">utm_campaign</th>
                        <th className="py-2 text-right font-medium">Số quảng cáo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fbHealth.links.observed.map((o, i) => (
                        <tr key={i} className="border-b border-slate-50 last:border-0">
                          <td className="py-2"><code className="text-xs">{o.source ?? "(trống)"}</code></td>
                          <td className="py-2"><code className="text-xs">{o.medium ?? "(trống)"}</code></td>
                          <td className="py-2"><code className="text-xs">{o.campaign ?? "(trống)"}</code></td>
                          <td className="py-2 text-right tabular-nums">{num(o.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : fbHealth.links.bad.length === 0 ? (
            <EmptyState title="Không có quảng cáo nào sai quy ước utm" description={`Mọi liên kết đọc được của ${effectiveCompany} đều khớp bảng link chuẩn.`} />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">
                {num(fbHealth.links.bad.length)} quảng cáo sai quy ước utm
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="px-4 py-2 font-medium">Quảng cáo</th>
                      <th className="px-3 py-2 text-right font-medium">Chi {rangeLabel}</th>
                      <th className="px-3 py-2 font-medium">Liên kết hiện tại</th>
                      <th className="px-3 py-2 font-medium">Lỗi</th>
                      <th className="px-3 py-2 font-medium">Link chuẩn gợi ý</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fbHealth.links.bad.map((row) => {
                      const taskText = [
                        `Sửa link cho quảng cáo "${row.adName}" (chiến dịch: ${row.campaignName}).`,
                        `Liên kết hiện tại: ${row.link ?? "(không đọc được)"}`,
                        row.check.suggestion
                          ? `Dùng link chuẩn: ${row.check.suggestion.url}`
                          : "Chưa có link chuẩn cho trang này — bổ sung vào Bảng link chuẩn trước khi giao việc.",
                      ].join("\n");
                      return (
                        <tr key={row.adId} className="border-b border-slate-50 last:border-0 align-top">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-slate-800">{row.adName}</div>
                            <div className="text-xs text-slate-400">{row.campaignName}</div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{vnd(row.cost)}</td>
                          <td className="px-3 py-2.5"><code className="block max-w-[220px] break-all text-xs text-slate-600">{row.link ?? "—"}</code></td>
                          <td className="px-3 py-2.5">
                            <div className="flex max-w-[220px] flex-col gap-1">
                              {row.check.problems.map((p) => {
                                const copy = PROBLEM_COPY[p];
                                return <Pill key={p} tone={copy.tone}>{copy.text}</Pill>;
                              })}
                              {row.check.detail && <div className="text-xs text-slate-500">{row.check.detail}</div>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            {row.check.suggestion ? (
                              <div className="flex max-w-[220px] flex-wrap items-center gap-1.5">
                                <code className="break-all rounded bg-slate-50 px-1.5 py-1 text-[11px] text-slate-600">{row.check.suggestion.url}</code>
                                <Button size="icon-sm" variant="ghost" aria-label="Sao chép link chuẩn" onClick={() => copyTaskText(row.check.suggestion!.url)}>
                                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Chưa có link chuẩn cho trang này — thêm vào bảng</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <Button size="sm" variant="outline" onClick={() => copyTaskText(taskText)}>
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Sao chép nội dung giao việc
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!healthLoading && !healthError && googleHealthData && (
        <>
          {!googleHealthData.utm.tableConfigured ? (
            <EmptyState
              title={`Chưa có bảng link chuẩn Google cho ${effectiveCompany} — tool chưa chấm`}
              description="Thêm link chuẩn Google ở bảng phía trên để tool bắt đầu chấm đúng/sai."
            />
          ) : googleRows.length === 0 ? (
            <EmptyState title="Không có liên kết nào sai quy ước utm" description={`Mọi URL đích đọc được của ${effectiveCompany} trên Google Ads đều khớp bảng link chuẩn.`} />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">
                {num(googleRows.length)} liên kết sai quy ước utm
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="px-4 py-2 font-medium">Chiến dịch</th>
                      <th className="px-3 py-2 font-medium">URL</th>
                      <th className="px-3 py-2 font-medium">Lỗi</th>
                      <th className="px-3 py-2 font-medium">Link chuẩn gợi ý</th>
                    </tr>
                  </thead>
                  <tbody>
                    {googleRows.map((row) => (
                      <tr key={row.key} className="border-b border-slate-50 last:border-0 align-top">
                        <td className="px-4 py-2.5 font-medium text-slate-800">{row.campaignName}</td>
                        <td className="px-3 py-2.5"><code className="block max-w-[260px] break-all font-mono text-xs text-slate-600">{row.url}</code></td>
                        <td className="px-3 py-2.5">
                          <div className="flex max-w-[220px] flex-col gap-1">
                            {row.check.problems.map((p) => {
                              const copy = PROBLEM_COPY[p];
                              return <Pill key={p} tone={copy.tone}>{copy.text}</Pill>;
                            })}
                            {row.check.detail && <div className="text-xs text-slate-500">{row.check.detail}</div>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {row.check.suggestion ? (
                            <div className="flex max-w-[220px] flex-wrap items-center gap-1.5">
                              <code className="break-all rounded bg-slate-50 px-1.5 py-1 text-[11px] text-slate-600">{row.check.suggestion.url}</code>
                              <Button size="icon-sm" variant="ghost" aria-label="Sao chép link chuẩn" onClick={() => copyTaskText(row.check.suggestion!.url)}>
                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Chưa có link chuẩn cho trang này — thêm vào bảng</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}

// ============================================================
// Gợi ý bổ sung bảng link chuẩn (Đợt 9 · 3) — lấy từ link quảng cáo ĐANG CHẠY
// chưa có trong bảng, người duyệt rồi bấm mới ghi (KHÔNG tự động thêm).
// ============================================================
interface SuggestResponse { success: true; suggestions: LinkSuggestion[]; observed: number }
type SuggestDraft = { selected: boolean; label: string; url: string };

function LinkSuggestSection({
  company,
  platform,
  canEdit,
  existingLinks,
  onSaved,
}: {
  company: Company;
  platform: Platform;
  canEdit: boolean;
  existingLinks: StandardLink[];
  onSaved: (json: LinksResponse) => void;
}) {
  const { toast } = useToast();
  const url = `/api/measure/utm-links/suggest?company=${company}&platform=${platform}`;
  const { data, error, isLoading, mutate } = useSWR<SuggestResponse>(url, getJson);
  const [draft, setDraft] = useState<Record<string, SuggestDraft>>({});
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(Object.fromEntries((data?.suggestions ?? []).map((s) => [s.key, { selected: false, label: s.label, url: s.url }])));
    setAddError(null);
  }, [data]);

  const suggestions = data?.suggestions ?? [];
  const chosen = suggestions.filter((s) => draft[s.key]?.selected);

  async function addSelected() {
    if (!chosen.length) return;
    setAdding(true);
    setAddError(null);
    try {
      const newRows: StandardLink[] = chosen.map((s) => ({ company, platform, label: (draft[s.key]?.label ?? s.label).trim(), url: (draft[s.key]?.url ?? s.url).trim() }));
      const json = await putJson("/api/measure/utm-links", { links: [...existingLinks, ...newRows] });
      onSaved(json);
      await mutate();
      toast({ title: `✅ Đã thêm ${newRows.length} dòng vào bảng link chuẩn` });
    } catch (e) {
      setAddError(e instanceof ApiError ? e.message : "Không thêm được — thử lại sau");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <span className="text-sm font-semibold text-slate-800">
          Gợi ý bổ sung bảng link chuẩn — {company} · {platform === "facebook" ? "Facebook" : "Google Ads"}
        </span>
        {canEdit && chosen.length > 0 && (
          <Button size="sm" onClick={addSelected} disabled={adding}>
            {adding && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Thêm {chosen.length} dòng vào bảng
          </Button>
        )}
      </div>
      <p className="px-4 pt-3 text-sm text-slate-500">
        Lấy từ link quảng cáo ĐANG CHẠY: giữ nguyên <code>utm_campaign</code> đang dùng, chỉ chuẩn hoá <code>utm_source</code>/<code>utm_medium</code>. Không sửa quảng cáo nào — chỉ bổ sung bảng để tool chấm đúng.
      </p>
      {addError && <div className="mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{addError}</div>}
      {isLoading && <div className="p-4 text-sm text-slate-400">Đang tải…</div>}
      {!isLoading && error && <div className="p-4 text-sm text-red-600">{error instanceof ApiError ? error.message : "Không tải được gợi ý"}</div>}
      {!isLoading && !error && suggestions.length === 0 && (
        <div className="p-4 text-sm text-slate-400">Mọi link đang chạy đã có trong bảng chuẩn.</div>
      )}
      {!isLoading && !error && suggestions.length > 0 && (
        <div className="space-y-3 p-4">
          {suggestions.map((s) => {
            const d = draft[s.key] ?? { selected: false, label: s.label, url: s.url };
            return (
              <div key={s.key} className="flex flex-wrap items-start gap-2 rounded-lg border border-slate-100 p-3">
                <input
                  type="checkbox"
                  className="mt-2.5 h-4 w-4 shrink-0"
                  checked={d.selected}
                  disabled={!canEdit}
                  onChange={(e) => setDraft((cur) => ({ ...cur, [s.key]: { ...d, selected: e.target.checked } }))}
                  aria-label={`Chọn gợi ý ${s.label}`}
                />
                <div className="min-w-[240px] flex-1 space-y-1.5">
                  <Input
                    className="max-w-xs"
                    value={d.label}
                    disabled={!canEdit}
                    onChange={(e) => setDraft((cur) => ({ ...cur, [s.key]: { ...d, label: e.target.value } }))}
                  />
                  <Input
                    className="font-mono text-xs"
                    value={d.url}
                    disabled={!canEdit}
                    onChange={(e) => setDraft((cur) => ({ ...cur, [s.key]: { ...d, url: e.target.value } }))}
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone="grey">{num(s.ads)} quảng cáo · {vnd(s.cost)}</Pill>
                    {s.campaignProposedByTool && <Pill tone="amber">⚠ tên do tool đề xuất — cần đặt tên</Pill>}
                  </div>
                  {s.variants.length > 0 && (
                    <div className="text-xs text-slate-500">
                      đang gắn: {s.variants.map((v) => `${v.source ?? "(trống)"}/${v.medium ?? "(trống)"} ×${v.count}`).join(", ")}
                    </div>
                  )}
                  {s.campaigns.length > 0 && (
                    <div className="truncate text-xs text-slate-400" title={s.campaigns.join(", ")}>
                      {s.campaigns.join(", ")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!canEdit && suggestions.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Cần quyền chỉnh sửa để thêm vào bảng.</div>
      )}
    </div>
  );
}
