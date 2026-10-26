"use client"
// ============================================================
// Chế độ cổng — Facebook: kết nối qua Cổng kết nối Mắt Bão → chọn tài khoản quảng cáo + Pixel / Trang cho từng công ty
// trong danh sách khách đã chia sẻ trên hộp thoại Facebook → xem chi tiêu 7 ngày thật.
// Câu chữ cần BA rà (luật handoff: wording thuộc BA).
// ============================================================
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { companyDef, companyIds } from "@/lib/companies/registry"

interface AdAccount { id: string; name: string; currency: string; status?: number; business?: string }
interface Named { id: string; name: string }
interface CompanyPick { pixelId?: string; pixelName?: string; pageId?: string; pageName?: string }
export interface MetaStatus { connected: boolean; createdAt?: string; createdBy?: string; adAccount?: AdAccount | null; companies?: Record<string, CompanyPick> }
interface Preview { spend?: number; clicks?: number; impressions?: number; currency?: string; error?: string }

const STATUS_VI: Record<number, string> = { 2: "bị vô hiệu hoá", 3: "chưa thanh toán", 7: "đang xét duyệt rủi ro", 9: "trong thời gian ân hạn", 100: "chờ đóng", 101: "đã đóng" }
const fmtMoney = (n: number, cur: string) => `${n.toLocaleString("vi-VN")} ${cur === "VND" ? "₫" : cur}`
const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleString("vi-VN") : "")
const label = (co: string) => companyDef(co)?.label ?? co

