"use client";

// ============================================================
// ExtraConnections — "Kết nối bổ sung" (GTM + Trang Facebook)
// ============================================================
// Nhập trực tiếp trong Cài đặt thay vì biến môi trường máy chủ (user chốt
// 28/09) — xem app/api/settings/connections-extra/route.ts. Component tự gọi
// API riêng, không phụ thuộc state của SettingsContent.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Loader2, CheckCircle2, AlertCircle, RefreshCw, Trash2, Plus,
  ExternalLink, Eye, EyeOff, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types (khớp app/api/settings/connections-extra/route.ts) ──

interface GtmContainer { publicId: string; name: string; account: string }
interface GtmTestResult { ok: boolean; email?: string; containers?: GtmContainer[]; error?: string }
interface GtmStatus { connected: boolean; source: "env" | "settings" | "none"; email: string | null; savedAt: string | null; savedBy: string | null }
interface PageRow { pageId: string; name: string | null; source: "env" | "settings" | "system_user"; addedAt: string | null; addedBy: string | null; removable: boolean }
interface StatusResponse { ok: true; gtm: GtmStatus; pages: PageRow[]; guide: { gtm: string; pages: string } }
interface AddedPage { pageId: string; name: string | null; neverExpires: boolean }
interface SkippedPage { pageId: string; name: string | null; reason: string }
interface PagesAddResult { ok: boolean; kind?: "user" | "page"; added?: AddedPage[]; skipped?: SkippedPage[]; warning?: string; error?: string }
interface PagesTestResult { pageId: string; name: string | null; ok: boolean; error?: string }

const SOURCE_LABEL: Record<PageRow["source"], string> = {
  system_user: "Người dùng hệ thống",
  settings: "Cài đặt",
  env: "Máy chủ",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// ── GTM card ─────────────────────────────────────────────

function GtmCard({ status, guideHref, canEdit, onChanged }: {
  status: GtmStatus; guideHref: string; canEdit: boolean; onChanged: (s: StatusResponse) => void;
}) {
  const [json, setJson] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [result, setResult] = useState<GtmTestResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  const test = async () => {
    setTesting(true); setResultError(null); setResult(null);
    try {
      const res = await fetch("/api/settings/connections-extra", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gtm_test", ...(json.trim() ? { json: json.trim() } : {}) }),
      });
      const data = await res.json() as { ok: boolean; test?: GtmTestResult; error?: string };
      if (data.ok && data.test) setResult(data.test);
      else setResultError(data.error ?? "Không kiểm tra được");
    } catch { setResultError("Network error"); }
    setTesting(false);
  };

  const save = async () => {
    if (!json.trim()) return;
    setSaving(true); setResultError(null); setResult(null);
    try {
      const res = await fetch("/api/settings/connections-extra", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gtm_save", json: json.trim() }),
      });
      const data = await res.json() as StatusResponse & { ok: boolean; test?: GtmTestResult; message?: string; error?: string };
      if (data.ok) {
        setResult(data.test ?? null);
        setJson(""); // không hiện lại khoá đã lưu
        onChanged(data);
      } else {
        setResultError(data.error ?? "Lưu thất bại");
        if (data.test) setResult(data.test);
      }
    } catch { setResultError("Network error"); }
    setSaving(false);
  };

  const remove = async () => {
    if (!window.confirm("Gỡ khoá Google Tag Manager đã lưu ở Cài đặt? Thao tác này không xoá gì trên GTM, chỉ ngừng dùng khoá này trong tool.")) return;
    setRemoving(true);
    try {
      const res = await fetch("/api/settings/connections-extra", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gtm_remove" }),
      });
      const data = await res.json() as StatusResponse;
      if (data.ok) { setResult(null); onChanged(data); }
    } catch { /* ignore */ }
    setRemoving(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-3 w-3 rounded-full bg-purple-500" />
        <h3 className="text-base font-semibold text-slate-800">Google Tag Manager</h3>
        <Link href={guideHref} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
          Hướng dẫn chi tiết <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      {status.connected ? (
        <div className="text-sm text-emerald-700">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Đã kết nối — {status.email} · nguồn: {status.source === "env" ? "máy chủ (biến môi trường)" : "Cài đặt"}</span>
          </div>
          {status.source === "settings" && status.savedAt && (
            <p className="text-xs text-slate-400 mt-0.5 ml-6">Lưu lúc {fmtDate(status.savedAt)}{status.savedBy ? ` bởi ${status.savedBy}` : ""}</p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Chưa kết nối</span>
        </div>
      )}

      {status.source === "env" && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Đang dùng khoá đặt trên máy chủ — khoá lưu ở đây chỉ có tác dụng khi máy chủ không đặt.
        </p>
      )}

      {canEdit && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600">Dán toàn bộ nội dung tệp .json khoá tài khoản dịch vụ</label>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder='{"type": "service_account", ...}'
            rows={4}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-400 resize-y"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={test} disabled={testing || saving} className="gap-1.5 border-slate-200">
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Kiểm tra
            </Button>
            <Button size="sm" onClick={save} disabled={saving || testing || !json.trim()} className="gap-1.5 bg-purple-600 text-white hover:bg-purple-700">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Kiểm tra &amp; Lưu
            </Button>
            {status.source === "settings" && (
              <Button variant="outline" size="sm" onClick={remove} disabled={removing} className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 ml-auto">
                {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Gỡ kết nối
              </Button>
            )}
          </div>
        </div>
      )}

      {resultError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          {resultError}
        </div>
      )}
      {result && !resultError && (
        result.ok && result.containers ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 space-y-1">
            <p className="text-xs font-semibold text-emerald-800">Thấy {result.containers.length} container:</p>
            {result.containers.map((c) => (
              <p key={c.publicId} className="text-xs text-emerald-700 font-mono">{c.publicId} — {c.name}</p>
            ))}
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            {result.error ?? "Khoá không dùng được"}
          </div>
        )
      )}
    </div>
  );
}

