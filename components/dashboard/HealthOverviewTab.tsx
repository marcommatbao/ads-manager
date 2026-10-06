"use client";

// ============================================================
// Dashboard → "🩺 Tình trạng & cảnh báo" (Đợt 5)
// ------------------------------------------------------------
// Một lần nhìn biết đang hỏng gì, sửa gì trước — gộp phát hiện của Đợt 1-4
// (Sức khoẻ đo lường, Chẩn đoán gắn thẻ, Tổng quan chiến dịch, Theo dõi phiên
// xử lý) từ GET /api/overview/health, KHÔNG gọi API mới. Đọc lib/overview/health.ts
// CHỈ lấy type — hàm thật (healthOverview) chạy Google/Meta client + fs, không
// được import giá trị vào client component (xem AGENTS.md phần việc Đợt 5).
// ============================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, type PillTone } from "@/components/measure/Pill";
import { ddmmyyyy, datetimeVN, num, vnd } from "@/components/case/format";
import { getJson, postJson, putJson, ApiError } from "@/components/case/api";
import { useToast } from "@/components/Toast";
import { useSession } from "@/components/SessionProvider";
import { resolveCompanyScope } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { CardTone, FixItem, HealthOverview, StatusCard } from "@/lib/overview/health";
import type { ChangeLevel, MonitorChange } from "@/lib/monitor/measure-monitor";
import type { LeadFlow, LeadFlowStatus } from "@/lib/monitor/lead-flow";
import { orderedCompanyIds, companyLabel } from "@/lib/companies/registry";

type CompanyFilter = string /* mã công ty hoặc "ALL" */;
type HealthResponse = { success: true } & HealthOverview;

const TONE_PILL: Record<CardTone, { tone: PillTone; text: string }> = {
  ok: { tone: "green", text: "✓ Ổn" },
  warn: { tone: "amber", text: "⚠ Cần chú ý" },
  bad: { tone: "red", text: "✕ Cần sửa" },
  unknown: { tone: "grey", text: "? Không đọc được" },
};

const RANK_LABEL: Record<FixItem["rank"], string> = {
  measurement: "Đo lường",
  money: "Tiền",
  overdue: "Quá hạn",
};
const RANK_TONE: Record<FixItem["rank"], PillTone> = {
  measurement: "red",
  money: "amber",
  overdue: "blue",
};

