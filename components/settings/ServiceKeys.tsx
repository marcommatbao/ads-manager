"use client";

// ============================================================
// ServiceKeys — "Khoá dịch vụ khác" (Đợt 24a)
// ============================================================
// SerpApi, SearchAPI, Apify, Resend, bot Telegram KPI — trước đây chỉ đặt được bằng biến môi trường máy chủ.
// Gọi app/api/settings/service-keys/route.ts. Máy chủ trả giá trị ĐÃ CHE; ô còn dạng che (****) gửi lên = không đổi.

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface KeyRow { key: string; label: string; help: string; secret: boolean; value: string; connected: boolean; source: "settings" | "env" | "none" }

const SOURCE: Record<KeyRow["source"], { text: string; cls: string }> = {
  settings: { text: "Đặt ở đây", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  env: { text: "Biến môi trường máy chủ", cls: "bg-slate-50 text-slate-600 border-slate-200" },
  none: { text: "Chưa cấu hình", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

export function ServiceKeys({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<KeyRow[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/service-keys");
      if (res.status === 403) { setForbidden(true); return; }
      if (res.ok) setRows(((await res.json()) as { keys: KeyRow[] }).keys);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const changed = Object.entries(draft).filter(([, v]) => v.trim() !== "");

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/service-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(changed)) });
      const j = (await res.json()) as { ok: boolean; message?: string; error?: string; keys?: KeyRow[] };
      setMsg({ ok: j.ok, text: j.ok ? j.message ?? "Đã lưu" : j.error ?? "Lưu thất bại" });
      if (j.ok) { setDraft({}); if (j.keys) setRows(j.keys); }
    } catch {
      setMsg({ ok: false, text: "Không gọi được máy chủ" });
    } finally {
      setSaving(false);
    }
  }

  if (forbidden || !rows) return null;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-bold text-slate-800">Khoá dịch vụ khác</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Tra tìm kiếm, đọc quảng cáo đối thủ, gửi email, báo cáo KPI. Có hiệu lực ngay sau khi lưu. Nếu máy chủ đã đặt biến môi trường cùng tên thì biến đó được ưu tiên.
        </p>
      </div>

      <div className="divide-y divide-slate-100">
        {rows.map((r) => (
          <div key={r.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`sk-${r.key}`} className="text-sm font-medium text-slate-800">{r.label}</label>
                <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", SOURCE[r.source].cls)}>{SOURCE[r.source].text}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{r.help}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                id={`sk-${r.key}`}
                type={r.secret && !show[r.key] ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                placeholder={r.value || "Dán giá trị…"}
                value={draft[r.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                disabled={!canEdit || r.source === "env"}
                title={r.source === "env" ? "Đang dùng biến môi trường máy chủ — đổi ở Coolify" : !canEdit ? "Chỉ Super Admin mới được sửa khoá" : undefined}
                className="font-mono text-xs"
              />
              {r.secret && (
                <Button type="button" variant="ghost" size="sm" className="h-9 w-9 shrink-0 p-0" aria-label={show[r.key] ? "Ẩn" : "Hiện"} onClick={() => setShow((s) => ({ ...s, [r.key]: !s[r.key] }))}>
                  {show[r.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {msg && (
        <div role="status" className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", msg.ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700")}>
          {msg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={!canEdit || saving || changed.length === 0} title={!canEdit ? "Chỉ Super Admin mới được sửa khoá" : undefined} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Lưu khoá
        </Button>
      </div>
    </div>
  );
}
