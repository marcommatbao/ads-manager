// ============================================================
// Đợt 19b — "Google học theo đơn thật": Sẵn sàng + so sánh 30 ngày theo chiến dịch
// ------------------------------------------------------------
// Chỉ đọc. Tool KHÔNG tự đưa hành động lên mục tiêu chính — chỉ kết luận từng chiến dịch.
// Client component: chỉ `import type` từ lib/*.
// ============================================================
"use client";

import useSWR from "swr";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { num, vnd } from "@/components/case/format";
import { getJson, ApiError } from "@/components/case/api";
import type { Company } from "@/lib/case/types";
import type { CampaignCompare, Readiness } from "@/lib/conversions/google-compare";

interface Resp { range: { from: string; to: string }; daysOn: number | null; readiness: Readiness; campaigns: CampaignCompare[] }

const VERDICT: Record<CampaignCompare["verdict"], { label: string; cls: string }> = {
  gathering: { label: "Đang gom số", cls: "bg-slate-100 text-slate-600" },
  few: { label: "Chưa đủ đơn", cls: "bg-amber-50 text-amber-700" },
  no_match: { label: "Chưa khớp — kiểm cấu hình", cls: "bg-red-50 text-red-700" },
  ready: { label: "Đủ để đưa lên chính", cls: "bg-emerald-50 text-emerald-700" },
};

export function GoogleRealOrderCompare({ company }: { company: Company }) {
  const { data, error, isLoading } = useSWR<Resp>(`/api/conversions/real-orders?company=${company}&view=google`, getJson);
  if (isLoading) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Đang đọc Google Ads…</div>;
  if (error || !data) return <p className="text-xs text-red-600">Không đọc được so sánh Google: {error instanceof ApiError ? error.message : "thử lại sau"}</p>;
  const { readiness: r } = data;
  const totals = data.campaigns.reduce((s, c) => ({ cost: s.cost + c.cost, g: s.g + c.googleConv, real: s.real + c.realOrders, v: s.v + c.realValue }), { cost: 0, g: 0, real: 0, v: 0 });

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="font-semibold text-slate-900">4. Google học theo đơn thật</h2>
        <p className="text-sm text-slate-500">
          Chạy song song ≥ 14 ngày ở mức PHỤ, so đơn Google tự báo với đơn thật Google khớp được, rồi mới đưa lên mục tiêu chính cho chiến dịch đủ số. Tool chỉ đề xuất, không tự đổi.
          {data.daysOn != null && <> · Đã bật <b>{data.daysOn}</b> ngày.</>}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 p-3 text-xs">
        <p className="mb-1.5 font-semibold text-slate-700">Sẵn sàng</p>
        <ul className="space-y-1">
          <Check ok={r.action.exists === null ? null : r.action.exists && !r.action.primary} label={`Hành động “Lead chốt đơn”: ${r.action.exists === null ? "" : r.action.exists ? (r.action.primary ? "đang là CHÍNH" : "có, mức PHỤ") : "chưa có"}`} />
          <Check ok={r.customerDataTerms} label="Điều khoản dữ liệu khách hàng đã chấp nhận" />
          <Check ok={r.ecForLeads} label="Chuyển đổi nâng cao cho khách hàng tiềm năng đã bật (khớp theo email/SĐT)" />
        </ul>
        {r.errors?.map((e, i) => <p key={i} className="mt-1 text-red-600">Không đọc được — {e}</p>)}
        {r.todo.length > 0 && (
          <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-amber-800">{r.todo.map((t, i) => <li key={i}>{t}</li>)}</ol>
        )}
      </div>

      {data.campaigns.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">Chưa có số để so — {r.action.exists ? "chưa có chiến dịch chi tiền trong 30 ngày" : "tạo hành động “Lead chốt đơn” trước"}.</p>
      ) : (
        <div className="overflow-x-auto">
          <p className="mb-1 text-xs text-slate-500">
            {data.range.from} → {data.range.to}: Google tự báo <b>{num(Math.round(totals.g))}</b> đơn · đơn thật khớp được <b>{num(Math.round(totals.real))}</b> ({vnd(totals.v)}).
            Đơn thật không khớp (khách tự vào, không qua quảng cáo) là bình thường.
          </p>
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-slate-400">
              <tr><th className="py-1">Chiến dịch</th><th className="text-right">Chi</th><th className="text-right">Đơn Google báo</th><th className="text-right">CPA Google</th><th className="text-right">Đơn thật</th><th className="text-right">CPA thật</th><th className="pl-3">Kết luận</th></tr>
            </thead>
            <tbody>
              {data.campaigns.slice(0, 40).map((c) => (
                <tr key={c.id} className="border-t border-slate-100 align-top">
                  <td className="max-w-[260px] py-1.5 pr-2 text-slate-700">{c.name}</td>
                  <td className="text-right tabular-nums">{vnd(c.cost)}</td>
                  <td className="text-right tabular-nums">{num(Math.round(c.googleConv * 10) / 10)}</td>
                  <td className="text-right tabular-nums">{c.cpaGoogle != null ? vnd(c.cpaGoogle) : "—"}</td>
                  <td className="text-right font-semibold tabular-nums">{num(Math.round(c.realOrders * 10) / 10)}</td>
                  <td className="text-right font-semibold tabular-nums">{c.cpaReal != null ? vnd(c.cpaReal) : "—"}</td>
                  <td className="pl-3"><span className={`rounded-full px-2 py-0.5 font-semibold ${VERDICT[c.verdict].cls}`} title={c.note}>{VERDICT[c.verdict].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.campaigns.some((c) => c.verdict === "ready" || c.verdict === "no_match") && (
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {data.campaigns.filter((c) => c.verdict === "ready" || c.verdict === "no_match").slice(0, 8).map((c) => <li key={c.id}><b>{c.name}:</b> {c.note}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Check({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <li className="flex items-start gap-1.5">
      {ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" /> : <CircleAlert className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${ok === null ? "text-slate-400" : "text-amber-600"}`} aria-hidden="true" />}
      <span className={ok === null ? "text-slate-400" : "text-slate-700"}>{label}{ok === null ? " — không đọc được" : ""}</span>
    </li>
  );
}
