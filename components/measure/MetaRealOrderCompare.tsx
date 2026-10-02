// ============================================================
// Đợt 19c — "Facebook học theo đơn thật": Sẵn sàng + tạo chuyển đổi tuỳ chỉnh + so sánh 30 ngày theo chiến dịch
// ------------------------------------------------------------
// Tạo chuyển đổi tuỳ chỉnh: Kiểm trước (Meta chỉ kiểm dữ liệu, không kiểm quyền) → gõ XAC NHAN → tạo.
// Client component: chỉ `import type` từ lib/*.
// ============================================================
"use client";

import { useState } from "react";
import useSWR from "swr";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { num, vnd } from "@/components/case/format";
import { getJson, postJson, ApiError } from "@/components/case/api";
import type { Company } from "@/lib/case/types";
import type { MetaCampaignCompare, MetaReadiness } from "@/lib/conversions/meta-compare";

interface Resp { range: { from: string; to: string }; readiness: MetaReadiness & { error?: string }; campaigns: MetaCampaignCompare[]; compareError: string | null }

const VERDICT: Record<MetaCampaignCompare["verdict"], { label: string; cls: string }> = {
  no_conversion: { label: "Chưa đo được", cls: "bg-slate-100 text-slate-600" },
  few: { label: "Chưa đủ đơn", cls: "bg-amber-50 text-amber-700" },
  view_heavy: { label: "Meta nhận vơ lượt xem", cls: "bg-red-50 text-red-700" },
  ready: { label: "Đủ để tối ưu theo đơn thật", cls: "bg-emerald-50 text-emerald-700" },
};

