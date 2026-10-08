"use client";
// Đợt 21 A6 — Trình thiết lập ban đầu (Super Admin). API: /api/setup/*, /api/connectors/health, /api/settings/users.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Save, Trash2, CheckCircle2, AlertCircle, Eye, EyeOff, Play } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type KeyId = "google_ads" | "meta" | "gemini";
interface CompanyDefLite {
  id: string; label: string; domain: string; color: string;
  match?: { googleAccountNames?: string[]; campaignContains?: string[] };
  brandTerms?: string[]; competitors?: string[];
}
interface CompaniesCfg { orgName?: string; modules?: string[]; companies: CompanyDefLite[]; fallback: string }
interface KeyInfo { id: KeyId; status: string; configComplete: boolean; lastSuccess: string | null; failureReason: string | null }
interface PerCompany { id: string; label: string; googleCustomerId: boolean; metaPixelId: boolean; metaPageId: boolean; brandProfile: boolean; caseTarget?: boolean }
interface Member { id: string; email: string; name: string; role: string; company_access: string[]; is_active: boolean }
interface SmokeSummary { at: string; ok: number; failed: { company: string; label: string; detail: string }[]; skipped: number }
interface SmokeResult { company: string; id: string; label: string; ok: boolean; skipped?: boolean; ms: number; detail: string }
interface Status {
  enabled: boolean; pending: boolean;
  completedAt?: string | null; completedBy?: string | null;
  options?: { colors: string[]; modules: { id: string; label: string }[] };
  companies?: { fileExists: boolean; config: CompaniesCfg | null; error: string | null };
  keys?: KeyInfo[]; perCompany?: PerCompany[]; smoke?: SmokeSummary | null; members?: Member[];
  allowlist?: { saved: { domains: string[]; emails: string[] }; effectiveDomains: string[]; envDomains: boolean; envEmails: boolean };
  me?: { email: string };
}
interface Row { id: string; label: string; domain: string; color: string; googleAccountNames: string; campaignContains: string; brandTerms: string; competitors: string; locked: boolean }
interface HealthRec { status: string; failureReason?: string | null }

