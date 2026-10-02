// ============================================================
// Bước 5 — Hướng xử lý: chỉ dựng nút cho việc tool GHI ĐƯỢC (đã mô phỏng
// trước). Việc ngoài khả năng → "Việc cần người làm", không có nút "Áp ngay".
// ============================================================
"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { vnd, num } from "./format";
import { patchJson, ApiError } from "./api";
import type { CampaignCase } from "@/lib/case/store";

export function Step5Actions({
  c,
  onRefresh,
  onBack,
  onNext,
  busy,
}: {
  c: CampaignCase;
  onRefresh: (next: CampaignCase) => void;
  onBack: () => void;
  onNext: () => void;
  busy?: boolean;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dialogFor, setDialogFor] = useState<string | null>(null);

  async function toggleAction(id: string, checked: boolean) {
    setSavingId(id);
    setErr(null);
    try {
      const json = await patchJson(`/api/cases/${c.id}/actions`, { selected: { [id]: checked } });
      onRefresh(json.case);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không lưu được lựa chọn");
    } finally {
      setSavingId(null);
    }
  }

  /** Đổi sự kiện tối ưu của việc "Tạo nhóm mới" — chỉ trong danh sách `alternatives`, giữ nguyên lựa chọn selected hiện tại. */
  async function changeEvent(id: string, currentSelected: boolean, event: string) {
    setSavingId(id);
    setErr(null);
    try {
      const json = await patchJson(`/api/cases/${c.id}/actions`, { selected: { [id]: currentSelected }, options: { [id]: { event } } });
      onRefresh(json.case);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không đổi được sự kiện");
    } finally {
      setSavingId(null);
    }
  }

  /** "Tạm dừng nhóm cũ cùng lúc" của việc "Bật nhóm mới". */
  async function togglePauseSource(id: string, currentSelected: boolean, pauseSource: boolean) {
    setSavingId(id);
    setErr(null);
    try {
      const json = await patchJson(`/api/cases/${c.id}/actions`, { selected: { [id]: currentSelected }, options: { [id]: { pauseSource } } });
      onRefresh(json.case);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không lưu được lựa chọn");
    } finally {
      setSavingId(null);
    }
  }

  /** Xác nhận hiểu rủi ro khi không sự kiện chuẩn nào đủ ngưỡng — server chặn CREATE nếu lowSignal && !lowSignalAck. */
  async function toggleLowSignalAck(id: string, currentSelected: boolean, lowSignalAck: boolean) {
    setSavingId(id);
    setErr(null);
    try {
      const json = await patchJson(`/api/cases/${c.id}/actions`, { selected: { [id]: currentSelected }, options: { [id]: { lowSignalAck } } });
      onRefresh(json.case);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không lưu được lựa chọn");
    } finally {
      setSavingId(null);
    }
  }

  const anySelected = c.actions.some((a) => a.selected);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">Tool sẽ làm những việc này</h2>
        <p className="mt-0.5 text-sm text-slate-500">{c.platform === "facebook"
          ? "Không việc nào được chọn sẵn: dừng là cắt phân phối, đổi vị trí hoặc ngân sách làm Meta học lại từ đầu. Đọc cảnh báo của từng việc rồi tự chọn."
          : "Mỗi việc đã chạy thử trên dữ liệu thật của kỳ — biết trước chặn bao nhiêu tiền và có chặn nhầm người mua không."}</p>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {c.actions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-400">Không có việc nào tool đề xuất cho chiến dịch này.</p>
      ) : (
        <div className="space-y-3">
          {c.actions.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={a.selected}
                  onCheckedChange={(v) => toggleAction(a.id, v)}
                  disabled={savingId === a.id}
                  aria-label={a.label}
                  className="mt-0.5"
                />
                <label className="min-w-0 flex-1 cursor-pointer text-sm font-semibold text-slate-900">{a.label}</label>
              </div>

              {a.type === "SET_CAMPAIGN_BUDGET" && (
                <div className="mt-3 pl-7 text-sm text-slate-600">
                  <div>
                    Trước → Sau: <span className="tabular-nums">{vnd(a.before)}</span> → <span className="tabular-nums font-semibold text-slate-900">{vnd(a.after)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{a.reason}</p>
                </div>
              )}

              {a.type === "PAUSE_ADSET" && (
                <div className="mt-3 pl-7 text-xs text-slate-500">{a.reason}</div>
              )}

              {a.type === "EXCLUDE_PLACEMENT" && (
                <div className="mt-3 space-y-2 pl-7 text-sm">
                  <div className="text-slate-600">
                    Chi phí ở vị trí này: <b className="tabular-nums">{vnd(a.cost)}</b> · <span className="tabular-nums">{num(a.results)}</span> {a.resultLabel}
                  </div>
                  {a.automatic && (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Vị trí tự động → sẽ chuyển sang thủ công
                    </span>
                  )}
                  {a.warnings.length > 0 && (
                    <ul className="space-y-0.5 text-xs text-amber-700">
                      {a.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {a.type === "CREATE_ADSET_WITH_EVENT" && (
                <div className="mt-3 space-y-3 pl-7 text-sm">
                  <div className="text-slate-600">
                    Nhóm nguồn: <b className="text-slate-900">{a.sourceAdsetName}</b>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <div className="mb-1.5 text-xs font-semibold text-slate-700">Sự kiện đề xuất — đọc từ Chẩn đoán gắn thẻ</div>
                    <div className="text-slate-800">
                      <b>{a.eventLabel}</b> — <span className="tabular-nums">{a.perWeek === null ? "—" : num(a.perWeek)}</span> lượt/tuần (7 ngày gần nhất)
                    </div>
                    <label className="mt-2.5 block text-xs text-slate-500" htmlFor={`event-select-${a.id}`}>Hoặc chọn sự kiện chuẩn khác</label>
                    <Select
                      value={a.event}
                      onValueChange={(v) => { if (v) changeEvent(a.id, a.selected, v); }}
                      disabled={savingId === a.id}
                    >
                      <SelectTrigger id={`event-select-${a.id}`} aria-label="Chọn sự kiện chuẩn khác" className="mt-1 w-full"><SelectValue>{(v: string) => { const alt = a.alternatives.find((x) => x.event === v); return alt ? `${alt.label} — ${num(alt.perWeek)} lượt/tuần` : a.eventLabel; }}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {a.alternatives.map((alt) => (
                          <SelectItem key={alt.event} value={alt.event}>{alt.label} — {num(alt.perWeek)} lượt/tuần</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {a.warnings.length > 0 && (
                    <ul className="space-y-0.5 text-xs text-amber-700">
                      {a.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
                    </ul>
                  )}

                  {a.lowSignal && (
                    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                      <div>
                        <b>Không sự kiện chuẩn nào đủ 50 lượt/tuần</b> — nhóm mới cũng có thể học thất bại như nhóm cũ.
                      </div>
                      <div className="flex min-h-8 items-start gap-2">
                        <Checkbox
                          checked={!!a.lowSignalAck}
                          onCheckedChange={(v) => toggleLowSignalAck(a.id, a.selected, !!v)}
                          disabled={savingId === a.id}
                          aria-label="Tôi hiểu nhóm mới có thể học thất bại vì sự kiện chưa đủ 50 lượt/tuần"
                          className="mt-0.5"
                        />
                        <span>Tôi hiểu nhóm mới có thể học thất bại vì sự kiện chưa đủ 50 lượt/tuần</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {a.type === "ACTIVATE_NEW_ADSET" && (
                <div className="mt-3 space-y-1.5 pl-7 text-sm">
                  <label className="flex min-h-8 cursor-pointer items-center gap-2 text-slate-700">
                    <Checkbox
                      checked={a.pauseSource}
                      onCheckedChange={(v) => togglePauseSource(a.id, a.selected, !!v)}
                      disabled={savingId === a.id}
                    />
                    Tạm dừng nhóm cũ cùng lúc
                  </label>
                  <p className="text-xs text-slate-500">Khuyến nghị chạy song song ≥ 7 ngày rồi mới tắt nhóm cũ.</p>
                </div>
              )}

              {a.type === "REMOVE_FROM_SHARED_LIST" && (
                <div className="mt-3 pl-7">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                    <div className="mb-1 font-semibold">Vì sao bỏ — mỗi từ chặn được một câu tìm của người mua:</div>
                    <ul className="space-y-0.5">{a.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    <div className="mt-1 text-amber-800/80">Hoàn tác sẽ thêm lại đúng các từ này vào danh sách.</div>
                  </div>
                </div>
              )}
              {"simulation" in a && (
                <div className="mt-3 space-y-3 pl-7">
                  {a.type === "ATTACH_SHARED_LIST" && a.flagged && a.flagged.length > 0
                    && c.actions.some((x) => x.type === "REMOVE_FROM_SHARED_LIST" && x.selected) && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                      {a.flagged.length} từ có thể chặn người mua sẽ được bỏ khỏi “{a.sharedSetName}” ở việc phía trên trước khi gắn — mô phỏng dưới đây đã tính trên danh sách sau khi bỏ.
                    </div>
                  )}
                  {a.type === "ATTACH_SHARED_LIST" && a.flagged && a.flagged.length > 0
                    && !c.actions.some((x) => x.type === "REMOVE_FROM_SHARED_LIST" && x.selected) && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                      <div className="mb-1 font-semibold">
                        {a.flagged.length} từ trong “{a.sharedSetName}” có thể chặn người MUA — việc bỏ chúng đang KHÔNG được chọn, gắn lúc này sẽ gắn cả các từ này
                      </div>
                      <ul className="space-y-0.5">
                        {a.flagged.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  )}
                  {a.simulation && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <SimTile label="Lượt tìm sẽ bị chặn" value={num(a.simulation.blockedTerms)} />
                      <SimTile label="Tiền lẽ ra đã chặn" value={vnd(a.simulation.blockedCost)} />
                      <SimTile label="Đơn mua bị mất" value={num(a.simulation.blockedConversions)} tone={a.simulation.blockedConversions === 0 ? "good" : "bad"} />
                      <SimTile label="Chuyển đổi phụ bị mất" value={num(a.simulation.blockedAllConversions, { maximumFractionDigits: 1 })} tone={a.simulation.blockedAllConversions === 0 ? "good" : "warn"} />
                    </div>
                  )}

                  {a.simulation && a.simulation.withConversions.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                      <div className="mb-1 font-semibold">Lượt tìm bị chặn nhưng CÓ đơn/chuyển đổi phụ — xem kỹ trước khi duyệt</div>
                      <ul className="space-y-0.5">
                        {a.simulation.withConversions.map((w, i) => (
                          <li key={i}>
                            “{w.term}” · {vnd(w.cost)} · {num(w.conversions, { maximumFractionDigits: 1 })} đơn, {num(w.allConversions, { maximumFractionDigits: 1 })} chuyển đổi phụ
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {a.simulation && a.simulation.ownKeywordsBlocked.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                      <div className="mb-1 font-semibold">Từ khoá đang bật của chiến dịch sẽ bị chặn theo</div>
                      <ul className="space-y-0.5">
                        {a.simulation.ownKeywordsBlocked.map((k, i) => (
                          <li key={i}>
                            “{k.text}” ({k.match}) · {vnd(k.cost)} · {k.impressions} hiển thị — chặn theo “{k.by}”
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {"negatives" in a && (<>
                  <Button className="h-10" variant="ghost" size="sm" onClick={() => setDialogFor(a.id)}>Xem đủ {a.negatives.length} từ</Button>

                  <Dialog open={dialogFor === a.id} onOpenChange={(o) => setDialogFor(o ? a.id : null)}>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>{a.negatives.length} từ khoá phủ định</DialogTitle>
                      </DialogHeader>
                      <div className="flex max-h-80 flex-wrap gap-1.5 overflow-y-auto text-sm">
                        {a.negatives.map((n, i) => (
                          <span key={i} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{n.text}</span>
                        ))}
                      </div>
                      <DialogFooter>
                        <DialogClose render={<Button className="h-10" variant="outline" />}>Đóng</DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  </>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-800">
          Việc cần người làm <span className="font-normal text-slate-400">(tool chưa ghi được — giao việc để không bị bỏ quên)</span>
        </h3>
        {c.manualTasks.length === 0 ? (
          <p className="text-sm text-slate-400">Không có việc nào cần người làm.</p>
        ) : (
          <div className="space-y-2">
            {c.manualTasks.map((t) => (
              <ManualTaskCard key={t.id} caseId={c.id} task={t} onRefresh={onRefresh} />
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button className="h-10" variant="outline" onClick={onBack} disabled={busy}>← Bước 4</Button>
        <Button className="h-10" onClick={onNext} disabled={busy || !anySelected} title={!anySelected ? "Chọn ít nhất một việc trước" : undefined}>
          Chuyển sang duyệt →
        </Button>
      </div>
    </div>
  );
}

function SimTile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  const cls = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function ManualTaskCard({
  caseId,
  task,
  onRefresh,
}: {
  caseId: string;
  task: CampaignCase["manualTasks"][number];
  onRefresh: (next: CampaignCase) => void;
}) {
  const [assignee, setAssignee] = useState(task.assignee ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function patch(body: { status?: "open" | "done"; assignee?: string | null }) {
    setSaving(true);
    setErr(null);
    try {
      const json = await patchJson(`/api/cases/${caseId}/tasks/${task.id}`, body);
      onRefresh(json.case);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không lưu được việc này");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-start gap-3">
        <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900">{task.title}</div>
          <p className="mt-0.5 text-sm text-slate-500">{task.detail}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor={`assignee-${task.id}`} className="text-xs text-slate-400">Giao cho</label>
            <Input
              id={`assignee-${task.id}`}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              onBlur={() => { if (assignee !== (task.assignee ?? "")) patch({ assignee: assignee.trim() || null }); }}
              placeholder="Tên người phụ trách"
              className="h-7 w-48"
              disabled={saving}
            />
            <label className="ml-2 flex min-h-8 cursor-pointer items-center gap-1.5 text-xs text-slate-600">
              <Checkbox
                checked={task.status === "done"}
                onCheckedChange={(v) => patch({ status: v ? "done" : "open" })}
                disabled={saving}
              />
              Đã xong
            </label>
          </div>
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </div>
      </div>
    </div>
  );
}
