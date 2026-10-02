// ============================================================
// Bước 6 — Duyệt & thực hiện. Ghi thật lên Google Ads: validate → ghi →
// đọc lại so từng dòng. KHÔNG tin phản hồi "thành công" của Google.
// ============================================================
"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Loader2, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { datetimeVN } from "./format";
import { postJson, ApiError } from "./api";
import type { CampaignCase, CaseAction, Execution } from "@/lib/case/store";

/** Chiến dịch/nhóm quảng cáo mà một việc sẽ tác động — dùng ở bảng duyệt trước khi ghi. */
function targetOf(a: CaseAction, c: CampaignCase): string {
  if (a.type === "ADD_TO_SHARED_LIST" || a.type === "REMOVE_FROM_SHARED_LIST") return `Danh sách dùng chung “${a.sharedSetName}”`;
  if (a.type === "ADD_NEGATIVES") return a.campaignIds.map((id) => (id === c.campaignId ? c.campaignName : id)).join(", ");
  if (a.type === "PAUSE_ADSET" || a.type === "EXCLUDE_PLACEMENT") return a.adsetName;
  if (a.type === "CREATE_ADSET_WITH_EVENT") return `Nhóm nguồn: ${a.sourceAdsetName}`;
  if (a.type === "ACTIVATE_NEW_ADSET") return `Nhóm mới ${a.newAdsetId}`;
  return a.campaignId === c.campaignId ? c.campaignName : a.campaignId;
}

