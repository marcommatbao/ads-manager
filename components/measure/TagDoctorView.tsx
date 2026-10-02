// ============================================================
// Chẩn đoán gắn thẻ (Đợt 4 · bổ sung) — nội dung tab thứ 3 của "Sức khoẻ đo
// lường". Tự fetch/tự quản loading-error-empty vì API + hình dạng dữ liệu
// khác hẳn health (facebook/google): có ackIfAlone/confirmText/history và
// một luồng ghi thật lên Google (xem TagDoctorFixPanel).
// ------------------------------------------------------------
// QUAN TRỌNG: đây là client component. lib/measure/tag-doctor.ts và
// lib/measure/google-goal-fix.ts kéo theo fs / google-ads-api / odoo-client /
// meta-client ở đầu file — CHỈ được `import type` từ hai module đó, không
// bao giờ import giá trị (hằng số, hàm). Hằng số cần cho UI (vd confirmText)
// lấy thẳng từ payload API trả về, không import từ lib.
// ============================================================
"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, Check, Copy, Info, Loader2, RefreshCw, Stethoscope, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Pill, type PillTone } from "@/components/measure/Pill";
import { SourceTable } from "@/components/measure/SourceTable";
import { datetimeVN, num } from "@/components/case/format";
import { getJson, postJson, ApiError } from "@/components/case/api";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";
import { useSession } from "@/components/SessionProvider";
import { ExecutionCard, TagDoctorFixPanel } from "@/components/measure/TagDoctorFixPanel";
import { GtmFixPanel, type GtmMeta } from "@/components/measure/GtmFixPanel";
import { rangeDays } from "@/lib/case/dates";
import type { DateRangeValue } from "@/components/DateRangeControl";
import type { Company } from "@/lib/case/types";
import type { CanonicalRow, RoadmapStep, TagDoctorReport, TagIssue } from "@/lib/measure/tag-doctor";
import type { GoalFixExecution } from "@/lib/measure/google-goal-fix";
import type { GtmContainer, GtmPixelTag } from "@/lib/measure/gtm";

/** Hình dạng đúng của GET /api/measure/tags — xem app/api/measure/tags/route.ts (KHÔNG sửa nghiệp vụ route,
 *  chỉ đọc để khớp kiểu). Route trả `gtmFix` (không phải `gtm`) cho khối cấu hình sửa GTM — `gtm` đã là
 *  mảng GtmContainer[] của TagDoctorReport (mục 2 "Thẻ Facebook Pixel trong GTM"); đặt trùng tên sẽ bị
 *  object literal phía route ghi đè mất mảng đó (đã sửa ở route.ts, xem chú thích tại đó). */
export interface TagDoctorApiResponse extends TagDoctorReport {
  success: true;
  ackIfAlone: Record<string, boolean>;
  confirmText: string;
  history: GoalFixExecution[];
  gtmFix: GtmMeta;
}

const VERDICT_STYLE: Record<CanonicalRow["verdict"]["tone"], { tone: PillTone; symbol: string }> = {
  ok: { tone: "green", symbol: "✓" },
  warn: { tone: "amber", symbol: "⚠" },
  bad: { tone: "red", symbol: "✕" },
};

const ROADMAP_STYLE: Record<RoadmapStep["status"], { tone: PillTone; symbol: string }> = {
  done: { tone: "green", symbol: "✓" },
  todo: { tone: "amber", symbol: "➜" },
  waiting: { tone: "grey", symbol: "◌" },
};

const SEVERITY_STYLE: Record<TagIssue["severity"], { tone: PillTone; text: string }> = {
  bad: { tone: "red", text: "✕ Nghiêm trọng" },
  warn: { tone: "amber", text: "⚠ Cảnh báo" },
};

const PLATFORM_CHIP: Record<TagIssue["platform"], string> = { meta: "Meta", google: "Google", gtm: "GTM" };

/** Thông điệp thân thiện khi Meta/Google chặn vì vượt hạn mức gọi API (#613…) — cùng luật với app/(dashboard)/do-luong/page.tsx. */
function quotaHint(message: string): string | null {
  return /hạn mức|quota|rate limit|#613/i.test(message) ? "Thử lại sau khoảng 10 phút." : null;
}