export function MetaRealOrderCompare({ company, canEdit, confirmText }: { company: Company; canEdit: boolean; confirmText: string }) {
  const { data, error, isLoading, mutate } = useSWR<Resp>(`/api/conversions/real-orders?company=${company}&view=meta`, getJson);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);

  async function cc(validateOnly: boolean) {
    setBusy(validateOnly ? "check" : "create"); setMsg(null);
    try {
      const r = await postJson("/api/conversions/real-orders", { company, op: "meta_cc", validateOnly, confirmText: typed }) as { id?: string };
      if (validateOnly) { setMsg({ tone: "green", text: "Meta kiểm dữ liệu qua (chế độ này không kiểm quyền ghi — tạo thật vẫn có thể bị từ chối)." }); setOpen(true); setTyped(""); }
      else { setMsg({ tone: "green", text: `Đã tạo chuyển đổi tuỳ chỉnh${r.id ? ` (mã ${r.id})` : ""}. Meta cần vài giờ để bắt đầu đếm.` }); setOpen(false); await mutate(); }
    } catch (e) { setMsg({ tone: "red", text: e instanceof ApiError ? e.message : "Có lỗi, thử lại" }); }
    finally { setBusy(null); }
  }

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Đang đọc Meta…</div>;
  if (error || !data) return <p className="text-xs text-red-600">Không đọc được so sánh Meta: {error instanceof ApiError ? error.message : "thử lại sau"}</p>;
  const r = data.readiness;
  const tot = data.campaigns.reduce((s, c) => ({ m: s.m + c.metaPurchases, real: s.real + c.realOrders, v: s.v + c.realValue }), { m: 0, real: 0, v: 0 });

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="font-semibold text-slate-900">5. Facebook học theo đơn thật</h2>
        <p className="text-sm text-slate-500">Meta tự báo “mua hàng” gồm cả lượt chỉ-xem. Đơn thật chỉ tính khi khách BẤM quảng cáo rồi mua trong 7 ngày — chênh lớn là Meta đang nhận vơ. Tool chỉ đề xuất.</p>
      </div>

      <div className="rounded-lg border border-slate-200 p-3 text-xs">
        <p className="mb-1.5 font-semibold text-slate-700">Sẵn sàng</p>
        <ul className="space-y-1">
          <Check ok={!!r.pixelId} label={`Pixel: ${r.pixelId ?? "chưa có"}`} />
          <Check ok={r.sending && !r.test} label={`Gửi CAPI: ${r.sending ? (r.test ? "chế độ thử" : `đang bật · đã gửi ${num(r.sent)} đơn`) : "tắt"}`} />
          <Check ok={r.error ? null : !!r.conversion} label={`Chuyển đổi tuỳ chỉnh: ${r.conversion ? `"${r.conversion.name}"` : "chưa có"}${r.error ? ` — không đọc được (${r.error})` : ""}`} />
        </ul>
        {r.todo.length > 0 && <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-amber-800">{r.todo.map((t, i) => <li key={i}>{t}</li>)}</ol>}
        {canEdit && !r.conversion && !r.error && r.pixelId && (
          <Button type="button" size="sm" variant="outline" className="mt-2 h-8" disabled={!!busy} onClick={() => void cc(true)}>
            {busy === "check" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Tạo chuyển đổi tuỳ chỉnh… (Kiểm trước)
          </Button>
        )}
        {msg && <p className={`mt-2 ${msg.tone === "green" ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
      </div>

      {data.compareError && <p className="text-xs text-red-600">Không đọc được số chiến dịch Meta: {data.compareError}</p>}
      {data.campaigns.length > 0 && (
        <div className="overflow-x-auto">
          <p className="mb-1 text-xs text-slate-500">{data.range.from} → {data.range.to}: Meta tự báo <b>{num(Math.round(tot.m))}</b> mua hàng · đơn thật khớp lượt bấm <b>{r.conversion ? num(Math.round(tot.real)) : "—"}</b>{r.conversion ? ` (${vnd(tot.v)})` : ""}.</p>
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="text-slate-400"><tr><th className="py-1">Chiến dịch</th><th className="text-right">Chi</th><th className="text-right">Meta báo</th><th className="text-right">% chỉ-xem</th><th className="text-right">CPA Meta</th><th className="text-right">Đơn thật</th><th className="text-right">CPA thật</th><th className="pl-3">Kết luận</th></tr></thead>
            <tbody>
              {data.campaigns.slice(0, 40).map((c) => (
                <tr key={c.id} className="border-t border-slate-100 align-top">
                  <td className="max-w-[240px] py-1.5 pr-2 text-slate-700">{c.name}</td>
                  <td className="text-right tabular-nums">{vnd(c.spend)}</td>
                  <td className="text-right tabular-nums">{num(Math.round(c.metaPurchases))}</td>
                  <td className="text-right tabular-nums">{c.viewShare != null ? `${Math.round(c.viewShare * 100)}%` : "—"}</td>
                  <td className="text-right tabular-nums">{c.cpaMeta != null ? vnd(c.cpaMeta) : "—"}</td>
                  <td className="text-right font-semibold tabular-nums">{r.conversion ? num(Math.round(c.realOrders)) : "—"}</td>
                  <td className="text-right font-semibold tabular-nums">{c.cpaReal != null ? vnd(c.cpaReal) : "—"}</td>
                  <td className="pl-3"><span className={`rounded-full px-2 py-0.5 font-semibold ${VERDICT[c.verdict].cls}`} title={c.note}>{VERDICT[c.verdict].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.campaigns.some((c) => c.verdict === "ready" || c.verdict === "view_heavy") && (
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {data.campaigns.filter((c) => c.verdict === "ready" || c.verdict === "view_heavy").slice(0, 8).map((c) => <li key={c.id}><b>{c.name}:</b> {c.note}</li>)}
            </ul>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo chuyển đổi tuỳ chỉnh từ đơn thật ({company})?</DialogTitle>
            <DialogDescription>Ghi lên tài khoản quảng cáo Meta thật. Chỉ tạo chuyển đổi để đo / tối ưu — không đổi nhóm quảng cáo nào.</DialogDescription>
          </DialogHeader>
          <label className="text-sm text-slate-700">
            Gõ <b>{confirmText}</b> để xác nhận
            <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-2" />
          </label>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Huỷ</DialogClose>
            <Button disabled={typed !== confirmText || !!busy} onClick={() => void cc(false)}>{busy === "create" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Tạo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Check({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <li className="flex items-start gap-1.5">
      {ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" /> : <CircleAlert className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${ok === null ? "text-slate-400" : "text-amber-600"}`} aria-hidden="true" />}
      <span className="text-slate-700">{label}</span>
    </li>
  );
}
