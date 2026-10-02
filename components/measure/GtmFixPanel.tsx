"use client";

// ============================================================
// C2 — Sửa GTM qua API (user chốt 28/09: làm C1 + C2)
// ============================================================
// Chọn đề xuất → "Kiểm trước" (workspace tạm, biên dịch thử rồi XOÁ — không
// publish) → nếu Google chấp nhận thì mở khoá ô XAC NHAN + "Publish lên GTM"
// (workspace mới → phiên bản mới → publish thật). Lịch sử publish + Hoàn tác
// nằm cùng file này để TagDoctorView chỉ cần thêm một section.
// MIRROR UX của components/measure/TagDoctorFixPanel.tsx (Sửa trên Google) —
// đọc file đó trước khi sửa file này.
// ------------------------------------------------------------
// QUAN TRỌNG: đây là client component. lib/measure/tag-doctor.ts và
// lib/measure/gtm-fix.ts kéo theo fs / google-ads-api / odoo-client ở đầu
// file — CHỈ được `import type` từ hai module đó, không bao giờ import giá
// trị (hằng số, hàm). confirmText/maxFixes lấy từ prop `gtm` (payload API).
// ============================================================

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/measure/Pill";
import { datetimeVN } from "@/components/case/format";
import { postJson, ApiError } from "@/components/case/api";
import { cn } from "@/lib/utils";
import type { Company } from "@/lib/case/types";
import type { GtmFixProposal } from "@/lib/measure/tag-doctor";
import type { GtmFixExecution } from "@/lib/measure/gtm-fix";

const KIND_CHIP: Record<GtmFixProposal["kind"], string> = {
  tag_standard: "Đổi sang Standard",
  tag_retrigger: "Đổi trigger",
};

/** Hình dạng của trường `gtm` trong GET /api/measure/tags — xem app/api/measure/tags/route.ts. */
export interface GtmMeta {
  apiConfigured: boolean;
  serviceEmail: string | null;
  confirmText: string;
  maxFixes: number;
  history: GtmFixExecution[];
}