export function Step6Execute({
  c,
  onRefresh,
  onBack,
  onNext,
  busy,
}: {
  c: CampaignCase;
  onRefresh: (next: CampaignCase) => void;
  onBack: () => void;
  onNext: () => void;
  busy?: boolean;
}) {
  const idemKeyRef = useRef<string>(crypto.randomUUID());
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<Execution | null>(null);
  const [executing, setExecuting] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [undoExecId, setUndoExecId] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const selected = c.actions.filter((a) => a.selected);
  const hasDone = c.executions.some((e) => e.status === "done");
  const history = [...c.executions].reverse();
  // Bật nhóm mới bắt đầu phân phối thật + học lại từ đầu — bắt gõ đúng chữ trước khi cho ghi.
  const needsActivateConfirm = selected.some((a) => a.type === "ACTIVATE_NEW_ADSET");
  const confirmOk = !needsActivateConfirm || confirmText.trim() === "XAC NHAN";

  async function runValidate() {
    setValidating(true);
    setErr(null);
    setValidateResult(null);
    try {
      const json = await postJson(`/api/cases/${c.id}/execute`, { idempotencyKey: idemKeyRef.current, validateOnly: true });
      setValidateResult(json.execution);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không kiểm được — thử lại sau");
    } finally {
      setValidating(false);
    }
  }

  async function runExecute() {
    setExecuting(true);
    setErr(null);
    try {
      const json = await postJson(`/api/cases/${c.id}/execute`, { idempotencyKey: idemKeyRef.current, validateOnly: false });
      onRefresh(json.case);
      setValidateResult(null);
      // Đổi mã sau MỌI lần ghi đã được xử lý, kể cả thất bại — giữ mã cũ thì
      // lần thử lại chỉ nhận về đúng lần thất bại đã lưu, không thử lại được.
      idemKeyRef.current = crypto.randomUUID();
      setApproveOpen(false);
      setConfirmText("");
      if (json.execution?.status !== "done") {
        setErr("Chưa hoàn tất — xem lỗi và bảng đọc lại ở lần thực hiện mới nhất bên dưới trước khi thử lại.");
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không thực hiện được — thử lại sau");
    } finally {
      setExecuting(false);
    }
  }

  async function runUndo(execId: string) {
    setUndoing(true);
    setErr(null);
    try {
      const json = await postJson(`/api/cases/${c.id}/undo`, { executionId: execId });
      onRefresh(json.case);
      setUndoExecId(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không hoàn tác được — thử lại sau");
    } finally {
      setUndoing(false);
    }
  }

  const platformLabel = c.platform === "facebook" ? "Meta" : "Google Ads";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">Sẽ ghi lên tài khoản thật · {platformLabel} {c.company}</h2>
        <p className="mt-0.5 text-sm text-slate-500">Người duyệt cần quyền chỉnh sửa + quyền với công ty {c.company}.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-4 py-2 font-medium">Việc</th>
              <th className="px-3 py-2 font-medium">Chiến dịch</th>
            </tr>
          </thead>
          <tbody>
            {selected.length === 0 ? (
              <tr><td colSpan={2} className="px-4 py-4 text-center text-slate-400">Chưa chọn việc nào ở bước 5.</td></tr>
            ) : (
              selected.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 text-slate-800">{a.label}</td>
                  <td className="px-3 py-2.5 text-slate-500">{targetOf(a, c)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 p-3">
          <Button className="h-10" variant="outline" size="sm" onClick={runValidate} disabled={validating || executing || selected.length === 0}>
            {validating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Kiểm trước (không ghi)
          </Button>
          <Button className="h-10" size="sm" onClick={() => { setConfirmText(""); setApproveOpen(true); }} disabled={validating || executing || selected.length === 0}>
            Duyệt & thực hiện
          </Button>
        </div>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {validateResult && (
        <div>
          <div className="mb-1.5 text-sm font-semibold text-slate-800">Kết quả kiểm trước (chưa ghi)</div>
          <ExecutionResultCard exec={validateResult} platformLabel={platformLabel} />
        </div>
      )}

      {history.length > 0 && (
        <div>
          <div className="mb-1.5 text-sm font-semibold text-slate-800">Lịch sử thực hiện</div>
          <div className="space-y-3">
            {history.map((ex) => (
              <div key={ex.id} className="space-y-2">
                <ExecutionResultCard exec={ex} platformLabel={platformLabel} />
                {ex.undoneAt ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                    <div className="font-semibold">Đã hoàn tác lúc {datetimeVN(ex.undoneAt)}</div>
                    {ex.undoReport && ex.undoReport.length > 0 && (
                      <ul className="mt-1 list-disc pl-4">
                        {ex.undoReport.map((line, i) => <li key={i}>{line}</li>)}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <Button className="h-10" variant="destructive" size="sm" onClick={() => setUndoExecId(ex.id)}>
                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Hoàn tác
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button className="h-10" variant="outline" onClick={onBack} disabled={busy}>← Sửa lựa chọn</Button>
        <Button className="h-10" onClick={onNext} disabled={busy || !hasDone} title={!hasDone ? "Cần ít nhất một lần thực hiện thành công" : undefined}>
          Đóng phiên →
        </Button>
      </div>

      {/* Xác nhận ghi thật */}
      <Dialog open={approveOpen} onOpenChange={(o) => { setApproveOpen(o); if (!o) setConfirmText(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ghi lên tài khoản thật {platformLabel} {c.company}?</DialogTitle>
            <DialogDescription>
              {selected.length} việc sẽ được ghi lên chiến dịch của {c.company}. Có thể hoàn tác sau nếu cần.
            </DialogDescription>
          </DialogHeader>
          {needsActivateConfirm && (
            <div className="space-y-1.5">
              <p className="text-sm text-slate-600">
                Trong việc đã chọn có <b>bật chạy nhóm mới</b> — nhóm sẽ bắt đầu phân phối thật và học lại từ đầu.
              </p>
              <label htmlFor="activate-confirm" className="text-xs font-medium text-slate-500">
                Gõ <code className="rounded bg-slate-100 px-1 py-0.5">XAC NHAN</code> để xác nhận
              </label>
              <Input
                id="activate-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="XAC NHAN"
                autoComplete="off"
                className="h-10"
              />
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button className="h-10" variant="outline" />}>Huỷ</DialogClose>
            <Button className="h-10" onClick={runExecute} disabled={executing || !confirmOk} title={!confirmOk ? 'Gõ đúng "XAC NHAN" để bật nhóm mới' : undefined}>
              {executing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Ghi thật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Xác nhận hoàn tác */}
      <Dialog open={!!undoExecId} onOpenChange={(o) => !o && setUndoExecId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Hoàn tác lần thực hiện này?</DialogTitle>
            <DialogDescription>
              Chỉ đảo những gì lần thực hiện này đã đổi trên tài khoản — sửa tay của người khác sau đó được giữ nguyên.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button className="h-10" variant="outline" />}>Giữ nguyên</DialogClose>
            <Button className="h-10" variant="destructive" onClick={() => undoExecId && runUndo(undoExecId)} disabled={undoing}>
              {undoing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Hoàn tác
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExecutionResultCard({ exec, platformLabel }: { exec: Execution; platformLabel: string }) {
  const ok = exec.status === "done";
  // Lần "Kiểm trước" KHÔNG ghi gì — tiêu đề phải nói rõ, không được giống lần ghi thật.
  const validate = exec.mode === "validate";
  const title = validate
    ? ok ? `${platformLabel} chấp nhận — CHƯA ghi gì lên tài khoản` : `${platformLabel} từ chối khi kiểm — chưa ghi gì`
    : ok ? "Đã thực hiện và đọc lại khớp" : "Thực hiện thất bại";
  return (
    <div className={`rounded-xl border p-3.5 text-sm ${!ok ? "border-red-200 bg-red-50" : validate ? "border-sky-200 bg-sky-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className={`flex items-center gap-1.5 font-semibold ${!ok ? "text-red-700" : validate ? "text-sky-800" : "text-emerald-700"}`}>
        {ok ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
        {title}
        <span className="ml-auto font-normal text-slate-400">{datetimeVN(exec.at)}</span>
      </div>

      {exec.errors.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-red-700">
          {exec.errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      {exec.warnings.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-amber-700">
          {exec.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
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
                  <td className="px-2.5 py-1.5">
                    {r.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />}
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