export function MetaConnectPanel({ status, canEdit, next, onChanged }: { status: MetaStatus; canEdit: boolean; next: "settings" | "setup"; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [assets, setAssets] = useState<{ adAccounts: AdAccount[]; pages: Named[] } | null>(null)
  const [pixels, setPixels] = useState<Named[]>([])
  const [acct, setAcct] = useState("")
  const [picks, setPicks] = useState<Record<string, CompanyPick>>({})

  const start = () => { window.location.href = `/api/connect/meta/start?next=${next}` }

  useEffect(() => {
    if (!status.connected || !status.adAccount) { setPreview(null); return }
    let alive = true
    fetch("/api/connect/meta/assets?preview=1", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (alive) setPreview(d as Preview) }).catch(() => {})
    return () => { alive = false }
  }, [status.connected, status.adAccount])

  const loadPixels = useCallback(async (id: string) => {
    setPixels([])
    if (!id) return
    const r = await fetch(`/api/connect/meta/assets?adAccountId=${encodeURIComponent(id)}`, { cache: "no-store" })
    const d = await r.json()
    if (!r.ok) { setMessage({ ok: false, text: `Không đọc được Pixel: ${d.error ?? r.status}` }); return }
    setPixels(d.pixels as Named[])
  }, [])

  async function openPicker() {
    setBusy("assets"); setMessage(null)
    try {
      const r = await fetch("/api/connect/meta/assets", { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? `Lỗi ${r.status}`)
      setAssets(d)
      const cur = status.adAccount?.id ?? (d.adAccounts.length === 1 ? d.adAccounts[0].id : "")
      setAcct(cur)
      setPicks(status.companies ?? {})
      await loadPixels(cur)
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(null) }
  }

  async function save() {
    setBusy("save"); setMessage(null)
    try {
      const companies = Object.fromEntries(Object.entries(picks).map(([co, p]) => [co, { pixelId: p.pixelId || undefined, pageId: p.pageId || undefined }]))
      const r = await fetch("/api/connect/meta/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adAccountId: acct, companies }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? `Lỗi ${r.status}`)
      setAssets(null)
      setMessage({ ok: true, text: `Đã lưu: tài khoản ${d.adAccount.name}.` })
      await onChanged()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(null) }
  }

  async function disconnect() {
    if (!confirm("Ngắt kết nối Facebook? Tool sẽ ngừng đọc và chỉnh quảng cáo Facebook cho tới khi kết nối lại.")) return
    setBusy("disconnect"); setMessage(null)
    try {
      const r = await fetch("/api/connect/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "meta" }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? `Lỗi ${r.status}`)
      setAssets(null); setPreview(null)
      setMessage({ ok: true, text: "Đã ngắt kết nối Facebook." })
      await onChanged()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(null) }
  }

  const setPick = (co: string, k: "pixelId" | "pageId", v: string) => setPicks((s) => ({ ...s, [co]: { ...s[co], [k]: v } }))

  return (
    <div className="space-y-4">
      {message && (
        <div className={`rounded-xl border p-3 text-sm ${message.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{message.text}</div>
      )}

      {!status.connected ? (
        <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm text-slate-700">
            Bấm nút dưới đây, đăng nhập Facebook, chọn <b>doanh nghiệp</b> và các <b>tài khoản quảng cáo, Trang, Pixel</b> muốn dùng rồi
            bấm <b>Lưu</b>. Bạn không cần tạo ứng dụng hay dán mã nào.
          </p>
          <Button disabled={!canEdit} onClick={start}>Kết nối Facebook</Button>
          {!canEdit && <p className="text-xs text-slate-500">Chỉ quản trị viên được kết nối.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Đã kết nối</Badge>
            <span>bởi {status.createdBy} · {fmtTime(status.createdAt)}</span>
          </div>

          {status.adAccount ? (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
              <div className="font-medium text-slate-800">Tài khoản quảng cáo: {status.adAccount.name} <span className="text-slate-400">(act_{status.adAccount.id})</span></div>
              <div className="text-xs text-slate-500">
                {!preview ? "Đang đọc số liệu 7 ngày…" : preview.error ? <span className="text-red-600">Chưa đọc được số liệu: {preview.error}</span>
                  : <>7 ngày qua: chi {fmtMoney(preview.spend ?? 0, status.adAccount.currency)} · {(preview.clicks ?? 0).toLocaleString("vi-VN")} lượt nhấp · {(preview.impressions ?? 0).toLocaleString("vi-VN")} lượt hiển thị</>}
              </div>
              {Object.entries(status.companies ?? {}).map(([co, p]) => (
                <div key={co} className="text-xs text-slate-600">
                  {label(co)}: Pixel {p.pixelName ?? <span className="text-slate-400">chưa chọn</span>} · Trang {p.pageName ?? <span className="text-slate-400">chưa chọn</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-amber-700">Chưa chọn tài khoản quảng cáo — bấm “Chọn tài khoản & Pixel”.</p>
          )}

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy !== null} onClick={openPicker}>{busy === "assets" ? "Đang tải danh sách…" : "Chọn tài khoản & Pixel"}</Button>
              <Button variant="outline" disabled={busy !== null} onClick={start}>Kết nối lại</Button>
              <Button variant="outline" disabled={busy !== null} className="text-red-600" onClick={disconnect}>Ngắt kết nối</Button>
            </div>
          )}

          {assets && (
            <div className="space-y-3 rounded-xl border border-slate-200 p-3 text-sm">
              {assets.adAccounts.length === 0 ? (
                <p className="text-slate-600">Bạn chưa chia sẻ tài khoản quảng cáo nào cho Mắt Bão. Bấm <b>Kết nối lại</b> và tích tài khoản quảng cáo trên hộp thoại Facebook.</p>
              ) : (
                <>
                  <label className="block space-y-1">
                    <span className="font-medium text-slate-700">Tài khoản quảng cáo</span>
                    <select className="w-full rounded-md border border-slate-200 px-2 py-1" value={acct} onChange={(e) => { setAcct(e.target.value); void loadPixels(e.target.value) }}>
                      <option value="">— Chọn —</option>
                      {assets.adAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name} (act_{a.id} · {a.currency}{a.status && STATUS_VI[a.status] ? ` · ${STATUS_VI[a.status]}` : ""}){a.business ? ` — ${a.business}` : ""}</option>
                      ))}
                    </select>
                  </label>
                  {acct && (
                    <div className="space-y-2">
                      <p className="font-medium text-slate-700">Pixel và Trang cho từng công ty</p>
                      {pixels.length === 0 && <p className="text-xs text-amber-700">Tài khoản này chưa có Pixel nào được chia sẻ — vẫn lưu được, chiến dịch chuyển đổi sẽ báo thiếu Pixel.</p>}
                      {companyIds().map((co) => (
                        <div key={co} className="grid gap-2 border-t border-slate-100 pt-2 sm:grid-cols-[8rem_1fr_1fr] sm:items-center">
                          <span className="font-medium text-slate-800">{label(co)}</span>
                          <select aria-label={`Pixel cho ${label(co)}`} className="rounded-md border border-slate-200 px-2 py-1" value={picks[co]?.pixelId ?? ""} onChange={(e) => setPick(co, "pixelId", e.target.value)}>
                            <option value="">— Không dùng Pixel —</option>
                            {pixels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <select aria-label={`Trang cho ${label(co)}`} className="rounded-md border border-slate-200 px-2 py-1" value={picks[co]?.pageId ?? ""} onChange={(e) => setPick(co, "pageId", e.target.value)}>
                            <option value="">— Không dùng Trang —</option>
                            {assets.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              <div className="flex gap-2 pt-1">
                <Button disabled={busy !== null || !acct} onClick={save}>{busy === "save" ? "Đang lưu…" : "Lưu lựa chọn"}</Button>
                <Button variant="ghost" onClick={() => setAssets(null)}>Đóng</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
