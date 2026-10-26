"use client"
// ============================================================
// Chế độ cổng (MB_CONNECT_*): thay ô dán khoá Google/Meta bằng nút "Kết nối" qua Cổng kết nối Mắt Bão.
// Google: kết nối → tự liệt kê tài khoản quảng cáo → tích chọn + gán công ty → xem chi tiêu 7 ngày thật.
// Câu chữ cần BA rà (luật handoff: wording thuộc BA).
// ============================================================
import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { companyDef, companyIds } from "@/lib/companies/registry"
import { useCompaniesVersion } from "@/lib/companies/use-companies"

interface Pick { customerId: string; loginCustomerId?: string; name: string; company: string }
interface Status {
  gateway: boolean
  google?: { connected: boolean; createdAt?: string; createdBy?: string; accounts?: Pick[] }
  meta?: { connected: boolean; createdAt?: string; createdBy?: string }
}
interface AccountRow { customerId: string; name: string; status: string; currency: string; loginCustomerId?: string; viaName?: string }
interface Preview { company: string; customerId: string; name?: string; currency?: string; cost?: number; clicks?: number; impressions?: number; error?: string }

const fmtId = (id: string) => id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3")
const fmtMoney = (n: number, cur: string) => `${n.toLocaleString("vi-VN")} ${cur === "VND" ? "₫" : cur}`
const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString("vi-VN") : "")

