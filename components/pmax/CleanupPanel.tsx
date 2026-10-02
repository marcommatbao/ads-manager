"use client";

// ============================================================
// PMax "🎨 Asset" — D3: Dọn PMax cũ (gắn nhãn "AdsCommand · PMax cũ" cho
// chiến dịch đã tạm dừng lâu — KHÔNG xoá chiến dịch, gỡ nhãn là hoàn tác).
// ------------------------------------------------------------
// Đọc/ghi qua lib/pmax/cleanup.ts — module SERVER (kéo google-ads SDK) nên ở
// đây CHỈ `import type`. Luồng ghi giống các panel PMax khác: Kiểm trước
// (validateOnly, không ghi) → gõ confirmText (đọc từ server) → Ghi thật →
// server tự đọc lại → có thể Hoàn tác.
// ============================================================

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, RefreshCw, Tag, Undo2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getJson, postJson, ApiError } from "@/components/case/api";
import { vnd, ddmmyyyy, datetimeVN } from "@/components/case/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import type { CleanupExecution, OldCampaign } from "@/lib/pmax/cleanup";

type Company = string;

interface CleanupResponse {
  campaigns: OldCampaign[];
  label: string;
  idleDays: number;
  history: CleanupExecution[];
  canEdit: boolean;
  confirmText: string;
}

// ── Kết quả Kiểm trước / Ghi ──

