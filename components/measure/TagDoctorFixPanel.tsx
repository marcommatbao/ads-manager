// ============================================================
// Sửa trên Google — chọn việc, xem trước (validateOnly), rồi ghi thật + đọc
// lại. Con của TagDoctorView (Đợt 4 · bổ sung).
// ------------------------------------------------------------
// QUAN TRỌNG: chỉ `import type` từ lib/measure/* (kéo theo google-ads-api/fs
// qua tag-doctor.ts/google-goal-fix.ts). CONFIRM_TEXT không import từ
// lib/measure/google-goal-fix — lấy từ prop `confirmText` (payload API).
// Luật cần-xác-nhận-mất-tín-hiệu MÔ PHỎNG lại luật server (server luôn kiểm
// lại thật, đây chỉ là gợi ý UI): chọn có ackIfAlone[id]===true mà không có
// việc action_primary nào chọn với after===true → cần tick xác nhận.
// ============================================================
"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { datetimeVN } from "@/components/case/format";
import { postJson, ApiError } from "@/components/case/api";
import { cn } from "@/lib/utils";
import type { Company } from "@/lib/case/types";
import type { GoogleFixProposal } from "@/lib/measure/tag-doctor";
import type { GoalFixExecution } from "@/lib/measure/google-goal-fix";

/** "Trước → Sau" theo loại việc — không import yesNo() của lib (đó là giá trị, không phải kiểu). */
function beforeAfterText(f: GoogleFixProposal, v: boolean): string {
  return f.kind === "goal_biddable" ? (v ? "Đặt giá" : "Không đặt giá") : v ? "Chính" : "Phụ";
}

