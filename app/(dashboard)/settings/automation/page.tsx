"use client";

// Auto-Apply settings.
//
// Replaces the previous orphan page at app/settings/automation, which sat
// outside the (dashboard) route group (so it rendered with no sidebar), was
// linked from no navigation, and toggled three rule ids that existed nowhere
// in the backend against two endpoints that were never implemented.
//
// The rules below are the real action names the Improvements engine emits
// and applyOne() executes, and every number shown comes from
// /api/automation/auto-apply — no placeholder values.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, Eye, ShieldCheck, AlertTriangle } from "lucide-react";
import { useAdsStore } from "@/store/useAdsStore";
import { cn } from "@/lib/utils";
import { companyIds } from "@/lib/companies/registry";

type Company = string;
type Mode = "dry_run" | "auto_apply";

interface SettingsResponse {
  enabledRules?: string[];
  mode?: Mode | null;
  effectiveMode?: Mode;
  envMode?: Mode;
  updatedAt?: string | null;
  updatedBy?: string | null;
  error?: string;
}

interface PreviewCandidate {
  id: string;
  type: string;
  title: string;
  action?: string;
  impactValue: number;
  ruleEnabled: boolean;
}

interface PreviewResponse {
  success?: boolean;
  pendingCount?: number;
  eligibleCount?: number;
  blockedCount?: number;
  totalSavings?: number;
  potentialSavings?: number;
  candidates?: PreviewCandidate[];
  error?: string;
}

// Descriptions state what the action does to the account — deliberately not
// a "safety score", which would be an opinion the backend does not compute.
const RULES: { id: string; label: string; desc: string; reversible: string }[] = [
  {
    id: "PAUSE_KEYWORD",
    label: "Tạm dừng keyword lãng phí",
    desc: "Pause keyword tiêu tiền nhưng không ra chuyển đổi.",
    reversible: "Bật lại được",
  },
  {
    id: "ADD_NEGATIVE",
    label: "Thêm negative keyword",
    desc: "Chặn search term không liên quan khỏi campaign.",
    reversible: "Xoá lại được",
  },
  {
    id: "UPDATE_BUDGET",
    label: "Điều chỉnh ngân sách",
    desc: "Thay đổi ngân sách ngày của campaign.",
    reversible: "Ảnh hưởng chi tiêu ngay",
  },
  {
    id: "UPDATE_TARGET_CPA",
    label: "Điều chỉnh Target CPA",
    desc: "Thay đổi Target CPA của chiến lược đặt giá thầu.",
    reversible: "Ảnh hưởng phân phối",
  },
  {
    id: "UPDATE_DEVICE_BID",
    label: "Điều chỉnh bid theo thiết bị",
    desc: "Thay đổi hệ số giá thầu cho mobile/desktop/tablet.",
    reversible: "Ảnh hưởng phân phối",
  },
];

const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));

