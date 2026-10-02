// ============================================================
// Đợt 16 — tab "Đơn thật" của trang Đo lường
// ------------------------------------------------------------
// Xem trước (chỉ đọc Odoo) → bật Google / Meta (gõ XAC NHAN) → job 3 giờ một lần gửi.
// Client component: CHỈ `import type` từ lib/conversions/* (các module đó kéo fs / odoo-client).
// confirmText lấy từ payload API, không import hằng số.
// ============================================================
"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, Eye, Loader2, Play, Power, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Pill } from "@/components/measure/Pill";
import { OrderSourcePanel } from "@/components/measure/OrderSourcePanel";
import { GoogleRealOrderCompare } from "@/components/measure/GoogleRealOrderCompare";
import { MetaRealOrderCompare } from "@/components/measure/MetaRealOrderCompare";
import { datetimeVN, num, vnd } from "@/components/case/format";
import { getJson, postJson, ApiError } from "@/components/case/api";
import type { Company } from "@/lib/case/types";
import type { RealOrderSettings, SyncResult } from "@/lib/conversions/sync";
import type { Coverage } from "@/lib/conversions/real-orders";

interface StatusResponse {
  settings: RealOrderSettings
  unsupported: string | null
  source: "odoo" | "webhook" | "csv" | null
  confirmText: string
  metaEventName: string
  meta: { total: number; byStatus: Record<"pending" | "sent" | "test_sent" | "failed" | "expired", number>; lastSentAt: string | null; lastErrors: string[] }
  google: {
    actions: { stage: string; name: string; resourceName: string | null; status: string | null; primary: boolean | null }[]
    stats: { total: number; byStatus: Record<"pending" | "uploaded" | "failed" | "skipped", number> }
  }
  canEdit: boolean
}

const pctOf = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—")

function CoverageBox({ title, c }: { title: string; c: Coverage | null }) {
  if (!c) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs font-medium text-slate-500">{title}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{num(c.orders)} đơn · {vnd(c.value)}</div>
      <div className="mt-1 text-xs text-slate-600">
        Có email {pctOf(c.withEmail, c.orders)} · có SĐT {pctOf(c.withPhone, c.orders)}{c.withClickId ? ` · gclid ${pctOf(c.withClickId, c.orders)}` : ""}{c.withFbc ? ` · fbc ${pctOf(c.withFbc, c.orders)}` : ""} · <b>khớp được {pctOf(c.matchable, c.orders)}</b> ({num(c.matchable)} đơn)
      </div>
    </div>
  )
}

