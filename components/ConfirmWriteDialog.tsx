"use client";

// ============================================================
// Đợt 11d-UI — hộp thoại xác nhận dùng chung cho các nút ghi Google Ads cũ
// (trước đây ghi thẳng, không hoàn tác). Đi cặp với lib/write-guard.ts.
// ------------------------------------------------------------
// Vòng chạy: Kiểm trước (validateOnly:true, KHÔNG ghi) cho MỌI lệnh cùng lúc
// → nếu tất cả qua thì mở MỘT hộp thoại xác nhận tóm tắt sẽ ghi gì → người
// dùng gõ đúng "XAC NHAN" → ghi thật (gọi lại từng lệnh kèm confirmText) →
// kết quả (thành công/lỗi TỪNG lệnh, nguyên văn lỗi server) hiện qua callback
// cho trang tự dựng thông báo + refresh của mình, kèm sẵn nút "Hoàn tác"
// (POST /api/write-log) gắn vào action của toast dùng chung (components/Toast.tsx).
//
// Style hộp thoại theo đúng quy ước ApplyControls trong
// components/pmax/PmaxActionsPanel.tsx (Dialog, Button variant, cn, input
// gõ "XAC NHAN").
// ============================================================

import { useCallback, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { useToast, type ToastApi } from "@/components/Toast";

/** Phải khớp WRITE_CONFIRM_TEXT ở lib/write-guard.ts (module server, không import được từ client). */
export const WRITE_CONFIRM_TEXT = "XAC NHAN";

/** Hình dạng chung của phản hồi JSON từ các route ghi qua guardedMutate(). */
export interface GuardedResponse {
  success: boolean;
  error?: string;
  writeId?: string;
  validated?: boolean;
  needsConfirm?: boolean;
  [key: string]: unknown;
}

export interface GuardedCall {
  /** URL tương đối, vd "/api/google/keywords/negative". */
  url: string;
  method?: "POST" | "PATCH";
  /** Payload gốc — hook tự thêm validateOnly / confirmText, không cần khai ở đây. */
  payload: Record<string, unknown>;
  /** Mô tả một dòng cho đúng lệnh này — dùng làm dòng mặc định trong hộp
   *  thoại xác nhận (nếu request không truyền `summary`) và để gắn với kết
   *  quả (thành công/lỗi) trả về cho `onSuccess`/`onFailure`. */
  label: string;
}

export interface GuardedWriteRequest {
  /** Câu hỏi ở tiêu đề hộp thoại, vd `Thêm 5 negative keyword vào toàn tài khoản?`. */
  title: string;
  /** company để hoàn tác (POST /api/write-log {company, id}). */
  company: string;
  description?: string;
  /** Ghi đè danh sách hiện trong hộp thoại — mặc định là calls[].label. */
  summary?: string[];
}

export interface GuardedCallResult {
  label: string;
  success: boolean;
  /** Nguyên văn thông báo lỗi từ server — KHÔNG rút gọn/diễn giải lại. */
  error?: string;
  writeId?: string;
  raw: GuardedResponse;
}

export interface GuardedWriteHandlers {
  /** Kiểm trước hỏng (Google từ chối, hoặc lỗi kết nối) — TRANG tự hiện thông báo của mình. */
  onValidateFail?: (message: string) => void;
  /** Toàn bộ lệnh ghi thành công. */
  onSuccess?: (results: GuardedCallResult[]) => void;
  /** Ít nhất một lệnh ghi thất bại (có thể lẫn lệnh đã thành công — xem writeId trong results). */
  onFailure?: (results: GuardedCallResult[]) => void;
}

type Phase = "idle" | "validating" | "confirm" | "writing";

async function callGuarded(call: GuardedCall, extra: Record<string, unknown>): Promise<GuardedResponse> {
  try {
    const res = await fetch(call.url, {
      method: call.method ?? "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...call.payload, ...extra }),
    });
    const json = (await res.json().catch(() => ({}))) as Partial<GuardedResponse>;
    if (typeof json.success === "boolean") return json as GuardedResponse;
    return { success: res.ok, error: json.error ?? `Lỗi không xác định (${res.status})` };
  } catch {
    return { success: false, error: "Lỗi kết nối — thử lại sau" };
  }
}

async function undoOne(company: string, id: string): Promise<{ id: string; success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/write-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, id }),
    });
    const json = await res.json().catch(() => ({}));
    if (json?.success) return { id, success: true };
    return { id, success: false, error: json?.error ?? `Lỗi không xác định (${res.status})` };
  } catch {
    return { id, success: false, error: "Lỗi kết nối — thử lại sau" };
  }
}

/** Hoàn tác từng writeId MỘT (mỗi lần ghi là một lệnh nguyên khối riêng — hỏng cái này không đụng cái khác). */
async function undoMany(company: string, ids: string[], toast: ToastApi["toast"]) {
  const results: { id: string; success: boolean; error?: string }[] = [];
  for (const id of ids) results.push(await undoOne(company, id));
  const failed = results.filter((r) => !r.success);
  if (failed.length === 0) {
    toast({ title: ids.length > 1 ? `✅ Đã hoàn tác ${ids.length} lần ghi` : "✅ Đã hoàn tác", variant: "success" });
  } else {
    toast({
      title: failed.length === ids.length ? "❌ Không hoàn tác được" : `⚠️ Đã hoàn tác ${ids.length - failed.length}/${ids.length}`,
      description: failed.map((f) => f.error).join("; "),
      variant: "error",
    });
  }
}