export function ConnectCard({ provider, canEdit, next = "settings" }: { provider: "google" | "meta"; canEdit: boolean; next?: "settings" | "setup" }) {
  useCompaniesVersion()
  const params = useSearchParams()
  const [status, setStatus] = useState<Status | null>(null)
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null)
  const [accountErrors, setAccountErrors] = useState<{ customerId: string; message: string }[]>([])
  const [assign, setAssign] = useState<Record<string, string>>({}) // customerId → company ("" = không dùng)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [previews, setPreviews] = useState<Preview[]>([])

  const load = useCallback(async () => {
    const r = await fetch("/api/connect/status", { cache: "no-store" })
    if (r.ok) setStatus((await r.json()) as Status)
  }, [])

  const loadPreviews = useCallback(async (picks: Pick[]) => {
    const out: Preview[] = []
    for (const p of picks) {
      const r = await fetch(`/api/connect/google/preview?company=${encodeURIComponent(p.company)}`, { cache: "no-store" })
      out.push((await r.json()) as Preview)
    }
    setPreviews(out)
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (params.get("connect") !== provider) return
    const err = params.get("connect_error")
    if (err) setMessage({ ok: false, text: err })
    else if (params.get("connect_ok")) setMessage({ ok: true, text: "Đã kết nối. Chọn tài khoản quảng cáo bên dưới." })
  }, [params, provider])

  const google = status?.google
  useEffect(() => {
    if (provider === "google" && google?.connected && google.accounts?.length) void loadPreviews(google.accounts)
  }, [provider, google?.connected, google?.accounts, loadPreviews])

  async function openPicker() {
    setBusy("accounts"); setMessage(null)
    try {
      const r = await fetch("/api/connect/google/accounts", { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? `Lỗi ${r.status}`)
      setAccounts(d.accounts as AccountRow[])
      setAccountErrors(d.errors ?? [])
      const cur: Record<string, string> = {}
      for (const p of google?.accounts ?? []) cur[p.customerId] = p.company
      setAssign(cur)
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(null) }
  }

  async function savePicks() {
    setBusy("save"); setMessage(null)
    try {
      const picks = Object.entries(assign).filter(([, company]) => company).map(([customerId, company]) => ({ customerId, company }))
      const r = await fetch("/api/connect/google/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accounts: picks }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? `Lỗi ${r.status}`)
      setAccounts(null)
      setMessage({ ok: true, text: `Đã lưu ${d.accounts.length} tài khoản.` })
      await load()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(null) }
  }

  async function disconnect() {
    if (!confirm("Ngắt kết nối? Tool sẽ ngừng đọc và chỉnh quảng cáo của tài khoản này cho tới khi kết nối lại.")) return
    setBusy("disconnect"); setMessage(null)
    try {
      const r = await fetch("/api/connect/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? `Lỗi ${r.status}`)
      setPreviews([]); setAccounts(null)
      setMessage({ ok: true, text: "Đã ngắt kết nối." })
      await load()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(null) }
  }

  if (!status) return <p className="text-sm text-slate-400">Đang tải trạng thái kết nối…</p>

  if (provider === "meta") {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Kết nối Facebook qua Cổng kết nối Mắt Bão đang được hoàn thiện. Trong lúc chờ, Mắt Bão sẽ hỗ trợ kết nối giúp bạn.
      </div>
    )
  }

  const usedCompanies = new Set(Object.values(assign).filter(Boolean))

  return (
    <div className="space-y-4">
      {message && (
        <div className={`rounded-xl border p-3 text-sm ${message.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{message.text}</div>
      )}

      {!google?.connected ? (
        <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm text-slate-700">
            Bấm nút dưới đây, đăng nhập tài khoản Google đang quản lý quảng cáo của bạn và bấm <b>Cho phép</b>. Bạn không cần tạo
            gì trên Google Cloud hay dán mã nào.
          </p>
          <Button disabled={!canEdit} onClick={() => { window.location.href = `/api/connect/google/start?next=${next}` }}>
            Kết nối Google Ads
          </Button>
          {!canEdit && <p className="text-xs text-slate-500">Chỉ quản trị viên được kết nối.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Đã kết nối</Badge>
            <span>bởi {google.createdBy} · {fmtTime(google.createdAt)}</span>
          </div>

          {(google.accounts?.length ?? 0) > 0 ? (
            <div className="space-y-2">
              {google.accounts!.map((p) => {
                const pv = previews.find((x) => x.company === p.company)
                return (
                  <div key={p.customerId} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="font-medium text-slate-800">{companyDef(p.company)?.label ?? p.company} → {p.name} <span className="text-slate-400">({fmtId(p.customerId)})</span></div>
                    <div className="text-xs text-slate-500">
                      {!pv ? "Đang đọc số liệu 7 ngày…" : pv.error ? <span className="text-red-600">Chưa đọc được số liệu: {pv.error}</span>
                        : <>7 ngày qua: chi {fmtMoney(pv.cost ?? 0, pv.currency ?? "")} · {(pv.clicks ?? 0).toLocaleString("vi-VN")} lượt nhấp · {(pv.impressions ?? 0).toLocaleString("vi-VN")} lượt hiển thị</>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-amber-700">Chưa chọn tài khoản quảng cáo nào — bấm “Chọn tài khoản”.</p>
          )}

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy !== null} onClick={openPicker}>{busy === "accounts" ? "Đang tải danh sách…" : "Chọn tài khoản"}</Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => { window.location.href = `/api/connect/google/start?next=${next}` }}>Kết nối lại</Button>
              <Button variant="outline" disabled={busy !== null} className="text-red-600" onClick={disconnect}>Ngắt kết nối</Button>
            </div>
          )}

          {accounts && (
            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-700">Tài khoản quảng cáo tài khoản Google này vào được — chọn công ty cho tài khoản muốn dùng:</p>
              {accounts.length === 0 && <p className="text-sm text-slate-500">Không có tài khoản quảng cáo nào.</p>}
              {accounts.map((a) => (
                <label key={a.customerId} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm">
                  <span>
                    <span className="font-medium text-slate-800">{a.name}</span> <span className="text-slate-400">({fmtId(a.customerId)} · {a.currency}{a.status && a.status !== "ENABLED" ? ` · ${a.status}` : ""})</span>
                    {a.viaName && <span className="block text-xs text-slate-400">qua tài khoản quản lý {a.viaName}</span>}
                  </span>
                  <select
                    className="rounded-md border border-slate-200 px-2 py-1 text-sm"
                    value={assign[a.customerId] ?? ""}
                    onChange={(e) => setAssign((s) => ({ ...s, [a.customerId]: e.target.value }))}
                  >
                    <option value="">— Không dùng —</option>
                    {companyIds().map((c) => (
                      <option key={c} value={c} disabled={usedCompanies.has(c) && assign[a.customerId] !== c}>{companyDef(c)?.label ?? c}</option>
                    ))}
                  </select>
                </label>
              ))}
              {accountErrors.map((e) => (
                <p key={e.customerId} className="text-xs text-red-600">Không đọc được tài khoản {fmtId(e.customerId)}: {e.message}</p>
              ))}
              <div className="flex gap-2 pt-2">
                <Button disabled={busy !== null} onClick={savePicks}>{busy === "save" ? "Đang lưu…" : "Lưu lựa chọn"}</Button>
                <Button variant="ghost" onClick={() => setAccounts(null)}>Đóng</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