export function RealOrdersView({ company }: { company: Company }) {
  const url = `/api/conversions/real-orders?company=${company}`
  const { data, error, isLoading, mutate } = useSWR<StatusResponse>(url, getJson)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null)
  const [preview, setPreview] = useState<SyncResult | null>(null)
  const [confirmFor, setConfirmFor] = useState<"google" | "meta" | null>(null)
  const [typed, setTyped] = useState("")
  const [testCode, setTestCode] = useState("")

  async function call(key: string, body: Record<string, unknown>, ok?: (r: { result?: SyncResult }) => string | void) {
    setBusy(key); setMsg(null)
    try {
      const r = await postJson("/api/conversions/real-orders", { company, ...body })
      const t = ok?.(r)
      if (t) setMsg({ tone: "green", text: t })
      await mutate()
      return true
    } catch (e) {
      setMsg({ tone: "red", text: e instanceof ApiError ? e.message : "Có lỗi, thử lại" })
      return false
    } finally { setBusy(null) }
  }

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải…</div>
  if (error || !data) return <EmptyState icon={AlertTriangle} title="Không tải được" description={error instanceof ApiError ? error.message : "Có lỗi khi tải trạng thái"} />
  // Đợt 19-0: chưa có nguồn đơn vẫn hiện bảng chọn nguồn (trước đây chỉ có dòng "chưa gửi được" — MBC không có lối nào).
  if (data.unsupported) return <div className="space-y-4"><OrderSourcePanel company={company} onChanged={() => void mutate()} /></div>

  const g = data.settings.google, m = data.settings.meta
  const wonAction = data.google.actions.find((a) => a.stage === "won" && a.resourceName)

  return (
    <div className="space-y-4">
      <OrderSourcePanel company={company} onChanged={() => void mutate()} />
      {msg && <div className={msg.tone === "green" ? "rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800" : "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"}>{msg.text}</div>}

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">1. Xem trước — chỉ đọc nguồn đơn</h2>
            <p className="text-sm text-slate-500">Đơn {company} đã thu tiền. {data.source === "odoo" ? "Khớp với quảng cáo bằng email/SĐT (đã băm) vì Odoo không lưu mã lượt bấm." : "Khớp bằng gclid / fbc nếu đơn có, không thì bằng email/SĐT (đã băm)."}</p>
          </div>
          <Button variant="outline" size="sm" disabled={!!busy || !data.canEdit} onClick={() => call("preview", { op: "preview" }, (r) => { setPreview(r.result ?? null) })}>
            {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Xem trước
          </Button>
        </div>
        {preview && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <CoverageBox title="30 ngày (gửi Google)" c={preview.coverage30} />
            <CoverageBox title="7 ngày (gửi Meta — Meta chỉ nhận 7 ngày)" c={preview.coverage7} />
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">2. Google Ads</h2>
            <Pill tone={g?.enabled ? "green" : "grey"}>{g?.enabled ? "Đang bật" : "Tắt"}</Pill>
          </div>
          <p className="mt-1 text-sm text-slate-600">Đơn vào hàng <b>“Lead chốt đơn”</b> (kèm giá trị đơn) và gửi mỗi giờ lên hành động chuyển đổi <b>PHỤ</b>: Google chưa dùng để đặt giá cho tới khi bạn tự đưa vào mục tiêu.</p>
          {!wonAction && (
            <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
              Chưa có hành động “Lead chốt đơn” trên tài khoản — đơn sẽ chờ. Tạo ở <Link className="underline" href="/google-pmax">PMax → Chất lượng lead</Link>.
            </p>
          )}
          <div className="mt-2 text-xs text-slate-500">
            Hàng Google (mọi nguồn): chờ {num(data.google.stats.byStatus.pending)} · đã nhận {num(data.google.stats.byStatus.uploaded)} · lỗi {num(data.google.stats.byStatus.failed)}
            {g?.at && <> · đổi lần cuối {datetimeVN(g.at)} bởi {g.by}</>}
          </div>
          {data.canEdit && (
            <Button className="mt-3" size="sm" variant={g?.enabled ? "outline" : "default"} disabled={!!busy}
              onClick={() => (g?.enabled ? call("g-off", { op: "toggle", platform: "google", enabled: false }, () => "Đã tắt gửi Google") : (setTyped(""), setConfirmFor("google")))}>
              <Power className="h-3.5 w-3.5" /> {g?.enabled ? "Tắt" : "Bật gửi Google"}
            </Button>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">3. Meta (Conversions API)</h2>
            <Pill tone={m?.enabled ? (m.testEventCode ? "amber" : "green") : "grey"}>{m?.enabled ? (m.testEventCode ? "Bật · chế độ thử" : "Đang bật") : "Tắt"}</Pill>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Gửi sự kiện riêng <code className="rounded bg-slate-100 px-1">{data.metaEventName}</code> — <b>không</b> phải “Purchase”, nên không làm trùng số mua hàng pixel đang báo.
            Muốn tối ưu theo đơn thật: tạo chuyển đổi tuỳ chỉnh từ sự kiện này trong Events Manager.
          </p>
          <div className="mt-2 text-xs text-slate-500">
            Hàng Meta: chờ {num(data.meta.byStatus.pending)} · đã gửi {num(data.meta.byStatus.sent)} · gửi thử {num(data.meta.byStatus.test_sent)} · lỗi {num(data.meta.byStatus.failed)} · quá 7 ngày {num(data.meta.byStatus.expired)}
            {data.meta.lastSentAt && <> · lần gửi cuối {datetimeVN(data.meta.lastSentAt)}</>}
          </div>
          {data.meta.lastErrors.length > 0 && <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-800">Lỗi gần nhất: {data.meta.lastErrors.join(" · ")}</p>}
          {data.canEdit && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              {!m?.enabled && (
                <label className="text-xs text-slate-600">
                  Mã thử (Events Manager → Kiểm tra sự kiện), để trống = gửi thật
                  <input value={testCode} onChange={(e) => setTestCode(e.target.value.trim())} placeholder="TEST12345" className="mt-1 block h-9 w-44 rounded-md border border-slate-300 px-2 text-sm" />
                </label>
              )}
              <Button size="sm" variant={m?.enabled ? "outline" : "default"} disabled={!!busy}
                onClick={() => (m?.enabled ? call("m-off", { op: "toggle", platform: "meta", enabled: false }, () => "Đã tắt gửi Meta") : (setTyped(""), setConfirmFor("meta")))}>
                <Power className="h-3.5 w-3.5" /> {m?.enabled ? "Tắt" : testCode ? "Bật chế độ thử" : "Bật gửi Meta"}
              </Button>
            </div>
          )}
        </section>
      </div>

      <GoogleRealOrderCompare company={company} />
      <MetaRealOrderCompare company={company} canEdit={data.canEdit} confirmText={data.confirmText} />

      {data.canEdit && (g?.enabled || m?.enabled) && (
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call("run", { op: "run" }, (r) => {
          const x = r.result
          if (!x) return "Đã chạy"
          const parts = [`${num(x.coverage30?.orders ?? 0)} đơn/30 ngày`]
          if (x.google.enabled) parts.push(`Google thêm ${num(x.google.accepted ?? 0)} đơn mới vào hàng (gửi ở lượt mỗi giờ)`)
          if (x.meta.enabled) parts.push(x.meta.error ? `Meta lỗi: ${x.meta.error}` : `Meta${x.meta.test ? " (thử)" : ""}: gửi ${num(x.meta.send?.sent ?? 0)}, Meta nhận ${num(x.meta.send?.received ?? 0)}, lỗi ${num(x.meta.send?.failed ?? 0)}`)
          return parts.join(" · ")
        })}>
          {busy === "run" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Chạy ngay một lượt
        </Button>
      )}

      <Dialog open={!!confirmFor} onOpenChange={(o) => !o && setConfirmFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmFor === "google" ? "Bật gửi đơn thật lên Google Ads" : testCode ? "Bật gửi thử lên Meta" : "Bật gửi đơn thật lên Meta"}</DialogTitle>
            <DialogDescription>
              {confirmFor === "google"
                ? "Mỗi 3 giờ tool đưa đơn đã thu tiền (30 ngày) vào hàng “Lead chốt đơn”; mỗi giờ gửi lên hành động PHỤ. Không đổi đặt giá."
                : testCode
                  ? `Sự kiện chỉ hiện ở tab Kiểm tra sự kiện (mã ${testCode}), không tính vào số liệu.`
                  : `Mỗi 3 giờ tool gửi đơn đã thu tiền (7 ngày) thành sự kiện ${data.metaEventName} lên pixel ${company}.`}
              {" "}Tắt lại bất cứ lúc nào.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm text-slate-700">
            Gõ <b>{data.confirmText}</b> để xác nhận
            <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-2" />
          </label>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Huỷ</DialogClose>
            <Button disabled={typed !== data.confirmText || !!busy} onClick={async () => {
              const p = confirmFor!
              const ok = await call(`${p}-on`, { op: "toggle", platform: p, enabled: true, confirmText: typed, ...(p === "meta" ? { testEventCode: testCode || null } : {}) }, () => (p === "google" ? "Đã bật gửi Google" : testCode ? "Đã bật gửi thử Meta" : "Đã bật gửi Meta"))
              if (ok) setConfirmFor(null)
            }}>
              {busy?.endsWith("-on") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Bật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