export function HealthOverviewTab() {
  const { user } = useSession();
  const allowedCompanies = resolveCompanyScope(user?.companies, user?.role);
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>("ALL");
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force?: boolean) => {
    if (force) setPulling(true); else setLoading(true);
    setError(null);
    try {
      const json = await getJson(`/api/overview/health?company=${companyFilter}${force ? "&force=1" : ""}`);
      setData(json);
    } catch (e) {
      // "Kéo lại" hỏng cũng KHÔNG giữ số cũ trên màn — số cũ có thể đã lỗi thời.
      setError(e instanceof ApiError ? e.message : "Không tải được tình trạng & cảnh báo");
      setData(null);
    } finally {
      setLoading(false);
      setPulling(false);
    }
  }, [companyFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">🩺 Tình trạng &amp; cảnh báo</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Một lần nhìn biết đang hỏng gì, sửa gì trước — gộp từ Sức khoẻ đo lường, Chẩn đoán gắn thẻ, Tổng quan chiến dịch và Theo dõi phiên xử lý.
          </p>
        </div>
        <Button className="h-10" variant="outline" size="sm" onClick={() => load(true)} disabled={loading || pulling}>
          {pulling ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />} Kéo lại
        </Button>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-slate-400">Công ty</div>
        <div role="tablist" aria-label="Công ty" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {([
            { value: "ALL", label: "Tất cả" },
            { value: "MBI", label: "MBI" },
            { value: "MBC", label: "MBC" },
          ] as const).map((f) => {
            const allowed = f.value === "ALL" || allowedCompanies.includes(f.value);
            return (
              <button
                key={f.value}
                role="tab"
                aria-selected={companyFilter === f.value}
                disabled={!allowed}
                onClick={() => setCompanyFilter(f.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                  companyFilter === f.value ? "bg-blue-600 text-white" : allowed ? "text-slate-600 hover:bg-slate-50" : "cursor-not-allowed text-slate-300",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading && <HealthSkeleton />}

      {!loading && error && (
        <EmptyState
          icon={AlertTriangle}
          title={error}
          description="Số cũ không hiển thị để tránh xử lý trên dữ liệu lỗi thời."
          action={<Button className="h-10" onClick={() => load()} disabled={loading}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Thử lại</Button>}
        />
      )}

      {!loading && !error && data && (
        <>
          <section>
            <h3 className="mb-1 text-base font-bold text-slate-900">Thẻ tình trạng</h3>
            <p className="mb-3 text-sm text-slate-500">Mỗi thẻ đọc từ một nguồn sẵn có, đệm dùng lại 30 phút. Nguồn nào hỏng chỉ thẻ đó báo &ldquo;Không đọc được&rdquo; — các thẻ khác vẫn hiện.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {data.cards.map((card) => <HealthCard key={card.id} card={card} />)}
            </div>
          </section>

          <section>
            <h3 className="mb-1 text-base font-bold text-slate-900">Sửa gì trước</h3>
            <p className="mb-3 text-sm text-slate-500">Xếp theo: (a) lỗi đo lường chặn mọi thứ khác → (b) tiền chi vượt trần lớn nhất → (c) việc quá hạn.</p>
            {data.fixes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-400">Không có gì cần sửa gấp.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="w-8 px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Vấn đề</th>
                      <th className="px-3 py-2 font-medium">Vì sao quan trọng</th>
                      <th className="px-3 py-2 font-medium">Gợi ý sửa</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.fixes.map((fix, i) => (
                      <tr key={fix.id} className="border-b border-slate-50 align-top last:border-0">
                        <td className="px-3 py-2.5 tabular-nums text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2.5">
                          <Pill tone={RANK_TONE[fix.rank]} className="mb-1">{RANK_LABEL[fix.rank]}</Pill>
                          <div className="font-semibold text-slate-900">{fix.title}</div>
                          {fix.money !== undefined && <div className="mt-0.5 text-xs font-semibold tabular-nums text-red-600">{vnd(fix.money)}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{fix.why}</td>
                        <td className="px-3 py-2.5 text-slate-600">{fix.suggestion}</td>
                        <td className="px-3 py-2.5">
                          <Link href={fix.href}>
                            <Button className="h-8" size="sm" variant="outline">{fix.hrefLabel}</Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-base font-bold text-slate-900">Điểm cần lưu ý</h3>
            <p className="mb-3 text-sm text-slate-500">Không phải lỗi — nhưng phải biết khi đọc số ở các trang khác.</p>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              {data.notes.map((n, i) => <div key={i}>ℹ {n}</div>)}
            </div>
          </section>
        </>
      )}

      <LeadFlowSection />
      <MonitorSection />
    </div>
  );
}

// ============================================================
// "Đường lead" (Đợt 9 · 1) — canh khách gửi form trên web (pixel) ↔ lead vào
// CRM (Odoo), job lead_flow_watch (2 giờ/lần). Đọc riêng từ GET
// /api/overview/lead-flows (KHÔNG gộp vào state "Thẻ tình trạng" ở trên —
// khác API, tải/refresh độc lập). id="duong-lead" là đích của thẻ "Đường lead"
// (lib/overview/health.ts, href="/?tab=health#duong-lead").
// ============================================================

interface LeadFlowsResponse {
  success: true;
  flows: LeadFlow[];
  statuses: LeadFlowStatus[];
  canEdit: boolean;
  canRunNow: boolean;
  jobId: string;
}

const LEAD_STATUS_PILL: Record<LeadFlowStatus["status"], { tone: PillTone; text: string }> = {
  ok: { tone: "green", text: "✓ Bình thường" },
  broken: { tone: "red", text: "✕ ĐỨT" },
  quiet: { tone: "grey", text: "◌ Yên" },
  error: { tone: "amber", text: "? Không kiểm được" },
};

const EMPTY_FLOW: LeadFlow = { id: "", company: "MBI", label: "", pixelId: "", pixelEvents: [], odooSourceIlike: "", minForms: 5, minExpectedLeads: 4, quietHours: 24, enabled: true };

function LeadFlowSection() {
  const { toast } = useToast();
  const [data, setData] = useState<LeadFlowsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LeadFlow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const json = await getJson("/api/overview/lead-flows");
      setData(json);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không tải được đường lead");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Cuộn tới đây khi mở từ thẻ "Đường lead" — đợi tải xong mới có phần tử để cuộn tới.
  useEffect(() => {
    if (!loading && data && window.location.hash === "#duong-lead") {
      document.getElementById("duong-lead")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading, data]);

  async function runNow() {
    if (!data) return;
    setRunning(true);
    try {
      await postJson(`/api/jobs/${data.jobId}/trigger`);
      toast({ title: "✅ Đã kiểm xong đường lead" });
      await load();
    } catch (e) {
      toast({ title: e instanceof ApiError ? `❌ ${e.message}` : "❌ Không chạy được job", variant: "error" });
    } finally {
      setRunning(false);
    }
  }

  function startEdit() {
    setDraft((data?.flows ?? []).map((f) => ({ ...f })));
    setSaveError(null);
    setEditing(true);
  }
  function cancelEdit() { setEditing(false); setSaveError(null); }
  function addRow() { setDraft((d) => [...d, { ...EMPTY_FLOW }]); }
  function removeRow(i: number) { setDraft((d) => d.filter((_, idx) => idx !== i)); }
  function patchRow(i: number, patch: Partial<LeadFlow>) { setDraft((d) => d.map((r, idx) => (idx === i ? { ...r, ...patch } : r))); }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await putJson("/api/overview/lead-flows", { flows: draft });
      setEditing(false);
      toast({ title: "✅ Đã lưu cấu hình đường lead" });
      await load();
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "Không lưu được — thử lại sau");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="duong-lead" className="scroll-mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="mb-1 text-base font-bold text-slate-900">Đường lead</h3>
          <p className="max-w-2xl text-sm text-slate-500">
            So số lượt gửi form trên pixel với lead vào CRM mỗi 2 giờ; đứt quá ngưỡng → báo Teams kênh IT.
          </p>
        </div>
        {data?.canRunNow && (
          <Button className="h-9" size="sm" onClick={runNow} disabled={running || loading}>
            {running && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Kiểm ngay
          </Button>
        )}
      </div>

      {loading && <div className="mt-3 h-32 animate-pulse rounded-xl bg-slate-100" />}
      {!loading && error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!loading && !error && data && (
        <div className="mt-3 space-y-3">
          {data.statuses.length === 0 ? (
            <EmptyState compact title="Chưa kiểm lần nào — bấm Kiểm ngay hoặc chờ lượt 2 giờ" />
          ) : (
            data.flows.map((flow) => {
              const st = data.statuses.find((s) => s.flow.id === flow.id) ?? null;
              return <LeadFlowCard key={flow.id} flow={flow} status={st} />;
            })
          )}

          {data.canEdit && !editing && (
            <div className="rounded-xl border border-dashed border-slate-200 p-3 text-right">
              <Button size="sm" variant="outline" onClick={startEdit}>Sửa cấu hình đường lead</Button>
            </div>
          )}
          {data.canEdit && editing && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-800">Sửa cấu hình đường lead</div>
              {saveError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>}
              {draft.length === 0 && <div className="text-sm text-slate-400">Chưa có đường nào — bấm &quot;Thêm đường&quot; để tạo.</div>}
              <div className="space-y-3">
                {draft.map((f, i) => (
                  <LeadFlowEditorRow key={i} flow={f} onChange={(patch) => patchRow(i, patch)} onRemove={() => removeRow(i)} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={addRow}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Thêm đường</Button>
                <div className="flex-1" />
                <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>Huỷ</Button>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Lưu
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function LeadFlowCard({ flow, status }: { flow: LeadFlow; status: LeadFlowStatus | null }) {
  const pill = status ? LEAD_STATUS_PILL[status.status] : { tone: "grey" as PillTone, text: "? Chưa kiểm" };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-sm font-semibold text-slate-800">{flow.label}</span>
          <span className="ml-2 text-xs text-slate-400">{flow.company}{!flow.enabled ? " · tắt" : ""}</span>
        </div>
        <Pill tone={pill.tone}>{pill.text}</Pill>
      </div>
      {status ? (
        <>
          <p className="mt-2 text-sm text-slate-600">{status.message}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Lead cuối: <b className="font-semibold text-slate-700">{status.lastLeadAt ? datetimeVN(status.lastLeadAt) : "chưa có"}</b></span>
            <span>Form sau đó: <b className="font-semibold tabular-nums text-slate-700">{num(status.formsSinceLead)}</b></span>
            {status.expectedLeads !== null && <span>Lẽ ra ~<b className="font-semibold tabular-nums text-slate-700">{num(status.expectedLeads)}</b> lead</span>}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-1 pr-4 font-medium">Ngày</th>
                  <th className="py-1 pr-4 font-medium">Form</th>
                  <th className="py-1 font-medium">Lead</th>
                </tr>
              </thead>
              <tbody>
                {status.days.map((d) => (
                  <tr key={d.date} className="border-t border-slate-50">
                    <td className="py-1 pr-4 text-slate-500">{ddmmyyyy(d.date)}</td>
                    <td className="py-1 pr-4 tabular-nums text-slate-700">{d.forms}</td>
                    <td className="py-1 tabular-nums text-slate-700">{d.leads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-400">Chưa kiểm lần nào.</p>
      )}
    </div>
  );
}

function LeadFlowEditorRow({ flow, onChange, onRemove }: { flow: LeadFlow; onChange: (patch: Partial<LeadFlow>) => void; onRemove: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-100 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-28" placeholder="Mã (a-z0-9_)" value={flow.id} onChange={(e) => onChange({ id: e.target.value })} />
        <Input className="w-56 flex-1" placeholder="Tên hiển thị" value={flow.label} onChange={(e) => onChange({ label: e.target.value })} />
        <div role="tablist" aria-label="Công ty" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(orderedCompanyIds(["MBI", "MBC"]) as ("MBI" | "MBC")[]).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={flow.company === c}
              onClick={() => onChange({ company: c })}
              className={cn("rounded-md px-2.5 py-1 text-xs font-semibold transition-colors", flow.company === c ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50")}
            >
              {c === "MBC" || c === "MBI" ? c : companyLabel(c)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={flow.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} /> Bật
        </label>
        <Button size="icon-sm" variant="ghost" aria-label="Xoá đường" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-40" placeholder="Pixel ID" value={flow.pixelId} onChange={(e) => onChange({ pixelId: e.target.value })} />
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Tên sự kiện form, cách nhau bằng dấu phẩy"
          value={flow.pixelEvents.join(", ")}
          onChange={(e) => onChange({ pixelEvents: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
        />
        <Input className="min-w-[180px] flex-1" placeholder="Nguồn lead Odoo chứa chuỗi này" value={flow.odooSourceIlike} onChange={(e) => onChange({ odooSourceIlike: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <label className="flex items-center gap-1.5">Sàn form ≥ <Input className="w-16" type="number" min={1} value={flow.minForms} onChange={(e) => onChange({ minForms: Number(e.target.value) })} /></label>
        <label className="flex items-center gap-1.5">Lead kỳ vọng ≥ <Input className="w-16" type="number" min={1} value={flow.minExpectedLeads} onChange={(e) => onChange({ minExpectedLeads: Number(e.target.value) })} /></label>
        <label className="flex items-center gap-1.5">Yên (giờ) ≥ <Input className="w-16" type="number" min={2} value={flow.quietHours} onChange={(e) => onChange({ quietHours: Number(e.target.value) })} /></label>
      </div>
    </div>
  );
}

// ============================================================
// "Giám sát đo lường" (Đợt 6 · A) — job measure_monitor so ảnh chụp sức khoẻ
// đo lường hôm nay với hôm qua, chỉ báo Teams khi có thay đổi. Đọc riêng từ
// GET /api/overview/monitor (KHÔNG gộp vào state của khối trên) vì đây là một
// nguồn khác, tải/refresh độc lập.
// ============================================================

type MonitorTeamsStatus = { sent: boolean; skipped?: string; error?: string };

interface MonitorRunSummary {
  date: string;
  at: string;
  comparedTo: string | null;
  teams: MonitorTeamsStatus;
  changes: MonitorChange[];
}

interface MonitorResponse {
  success: true;
  runs: MonitorRunSummary[];
  teamsConfigured: boolean;
  canRunNow: boolean;
  jobId: string;
}

const CHANGE_PILL: Record<ChangeLevel, { tone: PillTone; text: string }> = {
  bad: { tone: "red", text: "✕ Hỏng mới" },
  good: { tone: "green", text: "✓ Đã khỏi" },
  info: { tone: "grey", text: "ℹ Thông tin" },
};

function teamsNoteOf(t: MonitorTeamsStatus): string | null {
  if (t.sent) return "đã gửi Teams ✓";
  if (t.skipped) return t.skipped;
  if (t.error) return `Teams lỗi: ${t.error}`;
  return null;
}

function MonitorSection() {
  const { toast } = useToast();
  const [data, setData] = useState<MonitorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const json = await getJson("/api/overview/monitor");
      setData(json);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không tải được giám sát đo lường");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runNow() {
    if (!data) return;
    setRunning(true);
    try {
      const json = await postJson(`/api/jobs/${data.jobId}/trigger`);
      const run = (json.result as { run?: { changes: { level: ChangeLevel }[]; teams: MonitorTeamsStatus } } | undefined)?.run;
      if (run) {
        const bad = run.changes.filter((c) => c.level === "bad").length;
        const note = teamsNoteOf(run.teams);
        toast({ title: `✅ Đã chạy xong — ${run.changes.length} thay đổi (${bad} hỏng mới)${note ? `, ${note}` : ""}` });
      } else {
        toast({ title: "✅ Đã gọi job measure_monitor — đang so ảnh chụp…" });
      }
      await load();
    } catch (e) {
      toast({ title: e instanceof ApiError ? `❌ ${e.message}` : "❌ Không chạy được job", variant: "error" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <section>
      <h3 className="mb-1 text-base font-bold text-slate-900">Giám sát đo lường</h3>
      <p className="mb-3 text-sm text-slate-500">
        Tự động so ảnh chụp sức khoẻ đo lường hôm nay với hôm qua — không cần ai mở trang này mới biết đã hỏng. Chỉ gửi Teams khi có thay đổi.
      </p>

      {loading && <div className="h-32 animate-pulse rounded-xl bg-slate-100" />}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && data && (
        <div className="space-y-3">
          {!data.teamsConfigured && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              ⚠ Chưa có kênh Teams — thay đổi chỉ hiện ở đây.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm">
              <div className="text-xs text-slate-400">Lần chạy gần nhất · chạy mỗi ngày 09:00 (giờ VN)</div>
              {data.runs.length === 0 ? (
                <div className="mt-0.5 font-semibold text-slate-700">Chưa chạy lần nào — job chạy mỗi ngày 09:00.</div>
              ) : (
                <div className="mt-0.5 font-semibold text-slate-800">
                  {data.runs[0].at} · {data.runs[0].date}
                  {teamsNoteOf(data.runs[0].teams) && <span className="ml-2 font-normal text-slate-500">{teamsNoteOf(data.runs[0].teams)}</span>}
                </div>
              )}
            </div>
            {data.canRunNow && (
              <div className="text-right">
                <Button className="h-9" size="sm" onClick={runNow} disabled={running}>
                  {running && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Chạy ngay
                </Button>
                <div className="mt-1 text-xs text-slate-400">Chỉ super admin bấm được</div>
              </div>
            )}
          </div>

          {data.runs.length > 0 && (
            <div className="space-y-2">
              {data.runs.map((run, idx) => (
                <details key={run.date} className="group rounded-xl border border-slate-200 bg-white" open={idx === 0}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span>
                      <b className="text-slate-800">{run.date} · {run.at}</b>{" "}
                      <span className="text-slate-600">{run.changes.length === 0 ? "— không có thay đổi" : `— ${run.changes.length} thay đổi`}</span>{" "}
                      <span className="text-xs text-slate-400">{run.comparedTo ? `so với ${run.comparedTo}` : "lần chạy đầu — chỉ lưu"}</span>
                    </span>
                    <Pill tone={run.teams.sent ? "green" : "grey"}>{run.teams.sent ? "✓ Đã gửi Teams" : "– Không gửi Teams"}</Pill>
                  </summary>
                  <div className="space-y-1.5 border-t border-slate-100 px-4 py-3 text-sm">
                    {run.changes.length === 0 ? (
                      <p className="text-slate-400">Không có thay đổi</p>
                    ) : (
                      run.changes.map((c, i) => {
                        const pill = CHANGE_PILL[c.level];
                        return (
                          <div key={i} className="flex flex-wrap items-start gap-2">
                            <Pill tone={pill.tone}>{pill.text}</Pill>
                            <span className="text-slate-700">{c.text}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function HealthCard({ card }: { card: StatusCard }) {
  const pill = TONE_PILL[card.tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">{card.title}</span>
        <Pill tone={pill.tone}>{pill.text}</Pill>
      </div>
      <p className="mt-2 text-sm text-slate-500">{card.text}</p>
      {card.error && <p className="mt-1 text-xs text-red-600">{card.error}</p>}
      <Link href={card.href} className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:underline">
        Xem chi tiết →
      </Link>
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Đang tổng hợp từ 4 nguồn… lần tải đầu có thể mất tới 60 giây.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}