// ── Trang Facebook card ──────────────────────────────────

function PagesCard({ pages, guideHref, canEdit, onChanged }: {
  pages: PageRow[]; guideHref: string; canEdit: boolean; onChanged: (s: StatusResponse) => void;
}) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<PagesAddResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<PagesTestResult[] | null>(null);
  const [removing, setRemoving] = useState<Record<string, boolean>>({});

  const add = async () => {
    if (!token.trim()) return;
    setAdding(true); setAddResult(null);
    try {
      const res = await fetch("/api/settings/connections-extra", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pages_add", token: token.trim() }),
      });
      const data = await res.json() as StatusResponse & PagesAddResult;
      setAddResult(data);
      setToken("");
      if (data.pages) onChanged(data);
    } catch { setAddResult({ ok: false, error: "Network error" }); }
    setAdding(false);
  };

  const removePage = async (pageId: string, name: string | null) => {
    if (!window.confirm(`Gỡ Trang "${name ?? pageId}" khỏi danh sách kết nối?`)) return;
    setRemoving((r) => ({ ...r, [pageId]: true }));
    try {
      const res = await fetch("/api/settings/connections-extra", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "page_remove", pageId }),
      });
      const data = await res.json() as StatusResponse;
      if (data.ok) onChanged(data);
    } catch { /* ignore */ }
    setRemoving((r) => ({ ...r, [pageId]: false }));
  };

  const testAll = async () => {
    setTesting(true); setTestResults(null);
    try {
      const res = await fetch("/api/settings/connections-extra", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pages_test" }),
      });
      const data = await res.json() as { ok: boolean; results?: PagesTestResult[] };
      if (data.ok && data.results) setTestResults(data.results);
    } catch { /* ignore */ }
    setTesting(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-3 w-3 rounded-full bg-blue-500" />
        <h3 className="text-base font-semibold text-slate-800">Trang Facebook (đọc link quảng cáo bài viết)</h3>
        <Link href={guideHref} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
          Hướng dẫn chi tiết <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Dán token Trang, hoặc token người dùng DÀI HẠN của người quản trị Trang — tool tự đổi ra token từng Trang và không lưu token người dùng.
      </p>

      {pages.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-slate-500">
                <th className="px-3 py-2 font-medium">Trang</th>
                <th className="px-3 py-2 font-medium">Mã Trang</th>
                <th className="px-3 py-2 font-medium">Nguồn</th>
                <th className="px-3 py-2 font-medium">Kiểm tra</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => {
                const t = testResults?.find((r) => r.pageId === p.pageId);
                return (
                  <tr key={p.pageId} className="border-b border-slate-50 last:border-0" title={p.addedAt ? `Thêm lúc ${fmtDate(p.addedAt)}${p.addedBy ? ` bởi ${p.addedBy}` : ""}` : undefined}>
                    <td className="px-3 py-2 font-medium text-slate-800">{p.name ?? "(chưa rõ tên)"}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{p.pageId}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {SOURCE_LABEL[p.source]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {t ? (
                        t.ok
                          ? <span className="text-emerald-600 font-medium">✓ đọc được bài</span>
                          : <span className="text-red-600 font-medium" title={t.error}>✕ {t.error ?? "lỗi"}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canEdit && p.removable && (
                        <Button variant="outline" size="sm" onClick={() => removePage(p.pageId, p.name)} disabled={removing[p.pageId]}
                          className="h-6 px-2 text-[11px] border-red-200 text-red-600 hover:bg-red-50">
                          {removing[p.pageId] ? <Loader2 className="h-3 w-3 animate-spin" /> : "Gỡ"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">Chưa có Trang nào kết nối.</p>
      )}

      <Button variant="outline" size="sm" onClick={testAll} disabled={testing || pages.length === 0} className="gap-1.5 border-slate-200">
        {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Kiểm tra tất cả
      </Button>

      {canEdit && (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <label className="text-xs font-medium text-slate-600">Thêm Trang — dán token</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder="EAA... (token Trang hoặc token người dùng dài hạn)"
                className="pr-9"
              />
              <button type="button" onClick={() => setShowToken((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button size="sm" onClick={add} disabled={adding || !token.trim()} className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 shrink-0">
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Thêm Trang
            </Button>
          </div>

          {addResult && (
            <div className="space-y-1.5">
              {addResult.error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  {addResult.error}
                </div>
              )}
              {addResult.added && addResult.added.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 space-y-1">
                  {addResult.added.map((a) => (
                    <p key={a.pageId} className="text-xs text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {a.name ?? a.pageId}
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", a.neverExpires ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                        {a.neverExpires ? "không hết hạn" : "SẼ HẾT HẠN"}
                      </span>
                    </p>
                  ))}
                </div>
              )}
              {addResult.skipped && addResult.skipped.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 space-y-1">
                  {addResult.skipped.map((s) => (
                    <p key={s.pageId} className="text-xs text-slate-500">{s.name ?? s.pageId}: {s.reason}</p>
                  ))}
                </div>
              )}
              {addResult.warning && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  {addResult.warning}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────

export function ExtraConnections({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/connections-extra");
      if (res.status === 403) { setForbidden(true); return; }
      if (res.ok) setStatus(await res.json() as StatusResponse);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Bạn không có quyền xem kết nối.
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-800">Kết nối bổ sung</h2>
        <p className="text-xs text-slate-500 mt-0.5">Google Tag Manager và token Trang Facebook — không bắt buộc, dùng để chẩn đoán đo lường sâu hơn và đọc link quảng cáo bài viết.</p>
      </div>
      <GtmCard status={status.gtm} guideHref={status.guide.gtm} canEdit={canEdit} onChanged={setStatus} />
      <PagesCard pages={status.pages} guideHref={status.guide.pages} canEdit={canEdit} onChanged={setStatus} />
    </div>
  );
}
