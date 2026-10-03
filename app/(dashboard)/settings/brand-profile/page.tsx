"use client";
// Đợt 21 A3 — Cài đặt → Hồ sơ doanh nghiệp. AI viết quảng cáo + trợ lý AdsBot dùng hồ sơ này.
// MBC/MBI chưa lưu: AI vẫn dùng nội dung cũ trong mã (hiện ghi chú); bấm Lưu là chuyển sang dùng hồ sơ.
import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getJson, ApiError } from "@/components/case/api";
import { companyIds, companyLabel } from "@/lib/companies/registry";
import { useCompaniesVersion } from "@/lib/companies/use-companies";
import type { BrandProfile, BrandProduct } from "@/lib/brand/types";

interface Resp { profile: BrandProfile; saved: boolean; legacy: boolean; canEdit: boolean }
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export default function BrandProfilePage() {
  useCompaniesVersion();
  const ids = companyIds();
  const [company, setCompany] = useState(ids[0] ?? "");
  const [data, setData] = useState<Resp | null>(null);
  const [p, setP] = useState<BrandProfile | null>(null);
  const [strengths, setStrengths] = useState("");
  const [forbidden, setForbidden] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!company) return;
    let alive = true;
    setData(null); setMsg(null);
    getJson(`/api/settings/brand-profile?company=${company}`).then((j: Resp) => {
      if (!alive) return;
      setData(j); setP(j.profile); setStrengths(j.profile.strengths.join("\n")); setForbidden(j.profile.forbidden.join("\n"));
    }).catch((e) => alive && setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Không tải được" }));
    return () => { alive = false };
  }, [company]);

  const set = <K extends keyof BrandProfile>(k: K, v: BrandProfile[K]) => setP((x) => (x ? { ...x, [k]: v } : x));
  const setProduct = (i: number, patch: Partial<BrandProduct>) => set("products", (p?.products ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    if (!p) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/settings/brand-profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company, profile: { ...p, strengths: lines(strengths), forbidden: lines(forbidden) } }) });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error ?? "Không lưu được");
      setData((d) => (d ? { ...d, saved: true, legacy: false, profile: j.profile } : d)); setP(j.profile);
      setMsg({ ok: true, text: "Đã lưu — từ giờ AI viết quảng cáo cho công ty này theo hồ sơ." });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Không lưu được" }); }
    finally { setBusy(false); }
  }

  const ro = !data?.canEdit;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Hồ sơ doanh nghiệp</CardTitle>
          <CardDescription>AI dùng hồ sơ này khi viết quảng cáo Google (tiêu đề, mô tả, asset PMax) và khi giới thiệu thương hiệu. Chỉ ghi điểm mạnh CÓ THẬT — AI chỉ được dùng đúng những ý bạn ghi.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ids.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {ids.map((c) => (
                <Button key={c} type="button" size="sm" variant={c === company ? "default" : "outline"} onClick={() => setCompany(c)}>{companyLabel(c)}</Button>
              ))}
            </div>
          )}
          {!data && !msg && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải…</div>}
          {data?.legacy && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Chưa lưu hồ sơ cho {companyLabel(company)} — AI đang dùng nội dung mặc định có sẵn. Bấm “Lưu hồ sơ” thì AI chuyển sang dùng nội dung dưới đây.
            </p>
          )}
          {p && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tên thương hiệu" hint="Tên dùng trong quảng cáo."><Input value={p.brandName} disabled={ro} onChange={(e) => set("brandName", e.target.value)} /></Field>
              <Field label="Tên miền" hint="Vd matbao.ws (không cần https://)."><Input value={p.domain} disabled={ro} onChange={(e) => set("domain", e.target.value)} /></Field>
              <Field label="Đường dẫn hiển thị quảng cáo Search" hint="Tối đa 15 ký tự, vd “matbao ws”."><Input value={p.displayPath ?? ""} maxLength={15} disabled={ro} onChange={(e) => set("displayPath", e.target.value)} /></Field>
              <Field label="Ngành / nhóm sản phẩm" hint="Vd “tên miền, hosting, email doanh nghiệp”."><Input value={p.industry} disabled={ro} onChange={(e) => set("industry", e.target.value)} /></Field>
              <div className="md:col-span-2"><Field label="Giới thiệu ngắn" hint="1–2 câu."><textarea className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={p.description ?? ""} disabled={ro} onChange={(e) => set("description", e.target.value)} /></Field></div>
              <Field label="Khách hàng mục tiêu" hint="Vd “Chủ doanh nghiệp SME, phụ trách IT”."><Input value={p.persona} disabled={ro} onChange={(e) => set("persona", e.target.value)} /></Field>
              <Field label="Giọng văn" hint="Vd “chuyên nghiệp, gần gũi, không phóng đại”."><Input value={p.tone ?? ""} disabled={ro} onChange={(e) => set("tone", e.target.value)} /></Field>
              <Field label="Điểm mạnh / cam kết CÓ THẬT" hint="Mỗi dòng một ý. AI không được thêm con số, khuyến mãi hay cam kết ngoài danh sách này."><textarea className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={strengths} disabled={ro} onChange={(e) => setStrengths(e.target.value)} /></Field>
              <Field label="Điều KHÔNG được nói" hint="Mỗi dòng một ý, vd “không hứa miễn phí”, “không nêu tên đối thủ”."><textarea className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={forbidden} disabled={ro} onChange={(e) => setForbidden(e.target.value)} /></Field>
              <div className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Sản phẩm / dịch vụ chính</span>
                <p className="text-xs text-slate-400">Khi tạo quảng cáo Google với “sản phẩm tự nhập” đúng tên ở đây, tool dùng trang đích của sản phẩm đó.</p>
                {p.products.map((x, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-2 md:grid-cols-[1fr_2fr_2fr_auto]">
                    <Input placeholder="Tên" value={x.name} disabled={ro} onChange={(e) => setProduct(i, { name: e.target.value })} />
                    <Input placeholder="Mô tả ngắn" value={x.description ?? ""} disabled={ro} onChange={(e) => setProduct(i, { description: e.target.value })} />
                    <Input placeholder="https://… trang đích" value={x.url ?? ""} disabled={ro} onChange={(e) => setProduct(i, { url: e.target.value })} />
                    <Button type="button" variant="ghost" size="sm" disabled={ro} onClick={() => set("products", p.products.filter((_, j) => j !== i))} aria-label="Xoá"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                {!ro && <Button type="button" variant="outline" size="sm" onClick={() => set("products", [...p.products, { name: "" }])}><Plus className="h-4 w-4" /> Thêm sản phẩm</Button>}
              </div>
            </div>
          )}
          {msg && <p className={`flex items-center gap-1.5 text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{msg.text}</p>}
          {p && !ro && <Button type="button" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu hồ sơ</Button>}
          {data?.saved && p?.updatedAt && <p className="text-xs text-slate-400">Lưu lần cuối {new Date(p.updatedAt).toLocaleString("vi-VN")}{p.updatedBy ? ` · ${p.updatedBy}` : ""}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