export function GtmFixPanel({
  company,
  gtmFixes,
  gtm,
  canEdit,
  highlightIds,
  onChanged,
}: {
  company: Company;
  gtmFixes: GtmFixProposal[];
  gtm: GtmMeta;
  canEdit: boolean;
  highlightIds: string[] | null;
  onChanged: (force?: boolean) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<GtmFixExecution | null>(null);
  const [writing, setWriting] = useState(false);
  const [writeResult, setWriteResult] = useState<GtmFixExecution | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [ackSignalLoss, setAckSignalLoss] = useState(false);

  const selectedFixes = gtmFixes.filter((f) => selected[f.id]);
  const selectedIds = selectedFixes.map((f) => f.id);
  // Backend chỉ nhận một container mỗi lần — tick sang container khác thì tự bỏ chọn phần cũ.
  const selectedContainer = selectedFixes[0]?.container ?? null;
  const canValidate = selectedIds.length > 0 && selectedIds.length <= gtm.maxFixes;
  const validatedOk = !!validateResult && validateResult.status === "done" && validateResult.errors.length === 0;
  // Đổi trigger có thể làm Google mất tín hiệu đặt giá (user chốt 28/09) — publish
  // phải tích xác nhận riêng, không gộp chung với ô gõ XAC NHAN.
  const selectedSignalWarnings = [...new Set(
    selectedFixes
      .map((f) => (f.kind === "tag_retrigger" ? f.signalWarning : undefined))
      .filter((w): w is string => !!w),
  )];
  const needsSignalAck = selectedSignalWarnings.length > 0;

  function toggle(id: string, container: string) {
    setSelected((s) => {
      const willCheck = !s[id];
      const next = { ...s, [id]: willCheck };
      if (willCheck && selectedContainer && container !== selectedContainer) {
        for (const f of gtmFixes) if (f.container !== container) delete next[f.id];
      }
      return next;
    });
    setValidateResult(null);
    setWriteResult(null);
    setErr(null);
    setAckSignalLoss(false);
  }

  async function runValidate() {
    setValidating(true);
    setErr(null);
    setValidateResult(null);
    try {
      const json: { execution: GtmFixExecution } = await postJson("/api/measure/gtm-fix", { company, fixIds: selectedIds, validateOnly: true });
      setValidateResult(json.execution);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không kiểm được — thử lại sau");
    } finally {
      setValidating(false);
    }
  }

  function openConfirm() {
    setConfirmInput("");
    setAckSignalLoss(false);
    setConfirmOpen(true);
  }

  async function runPublish() {
    setWriting(true);
    setErr(null);
    try {
      const json: { execution: GtmFixExecution } = await postJson("/api/measure/gtm-fix", {
        company, fixIds: selectedIds, validateOnly: false, confirmText: confirmInput, acknowledgeSignalLoss: ackSignalLoss,
      });
      setWriteResult(json.execution);
      setValidateResult(null);
      setConfirmOpen(false);
      setSelected({});
      await onChanged(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không publish được — thử lại sau");
    } finally {
      setWriting(false);
    }
  }

  const canPublish = confirmInput.trim() === gtm.confirmText && (!needsSignalAck || ackSignalLoss);
  const showChecklist = gtm.apiConfigured && gtmFixes.length > 0;

  return (
    <div className="space-y-4">
      {showChecklist && (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-semibold">Publish GTM đổi mã theo dõi trên website THẬT ngay lập tức.</div>
                <div className="mt-1">
                  Tool tạo workspace riêng (không đụng Default Workspace), tạo phiên bản mới rồi publish; Hoàn tác = publish lại phiên bản trước.
                </div>
              </div>
            </div>
          </div>

          <p className="text-sm text-slate-500">
            Không có việc nào được chọn sẵn — tự chọn từng việc muốn publish. Tối đa {gtm.maxFixes} việc một lần, cùng một container GTM.
          </p>

          <div className="space-y-2">
            {gtmFixes.map((f) => {
              const isSelected = !!selected[f.id];
              const otherContainer = !isSelected && selectedContainer !== null && f.container !== selectedContainer;
              const overCap = !isSelected && selectedIds.length >= gtm.maxFixes;
              const disabled = !canEdit || otherContainer || overCap;
              return (
                <div
                  key={f.id}
                  id={`gtm-fix-row-${f.id}`}
                  className={cn(
                    "flex gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition-colors",
                    disabled && !isSelected && "opacity-50",
                    highlightIds?.includes(f.id) && "border-blue-400 bg-blue-50 ring-2 ring-blue-300",
                  )}
                >
                  {/* Không bọc <label htmlFor> ngoài Checkbox — Checkbox tự thân đã là
                      một <label> (xem components/ui/checkbox.tsx). */}
                  <Checkbox
                    id={`gtm-fix-${f.id}`}
                    aria-label={f.label}
                    checked={isSelected}
                    onCheckedChange={() => toggle(f.id, f.container)}
                    disabled={disabled}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill tone="blue">{f.container}</Pill>
                      <Pill tone="grey">{KIND_CHIP[f.kind]}</Pill>
                    </div>
                    <div className="mt-1 font-semibold text-slate-800">{f.label}</div>
                    {f.kind === "tag_retrigger" && f.signalWarning && (
                      <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{f.signalWarning}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <span className="text-xs text-slate-500">{!canEdit && "Cần quyền chỉnh sửa"}</span>
            <div className="flex flex-wrap gap-2">
              <Button className="h-10" variant="outline" size="sm" onClick={runValidate} disabled={!canEdit || validating || writing || !canValidate}>
                {validating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Kiểm trước (không publish)
              </Button>
              <Button className="h-10" variant="destructive" size="sm" onClick={openConfirm} disabled={!canEdit || validating || writing || !validatedOk}>
                Publish lên GTM
              </Button>
            </div>
          </div>

          {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

          {validateResult && (
            <div>
              <div className="mb-1.5 text-sm font-semibold text-slate-800">Kết quả kiểm trước (chưa publish)</div>
              <GtmExecutionCard exec={validateResult} title={validatedOk ? "GTM biên dịch được — chưa publish" : "Kiểm trước thất bại — chưa publish"} />
            </div>
          )}

          {writeResult && (
            <div>
              <div className="mb-1.5 text-sm font-semibold text-slate-800">Kết quả publish</div>
              <GtmExecutionCard exec={writeResult} title={writeResult.status === "done" ? "Đã publish và đọc lại khớp" : "Publish thất bại — xem lỗi bên dưới"} />
            </div>
          )}

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-red-600">Publish lên GTM thật?</DialogTitle>
                <DialogDescription>
                  Đổi mã theo dõi trên website THẬT ngay lập tức. {selectedIds.length} việc sẽ publish lên container {selectedContainer}. Có thể hoàn tác (publish lại bản trước) nếu chưa có ai publish đè lên sau đó.
                </DialogDescription>
              </DialogHeader>

              {needsSignalAck && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div className="space-y-1.5">
                      {selectedSignalWarnings.map((w, i) => <p key={i}>{w}</p>)}
                    </div>
                  </div>
                  {/* Không bọc <label htmlFor> ngoài Checkbox — Checkbox tự thân đã là một <label>. */}
                  <div className="flex items-start gap-2 pl-0.5">
                    <Checkbox
                      id="gtm-fix-ack-signal-loss"
                      aria-label="Tôi hiểu Google sẽ mất tín hiệu đặt giá và vẫn muốn publish"
                      checked={ackSignalLoss}
                      onCheckedChange={setAckSignalLoss}
                      className="mt-0.5"
                    />
                    <span className="text-xs font-medium">Tôi hiểu Google sẽ mất tín hiệu đặt giá và vẫn muốn publish</span>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="gtm-fix-confirm-input" className="text-xs font-medium text-slate-600">Gõ <code>{gtm.confirmText}</code> để xác nhận</label>
                <input
                  id="gtm-fix-confirm-input"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder={gtm.confirmText}
                  autoComplete="off"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                />
              </div>

              <DialogFooter>
                <DialogClose render={<Button className="h-10" variant="outline" />}>Huỷ</DialogClose>
                <Button className="h-10" variant="destructive" onClick={runPublish} disabled={!canPublish || writing}>
                  {writing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Publish lên GTM thật
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {!gtm.apiConfigured && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Chưa cấu hình khoá GTM — chỉ đọc gtm.js công khai, không sửa được.
        </div>
      )}

      {gtm.apiConfigured && gtmFixes.length === 0 && (
        <EmptyState compact title="Không có việc GTM nào tool sửa được" description="Chẩn đoán hiện không đề xuất việc nào tool tự sửa được trên GTM." />
      )}

      <GtmFixHistory history={gtm.history} company={company} canEdit={canEdit} onChanged={onChanged} />
    </div>
  );
}

function GtmFixHistory({
  history,
  company,
  canEdit,
  onChanged,
}: {
  history: GtmFixExecution[];
  company: Company;
  canEdit: boolean;
  onChanged: (force?: boolean) => void | Promise<void>;
}) {
  const [undoTarget, setUndoTarget] = useState<GtmFixExecution | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoErr, setUndoErr] = useState<string | null>(null);
  const [undoReport, setUndoReport] = useState<{ id: string; lines: string[] } | null>(null);

  async function runUndo() {
    if (!undoTarget) return;
    setUndoing(true);
    setUndoErr(null);
    try {
      const json: { report: string[] } = await postJson("/api/measure/gtm-fix/undo", { company, id: undoTarget.id });
      setUndoReport({ id: undoTarget.id, lines: json.report });
      setUndoTarget(null);
      await onChanged(true);
    } catch (e) {
      setUndoErr(e instanceof ApiError ? e.message : "Không hoàn tác được — thử lại sau");
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-slate-800">Lịch sử publish GTM</h4>
      {history.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">Chưa có lần publish GTM nào.</div>
      ) : (
        <div className="space-y-3">
          {undoErr && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{undoErr}</div>}
          {history.map((ex) => (
            <div key={ex.id} className="space-y-2">
              <GtmExecutionCard
                exec={ex}
                title={`${ex.mode === "validate" ? "Kiểm trước" : ex.status === "done" ? "Đã publish" : "Publish thất bại"} · ${ex.container} · bởi ${ex.by}`}
              />
              {undoReport?.id === ex.id && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                  <ul className="list-disc pl-4">{undoReport.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                </div>
              )}
              {ex.undoneAt ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                  <div className="font-semibold">Đã hoàn tác lúc {datetimeVN(ex.undoneAt)}</div>
                  {ex.undoReport && ex.undoReport.length > 0 && <ul className="mt-1 list-disc pl-4">{ex.undoReport.map((l, i) => <li key={i}>{l}</li>)}</ul>}
                </div>
              ) : ex.mode === "write" && ex.newVersionId ? (
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
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!undoTarget} onOpenChange={(o) => !o && setUndoTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Publish lại bản {undoTarget?.prevVersionId}?</DialogTitle>
            <DialogDescription>
              Publish lại phiên bản GTM trước khi tool sửa lần này (container {undoTarget?.container}). Nếu người khác đã publish bản khác sau đó, hệ thống sẽ từ chối để tránh đè lên thay đổi của họ.
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

/** Thẻ hiển thị kết quả 1 lần validate/publish/lịch sử. readback của GTM không có
 *  before/after/expected như Google — chỉ label/ok/note — nên KHÔNG dùng chung
 *  ExecutionCard của TagDoctorFixPanel. */
function GtmExecutionCard({ exec, title }: { exec: GtmFixExecution; title: string }) {
  const ok = exec.status === "done";
  const validate = exec.mode === "validate";
  return (
    <div className={cn("rounded-xl border p-3.5 text-sm", !ok ? "border-red-200 bg-red-50" : validate ? "border-sky-200 bg-sky-50" : "border-emerald-200 bg-emerald-50")}>
      <div className={cn("flex flex-wrap items-center gap-1.5 font-semibold", !ok ? "text-red-700" : validate ? "text-sky-800" : "text-emerald-700")}>
        {ok ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
        {title}
        <span className="ml-auto font-normal text-slate-400">{datetimeVN(exec.at)}</span>
      </div>

      {(exec.prevVersionId || exec.newVersionId) && (
        <div className="mt-2 text-xs text-slate-500">
          Phiên bản: <span className="font-medium text-slate-700">{exec.prevVersionId ?? "?"}</span> → <span className="font-medium text-slate-700">{exec.newVersionId ?? "chưa tạo"}</span>
        </div>
      )}

      {exec.applied.length > 0 && (
        <div className="mt-2 text-xs text-slate-600">Việc đã áp: {exec.applied.map((a) => a.label).join("; ")}</div>
      )}

      {exec.skipped.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-slate-600">{exec.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
      )}
      {exec.errors.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-red-700">{exec.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      )}

      {exec.readback.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-white/60 bg-white/70">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="px-2.5 py-1.5 font-medium">Kiểm tra</th>
                <th className="px-2.5 py-1.5 font-medium">Kết quả</th>
                <th className="px-2.5 py-1.5 font-medium">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {exec.readback.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="px-2.5 py-1.5 text-slate-700">{r.label}</td>
                  <td className="px-2.5 py-1.5">
                    {r.ok
                      ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> ✓</span>
                      : <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="h-3.5 w-3.5" aria-hidden="true" /> ✕</span>}
                  </td>
                  <td className="px-2.5 py-1.5 text-slate-600">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