export function TagDoctorFixPanel({
  company,
  fixes,
  ackIfAlone,
  confirmText,
  canEdit,
  highlightIds,
  onChanged,
}: {
  company: Company;
  fixes: GoogleFixProposal[];
  ackIfAlone: Record<string, boolean>;
  confirmText: string;
  canEdit: boolean;
  highlightIds: string[] | null;
  onChanged: (force?: boolean) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<GoalFixExecution | null>(null);
  const [writing, setWriting] = useState(false);
  const [writeResult, setWriteResult] = useState<GoalFixExecution | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [ackChecked, setAckChecked] = useState(false);

  const selectedFixes = fixes.filter((f) => selected[f.id]);
  const selectedIds = selectedFixes.map((f) => f.id);
  const hasPrimaryOn = selectedFixes.some((f) => f.kind === "action_primary" && f.after === true);
  const needsAck = selectedFixes.some((f) => ackIfAlone[f.id]) && !hasPrimaryOn;

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
    setValidateResult(null);
    setWriteResult(null);
    setErr(null);
  }

  async function runValidate() {
    setValidating(true);
    setErr(null);
    setValidateResult(null);
    try {
      const json: { execution: GoalFixExecution } = await postJson("/api/measure/google-fix", { company, fixIds: selectedIds, validateOnly: true });
      setValidateResult(json.execution);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không kiểm được — thử lại sau");
    } finally {
      setValidating(false);
    }
  }

  function openConfirm() {
    setConfirmInput("");
    setAckChecked(false);
    setConfirmOpen(true);
  }

  async function runWrite() {
    setWriting(true);
    setErr(null);
    try {
      const json: { execution: GoalFixExecution } = await postJson("/api/measure/google-fix", {
        company, fixIds: selectedIds, validateOnly: false, confirmText: confirmInput, acknowledgeNoSignal: ackChecked,
      });
      setWriteResult(json.execution);
      setValidateResult(null);
      setConfirmOpen(false);
      setSelected({});
      await onChanged(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không ghi được — thử lại sau");
    } finally {
      setWriting(false);
    }
  }

  const canWrite = confirmInput.trim() === confirmText && (!needsAck || ackChecked);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Không có việc nào được chọn sẵn — tự chọn từng việc muốn ghi.</p>

      <div className="space-y-2">
        {fixes.map((f) => (
          <div
            key={f.id}
            id={`fix-row-${f.id}`}
            className={cn(
              "flex gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition-colors",
              highlightIds?.includes(f.id) && "border-blue-400 bg-blue-50 ring-2 ring-blue-300",
            )}
          >
            {/* Không bọc <label htmlFor> ngoài Checkbox — Checkbox tự thân đã là
                một <label> (xem components/ui/checkbox.tsx); lồng thêm label
                ngoài sẽ phát sinh click kép khiến chọn/bỏ chọn tự huỷ nhau. */}
            <Checkbox id={`fix-${f.id}`} aria-label={f.label} checked={!!selected[f.id]} onCheckedChange={() => toggle(f.id)} className="mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-slate-800">{f.label}</div>
              <div className="mt-1 text-slate-500">
                Trước: <span className="font-medium text-slate-700">{beforeAfterText(f, f.before)}</span> → Sau: <span className="font-medium text-slate-700">{beforeAfterText(f, f.after)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <span className="text-xs text-slate-500">{!canEdit && "Cần quyền chỉnh sửa"}</span>
        <div className="flex flex-wrap gap-2">
          <Button className="h-10" variant="outline" size="sm" onClick={runValidate} disabled={!canEdit || validating || writing || selectedIds.length === 0}>
            {validating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Kiểm trước (không ghi)
          </Button>
          <Button className="h-10" size="sm" onClick={openConfirm} disabled={!canEdit || validating || writing || selectedIds.length === 0}>
            Xác nhận ghi
          </Button>
        </div>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {validateResult && (
        <div>
          <div className="mb-1.5 text-sm font-semibold text-slate-800">Kết quả kiểm trước (chưa ghi)</div>
          <ExecutionCard exec={validateResult} title={validateResult.status === "done" ? "Google chấp nhận — CHƯA ghi gì lên tài khoản" : "Google từ chối khi kiểm — chưa ghi gì"} />
        </div>
      )}

      {writeResult && (
        <div>
          <div className="mb-1.5 text-sm font-semibold text-slate-800">Kết quả ghi</div>
          <ExecutionCard exec={writeResult} title={writeResult.status === "done" ? "Đã ghi và đọc lại khớp" : "Ghi thất bại — xem lỗi bên dưới"} />
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Ghi lên tài khoản thật?</DialogTitle>
            <DialogDescription>
              Đổi mục tiêu cấp tài khoản tác động <b>NGAY</b> lên mọi chiến dịch dùng mục tiêu tài khoản. {selectedIds.length} việc sẽ được ghi lên Google Ads {company}. Có thể hoàn tác.
            </DialogDescription>
          </DialogHeader>

          {needsAck && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <div className="font-semibold">⚠ Sau thay đổi, không hành động Mua hàng CHÍNH nào có lượt trong 7 ngày.</div>
              <div className="mt-2 flex items-start gap-2">
                <Checkbox id="tag-doctor-ack" aria-label="Tôi hiểu Google sẽ mất tín hiệu đặt giá tới khi Purchase bắn lại" checked={ackChecked} onCheckedChange={setAckChecked} className="mt-0.5" />
                <span>Tôi hiểu Google sẽ mất tín hiệu đặt giá tới khi Purchase bắn lại</span>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="tag-doctor-confirm-input" className="text-xs font-medium text-slate-600">Gõ <code>{confirmText}</code> để xác nhận</label>
            <input
              id="tag-doctor-confirm-input"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder={confirmText}
              autoComplete="off"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button className="h-10" variant="outline" />}>Huỷ</DialogClose>
            <Button className="h-10" variant="destructive" onClick={runWrite} disabled={!canWrite || writing}>
              {writing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Ghi lên tài khoản thật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Thẻ hiển thị kết quả 1 lần validate/write/lịch sử — dùng chung ở đây + TagDoctorView (lịch sử). */
export function ExecutionCard({ exec, title }: { exec: GoalFixExecution; title: string }) {
  const ok = exec.status === "done";
  const validate = exec.mode === "validate";
  return (
    <div className={cn("rounded-xl border p-3.5 text-sm", !ok ? "border-red-200 bg-red-50" : validate ? "border-sky-200 bg-sky-50" : "border-emerald-200 bg-emerald-50")}>
      <div className={cn("flex items-center gap-1.5 font-semibold", !ok ? "text-red-700" : validate ? "text-sky-800" : "text-emerald-700")}>
        {ok ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
        {title}
        <span className="ml-auto font-normal text-slate-400">{datetimeVN(exec.at)}</span>
      </div>

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
                <th className="px-2.5 py-1.5 font-medium">Trước</th>
                <th className="px-2.5 py-1.5 font-medium">Sau</th>
                <th className="px-2.5 py-1.5 font-medium">Dự kiến</th>
                <th className="px-2.5 py-1.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {exec.readback.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="px-2.5 py-1.5 text-slate-700">{r.label}</td>
                  <td className="px-2.5 py-1.5 tabular-nums text-slate-600">{r.before}</td>
                  <td className="px-2.5 py-1.5 tabular-nums text-slate-600">{r.after}</td>
                  <td className="px-2.5 py-1.5 tabular-nums text-slate-600">{r.expected}</td>
                  <td className="px-2.5 py-1.5">{r.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
