"use client";

// A/B test tệp — Đợt 27. Tool giữ nhóm A, tạo nhóm B y hệt (chỉ đổi tệp), đo bằng phép thử của bảng so sánh.
// Mọi thao tác ghi đi qua /api/meta/ab-audience (máy chủ kiểm lại quyền + trạng thái thật trên Meta).
// Lib phía máy chủ chỉ được `import type` ở đây.

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Pill, type PillTone } from "@/components/measure/Pill";
import { vnd, num, datetimeVN } from "@/components/case/format";
import { getJson, postJson, ApiError } from "@/components/case/api";
import type { CompareGroup, RankedAdset } from "@/lib/meta/audience-compare";
import type { AbAudienceTest } from "@/lib/meta/ab-audience";
import type { WinningAudience } from "@/lib/meta/winning-audiences";

type Reading = { tone: "win_a" | "win_b" | "leaning" | "wait"; text: string };
type Entry = {
  test: AbAudienceTest;
  measure: { group: CompareGroup | null; days: number; range: { from: string; to: string } | null } | null;
  reading: Reading | null;
  error: string | null;
};
type ListResponse = { success: true; company: string; canEdit: boolean; tests: Entry[] };

type Plan = {
  campaignId: string; campaignName: string; goalKind: string;
  a: { adsetId: string; adsetName: string; summary: string };
  bName: string; bSummary: string; bTargeting: unknown; droppedKeys: string[];
  dailyBudget: number | null; ads: number; overlapPct: number;
  blockers: string[]; warnings: string[]; validated: boolean; metaError: string | null;
};

const abKey = (company: string) => `/api/meta/ab-audience?company=${company}`;
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

const STATUS_UI: Record<AbAudienceTest["status"], { tone: PillTone; label: string }> = {
  draft: { tone: "grey", label: "Nháp — chưa chạy" },
  running: { tone: "blue", label: "Đang chạy" },
  ended: { tone: "green", label: "Đã kết thúc" },
  discarded: { tone: "grey", label: "Đã huỷ" },
};

const READING_BOX: Record<Reading["tone"], string> = {
  win_a: "border-emerald-200 bg-emerald-50 text-emerald-800",
  win_b: "border-emerald-200 bg-emerald-50 text-emerald-800",
  leaning: "border-amber-200 bg-amber-50 text-amber-800",
  wait: "border-slate-200 bg-slate-50 text-slate-700",
};

// ---------- Form tạo nhóm B từ một dòng nhóm quảng cáo ----------