const STATUS_VI: Record<string, { text: string; cls: string }> = {
  healthy: { text: "Đã kết nối", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  warning: { text: "Cảnh báo", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  missing_config: { text: "Chưa dán khoá", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  auth_error: { text: "Sai khoá", cls: "bg-red-50 text-red-700 border-red-200" },
  service_error: { text: "Lỗi dịch vụ", cls: "bg-red-50 text-red-700 border-red-200" },
  disabled: { text: "Tắt", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};
const KEY_LABEL: Record<KeyId, string> = { google_ads: "Google Ads", meta: "Meta (Facebook)", gemini: "Gemini (AI)" };
const REQUIRED: KeyId[] = ["google_ads", "meta", "gemini"];
// 08/10: bỏ Telegram — chỉ là kênh dự phòng sau Teams, bản cài khách không cần (thẻ Telegram ở Cài đặt cũng ẩn).
const KEY_IDS: KeyId[] = ["google_ads", "meta", "gemini"];
const ROLES = [
  { id: "admin", label: "Admin (sửa được)" },
  { id: "viewer", label: "Viewer (chỉ xem)" },
  { id: "super_admin", label: "Super Admin (toàn quyền, xem khoá)" },
];
const ID_RE = /^[A-Z][A-Z0-9_]{1,15}$/;
const inputCls = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const lst = (s: string) => s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
const emptyRow = (color: string): Row => ({ id: "", label: "", domain: "", color, googleAccountNames: "", campaignContains: "", brandTerms: "", competitors: "", locked: false });

async function call<T>(url: string, method: "GET" | "POST" | "PUT", body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; errors?: string[]; success?: boolean } }> {
  const res = await fetch(url, {
    method, credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; errors?: string[]; success?: boolean };
  return { ok: res.ok, status: res.status, data };
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
function StepBadge({ state }: { state: "done" | "todo" | "warn" }) {
  const m = { done: ["Xong", "bg-emerald-50 text-emerald-700 border-emerald-200"], todo: ["Chưa", "bg-slate-100 text-slate-600 border-slate-200"], warn: ["Cần xem", "bg-amber-50 text-amber-700 border-amber-200"] }[state];
  return <Badge cls={m[1]}>{m[0]}</Badge>;
}
function StatusBadge({ status }: { status: string }) {
  const m = STATUS_VI[status] ?? { text: status, cls: "bg-slate-100 text-slate-600 border-slate-200" };
  return <Badge cls={m.cls}>{m.text}</Badge>;
}
function Step({ n, title, state, desc, children }: { n: number; title: string; state: "done" | "todo" | "warn"; desc?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs text-white">{n}</span>{title}
          </CardTitle>
          <StepBadge state={state} />
        </div>
        {desc && <CardDescription>{desc}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
function Msg({ ok, text, list }: { ok: boolean; text?: string; list?: string[] }) {
  if (!text && !(list && list.length)) return null;
  return (
    <div className={`text-sm ${ok ? "text-emerald-700" : "text-red-600"}`}>
      {text && <p className="flex items-start gap-1.5">{ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}<span>{text}</span></p>}
      {list && list.length > 0 && <ul className="list-disc space-y-0.5 pl-9">{list.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    </div>
  );
}
const Tick = ({ ok }: { ok: boolean }) => <span className={ok ? "text-emerald-600" : "text-slate-400"}>{ok ? "✓" : "✗"}</span>;
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString("vi-VN") : "");

export default function SetupPage() {
  const [st, setSt] = useState<Status | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  // Bước 1
  const [orgName, setOrgName] = useState("");
  const [mods, setMods] = useState<string[]>(["marketing"]);
  const [rows, setRows] = useState<Row[]>([]);
  const [fallback, setFallback] = useState("");
  const [busy1, setBusy1] = useState(false);
  const [msg1, setMsg1] = useState<{ ok: boolean; text?: string; list?: string[] } | null>(null);
  // Bước 3
  const [busy3, setBusy3] = useState(false);
  const [health, setHealth] = useState<Record<string, HealthRec> | null>(null);
  const [msg3, setMsg3] = useState<string>("");
  // Bước 4
  const [busy4, setBusy4] = useState(false);
  const [smokeRun, setSmokeRun] = useState<{ at: string; results: SmokeResult[] } | null>(null);
  const [msg4, setMsg4] = useState<string>("");
  // Bước 5
  const [domainsTxt, setDomainsTxt] = useState("");
  const [emailsTxt, setEmailsTxt] = useState("");
  const [busyA, setBusyA] = useState(false);
  const [msgA, setMsgA] = useState<{ ok: boolean; text: string } | null>(null);
  const [uEmail, setUEmail] = useState("");
  const [uName, setUName] = useState("");
  const [uPass, setUPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [uRole, setURole] = useState("admin");
  const [uAccess, setUAccess] = useState<string[]>([]);
  const [busyU, setBusyU] = useState(false);
  const [msgU, setMsgU] = useState<{ ok: boolean; text: string } | null>(null);
  // Bước 6
  const [busy6, setBusy6] = useState(false);
  const [msg6, setMsg6] = useState("");

  const applyStatus = useCallback((s: Status, prefill: boolean) => {
    setSt(s);
    if (!prefill || !s.options) return;
    const cfg = s.companies?.config;
    const firstColor = s.options.colors[0] ?? "blue";
    setOrgName(cfg?.orgName ?? "");
    setMods(Array.from(new Set(["marketing", ...(cfg?.modules ?? [])])));
    const saved = new Set(cfg?.companies.map((c) => c.id) ?? []);
    if (s.companies?.fileExists && cfg && cfg.companies.length) {
      setRows(cfg.companies.map((c) => ({
        id: c.id, label: c.label, domain: c.domain, color: c.color,
        googleAccountNames: (c.match?.googleAccountNames ?? []).join(", "),
        campaignContains: (c.match?.campaignContains ?? []).join(", "),
        brandTerms: (c.brandTerms ?? []).join(", "), competitors: (c.competitors ?? []).join(", "),
        locked: !!s.completedAt && saved.has(c.id),
      })));
      setFallback(cfg.fallback);
    } else {
      setRows([emptyRow(firstColor)]);
      setFallback("");
    }
    setDomainsTxt((s.allowlist?.saved.domains ?? []).join("\n"));
    setEmailsTxt((s.allowlist?.saved.emails ?? []).join("\n"));
  }, []);

  const refresh = useCallback(async (prefill = false) => {
    try {
      const r = await call<Status>("/api/setup/status", "GET");
      if (!r.ok) throw new Error(r.data.error ?? `Không tải được (HTTP ${r.status})`);
      applyStatus(r.data, prefill);
      setLoadErr("");
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Không tải được");
    } finally { setLoading(false); }
  }, [applyStatus]);

  useEffect(() => { void refresh(true); }, [refresh]);

  if (loading) return <div className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải…</div>;
  if (loadErr && !st) {
    return (
      <Card><CardContent className="space-y-3 pt-6">
        <Msg ok={false} text={loadErr} />
        <Button type="button" variant="outline" size="sm" onClick={() => { setLoading(true); void refresh(true); }}>Thử lại</Button>
      </CardContent></Card>
    );
  }
  if (!st) return null;
  if (!st.enabled) {
    return (
      <Card><CardContent className="space-y-3 pt-6">
        <p className="text-sm text-slate-700">Bản cài này không bật trình thiết lập.</p>
        <Link href="/" className="text-sm font-medium text-blue-600 underline">Về trang chủ</Link>
      </CardContent></Card>
    );
  }
  if (!st.options) {
    return <Card><CardContent className="pt-6"><p className="text-sm text-slate-700">Quản trị viên đang thiết lập bản cài — vui lòng quay lại sau.</p></CardContent></Card>;
  }

  const options = st.options;
  const keys = st.keys ?? [];
  const keyOf = (id: KeyId) => keys.find((k) => k.id === id);
  const companyList = st.companies?.config?.companies ?? [];
  const members = st.members ?? [];
  const allow = st.allowlist;
  const completed = !!st.completedAt;

  const done1 = !!st.companies?.fileExists && !st.companies.error;
  const done2 = REQUIRED.every((id) => keyOf(id)?.configComplete);
  const done3 = REQUIRED.every((id) => keyOf(id)?.status === "healthy");
  const done4 = !!st.smoke && st.smoke.failed.length === 0 && st.smoke.ok > 0;
  const savedEmpty = !allow || (allow.saved.domains.length === 0 && allow.saved.emails.length === 0);
  const warn5 = savedEmpty && allow?.effectiveDomains.length === 1 && allow.effectiveDomains[0] === "matbao.com";
  const done5 = members.length >= 1;
  const warnings: string[] = [];
  if (!done2) warnings.push("Chưa dán đủ khoá bắt buộc (Google Ads, Meta, Gemini).");
  if (!done3) warnings.push("Chưa kiểm tra kết nối thành công cho cả 3 khoá bắt buộc.");
  if (!done4) warnings.push("Chưa có lượt tự kiểm đạt (không lỗi, có ít nhất một truy vấn chạy được).");
  if ((st.perCompany ?? []).some((p) => !p.caseTarget)) warnings.push("Chưa đặt mục tiêu chiến dịch (Xử lý chiến dịch → Mục tiêu) — tool sẽ không chấm được chiến dịch nào là kém.");
  if (!done5 || warn5) warnings.push(!done5 ? "Chưa có người dùng nào." : "Danh sách đăng nhập vẫn là mặc định (matbao.com) — kiểm tra lại tên miền được phép.");

  // ---- Hành động ----
  const patchRow = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  async function saveCompanies() {
    setMsg1(null);
    const local: string[] = [];
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      if (!ID_RE.test(r.id)) local.push(`Dòng ${i + 1}: mã "${r.id}" không hợp lệ (2–16 ký tự A-Z, 0-9, _, bắt đầu bằng chữ).`);
      if (seen.has(r.id)) local.push(`Dòng ${i + 1}: mã "${r.id}" bị trùng.`);
      seen.add(r.id);
      if (!r.label.trim()) local.push(`Dòng ${i + 1}: thiếu tên công ty.`);
    });
    if (!rows.length) local.push("Cần ít nhất một công ty.");
    if (local.length) { setMsg1({ ok: false, list: local }); return; }
    setBusy1(true);
    try {
      const fb = rows.some((r) => r.id === fallback) ? fallback : rows[0].id;
      const r = await call<unknown>("/api/setup/companies", "PUT", {
        orgName: orgName.trim(), modules: Array.from(new Set(["marketing", ...mods])), fallback: fb,
        companies: rows.map((x) => ({
          id: x.id, label: x.label.trim(), domain: x.domain.trim(), color: x.color,
          googleAccountNames: csv(x.googleAccountNames), campaignContains: csv(x.campaignContains),
          brandTerms: csv(x.brandTerms), competitors: csv(x.competitors),
        })),
      });
      if (r.status === 422) { setMsg1({ ok: false, text: "Cấu hình chưa hợp lệ:", list: r.data.errors ?? [r.data.error ?? "Không lưu được"] }); return; }
      if (!r.ok || r.data.success === false) throw new Error(r.data.error ?? `Không lưu được (HTTP ${r.status})`);
      setMsg1({ ok: true, text: "Đã lưu — đang tải lại trang…" });
      window.location.reload();
    } catch (e) { setMsg1({ ok: false, text: e instanceof Error ? e.message : "Không lưu được" }); }
    finally { setBusy1(false); }
  }

  async function runHealth() {
    setBusy3(true); setMsg3("");
    try {
      const r = await call<{ records?: Record<string, HealthRec> }>("/api/connectors/health", "POST");
      if (!r.ok) throw new Error(r.data.error ?? `Không kiểm tra được (HTTP ${r.status})`);
      setHealth(r.data.records ?? {});
      await refresh(false);
    } catch (e) { setMsg3(e instanceof Error ? e.message : "Không kiểm tra được"); }
    finally { setBusy3(false); }
  }

  async function runSmoke() {
    setBusy4(true); setMsg4("");
    try {
      const r = await call<{ run?: { at: string; results: SmokeResult[] } }>("/api/setup/smoke", "POST");
      if (!r.ok || r.data.success === false || !r.data.run) throw new Error(r.data.error ?? `Tự kiểm lỗi (HTTP ${r.status})`);
      setSmokeRun(r.data.run);
      await refresh(false);
    } catch (e) { setMsg4(e instanceof Error ? e.message : "Tự kiểm lỗi"); }
    finally { setBusy4(false); }
  }

  async function saveAllow() {
    setBusyA(true); setMsgA(null);
    try {
      const r = await call<unknown>("/api/setup/allowlist", "PUT", { domains: lst(domainsTxt).map((d) => d.toLowerCase()), emails: lst(emailsTxt).map((d) => d.toLowerCase()) });
      if (!r.ok || r.data.success === false) throw new Error(r.data.error ?? `Không lưu được (HTTP ${r.status})`);
      setMsgA({ ok: true, text: "Đã lưu danh sách đăng nhập." });
      await refresh(false);
    } catch (e) { setMsgA({ ok: false, text: e instanceof Error ? e.message : "Không lưu được" }); }
    finally { setBusyA(false); }
  }

  async function addUser() {
    setMsgU(null);
    if (!uEmail.trim() || !uName.trim()) { setMsgU({ ok: false, text: "Nhập email và tên." }); return; }
    if (uPass.length < 12) { setMsgU({ ok: false, text: "Mật khẩu tối thiểu 12 ký tự." }); return; }
    const access = uRole === "super_admin" ? ["ALL"] : uAccess;
    if (!access.length) { setMsgU({ ok: false, text: "Chọn ít nhất một công ty cho Admin/Viewer." }); return; }
    setBusyU(true);
    try {
      const r = await call<unknown>("/api/settings/users", "POST", { email: uEmail.trim(), name: uName.trim(), role: uRole, password: uPass, company_access: access });
      if (r.status !== 201 && (!r.ok || r.data.success === false)) throw new Error(r.data.error ?? `Không thêm được (HTTP ${r.status})`);
      setUEmail(""); setUName(""); setUPass(""); setUAccess([]); setURole("admin");
      setMsgU({ ok: true, text: "Đã thêm người dùng." });
      await refresh(false);
    } catch (e) { setMsgU({ ok: false, text: e instanceof Error ? e.message : "Không thêm được" }); }
    finally { setBusyU(false); }
  }

  async function complete() {
    setBusy6(true); setMsg6("");
    try {
      const r = await call<unknown>("/api/setup/complete", "POST");
      if (!r.ok || r.data.success === false) throw new Error(r.data.error ?? `Không hoàn tất được (HTTP ${r.status})`);
      window.location.href = "/";
    } catch (e) { setMsg6(e instanceof Error ? e.message : "Không hoàn tất được"); setBusy6(false); }
  }

  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const smokeGroups: Record<string, SmokeResult[]> = {};
  (smokeRun?.results ?? []).forEach((x) => { (smokeGroups[x.company] ||= []).push(x); });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Thiết lập ban đầu</CardTitle>
          <CardDescription>Làm lần lượt từ bước 1 đến bước 6: khai báo công ty, dán khoá API, kiểm tra kết nối, tự kiểm, thêm người dùng rồi hoàn tất.</CardDescription>
        </CardHeader>
        {st.pending && (
          <CardContent>
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">Các trang khác tạm khoá cho tới khi hoàn tất; mục Cài đặt vẫn mở để dán khoá.</p>
          </CardContent>
        )}
      </Card>
      {loadErr && <Msg ok={false} text={`Làm mới trạng thái lỗi: ${loadErr}`} />}

      {/* 1 */}
      <Step n={1} title="Tổ chức & công ty" state={done1 ? "done" : "todo"} desc="Khai báo tên tổ chức, mô-đun và các công ty chạy quảng cáo.">
        <Field label="Tên tổ chức"><Input value={orgName} maxLength={60} onChange={(e) => setOrgName(e.target.value)} /></Field>
        <div className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Mô-đun</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {options.modules.map((m) => (
              <label key={m.id} className="flex items-center gap-2">
                <input type="checkbox" checked={m.id === "marketing" || mods.includes(m.id)} disabled={m.id === "marketing"} onChange={() => setMods((x) => toggle(x, m.id))} />
                {m.label}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Công ty {i + 1}</span>
                <Button type="button" variant="ghost" size="sm" disabled={r.locked || rows.length <= 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Xoá công ty"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Mã công ty" hint="Mã ngắn, không đổi sau khi đã có dữ liệu"><Input value={r.id} maxLength={16} disabled={r.locked} onChange={(e) => patchRow(i, { id: e.target.value.toUpperCase() })} /></Field>
                <Field label="Tên hiển thị"><Input value={r.label} maxLength={60} onChange={(e) => patchRow(i, { label: e.target.value })} /></Field>
                <Field label="Website" hint="Vd example.com (không cần https://)"><Input value={r.domain} onChange={(e) => patchRow(i, { domain: e.target.value })} /></Field>
                <Field label="Màu">
                  <select className={inputCls} value={r.color} onChange={(e) => patchRow(i, { color: e.target.value })}>
                    {options.colors.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Tên tài khoản Google Ads" hint="Tuỳ chọn, cách nhau bằng dấu phẩy"><Input value={r.googleAccountNames} onChange={(e) => patchRow(i, { googleAccountNames: e.target.value })} /></Field>
                <Field label="Chữ có trong tên chiến dịch" hint="Tuỳ chọn, cách nhau bằng dấu phẩy"><Input value={r.campaignContains} onChange={(e) => patchRow(i, { campaignContains: e.target.value })} /></Field>
                <Field label="Từ khoá thương hiệu" hint="Tuỳ chọn, cách nhau bằng dấu phẩy"><Input value={r.brandTerms} onChange={(e) => patchRow(i, { brandTerms: e.target.value })} /></Field>
                <Field label="Đối thủ" hint="Tuỳ chọn, cách nhau bằng dấu phẩy"><Input value={r.competitors} onChange={(e) => patchRow(i, { competitors: e.target.value })} /></Field>
              </div>
              {r.locked && <p className="text-xs text-slate-400">Mã này đã lưu — không đổi/xoá được.</p>}
            </div>
          ))}
          {rows.length < 10 && <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, emptyRow(options.colors[rs.length % options.colors.length] ?? "blue")])}><Plus className="h-4 w-4" /> Thêm công ty</Button>}
        </div>
        {rows.length > 1 && (
          <Field label="Công ty mặc định" hint="Dùng khi không khớp quy tắc nào.">
            <select className={inputCls} value={rows.some((r) => r.id === fallback) ? fallback : rows[0].id} onChange={(e) => setFallback(e.target.value)}>
              {rows.filter((r) => r.id).map((r) => <option key={r.id} value={r.id}>{r.label || r.id}</option>)}
            </select>
          </Field>
        )}
        {st.companies?.error && <Msg ok={false} text={`Cấu hình hiện tại lỗi: ${st.companies.error}`} />}
        <Msg ok={!!msg1?.ok} text={msg1?.text} list={msg1?.list} />
        <Button type="button" onClick={saveCompanies} disabled={busy1}>{busy1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu công ty</Button>
      </Step>

      {/* 2 */}
      <Step n={2} title="Dán khoá API" state={done2 ? "done" : "todo"} desc="Chỉ Super Admin xem/dán được khoá, ở trang Cài đặt.">
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {KEY_IDS.map((id) => {
            const k = keyOf(id);
            return (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 font-medium text-slate-700">{KEY_LABEL[id]}<span className="text-xs font-normal text-slate-400">{REQUIRED.includes(id) ? "bắt buộc" : "tuỳ chọn"}</span></span>
                <span className="flex items-center gap-2">{k?.configComplete && <span className="text-xs text-slate-400">đã đủ cấu hình</span>}<StatusBadge status={k?.status ?? "missing_config"} /></span>
              </li>
            );
          })}
        </ul>
        <Link href="/settings" className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Mở trang dán khoá</Link>
        {(st.perCompany ?? []).length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-xs text-slate-500"><tr><th className="py-1 pr-2">Công ty</th><th className="px-2">Google customer ID</th><th className="px-2">Meta Pixel</th><th className="px-2">Meta Page</th><th className="px-2">Hồ sơ doanh nghiệp</th><th className="px-2">Mục tiêu chiến dịch</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(st.perCompany ?? []).map((p) => (
                  <tr key={p.id}><td className="py-1.5 pr-2 font-medium text-slate-700">{p.label}</td><td className="px-2"><Tick ok={p.googleCustomerId} /></td><td className="px-2"><Tick ok={p.metaPixelId} /></td><td className="px-2"><Tick ok={p.metaPageId} /></td><td className="px-2"><Tick ok={p.brandProfile} /></td><td className="px-2"><Tick ok={!!p.caseTarget} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-400">Các mã theo công ty nhập ở <Link href="/settings" className="underline">Cài đặt</Link>, mục “Mã theo công ty”. Hồ sơ doanh nghiệp (tuỳ chọn) nhập ở <Link href="/settings/brand-profile" className="underline">Hồ sơ doanh nghiệp</Link>. <b>Mục tiêu chiến dịch</b> (chi phí/đơn hoặc ROAS mong muốn và mức trần) đặt ở <Link href="/xu-ly/muc-tieu" className="underline">Xử lý chiến dịch → Mục tiêu</Link> — chưa đặt thì tool không chấm được chiến dịch nào là kém.</p>
      </Step>

      {/* 3 */}
      <Step n={3} title="Kiểm tra kết nối" state={done3 ? "done" : "todo"} desc="Thử gọi thật tới Google Ads, Meta và Gemini bằng khoá đã dán.">
        <Button type="button" onClick={runHealth} disabled={busy3}>{busy3 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Kiểm tra ngay</Button>
        {msg3 && <Msg ok={false} text={msg3} />}
        {health && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {KEY_IDS.map((id) => {
              const h = health[id];
              return (
                <li key={id} className="space-y-1 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium text-slate-700">{KEY_LABEL[id]}</span><StatusBadge status={h?.status ?? "missing_config"} /></div>
                  {h?.failureReason && <p className="text-xs text-red-600">{h.failureReason}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Step>

      {/* 4 */}
      <Step n={4} title="Tự kiểm" state={done4 ? "done" : "todo"} desc="Chạy thử các truy vấn ĐỌC thật trên Google Ads / Meta (không ghi gì lên tài khoản), có thể mất tới 5 phút.">
        <Button type="button" onClick={runSmoke} disabled={busy4}>{busy4 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {busy4 ? "Đang chạy…" : "Chạy tự kiểm"}</Button>
        {msg4 && <Msg ok={false} text={msg4} />}
        {st.smoke && (
          <p className="text-xs text-slate-500">Lần gần nhất {fmtDate(st.smoke.at)}: {st.smoke.ok} đạt, {st.smoke.failed.length} hỏng, {st.smoke.skipped} bỏ qua.</p>
        )}
        {st.smoke && st.smoke.failed.length > 0 && !smokeRun && (
          <ul className="space-y-1 text-sm text-red-600">{st.smoke.failed.map((f, i) => <li key={i}>✗ {f.company} · {f.label}: {f.detail}</li>)}</ul>
        )}
        {Object.entries(smokeGroups).map(([company, items]) => (
          <div key={company} className="space-y-1 rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-700">{company}</p>
            <ul className="space-y-1 text-sm">
              {items.map((x, i) => (
                <li key={i} className={x.skipped ? "text-slate-500" : x.ok ? "text-emerald-700" : "text-red-600"}>
                  {x.skipped ? "⏭ bỏ qua" : x.ok ? "✓" : "✗"} {x.label}
                  {x.detail && <span className="text-xs text-slate-400"> — {x.detail}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Step>

      {/* 5 */}
      <Step n={5} title="Người dùng & đăng nhập" state={!done5 ? "todo" : warn5 ? "warn" : "done"} desc="Ai được đăng nhập và tài khoản đầu tiên của họ.">
        <div className="space-y-3">
          <Field label="Tên miền email được đăng nhập" hint="Mỗi dòng một tên miền, hoặc cách nhau bằng dấu phẩy.">
            <textarea className={`${inputCls} min-h-16`} value={domainsTxt} onChange={(e) => setDomainsTxt(e.target.value)} />
          </Field>
          <Field label="Email lẻ được đăng nhập" hint="Mỗi dòng một email.">
            <textarea className={`${inputCls} min-h-16`} value={emailsTxt} onChange={(e) => setEmailsTxt(e.target.value)} />
          </Field>
          {allow && <p className="text-xs text-slate-500">Tên miền đang có hiệu lực: {allow.effectiveDomains.join(", ") || "(không có)"}</p>}
          {allow && (allow.envDomains || allow.envEmails) && <p className="text-xs text-slate-400">Có thêm danh sách đặt sẵn trong biến môi trường máy chủ.</p>}
          {warn5 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Chưa khai báo tên miền nào — đang dùng mặc định matbao.com.</p>}
          {msgA && <Msg ok={msgA.ok} text={msgA.text} />}
          <Button type="button" onClick={saveAllow} disabled={busyA}>{busyA ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu danh sách đăng nhập</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-1 pr-2">Email</th><th className="px-2">Tên</th><th className="px-2">Vai trò</th><th className="px-2">Công ty</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id}><td className="py-1.5 pr-2 break-all">{m.email}</td><td className="px-2">{m.name}</td><td className="px-2">{m.role}</td><td className="px-2">{m.company_access.join(", ")}</td></tr>
              ))}
              {members.length === 0 && <tr><td colSpan={4} className="py-2 text-slate-400">Chưa có người dùng.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-700">Thêm người dùng</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email"><Input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} autoComplete="off" /></Field>
            <Field label="Tên"><Input value={uName} onChange={(e) => setUName(e.target.value)} /></Field>
            <Field label="Mật khẩu" hint="Tối thiểu 12 ký tự.">
              <div className="flex gap-2">
                <Input type={showPass ? "text" : "password"} value={uPass} onChange={(e) => setUPass(e.target.value)} autoComplete="new-password" />
                <Button type="button" variant="outline" size="sm" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>{showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
              </div>
            </Field>
            <Field label="Vai trò">
              <select className={inputCls} value={uRole} onChange={(e) => setURole(e.target.value)}>
                {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </Field>
          </div>
          {uRole !== "super_admin" && (
            <div className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Công ty được truy cập</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <label className="flex items-center gap-2"><input type="checkbox" checked={uAccess.includes("ALL")} onChange={() => setUAccess((a) => toggle(a, "ALL"))} /> Tất cả công ty</label>
                {companyList.map((c) => (
                  <label key={c.id} className="flex items-center gap-2"><input type="checkbox" checked={uAccess.includes(c.id)} onChange={() => setUAccess((a) => toggle(a, c.id))} /> {c.label}</label>
                ))}
              </div>
              {companyList.length === 0 && <p className="text-xs text-slate-400">Lưu công ty ở bước 1 trước.</p>}
            </div>
          )}
          {msgU && <Msg ok={msgU.ok} text={msgU.text} />}
          <Button type="button" onClick={addUser} disabled={busyU}>{busyU ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Thêm người dùng</Button>
        </div>
      </Step>

      {/* 6 */}
      <Step n={6} title="Hoàn tất" state={completed ? "done" : "todo"}>
        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p className="mb-1 font-medium">Lưu ý (không chặn hoàn tất):</p>
            <ul className="list-disc space-y-0.5 pl-4">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        {completed ? (
          <>
            <p className="flex items-start gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Đã hoàn tất lúc {fmtDate(st.completedAt)} bởi {st.completedBy}</p>
            <p className="text-xs text-slate-400">Vẫn sửa được công ty (không xoá/đổi mã cũ).</p>
          </>
        ) : (
          <>
            {!done1 && <p className="text-xs text-slate-500">Cần lưu công ty ở bước 1 trước.</p>}
            {msg6 && <Msg ok={false} text={msg6} />}
            <Button type="button" onClick={complete} disabled={!done1 || busy6}>{busy6 ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Hoàn tất thiết lập</Button>
          </>
        )}
      </Step>
    </div>
  );
}