export default function AutomationSettingsPage() {
  const storeCompany = useAdsStore((s) => s.selectedCompany);
  // The store allows "all"; this page configures one company at a time.
  const [company, setCompany] = useState<Company>(
    storeCompany === "MBI" ? "MBI" : "MBC",
  );

  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  useEffect(() => {
    if (storeCompany === "MBC" || storeCompany === "MBI") setCompany(storeCompany);
  }, [storeCompany]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [sRes, pRes] = await Promise.all([
        fetch(`/api/automation/settings?company=${company}`),
        fetch(`/api/automation/auto-apply?company=${company}`),
      ]);

      const sJson = (await sRes.json()) as SettingsResponse;
      if (!sRes.ok) throw new Error(sJson.error || `Không tải được cấu hình (HTTP ${sRes.status})`);
      setSettings(sJson);

      const pJson = (await pRes.json()) as PreviewResponse;
      if (!pRes.ok) {
        // Show the real reason rather than a silent empty state.
        setPreview(null);
        setLoadError(pJson.error || `Không tải được danh sách chờ (HTTP ${pRes.status})`);
      } else {
        setPreview(pJson);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Lỗi kết nối");
    }
  }, [company]);

  useEffect(() => {
    void load();
  }, [load]);

  const enabledRules = settings?.enabledRules ?? [];

  async function toggleRule(ruleId: string, enable: boolean) {
    setSaving(true);
    setRunMsg(null);
    try {
      const updated = enable
        ? [...new Set([...enabledRules, ruleId])]
        : enabledRules.filter((r) => r !== ruleId);

      const res = await fetch("/api/automation/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, enabledRules: updated }),
      });
      const json = (await res.json()) as SettingsResponse;
      if (!res.ok) throw new Error(json.error || `Lưu thất bại (HTTP ${res.status})`);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function setMode(mode: Mode) {
    setSaving(true);
    setRunMsg(null);
    try {
      const res = await fetch("/api/automation/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, mode }),
      });
      const json = (await res.json()) as SettingsResponse;
      if (!res.ok) throw new Error(json.error || `Lưu thất bại (HTTP ${res.status})`);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function runNow(dryRun: boolean) {
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await fetch("/api/automation/auto-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, dryRun }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);

      setRunMsg(
        dryRun
          ? `Chạy thử: sẽ áp dụng ${json.applied} mục · ước tính ₫${vnd(json.savings ?? 0)}` +
              (json.blocked ? ` · ${json.blocked} mục bị chặn do quy tắc đang tắt` : "")
          : `Đã áp dụng ${json.applied} mục · ₫${vnd(json.savings ?? 0)}` +
              (json.failed ? ` · ${json.failed} mục thất bại` : ""),
      );
      await load();
    } catch (err) {
      setRunMsg(`Lỗi: ${err instanceof Error ? err.message : "không rõ"}`);
    } finally {
      setRunning(false);
    }
  }

  const effectiveMode = settings?.effectiveMode ?? "dry_run";
  const isAuto = effectiveMode === "auto_apply";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Auto-Apply</h2>
          <p className="text-sm text-slate-500">
            Chọn loại hành động được phép tự động áp dụng từ danh sách Cải tiến.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {companyIds().map((c) => (
            <button
              key={c}
              onClick={() => setCompany(c)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                company === c ? "bg-amber-500 text-amber-950" : "text-slate-500 hover:bg-slate-50",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Mode */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Chế độ chạy tự động ({company})</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {isAuto
                ? "Cron sẽ thực sự thay đổi tài khoản quảng cáo với các quy tắc đang bật."
                : "Cron chỉ gửi đề xuất qua Telegram, không thay đổi tài khoản."}
              {settings?.mode == null && (
                <> Đang dùng mặc định từ biến môi trường (<code>{settings?.envMode ?? "dry_run"}</code>).</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 p-1">
            {(["dry_run", "auto_apply"] as Mode[]).map((m) => (
              <button
                key={m}
                disabled={saving}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                  effectiveMode === m
                    ? m === "auto_apply"
                      ? "bg-red-500 text-white"
                      : "bg-slate-700 text-white"
                    : "text-slate-500 hover:bg-slate-50",
                )}
              >
                {m === "dry_run" ? "Chỉ đề xuất" : "Tự động áp dụng"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pending work — real counts from the same set the cron acts on */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        {preview === null ? (
          <p className="text-sm text-slate-400">Chưa tải được danh sách chờ.</p>
        ) : (preview.pendingCount ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">
            Hiện không có cải tiến nào đủ điều kiện tự động áp dụng cho {company}.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-slate-800">
                {preview.eligibleCount ?? 0}/{preview.pendingCount} mục sẽ chạy theo cấu hình hiện tại
              </p>
              <p className="text-xs text-slate-500">
                Giá trị ước tính từ engine Cải tiến: ₫{vnd(preview.totalSavings ?? 0)}
                {(preview.blockedCount ?? 0) > 0 && (
                  <> · {preview.blockedCount} mục bị chặn vì quy tắc đang tắt</>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => runNow(true)}
                disabled={running}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Eye className="h-4 w-4" /> Chạy thử
              </button>
              <button
                onClick={() => runNow(false)}
                disabled={running || (preview.eligibleCount ?? 0) === 0}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-600 disabled:opacity-50"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Chạy ngay
              </button>
            </div>
          </div>
        )}
        {runMsg && <p className="mt-3 text-sm text-slate-600">{runMsg}</p>}
      </div>

      {/* Rules */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Loại hành động được phép</h3>
        {RULES.map((rule) => {
          const on = enabledRules.includes(rule.id);
          const waiting = preview?.candidates?.filter((c) => c.action === rule.id).length ?? 0;
          return (
            <div key={rule.id} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-medium text-slate-800">{rule.label}</h4>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      <ShieldCheck className="mr-0.5 inline h-3 w-3" />
                      {rule.reversible}
                    </span>
                    {waiting > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        {waiting} mục đang chờ
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{rule.desc}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">{rule.id}</p>
                </div>
                <button
                  onClick={() => toggleRule(rule.id, !on)}
                  disabled={saving}
                  aria-label={`${on ? "Tắt" : "Bật"} ${rule.label}`}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50",
                    on ? "bg-amber-500" : "bg-slate-200",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
                      on ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm">
        <p className="mb-2 font-medium text-slate-700">Lịch chạy tự động</p>
        <div className="space-y-1 text-xs text-slate-500">
          <p>• 09:00 hằng ngày (giờ VN): quét và xử lý cải tiến đủ điều kiện</p>
          <p>• Mọi thay đổi đều gửi Telegram và ghi vào lịch sử job</p>
          <p>• Đổi giờ bằng biến môi trường IMPROVEMENTS_AUTO_APPLY_CRON</p>
        </div>
        {settings?.updatedAt && (
          <p className="mt-3 text-[11px] text-slate-400">
            Cập nhật lần cuối: {new Date(settings.updatedAt).toLocaleString("vi-VN")}
            {settings.updatedBy ? ` · ${settings.updatedBy}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