function gtmBadge(inGtm: boolean | null): { tone: PillTone; text: string } {
  if (inGtm === true) return { tone: "green", text: "✓ có" };
  if (inGtm === false) return { tone: "red", text: "✕ không" };
  return { tone: "grey", text: "? không rõ" };
}

export function TagDoctorView({ company, range }: { company: Company; range: DateRangeValue }) {
  const { user } = useSession();
  const canEdit = !!user && hasPermission(user.role, "can_edit");

  const url = `/api/measure/tags?company=${company}&from=${range.from}&to=${range.to}`;
  const { data, error, isLoading, mutate } = useSWR<TagDoctorApiResponse>(url, getJson);
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[] | null>(null);
  const [gtmHighlightIds, setGtmHighlightIds] = useState<string[] | null>(null);

  async function reload(force = false) {
    if (!force) {
      await mutate();
      return;
    }
    setPulling(true);
    try {
      const json = await getJson(`${url}&force=1`);
      setPullError(null);
      await mutate(json, { revalidate: false });
    } catch (e) {
      setPullError(e instanceof ApiError ? e.message : "Không kéo lại được số liệu chẩn đoán gắn thẻ");
    } finally {
      setPulling(false);
    }
  }

  function openFixFlow(ids: string[]) {
    setHighlightIds(ids);
    const el = document.getElementById(ids[0] ? `fix-row-${ids[0]}` : "fix-panel") ?? document.getElementById("fix-panel");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setHighlightIds(null), 4000);
  }

  function openGtmFixFlow(ids: string[]) {
    setGtmHighlightIds(ids);
    const el = document.getElementById(ids[0] ? `gtm-fix-row-${ids[0]}` : "gtm-fix-panel") ?? document.getElementById("gtm-fix-panel");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setGtmHighlightIds(null), 4000);
  }

  const errorMessage = pullError ?? (error instanceof ApiError ? error.message : error ? "Có lỗi khi tải dữ liệu chẩn đoán gắn thẻ" : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Stethoscope className="h-4.5 w-4.5 text-blue-600" aria-hidden="true" /> Chẩn đoán gắn thẻ
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Phát hiện sự kiện bắn trùng/sai tên và thẻ cấu hình sai trong GTM — kèm cách sửa từng bước.
          </p>
        </div>
        <Button className="h-10" variant="outline" size="sm" onClick={() => reload(true)} disabled={pulling}>
          {pulling ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          Kéo lại
        </Button>
      </div>

      {isLoading && <TagDoctorSkeleton />}

      {!isLoading && errorMessage && (
        <EmptyState
          icon={AlertTriangle}
          title={errorMessage}
          description={quotaHint(errorMessage) ?? "Số cũ không hiển thị để tránh xử lý trên dữ liệu lỗi thời."}
          action={<Button className="h-10" onClick={() => reload(true)} disabled={pulling}>{pulling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />} Thử lại</Button>}
        />
      )}

      {!isLoading && !errorMessage && data && (
        <>
          {!data.current && (
            <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Khoảng đang xem kết thúc trước hôm nay — chỉ xem số, tool không đề xuất sửa (cấu hình GTM/Google là của hôm nay). Chọn khoảng tới hôm nay để sửa.</span>
            </div>
          )}

          {data.roadmap.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-bold text-slate-900">Lộ trình sửa đo lường Mua hàng</h3>
              <p className="mb-3 text-sm text-slate-500">
                Làm theo thứ tự — sửa thẻ nhầm nhóm TRƯỚC khi Google đặt giá theo Mua hàng sẽ làm mất tín hiệu đặt giá.
              </p>
              <ol className="space-y-2">
                {data.roadmap.map((step, i) => <RoadmapStepCard key={step.id} index={i + 1} step={step} />)}
              </ol>
            </section>
          )}

          <SourceTable sources={data.sources} />

          <section>
            <h3 className="mb-1 text-sm font-bold text-slate-900">1 · Bản chuẩn của từng hành động</h3>
            <p className="mb-3 text-sm text-slate-500">
              So Meta (chuẩn vs tự đặt) với Google (Chính/Phụ) và Odoo cùng kỳ. Nếu bản <b>chuẩn</b> đếm ít hơn hẳn bản <b>tự đặt</b> — sửa nguồn bắn, đừng vội đổi mục tiêu tối ưu sang bản tự đặt.
            </p>
            <CanonicalTable rows={data.canonical} company={company} days={rangeDays(data.range)} />
          </section>

          <section>
            <h3 className="mb-1 text-sm font-bold text-slate-900">2 · Thẻ Facebook Pixel trong GTM</h3>
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              GTM chỉ hướng dẫn — tool không có quyền ghi GTM.
            </div>
            {data.gtm.length === 0 ? (
              <EmptyState compact title="Không đọc được cấu hình GTM" description="Không thấy mã GTM công khai trên trang đích của công ty này." />
            ) : (
              <div className="space-y-4">
                {data.gtm.map((g) => <GtmContainerTable key={g.id} container={g} />)}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-sm font-bold text-slate-900">3 · Vấn đề phát hiện</h3>
            {data.issues.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <Pill tone="green">✓ Không phát hiện vấn đề nào</Pill>
              </div>
            ) : (
              <div className="space-y-3">
                {data.issues.map((issue) => <IssueCard key={issue.id} issue={issue} onFix={openFixFlow} onFixGtm={openGtmFixFlow} />)}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-sm font-bold text-slate-900">4 · Gửi 2 đường</h3>
            {data.dualSource.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">Không có sự kiện nào gửi cả 2 đường trong kỳ.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="px-4 py-2 font-medium">Sự kiện</th>
                      <th className="px-3 py-2 text-right font-medium">Trình duyệt (Pixel)</th>
                      <th className="px-3 py-2 text-right font-medium">Máy chủ (Conversions API)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dualSource.map((d, i) => (
                      <tr key={i} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-slate-800"><code className="text-xs">{d.event}</code></td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{num(d.browser)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{num(d.server)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section id="fix-panel">
            <h3 className="mb-1 text-sm font-bold text-slate-900">5 · Sửa trên Google</h3>
            {data.fixes.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <Pill tone="green">✓ Không có gì cần sửa trên Google</Pill>
              </div>
            ) : (
              <TagDoctorFixPanel
                company={company}
                fixes={data.fixes}
                ackIfAlone={data.ackIfAlone}
                confirmText={data.confirmText}
                canEdit={canEdit}
                highlightIds={highlightIds}
                onChanged={reload}
              />
            )}
          </section>

          <section id="gtm-fix-panel">
            <h3 className="mb-1 text-sm font-bold text-slate-900">6 · Sửa trên GTM</h3>
            <GtmFixPanel
              company={company}
              gtmFixes={data.gtmFixes}
              gtm={data.gtmFix}
              canEdit={canEdit}
              highlightIds={gtmHighlightIds}
              onChanged={reload}
            />
          </section>

          <section>
            <h3 className="mb-1 text-sm font-bold text-slate-900">7 · Lịch sử sửa trên Google</h3>
            <TagDoctorHistory history={data.history} company={company} canEdit={canEdit} onChanged={reload} />
          </section>
        </>
      )}
    </div>
  );
}

function RoadmapStepCard({ index, step }: { index: number; step: RoadmapStep }) {
  const s = ROADMAP_STYLE[step.status];
  const isTodo = step.status === "todo";
  return (
    <li
      className={cn(
        "rounded-xl border p-3.5 text-sm",
        isTodo ? "border-amber-300 bg-amber-50" : step.status === "done" ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            step.status === "done" ? "bg-emerald-100 text-emerald-700" : isTodo ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400",
          )}
        >
          {index}
        </span>
        <Pill tone={s.tone}>{s.symbol} {step.label}</Pill>
      </div>
      <p className="mt-1.5 pl-8 text-xs text-slate-500">{step.evidence}</p>
      {isTodo && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
          <span className="text-sm font-medium text-amber-800">{step.action}</span>
          <Link href={step.href}>
            <Button className="h-8" size="sm">Đi tới bước này →</Button>
          </Link>
        </div>
      )}
    </li>
  );
}

function CanonicalTable({ rows, company, days }: { rows: CanonicalRow[]; company: Company; days: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
            <th className="px-4 py-2 font-medium">Hành động</th>
            <th className="px-3 py-2 font-medium">Meta</th>
            <th className="px-3 py-2 font-medium">Google Ads</th>
            <th className="px-3 py-2 font-medium">Odoo (đơn thật)</th>
            <th className="px-3 py-2 font-medium">Kết luận</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const v = VERDICT_STYLE[row.verdict.tone];
            const odooText = row.key !== "purchase" ? "—" : row.odooOrders !== null ? `${num(row.odooOrders)} đơn` : company === "MBC" ? "chưa có bộ lọc" : "—";
            return (
              <tr key={row.key} className="border-b border-slate-50 last:border-0 align-top">
                <td className="px-4 py-2.5 font-semibold whitespace-nowrap text-slate-800">{row.label}</td>
                <td className="px-3 py-2.5">
                  {row.meta.length === 0 ? (
                    <span className="text-slate-400">Chưa dùng</span>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {row.meta.map((m) => (
                        <div key={m.name}>
                          <code className="text-xs">{m.name}</code>{" "}
                          <Pill tone={m.standard ? "grey" : "amber"} className="ml-1">{m.standard ? "Chuẩn" : "⚠ Tự đặt"}</Pill>
                          <div className="mt-0.5 text-xs text-slate-400 tabular-nums">{days} ngày: {num(m.total)} · 7 ngày: {num(m.last7)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {row.google.length === 0 ? (
                    <span className="text-slate-400">— Không có hành động Google tương ứng</span>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {row.google.map((g, i) => {
                        const badge = gtmBadge(g.inGtm);
                        return (
                          <div key={i}>
                            <code className="text-xs">{g.name}</code>{" "}
                            <span className={cn("ml-1 text-xs font-semibold", g.primary ? "text-slate-800" : "text-slate-500 font-normal")}>{g.primary ? "Chính" : "Phụ"}</span>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400 tabular-nums">
                              <span>{num(g.total, { maximumFractionDigits: 1 })}/{days} · {num(g.last7, { maximumFractionDigits: 1 })}/7 ngày</span>
                              <Pill tone={badge.tone}>GTM: {badge.text}</Pill>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-slate-700">{odooText}</td>
                <td className="px-3 py-2.5 min-w-[220px]">
                  <Pill tone={v.tone} className="whitespace-normal text-left">{v.symbol} {row.verdict.text}</Pill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GtmContainerTable({ container }: { container: GtmContainer }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">
        {container.id} · bản {container.version ?? "?"}
      </div>
      {container.pixelTags.length === 0 ? (
        <div className="p-4 text-sm text-slate-400">Không thấy thẻ Facebook Pixel nào trong container này.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-4 py-2 font-medium">Thẻ</th>
              <th className="px-3 py-2 font-medium">Loại</th>
              <th className="px-3 py-2 font-medium">Sự kiện</th>
              <th className="px-3 py-2 font-medium">event_id</th>
              <th className="px-3 py-2 font-medium">Nguồn</th>
            </tr>
          </thead>
          <tbody>
            {container.pixelTags.map((t: GtmPixelTag, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 font-semibold text-slate-800">{t.tagId}</td>
                <td className="px-3 py-2.5 text-slate-600">{t.kind === "standard" ? "Standard" : "Custom"}</td>
                <td className="px-3 py-2.5">{t.dynamic ? <span className="text-slate-400 italic">tên từ biến</span> : <code className="text-xs">{t.eventName}</code>}</td>
                <td className="px-3 py-2.5">{t.hasEventId ? <Pill tone="green">✓</Pill> : <Pill tone="red">✕</Pill>}</td>
                <td className="px-3 py-2.5 text-slate-600">{t.source === "template" ? "mẫu" : "HTML"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function IssueCard({ issue, onFix, onFixGtm }: { issue: TagIssue; onFix: (ids: string[]) => void; onFixGtm: (ids: string[]) => void }) {
  const sev = SEVERITY_STYLE[issue.severity];
  const isWebTeamNote = issue.id.startsWith("gtm_dl_silent_");
  return (
    <div className={cn("rounded-xl border p-3.5 text-sm", issue.severity === "bad" ? "border-red-200 bg-red-50/50" : "border-amber-200 bg-amber-50/50")}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={sev.tone}>{sev.text}</Pill>
        <Pill tone="blue">{PLATFORM_CHIP[issue.platform]}</Pill>
        <span className="font-semibold text-slate-800">{issue.title}</span>
      </div>
      <p className="mt-2 text-slate-600">{issue.detail}</p>
      {issue.steps.length > 0 && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-700" style={{ listStyle: "decimal" }}>
          {issue.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
      {(issue.fixIds.length > 0 || (issue.gtmFixIds && issue.gtmFixIds.length > 0) || isWebTeamNote) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {issue.fixIds.length > 0 && (
            <Button className="h-10" size="sm" onClick={() => onFix(issue.fixIds)}>Sửa trên Google</Button>
          )}
          {issue.gtmFixIds && issue.gtmFixIds.length > 0 && (
            <Button className="h-10" size="sm" onClick={() => onFixGtm(issue.gtmFixIds!)}>Sửa trên GTM</Button>
          )}
          {isWebTeamNote && <CopyWebTeamStepsButton issue={issue} />}
        </div>
      )}
    </div>
  );
}

/** Lỗi `gtm_dl_silent_*` là việc của đội web (trang không đẩy sự kiện dataLayer) — tool không tự
 *  sửa được, chỉ đưa dặn việc để dán sang kênh trao đổi với đội web. */
function CopyWebTeamStepsButton({ issue }: { issue: TagIssue }) {
  const [copied, setCopied] = useState(false);
  const text = [issue.title, issue.detail, ...issue.steps.map((s, i) => `${i + 1}. ${s}`)].join("\n");
  return (
    <Button
      className="h-10"
      variant="outline"
      size="sm"
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "Đã sao chép" : "Sao chép dặn việc cho đội web"}
    </Button>
  );
}

// Lịch sử dùng chung khối hiển thị readback với TagDoctorFixPanel (component
// con export cả ExecutionCard) — xem import gộp ở đầu file.
function TagDoctorHistory({ history, company, canEdit, onChanged }: { history: GoalFixExecution[]; company: Company; canEdit: boolean; onChanged: (force?: boolean) => void }) {
  const [undoTarget, setUndoTarget] = useState<GoalFixExecution | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runUndo() {
    if (!undoTarget) return;
    setUndoing(true);
    setErr(null);
    try {
      await postJson("/api/measure/google-fix/undo", { company, id: undoTarget.id });
      setUndoTarget(null);
      await onChanged(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không hoàn tác được — thử lại sau");
    } finally {
      setUndoing(false);
    }
  }

  if (history.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">Chưa có lần sửa nào trên Google.</div>;
  }

  return (
    <div className="space-y-3">
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {history.map((ex) => (
        <div key={ex.id} className="space-y-2">
          <ExecutionCard exec={ex} title={ex.status === "done" ? `Đã ghi bởi ${ex.by}` : `Ghi thất bại — bởi ${ex.by}`} />
          {ex.changes.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Việc đã ghi: {ex.changes.map((c) => c.label).join("; ")}
            </div>
          )}
          {ex.undoneAt ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
              <div className="font-semibold">Đã hoàn tác lúc {datetimeVN(ex.undoneAt)}</div>
              {ex.undoReport && ex.undoReport.length > 0 && (
                <ul className="mt-1 list-disc pl-4">{ex.undoReport.map((line, i) => <li key={i}>{line}</li>)}</ul>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              {!canEdit && <span className="text-xs text-slate-500">Cần quyền chỉnh sửa</span>}
              <Button
                className="h-10"
                variant="destructive"
                size="sm"
                onClick={() => setUndoTarget(ex)}
                disabled={!canEdit}
                title={!canEdit ? "Cần quyền chỉnh sửa" : undefined}
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Hoàn tác
              </Button>
            </div>
          )}
        </div>
      ))}

      <Dialog open={!!undoTarget} onOpenChange={(o) => !o && setUndoTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Hoàn tác thay đổi vừa ghi?</DialogTitle>
            <DialogDescription>
              Sẽ đưa mục tiêu đặt giá cấp tài khoản và hành động chính về đúng trạng thái trước khi lần ghi này thực hiện. Chỉ hoàn tác những gì lần ghi này đã đổi — sửa tay của người khác sau đó được giữ nguyên.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button className="h-10" variant="outline" />}>Giữ nguyên</DialogClose>
            <Button className="h-10" variant="destructive" onClick={runUndo} disabled={undoing}>
              {undoing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Hoàn tác
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TagDoctorSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}