/**
 * Hook dùng chung: Kiểm trước → hộp thoại "XAC NHAN" → Ghi thật → callback.
 * `guard.dialog` là JSX phải render MỘT LẦN ở đâu đó trong trang gọi.
 */
export function useGuardedWrite() {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ calls: GuardedCall[]; req: GuardedWriteRequest; handlers?: GuardedWriteHandlers } | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [writeError, setWriteError] = useState<string | null>(null);

  const cancel = useCallback(() => {
    setOpen(false);
    setPhase("idle");
    setPending(null);
    setConfirmInput("");
    setWriteError(null);
  }, []);

  /** Trả về khi bước Kiểm trước xong (mở được hộp thoại hoặc đã báo lỗi) — KHÔNG đợi lúc ghi thật, việc đó xảy ra sau khi người dùng gõ "XAC NHAN". */
  const run = useCallback(async (calls: GuardedCall[], req: GuardedWriteRequest, handlers?: GuardedWriteHandlers) => {
    if (!calls.length || phase !== "idle") return;
    setPhase("validating");
    setWriteError(null);
    try {
      const responses = await Promise.all(calls.map((c) => callGuarded(c, { validateOnly: true })));
      const failed = responses.find((r) => !r.success);
      if (failed) {
        handlers?.onValidateFail?.(failed.error ?? "Kiểm trước thất bại — chưa ghi gì");
        setPhase("idle");
        return;
      }
      setPending({ calls, req, handlers });
      setConfirmInput("");
      setPhase("confirm");
      setOpen(true);
    } catch (e) {
      handlers?.onValidateFail?.(e instanceof Error ? e.message : "Không kiểm được — thử lại sau");
      setPhase("idle");
    }
  }, [phase]);

  const undoAction = useCallback((company: string, writeIds: (string | undefined)[]) => {
    const ids = writeIds.filter((id): id is string => !!id);
    if (!ids.length) return undefined;
    return { label: "Hoàn tác", onClick: () => undoMany(company, ids, toast) };
  }, [toast]);

  const confirmWrite = useCallback(async () => {
    if (!pending || confirmInput.trim() !== WRITE_CONFIRM_TEXT) return;
    setPhase("writing");
    setWriteError(null);
    try {
      const { calls, req, handlers } = pending;
      const responses = await Promise.all(calls.map((c) => callGuarded(c, { confirmText: confirmInput.trim() })));
      const results: GuardedCallResult[] = calls.map((c, i) => ({
        label: c.label,
        success: !!responses[i].success,
        error: responses[i].success ? undefined : (responses[i].error ?? "Lỗi không xác định"),
        writeId: responses[i].writeId,
        raw: responses[i],
      }));
      const anyFail = results.some((r) => !r.success);
      cancel();
      void req;
      if (anyFail) handlers?.onFailure?.(results);
      else handlers?.onSuccess?.(results);
    } catch (e) {
      setWriteError(e instanceof Error ? e.message : "Không ghi được — thử lại sau");
      setPhase("confirm");
    }
  }, [pending, confirmInput, cancel]);

  const dialog = (
    <GuardedWriteDialogView
      open={open}
      phase={phase}
      pending={pending}
      confirmInput={confirmInput}
      setConfirmInput={setConfirmInput}
      writeError={writeError}
      onOpenChange={(o) => { if (!o) cancel(); }}
      onConfirm={confirmWrite}
    />
  );

  return { run, undoAction, validating: phase === "validating", dialog };
}

function GuardedWriteDialogView({
  open, phase, pending, confirmInput, setConfirmInput, writeError, onOpenChange, onConfirm,
}: {
  open: boolean;
  phase: Phase;
  pending: { calls: GuardedCall[]; req: GuardedWriteRequest } | null;
  confirmInput: string;
  setConfirmInput: (v: string) => void;
  writeError: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const confirmId = useId();
  if (!pending) return null;
  const { calls, req } = pending;
  const lines = req.summary ?? calls.map((c) => c.label);
  const writing = phase === "writing";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{req.title}</DialogTitle>
          <DialogDescription>{req.description ?? "Có thể hoàn tác sau nếu cần."}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs">
          {lines.map((line, i) => (
            <li key={i} className="text-slate-700">{line}</li>
          ))}
        </ul>
        <div className="space-y-1.5">
          <label htmlFor={confirmId} className="text-xs font-medium text-slate-500">
            Gõ <code className="rounded bg-slate-100 px-1 py-0.5">{WRITE_CONFIRM_TEXT}</code> để xác nhận
          </label>
          <Input
            id={confirmId}
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={WRITE_CONFIRM_TEXT}
            autoComplete="off"
            className="h-10"
          />
        </div>
        {writeError && <p className="text-xs text-red-600">{writeError}</p>}
        <DialogFooter>
          <DialogClose render={<Button className="h-10" variant="outline" />}>Huỷ</DialogClose>
          <Button
            className="h-10"
            variant="destructive"
            onClick={onConfirm}
            disabled={writing || confirmInput.trim() !== WRITE_CONFIRM_TEXT}
          >
            {writing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Ghi thật
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