export function AbCreateForm({ company, source, saved, onClose, onCreated }: {
  company: string;
  source: RankedAdset;
  saved: WinningAudience[];
  onClose: () => void;
  onCreated: (text: string) => void;
}) {
  const options = saved.filter((w) => w.goalKind === source.goalKind);
  const [mode, setMode] = useState<"winning" | "edit">(options.length > 0 ? "winning" : "edit");
  const [winningId, setWinningId] = useState(options[0]?.id ?? "");
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [gender, setGender] = useState<"all" | "1" | "2">("all");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<"plan" | "create" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const ageOk = Number.isInteger(ageMin) && Number.isInteger(ageMax) && ageMin >= 18 && ageMax <= 65 && ageMin <= ageMax;
  const formOk = mode === "winning" ? !!winningId : ageOk;

  function variant() {
    if (mode === "winning") {
      const w = options.find((o) => o.id === winningId);
      return { kind: "winning", winningId, name: w?.name ?? "" };
    }
    return { kind: "edit", ageMin, ageMax, genders: gender === "all" ? [] : [Number(gender)] };
  }

  function touch() { setPlan(null); setErr(null); }

  async function run(action: "plan" | "create") {
    setBusy(action);
    setErr(null);
    try {
      const res = await postJson("/api/meta/ab-audience", { action, company, sourceAdsetId: source.id, variant: variant() });
      if (action === "plan") setPlan(res.plan as Plan);
      else {
        await globalMutate(abKey(company));
        onCreated(`Đã tạo nhóm B cho “${source.name}” ở trạng thái tạm dừng. Bấm “Bắt đầu thử nghiệm” ở mục A/B test tệp bên dưới khi sẵn sàng.`);
      }
    } catch (e) {
      setErr(errMsg(e, action === "plan" ? "Không kiểm tra được với Meta." : "Không tạo được nhóm B."));
    } finally {
      setBusy(null);
    }
  }

  const canCreate = !!plan && plan.validated && plan.blockers.length === 0 && !plan.metaError;

  return (
    <div className="mt-2 max-w-2xl space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <div className="font-semibold text-slate-800">🧪 A/B test tệp cho “{source.name}” (nhóm A)</div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-slate-500">Nhóm B dùng tệp nào?</legend>
        <label className={cn("flex items-start gap-2", options.length === 0 && "opacity-60")}>
          <input type="radio" className="mt-1 h-4 w-4" name={`ab-mode-${source.id}`} checked={mode === "winning"} disabled={options.length === 0} onChange={() => { setMode("winning"); touch(); }} />
          <span>
            Dùng tệp thắng đã lưu
            {options.length === 0 && <span className="block text-xs text-slate-500">Chưa có tệp thắng đã lưu cùng loại mục tiêu ({source.goalKind === "leads" ? "thu lead" : "bán hàng"}).</span>}
          </span>
        </label>
        {mode === "winning" && options.length > 0 && (
          <label className="block pl-6 text-xs font-medium text-slate-500">
            Tệp thắng
            <select className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800" value={winningId} onChange={(e) => { setWinningId(e.target.value); touch(); }}>
              {options.map((o) => <option key={o.id} value={o.id}>{o.name} — {o.summary}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-start gap-2">
          <input type="radio" className="mt-1 h-4 w-4" name={`ab-mode-${source.id}`} checked={mode === "edit"} onChange={() => { setMode("edit"); touch(); }} />
          <span>Đổi tuổi / giới tính</span>
        </label>
        {mode === "edit" && (
          <div className="grid gap-2 pl-6 sm:grid-cols-3">
            <label className="block text-xs font-medium text-slate-500">
              Tuổi từ (18–65)
              <Input className="mt-1" type="number" min={18} max={65} value={ageMin} onChange={(e) => { setAgeMin(Number(e.target.value)); touch(); }} />
            </label>
            <label className="block text-xs font-medium text-slate-500">
              Đến tuổi (18–65)
              <Input className="mt-1" type="number" min={18} max={65} value={ageMax} onChange={(e) => { setAgeMax(Number(e.target.value)); touch(); }} />
            </label>
            <label className="block text-xs font-medium text-slate-500">
              Giới tính
              <select className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800" value={gender} onChange={(e) => { setGender(e.target.value as "all" | "1" | "2"); touch(); }}>
                <option value="all">Mọi giới</option>
                <option value="1">Nam</option>
                <option value="2">Nữ</option>
              </select>
            </label>
            {!ageOk && <p className="text-xs text-red-600 sm:col-span-3">Tuổi phải từ 18 đến 65 và “từ” không lớn hơn “đến”.</p>}
          </div>
        )}
      </fieldset>

      {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700">{err}</div>}

      {plan && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div><div className="text-xs font-semibold text-slate-500">Nhóm A (giữ nguyên)</div><div className="text-slate-800">{plan.a.adsetName}</div><div className="text-xs text-slate-600">{plan.a.summary}</div></div>
            <div><div className="text-xs font-semibold text-slate-500">Nhóm B (sẽ tạo)</div><div className="text-slate-800">{plan.bName}</div><div className="text-xs text-slate-600">{plan.bSummary}</div></div>
          </div>
          <ul className="space-y-0.5 text-xs text-slate-700">
            <li>Hai tệp trùng nhau khoảng {num(plan.overlapPct)}%.</li>
            <li>Sao chép {num(plan.ads)} quảng cáo sang nhóm B.</li>
            <li>{plan.dailyBudget !== null ? `Khi bắt đầu, chiến dịch chi thêm khoảng ${vnd(plan.dailyBudget)}/ngày cho nhóm B.` : "Ngân sách nhóm B theo chiến dịch (không có ngân sách riêng theo ngày)."}</li>
            {plan.droppedKeys.length > 0 && <li>Không chép được vào nhóm B: {plan.droppedKeys.join(", ")}.</li>}
          </ul>
          {plan.blockers.length > 0 && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              <div className="font-semibold">Chưa tạo được:</div>
              <ul className="list-disc pl-4">{plan.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          )}
          {plan.metaError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">Meta báo lỗi khi kiểm: {plan.metaError}</div>}
          {plan.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              <div className="font-semibold">Lưu ý:</div>
              <ul className="list-disc pl-4">{plan.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          {plan.validated && !plan.metaError && <div className="text-xs font-medium text-emerald-700">✓ Meta đã kiểm hợp lệ (chưa tạo gì).</div>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button className="h-9" variant="outline" size="sm" onClick={() => run("plan")} disabled={busy !== null || !formOk}>
          {busy === "plan" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Xem trước &amp; kiểm với Meta
        </Button>
        <Button className="h-9" size="sm" onClick={() => run("create")} disabled={busy !== null || !canCreate}>
          {busy === "create" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Tạo nhóm B (tạm dừng)
        </Button>
        <Button className="h-9" variant="outline" size="sm" onClick={onClose} disabled={busy !== null}>Đóng</Button>
      </div>
    </div>
  );
}

// ---------- Mục danh sách A/B test ----------

export function AbSection({ company, canEdit }: { company: string; canEdit: boolean }) {
  const { data, error, isLoading, mutate } = useSWR<ListResponse>(company ? abKey(company) : null, getJson);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshErr, setRefreshErr] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setRefreshErr(null);
    try {
      await mutate(getJson(`${abKey(company)}&force=1`) as Promise<ListResponse>, { revalidate: false });
    } catch (e) {
      setRefreshErr(errMsg(e, "Không tải được số mới."));
    } finally {
      setRefreshing(false);
    }
  }

  const tests = data?.tests ?? [];
  const editable = canEdit && (data?.canEdit ?? true);

  return (
    <section className="space-y-3" aria-label="A/B test tệp">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="max-w-3xl">
          <h2 className="text-base font-bold text-slate-900">🧪 A/B test tệp</h2>
          <p className="text-xs text-slate-500">
            Tool giữ nguyên nhóm A và tạo nhóm B y hệt (cùng sự kiện, ngân sách, quảng cáo), chỉ đổi tệp. Đo bằng cùng phép thử của bảng so sánh; cần chạy ít nhất 7 ngày mới kết luận.
            Đây không phải công cụ chia tách người của Meta — hai nhóm vẫn có thể trùng một phần người xem.
          </p>
        </div>
        <Button className="h-10" variant="outline" size="sm" onClick={refresh} disabled={refreshing || !company}>
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden="true" /> Làm mới số
        </Button>
      </div>
      {isLoading && <p className="text-sm text-slate-500">Đang tải…</p>}
      {!isLoading && !!error && <p role="alert" className="text-sm text-red-600">{errMsg(error, "Không tải được danh sách A/B test.")}</p>}
      {refreshErr && <p role="alert" className="text-sm text-red-600">{refreshErr}</p>}
      {!isLoading && !error && tests.length === 0 && (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Chưa có A/B test nào. So sánh các chiến dịch ở trên rồi bấm “🧪 A/B test tệp khác” ở một nhóm đang chạy để tạo nhóm B.</p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {tests.map((e) => <TestCard key={e.test.id} entry={e} canEdit={editable} onChanged={() => mutate()} />)}
      </div>
    </section>
  );
}

function TestCard({ entry, canEdit, onChanged }: { entry: Entry; canEdit: boolean; onChanged: () => void }) {
  const { test: t, measure, reading, error } = entry;
  const ui = STATUS_UI[t.status];
  const [panel, setPanel] = useState<"start" | "discard" | "end" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<string[] | null>(null);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await postJson("/api/meta/ab-audience", { ...body, id: t.id });
      if (body.action === "discard") setReport((res.report as string[]) ?? []);
      setPanel(null);
      onChanged();
    } catch (e) {
      setErr(errMsg(e, "Không thực hiện được — thử lại sau ít phút."));
    } finally {
      setBusy(false);
    }
  }

  const loser = reading?.tone === "win_a" ? "b" : reading?.tone === "win_b" ? "a" : null;
  const pausedLabel = t.result?.paused === t.a.adsetId ? "nhóm A" : t.result?.paused === t.b.adsetId ? "nhóm B" : t.result?.paused ? t.result.paused : "không tạm dừng nhóm nào";

  return (
    <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={ui.tone}>{ui.label}</Pill>
        <span className="break-words font-semibold text-slate-800">{t.campaignName}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><div className="text-xs font-semibold text-slate-500">Nhóm A</div><div className="break-words text-slate-800">{t.a.adsetName}</div><div className="text-xs text-slate-600">{t.a.summary}</div></div>
        <div><div className="text-xs font-semibold text-slate-500">Nhóm B</div><div className="break-words text-slate-800">{t.b.adsetName}</div><div className="text-xs text-slate-600">{t.b.summary}</div></div>
      </div>
      <p className="text-xs text-slate-500">
        Tạo {datetimeVN(t.createdAt)} bởi {t.createdBy}
        {t.startedAt && <> · bắt đầu {datetimeVN(t.startedAt)}</>}
        {t.endedAt && <> · kết thúc {datetimeVN(t.endedAt)}</>}
        {t.overlapPct > 0 && <> · trùng tệp ≈ {num(t.overlapPct)}%</>}
      </p>
      {t.warnings.length > 0 && (
        <details className="text-xs text-amber-800">
          <summary className="cursor-pointer font-medium">Lưu ý ({t.warnings.length})</summary>
          <ul className="mt-1 list-disc pl-4">{t.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      )}

      {t.status === "running" && (
        <div className="space-y-2">
          {reading && <div className={cn("rounded-lg border p-2 text-sm", READING_BOX[reading.tone])}>{reading.text}</div>}
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
          {measure && <p className="text-xs text-slate-500">Đã chạy {num(measure.days)} ngày{measure.days < 7 && " — chưa đủ 7 ngày để kết luận"}.</p>}
          {measure?.group && measure.group.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-xs">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="py-1.5 pr-2 font-medium">Nhóm</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Chi phí</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Kết quả</th>
                    <th className="py-1.5 text-right font-medium">Chi phí/kết quả</th>
                  </tr>
                </thead>
                <tbody>
                  {measure.group.rows.map((r) => {
                    const label = r.id === t.a.adsetId ? "A" : r.id === t.b.adsetId ? "B" : "";
                    return (
                      <tr key={r.id} className="border-b border-slate-50 align-top">
                        <td className="py-1.5 pr-2">
                          <span className="font-medium text-slate-800">{label && `${label} · `}{r.name}</span>
                          {r.flags.length > 0 && <ul className="text-[11px] text-amber-700">{r.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{vnd(r.spend)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{num(r.results)}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {r.costPerResult !== null ? vnd(r.costPerResult) : "—"}
                          {r.cprLow !== null && r.cprHigh !== null && <div className="text-[11px] text-slate-400">≈ {vnd(r.cprLow)}–{vnd(r.cprHigh)}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {t.status === "ended" && t.result && (
        <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
          <p>{t.result.summary}</p>
          <p>Đã đo {num(t.result.days)} ngày · {t.result.paused ? `đã tạm dừng ${pausedLabel}` : "giữ cả hai nhóm"}.</p>
        </div>
      )}

      {report && report.length > 0 && (
        <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
          <ul className="list-disc pl-4">{report.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}
      {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      {canEdit && (t.status === "draft" || t.status === "running") && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {t.status === "draft" && panel !== "start" && (
              <Button className="h-9" size="sm" disabled={busy} onClick={() => { setPanel("start"); setErr(null); }}>▶ Bắt đầu thử nghiệm</Button>
            )}
            {t.status === "running" && panel !== "end" && (
              <Button className="h-9" size="sm" disabled={busy} onClick={() => { setPanel("end"); setErr(null); }}>Kết thúc</Button>
            )}
            {t.status === "draft" && panel !== "discard" && (
              <Button className="h-9" variant="outline" size="sm" disabled={busy} onClick={() => { setPanel("discard"); setErr(null); }}>Huỷ thử nghiệm</Button>
            )}
          </div>
          {panel === "start" && (
            <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-slate-700">
              <p>
                {t.dailyBudget !== null ? <>Chiến dịch sẽ chi thêm khoảng <b>{vnd(t.dailyBudget)}/ngày</b> cho nhóm B. </> : "Nhóm B sẽ bắt đầu chi tiền ngay. "}
                Máy chủ kiểm lại trạng thái thật trên Meta trước khi bật.
              </p>
              <div className="flex gap-2">
                <Button className="h-9" size="sm" disabled={busy} onClick={() => act({ action: "start" })}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Xác nhận bắt đầu</Button>
                <Button className="h-9" variant="outline" size="sm" disabled={busy} onClick={() => setPanel(null)}>Không</Button>
              </div>
            </div>
          )}
          {panel === "discard" && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-slate-700">
              <p>Nhóm B chưa chạy sẽ bị xoá; nếu đã phân phối thì chỉ tạm dừng. Nhóm A không bị đụng tới.</p>
              <div className="flex gap-2">
                <Button className="h-9" size="sm" disabled={busy} onClick={() => act({ action: "discard" })}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Xác nhận huỷ</Button>
                <Button className="h-9" variant="outline" size="sm" disabled={busy} onClick={() => setPanel(null)}>Không</Button>
              </div>
            </div>
          )}
          {panel === "end" && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p>Chọn cách kết thúc{loser ? ` — số đang cho thấy nhóm ${loser === "a" ? "A" : "B"} kém hơn, nhưng bạn quyết định` : ""}.</p>
              <div className="flex flex-wrap gap-2">
                <Button className="h-9" variant="outline" size="sm" disabled={busy} onClick={() => act({ action: "end", pause: null })}>Kết thúc, giữ cả hai</Button>
                <Button className={cn("h-9", loser === "a" && "border-emerald-400")} variant="outline" size="sm" disabled={busy} onClick={() => act({ action: "end", pause: "a" })}>Kết thúc + tạm dừng nhóm A{loser === "a" && " (gợi ý)"}</Button>
                <Button className={cn("h-9", loser === "b" && "border-emerald-400")} variant="outline" size="sm" disabled={busy} onClick={() => act({ action: "end", pause: "b" })}>Kết thúc + tạm dừng nhóm B{loser === "b" && " (gợi ý)"}</Button>
                <Button className="h-9" variant="outline" size="sm" disabled={busy} onClick={() => setPanel(null)}>Không</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