function CleanupResultCard({ exec }: { exec: CleanupExecution }) {
  const ok = exec.status === "done";
  return (
    <div className={cn("rounded-lg border p-2.5 text-xs", ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50")}>
      <div className={cn("flex items-center gap-1.5 font-semibold", ok ? "text-emerald-700" : "text-red-700")}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        {ok ? `Đã gắn nhãn ${exec.campaigns.length} chiến dịch` : "Google từ chối — xem lỗi bên dưới"}
      </div>
      {exec.campaigns.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-slate-600">{exec.campaigns.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
      )}
      {exec.errors.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-red-700">{exec.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      )}
    </div>
  );
}

// ── Lịch sử gắn nhãn ──

function CleanupHistoryRow({ h, onUndo }: { h: CleanupExecution; onUndo: (id: string) => void }) {
  const ok = h.status === "done";
  return (
    <div className={cn("rounded-lg border p-3 text-xs", ok ? "border-emerald-100 bg-emerald-50/30" : "border-red-100 bg-red-50/30")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn("flex items-center gap-1 font-semibold", ok ? "text-emerald-700" : "text-red-700")}>
          {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          {h.campaigns.length} chiến dịch
        </span>
        <span className="text-slate-400">{datetimeVN(h.at)}</span>
        <span className="text-slate-500">{h.by}</span>
      </div>
      {h.campaigns.length > 0 && <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-slate-600">{h.campaigns.map((c) => <li key={c.id}>{c.name}</li>)}</ul>}
      {h.errors.length > 0 && <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-red-700">{h.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {ok && (
        h.undoneAt ? (
          <p className="mt-1.5 text-slate-500">Đã hoàn tác lúc {datetimeVN(h.undoneAt)}</p>
        ) : (
          <div className="mt-2 flex justify-end">
            <Button variant="destructive" size="sm" className="h-8" onClick={() => onUndo(h.id)}>
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Hoàn tác
            </Button>
          </div>
        )
      )}
    </div>
  );
}

// ── Root ──

export function CleanupPanel({ company }: { company: Company }) {
  const confirmId = useId();
  const [data, setData] = useState<CleanupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async (force?: boolean) => {
    if (force) setReloading(true); else setLoading(true);
    setError(null);
    try {
      const json = await getJson(`/api/google/pmax/cleanup?company=${company}`);
      setData(json as CleanupResponse);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Lỗi kết nối tới Google Ads");
    } finally { setLoading(false); setReloading(false); }
  }, [company]);

  useEffect(() => { load(); }, [load]);

  // Giữ lựa chọn tay qua lần tải lại; chiến dịch mới xuất hiện lấy mặc định `suggest`.
  useEffect(() => {
    if (!data) return;
    setChecked((prev) => {
      const next: Record<string, boolean> = {};
      for (const c of data.campaigns) if (!c.labelled) next[c.id] = c.id in prev ? prev[c.id] : c.suggest;
      return next;
    });
  }, [data]);

  const refresh = useCallback(() => load(true), [load]);
  const toggle = (id: string) => setChecked((p) => ({ ...p, [id]: !p[id] }));

  const selectedIds = useMemo(() => Object.entries(checked).filter(([, v]) => v).map(([id]) => id), [checked]);
  const sig = selectedIds.slice().sort().join(",");

  const [validating, setValidating] = useState(false);
  const [validateExec, setValidateExec] = useState<CleanupExecution | null>(null);
  const [validateErr, setValidateErr] = useState<string | null>(null);
  const [validatedSig, setValidatedSig] = useState<string | null>(null);

  const [applyOpen, setApplyOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyErr, setApplyErr] = useState<string | null>(null);
  const [writeExec, setWriteExec] = useState<CleanupExecution | null>(null);

  const canApply = selectedIds.length > 0 && sig === validatedSig;

  async function doValidate() {
    if (!selectedIds.length) return;
    setValidating(true); setValidateErr(null); setValidateExec(null); setWriteExec(null);
    try {
      const json = await postJson("/api/google/pmax/cleanup", { company, op: "apply", ids: selectedIds, validateOnly: true });
      const exec = json.execution as CleanupExecution;
      setValidateExec(exec);
      setValidatedSig(exec.status === "done" ? sig : null);
    } catch (e) {
      setValidateErr(e instanceof ApiError ? e.message : "Không kiểm được — thử lại sau");
      setValidatedSig(null);
    } finally { setValidating(false); }
  }

  async function doApply() {
    setApplying(true); setApplyErr(null);
    try {
      const json = await postJson("/api/google/pmax/cleanup", { company, op: "apply", ids: selectedIds, validateOnly: false, confirmText: confirmInput });
      const exec = json.execution as CleanupExecution;
      setWriteExec(exec);
      if (exec.status === "done") {
        setApplyOpen(false); setConfirmInput(""); setValidatedSig(null); setValidateExec(null);
        refresh();
      } else {
        setApplyErr(exec.errors.join(" · ") || "Google từ chối — chưa ghi gì.");
      }
    } catch (e) {
      setApplyErr(e instanceof ApiError ? e.message : "Không ghi được — thử lại sau");
    } finally { setApplying(false); }
  }

  async function undo(id: string) {
    setValidateErr(null);
    try {
      await postJson("/api/google/pmax/cleanup", { company, op: "undo", id });
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không hoàn tác được — thử lại sau");
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-extrabold text-slate-900">
            <Tag className="h-4 w-4" aria-hidden="true" /> Dọn PMax cũ
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Chỉ gắn nhãn &quot;{data?.label ?? "AdsCommand · PMax cũ"}&quot; — không xoá chiến dịch; gỡ nhãn là hoàn tác.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9 bg-white" onClick={refresh} disabled={loading || reloading}>
          {reloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />} Tải lại
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />)}</div>
      ) : !data ? null : (
        <>
          {!data.canEdit && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">🔒 Cần quyền sửa để gắn nhãn — xem được, không ghi được.</p>
          )}

          {data.campaigns.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-400">Không có PMax nào đang tạm dừng.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[720px] text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-slate-500">
                    <th className="w-8 px-2 py-2"></th>
                    <th className="px-2 py-2 font-medium">Chiến dịch</th>
                    <th className="px-2 py-2 font-medium">Bắt đầu</th>
                    <th className="px-2 py-2 font-medium text-right">Chi 12 tháng</th>
                    <th className="px-2 py-2 font-medium">Chi lần cuối</th>
                    <th className="px-2 py-2 font-medium">Nhãn</th>
                    <th className="px-2 py-2 font-medium">Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-2 py-2">
                        {c.labelled ? null : (
                          <Checkbox checked={!!checked[c.id]} onCheckedChange={() => toggle(c.id)} disabled={!data.canEdit} />
                        )}
                      </td>
                      <td className="max-w-[220px] truncate px-2 py-2 text-slate-800" title={c.name}>{c.name}</td>
                      <td className="px-2 py-2 text-slate-500">{ddmmyyyy(c.started)}</td>
                      <td className="px-2 py-2 text-right text-slate-500">{vnd(c.spend12m)}</td>
                      <td className="px-2 py-2 text-slate-500">{c.lastSpendMonth ? c.lastSpendMonth.split("-").reverse().join("/") : "—"}</td>
                      <td className="px-2 py-2">
                        {c.labelled ? (
                          <span className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Đã gắn nhãn</span>
                        ) : (
                          <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Chưa gắn</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-slate-500">
                        <span className={c.suggest ? "text-amber-700" : "text-slate-400"}>{c.why}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.canEdit && data.campaigns.some((c) => !c.labelled) && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-9 bg-white" onClick={doValidate} disabled={!selectedIds.length || validating}>
                  {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Kiểm trước (không ghi)
                </Button>
                <Button
                  type="button" size="sm" className="h-9"
                  onClick={() => { setConfirmInput(""); setApplyErr(null); setApplyOpen(true); }}
                  disabled={!canApply}
                  title={!canApply ? "Kiểm trước rồi mới áp dụng được" : undefined}
                >
                  Gắn nhãn{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
                </Button>
                {!selectedIds.length && <span className="text-[11px] text-slate-400">Chưa chọn chiến dịch nào</span>}
              </div>
              {validateErr && <p className="text-xs text-red-600">{validateErr}</p>}
              {validateExec && <CleanupResultCard exec={validateExec} />}
              {writeExec && <CleanupResultCard exec={writeExec} />}
            </div>
          )}

          {data.history.length > 0 && (
            <div>
              <button type="button" onClick={() => setHistoryOpen((o) => !o)} className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-800">
                {historyOpen ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />} Lịch sử gắn nhãn ({data.history.length})
              </button>
              {historyOpen && (
                <div className="mt-2 space-y-2">
                  {data.history.map((h) => <CleanupHistoryRow key={h.id} h={h} onUndo={undo} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={applyOpen} onOpenChange={(o) => { setApplyOpen(o); if (!o) setConfirmInput(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gắn nhãn {selectedIds.length} chiến dịch trên tài khoản thật {company}?</DialogTitle>
            <DialogDescription>Không xoá chiến dịch — chỉ gắn nhãn, gỡ nhãn là hoàn tác.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs">
            {data?.campaigns.filter((c) => selectedIds.includes(c.id)).map((c) => <li key={c.id} className="text-slate-700">{c.name}</li>)}
          </ul>
          <div className="space-y-1.5">
            <label htmlFor={confirmId} className="text-xs font-medium text-slate-500">
              Gõ <code className="rounded bg-slate-100 px-1 py-0.5">{data?.confirmText}</code> để xác nhận
            </label>
            <Input id={confirmId} value={confirmInput} onChange={(e) => setConfirmInput(e.target.value)} placeholder={data?.confirmText} autoComplete="off" className="h-10" />
          </div>
          {applyErr && <p className="text-xs text-red-600">{applyErr}</p>}
          {writeExec && writeExec.status !== "done" && <CleanupResultCard exec={writeExec} />}
          <DialogFooter>
            <DialogClose render={<Button className="h-10" variant="outline" />}>Huỷ</DialogClose>
            <Button className="h-10" onClick={doApply} disabled={applying || confirmInput.trim() !== (data?.confirmText ?? "")}>
              {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Ghi thật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
