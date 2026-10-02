"use client";

// ============================================================
// Luồng "Tách lượt tìm chung khỏi chiến dịch thương hiệu" (Đợt 11e) — mở từ
// thẻ đề xuất `action.type === "split"` trong SearchXrayTab.tsx.
// ------------------------------------------------------------
// Đọc/ghi qua lib/search/split.ts — module SERVER, ở đây CHỈ `import type`.
// Bước 1 (dựng chiến dịch TẠM DỪNG): Kiểm trước (validateOnly, không ghi) →
// gõ confirmText → Tạo (ghi thật). Bước 2/3 + hoàn tác: mỗi nút thao tác trên
// một bản tách đã có đều qua cùng một hộp thoại gõ confirmText.
// ============================================================

import { useCallback, useEffect, useId, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, Split as SplitIcon, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getJson, postJson, ApiError } from "@/components/case/api";
import { vnd, num } from "@/components/case/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import type { SplitPlan, SplitAdGroup, SplitRecord, SplitAdGroupAds } from "@/lib/search/split";
import { EditRsaModal } from "@/components/EditRsaModal";
import type { AssetCount, AssetReport } from "@/lib/search/split-assets";
import type { SplitSeries } from "@/lib/search/split-tracking";
import type { SplitAssessment } from "@/lib/search/split-assessment";

type Company = string;
type Range = { from: string; to: string };
type SplitAction = "enable" | "pause" | "move" | "unmove" | "remove" | "clear_tcpa" | "source_budget";

interface SplitResponse {
  plan: SplitPlan | null;
  assessment: SplitAssessment | null;
  splits: SplitRecord[];
  canEdit: boolean;
  confirmText: string;
}

interface CheckpointResponse {
  record: SplitRecord;
  days: number;
  result: { lines: string[]; verdict: "tot" | "theo_doi" | "dung" } | null;
  note?: string;
}

const MATCH_LABEL: Record<string, string> = { EXACT: "Chính xác", PHRASE: "Cụm từ", BROAD: "Rộng" };
const STEP_LABEL: Record<SplitRecord["step"], string> = {
  created: "Đã tạo — chưa chuyển từ khoá", moved: "Đã chuyển từ khoá chung", removed: "Đã gỡ", failed: "Tạo thất bại",
};
const STEP_CLS: Record<SplitRecord["step"], string> = {
  created: "bg-sky-50 text-sky-700 border-sky-200", moved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  removed: "bg-slate-100 text-slate-500 border-slate-200", failed: "bg-red-50 text-red-700 border-red-200",
};
const VERDICT_LABEL: Record<"tot" | "theo_doi" | "dung", string> = { tot: "Đạt", theo_doi: "Theo dõi", dung: "Nên hoàn tác" };
const VERDICT_CLS: Record<"tot" | "theo_doi" | "dung", string> = {
  tot: "bg-emerald-50 text-emerald-700 border-emerald-200", theo_doi: "bg-amber-50 text-amber-700 border-amber-200",
  dung: "bg-red-50 text-red-700 border-red-200",
};

function AdGroupPreview({ g }: { g: SplitAdGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-100 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="min-w-0 truncate text-xs font-semibold text-slate-700" title={g.name}>{g.name}</span>
        <span className="shrink-0 text-[11px] text-slate-400">{g.keywords.length} từ khoá · {g.ads.length} quảng cáo</span>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />}
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-slate-100 px-3 py-2">
          <table className="w-full text-[11px]">
            <thead><tr className="text-left text-slate-400"><th className="py-1 pr-2 font-medium">Từ khoá</th><th className="py-1 pr-2 font-medium">Khớp</th><th className="py-1 pr-2 text-right font-medium">Chi phí</th><th className="py-1 text-right font-medium">Đơn</th></tr></thead>
            <tbody>
              {g.keywords.map((k) => (
                <tr key={k.criterion} className="border-t border-slate-50">
                  <td className="py-1 pr-2 text-slate-700">{k.text}</td>
                  <td className="py-1 pr-2 text-slate-500">{MATCH_LABEL[k.match] ?? k.match}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{vnd(k.cost)}</td>
                  <td className="py-1 text-right tabular-nums text-slate-600">{num(k.purchases, { maximumFractionDigits: 1 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />}
      </button>
      {open && <div className="border-t border-slate-100 px-3 py-2.5">{children}</div>}
    </div>
  );
}

function AssessmentView({
  assessment, selectedOption, onSelectOption,
}: {
  assessment: SplitAssessment; selectedOption: "keep_total" | "grow"; onSelectOption: (id: "keep_total" | "grow", genericBudget: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-slate-800">📋 Đánh giá &amp; lộ trình</p>

      <Section title="Hiện trạng" defaultOpen>
        <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">{assessment.now.map((n, i) => <li key={i}>{n}</li>)}</ul>
      </Section>

      <Section title="Cấu trúc sau khi tách">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {assessment.structure.map((s, i) => (
            <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-semibold text-slate-700" title={s.name}>{s.name}</span>
                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", i === 0 ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-emerald-50 text-emerald-700 border-emerald-200")}>{s.role}</span>
              </div>
              <p className="mt-1 text-slate-500">{s.keywords}</p>
              <p className="mt-1 text-slate-400">{vnd(s.budgetPerDay)}/ngày · {s.bidding}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Chia ngân sách" defaultOpen>
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {assessment.budgetOptions.map((o) => {
              const checked = selectedOption === o.id;
              return (
                <label key={o.id} className={cn("flex cursor-pointer flex-col gap-1 rounded-lg border p-2.5 text-xs", checked ? "border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-300" : "border-slate-200 bg-white hover:border-slate-300")}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                      <input type="radio" name="budget-option" checked={checked} onChange={() => onSelectOption(o.id, o.genericBudget)} className="h-3.5 w-3.5" />
                      {o.label}
                    </span>
                    {assessment.recommendedOption === o.id && <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Khuyên dùng</span>}
                  </span>
                  <span className="text-slate-500">Thương hiệu {vnd(o.brandBudget)}/ngày · Chung {vnd(o.genericBudget)}/ngày · Tổng {vnd(o.total)}/ngày</span>
                  <span className="text-slate-400">{o.note}</span>
                </label>
              );
            })}
          </div>
          <p className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500">Ngân sách chiến dịch Thương hiệu đổi trong Google Ads hoặc trang Chiến dịch; tool không tự đổi.</p>
        </div>
      </Section>

      <Section title="Đặt giá">
        <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">{assessment.bidding.map((b, i) => <li key={i}>{b}</li>)}</ul>
      </Section>

      <Section title="Lộ trình" defaultOpen>
        <ol className="space-y-2.5 border-l border-slate-200 pl-3">
          {assessment.timeline.map((t, i) => (
            <li key={i} className="relative text-xs">
              <span className="absolute -left-[15px] top-0.5 h-2 w-2 rounded-full border-2 border-white bg-indigo-400" aria-hidden="true" />
              <p className="font-semibold text-slate-700">{t.when}</p>
              <p className="text-slate-500">{t.what}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Thành công khi">
        <ul className="space-y-1 text-xs text-emerald-700">
          {assessment.success.map((s, i) => (
            <li key={i} className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{s}</span></li>
          ))}
        </ul>
      </Section>

      <Section title="Dừng & hoàn tác khi">
        <ul className="space-y-1 text-xs text-red-700">
          {assessment.abort.map((a, i) => (
            <li key={i} className="flex items-start gap-1.5"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{a}</span></li>
          ))}
        </ul>
      </Section>

      <Section title="Lưu ý">
        <ul className="list-disc space-y-1 pl-4 text-xs text-slate-400">{assessment.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
      </Section>
    </div>
  );
}

function PlanView({
  plan, assessment, company, range, confirmText, onCreated,
}: {
  plan: SplitPlan; assessment: SplitAssessment | null; company: Company; range: Range; confirmText: string; onCreated: (rec: SplitRecord) => void;
}) {
  const confirmId = useId();
  const [budget, setBudget] = useState(String(plan.budgetPerDay));
  const [targetCpa, setTargetCpa] = useState("");
  // Mặc định KHÔNG mục tiêu CPA (đánh giá khuyên 2 tuần đầu) — trước đây ô trống = giữ tCPA của gốc (user 01/10).
  const [cpaMode, setCpaMode] = useState<"none" | "keep" | "set">("none");
  const [selectedBudgetOption, setSelectedBudgetOption] = useState<"keep_total" | "grow">(assessment?.recommendedOption ?? "keep_total");

  const [validating, setValidating] = useState(false);
  const [validateOk, setValidateOk] = useState(false);
  const [validateLog, setValidateLog] = useState<string[]>([]);
  const [validateErrs, setValidateErrs] = useState<string[]>([]);
  const [validatedSig, setValidatedSig] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const sig = `${budget}|${cpaMode}|${targetCpa}|${selectedBudgetOption}`;
  const brandBudget = selectedBudgetOption === "keep_total" ? assessment?.budgetOptions.find((o) => o.id === "keep_total")?.brandBudget : undefined;
  const canCreate = validateOk && sig === validatedSig;

  function selectBudgetOption(id: "keep_total" | "grow", genericBudget: number) {
    setSelectedBudgetOption(id);
    setBudget(String(genericBudget));
    setValidateOk(false);
  }

  const genericKeywords = plan.adGroups.reduce((s, g) => s + g.keywords.length, 0);
  const genericAds = plan.adGroups.reduce((s, g) => s + g.ads.length, 0);
  const budgetIncreaseNote = plan.notes.find((n) => n.startsWith("Tổng ngân sách/ngày tăng"));
  const otherNotes = plan.notes.filter((n) => n !== budgetIncreaseNote);

  async function run(validateOnly: boolean, confirmTextInput?: string) {
    const b = Number(budget);
    const cpa = cpaMode === "set" && targetCpa.trim() ? Number(targetCpa) : undefined;
    return postJson("/api/google/search/split", {
      company, op: "create", campaignId: plan.sourceId, from: range.from, to: range.to,
      budgetPerDay: Number.isFinite(b) && b > 0 ? b : undefined,
      targetCpa: cpa !== undefined && Number.isFinite(cpa) && cpa > 0 ? cpa : undefined, cpaMode,
      sourceBudgetPerDay: brandBudget && !plan.sourceBudgetShared ? brandBudget : undefined,
      validateOnly, confirmText: confirmTextInput,
    });
  }

  async function doValidate() {
    setValidating(true); setValidateErrs([]); setValidateLog([]); setValidateOk(false); setValidatedSig(null);
    try {
      const json = await run(true);
      const rec = json.record as SplitRecord;
      setValidateLog(rec.log ?? []);
      if (rec.errors.length) setValidateErrs(rec.errors);
      else { setValidateOk(true); setValidatedSig(sig); }
    } catch (e) {
      setValidateErrs([e instanceof ApiError ? e.message : "Không kiểm được — thử lại sau"]);
    } finally { setValidating(false); }
  }

  async function doCreate() {
    setCreating(true); setCreateErr(null);
    try {
      const json = await run(false, confirmInput);
      const rec = json.record as SplitRecord;
      if (rec.step === "created" || rec.step === "moved") {
        setCreateOpen(false); setConfirmInput(""); setValidateOk(false); setValidatedSig(null);
        onCreated(rec);
      } else {
        setCreateErr(rec.errors.join(" · ") || "Google từ chối — chưa tạo gì.");
      }
    } catch (e) {
      setCreateErr(e instanceof ApiError ? e.message : "Không tạo được — thử lại sau");
    } finally { setCreating(false); }
  }

  return (
    <div className="space-y-3">
      {assessment && (
        <AssessmentView assessment={assessment} selectedOption={selectedBudgetOption} onSelectOption={selectBudgetOption} />
      )}

      <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2.5 text-xs text-indigo-900">
        <p><b>Bước 1</b> tạo chiến dịch <b>TẠM DỪNG</b> — chưa tiêu tiền. <b>Bước 2</b> bạn bật. <b>Bước 3</b> tool tạm dừng từ khoá chung ở chiến dịch gốc (chỉ khi chiến dịch mới đang bật).</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
          <p className="font-semibold text-slate-700">Chiến dịch mới</p>
          <p className="mt-1 text-slate-600">{plan.newName}</p>
          <p className="mt-1 text-slate-400">Đặt giá: {plan.bidding} · {genericKeywords} từ khoá chung trong {plan.adGroups.length} nhóm quảng cáo · {genericAds} quảng cáo</p>
        </div>
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
          <label className="block">
            <span className="font-semibold text-slate-700">Ngân sách/ngày</span>
            <Input type="number" min={0} value={budget} onChange={(e) => { setBudget(e.target.value); setValidateOk(false); }} className="mt-1 h-9" />
            <span className="mt-1 block text-slate-400">Chi phí lượt tìm chung hiện tại: {vnd(plan.genericCostPerDay)}/ngày</span>
          </label>
          {brandBudget && plan.sourceBudgetPerDay && brandBudget !== plan.sourceBudgetPerDay && (
            <p className="rounded-md bg-sky-50 px-2 py-1.5 text-sky-800">
              {plan.sourceBudgetShared
                ? "Chiến dịch gốc dùng ngân sách DÙNG CHUNG — tool không đổi, chỉnh tay để giữ tổng."
                : `Giữ tổng: chiến dịch gốc sẽ hạ ${vnd(plan.sourceBudgetPerDay)} → ${vnd(brandBudget)}/ngày lúc Chuyển từ khoá chung (bước 3).`}
            </p>
          )}
          <div className="block">
            <span className="font-semibold text-slate-700">Mục tiêu CPA</span>
            <div className="mt-1 space-y-1">
              {([
                ["none", "Không đặt (Tối đa chuyển đổi) — khuyên 2 tuần đầu"],
                ...(plan.sourceTargetCpa ? [["keep", `Giữ như chiến dịch gốc (${vnd(plan.sourceTargetCpa)})`]] : []),
                ["set", "Đặt mức khác"],
              ] as ["none" | "keep" | "set", string][]).map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-slate-600">
                  <input type="radio" name={`cpa-${plan.sourceId}`} checked={cpaMode === v} onChange={() => { setCpaMode(v); setValidateOk(false); }} /> {l}
                </label>
              ))}
            </div>
            {cpaMode === "set" && <Input type="number" min={0} value={targetCpa} onChange={(e) => { setTargetCpa(e.target.value); setValidateOk(false); }} placeholder="₫ / chuyển đổi" className="mt-1 h-9" />}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-700">{plan.adGroups.length} nhóm quảng cáo sẽ chuyển</p>
        <div className="space-y-1.5">{plan.adGroups.map((g) => <AdGroupPreview key={g.sourceId} g={g} />)}</div>
        {plan.adGroups.length === 0 && <p className="text-xs text-slate-400">Không có nhóm quảng cáo nào có từ khoá chung để tách.</p>}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
        <p className="font-semibold text-slate-700">Tài sản sẽ gắn sang chiến dịch mới</p>
        {plan.assets ? (
          <>
            <p>Cấp chiến dịch: {countsText(plan.assets.campaign)}</p>
            {plan.assets.adGroup.length > 0 && <p>Cấp nhóm quảng cáo: {countsText(plan.assets.adGroup)}</p>}
            <p className="text-slate-400">Tài sản cấp tài khoản không cần chép — tự áp cho mọi chiến dịch.</p>
          </>
        ) : <p className="text-amber-700">Không đọc được tài sản của chiến dịch gốc — sau khi tạo, bấm “Bổ sung tài sản” trên thẻ bản tách.</p>}
      </div>

      {plan.brandNegatives.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-700">Phủ định thương hiệu ở chiến dịch mới ({plan.brandNegatives.length})</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {plan.brandNegatives.map((n) => <span key={n} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">{n}</span>)}
          </div>
        </div>
      )}

      {plan.skippedAdGroups.length > 0 && (
        <details className="text-[11px] text-amber-700">
          <summary className="cursor-pointer select-none font-semibold">{plan.skippedAdGroups.length} nhóm quảng cáo bị bỏ qua</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{plan.skippedAdGroups.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </details>
      )}

      {budgetIncreaseNote && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">⚠️ {budgetIncreaseNote}</p>}
      {otherNotes.length > 0 && <div className="space-y-1 text-[11px] text-slate-500">{otherNotes.map((n, i) => <p key={i}>{n}</p>)}</div>}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <Button type="button" variant="outline" size="sm" className="h-9 bg-white" onClick={doValidate} disabled={validating || plan.adGroups.length === 0 || (cpaMode === "set" && !(Number(targetCpa) > 0))}>
          {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Kiểm trước (không ghi)
        </Button>
        <Button type="button" size="sm" className="h-9" onClick={() => { setConfirmInput(""); setCreateErr(null); setCreateOpen(true); }} disabled={!canCreate}
          title={!canCreate ? "Kiểm trước rồi mới tạo được" : undefined}>
          <SplitIcon className="h-3.5 w-3.5" aria-hidden="true" /> Tạo chiến dịch tạm dừng
        </Button>
      </div>
      {validateErrs.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-xs text-red-700">{validateErrs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {validateOk && validateLog.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-xs text-emerald-700">{validateLog.map((l, i) => <li key={i} className={l.startsWith("Bỏ ") ? "text-amber-700" : undefined}>{l}</li>)}</ul>}

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setConfirmInput(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo chiến dịch &quot;{plan.newName}&quot; (TẠM DỪNG) trên {company}?</DialogTitle>
            <DialogDescription>Chưa tiêu tiền — chỉ bắt đầu tiêu sau khi bạn tự bật ở bước 2.</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-slate-600">{genericKeywords} từ khoá trong {plan.adGroups.length} nhóm quảng cáo · Ngân sách {vnd(Number(budget) || plan.budgetPerDay)}/ngày.</p>
          <div className="space-y-1.5">
            <label htmlFor={confirmId} className="text-xs font-medium text-slate-500">
              Gõ <code className="rounded bg-slate-100 px-1 py-0.5">{confirmText}</code> để xác nhận
            </label>
            <Input id={confirmId} value={confirmInput} onChange={(e) => setConfirmInput(e.target.value)} placeholder={confirmText} autoComplete="off" className="h-10" />
          </div>
          {createErr && <p className="text-xs text-red-600">{createErr}</p>}
          <DialogFooter>
            <DialogClose render={<Button className="h-10" variant="outline" />}>Huỷ</DialogClose>
            <Button className="h-10" onClick={doCreate} disabled={creating || confirmInput.trim() !== confirmText}>
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Tạo thật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Một bản tách đã có ──

const countsText = (c: AssetCount[]) => (c.length ? c.map((x) => `${x.count} ${x.label}`).join(" · ") : "không có");

/** Đợt 18c: bổ sung tài sản — Kiểm trước (không ghi) rồi gõ xác nhận mới gắn thật. */
function AssetPanel({ rec, company, confirmText, canEdit, onChanged }: { rec: SplitRecord; company: Company; confirmText: string; canEdit: boolean; onChanged: (rec: SplitRecord) => void }) {
  const confirmId = useId();
  const [preview, setPreview] = useState<AssetReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const last = [...(rec.assetReports ?? [])].reverse().find((a) => !a.validateOnly);
  async function check() {
    setBusy(true); setErr(null);
    try { const j = await postJson("/api/google/search/split", { company, op: "assets", id: rec.id, validateOnly: true }); setPreview(j.report as AssetReport); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Không kiểm được — thử lại sau"); } finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true); setErr(null);
    try { const j = await postJson("/api/google/search/split", { company, op: "assets", id: rec.id, validateOnly: false, confirmText: input }); onChanged(j.record as SplitRecord); setPreview(null); setOpen(false); setInput(""); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Không gắn được — thử lại sau"); } finally { setBusy(false); }
  }
  const nothing = preview && !preview.planned.length;
  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-2">
      <p className="text-slate-500"><span className="font-semibold text-slate-700">Tài sản (sitelink, ảnh, tên doanh nghiệp…): </span>
        {last ? <>đã gắn {countsText(last.added)}{last.after ? ` · hiện có ${countsText(last.after)}` : ""}</> : "chưa gắn từ chiến dịch gốc"}</p>
      {last?.failed.map((x, i) => <p key={i} className="text-red-600">Chưa gắn được {x.count} {x.label}: {x.error}</p>)}
      {last?.notes.map((n, i) => <p key={i} className={n.startsWith("Bỏ ") ? "text-amber-700" : "text-slate-400"}>{n}</p>)}
      {canEdit && (
        <Button type="button" variant="outline" size="sm" className="h-8 bg-white" onClick={check} disabled={busy}>
          {busy && !open ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Bổ sung tài sản từ chiến dịch gốc
        </Button>
      )}
      {preview && (
        <div className="space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
          <p>Chiến dịch gốc: {countsText(preview.source)} · chiến dịch mới đang có: {countsText(preview.before)}</p>
          {nothing ? <p className="text-emerald-700">Không còn gì để gắn.</p> : <p className="font-semibold text-slate-700">Sẽ gắn thêm: {countsText(preview.planned)}{preview.failed.length ? "" : " — Google kiểm qua"}</p>}
          {preview.failed.map((x, i) => <p key={i} className="text-red-600">Google từ chối {x.count} {x.label}: {x.error}</p>)}
          {preview.notes.map((n, i) => <p key={i} className={n.startsWith("Bỏ ") ? "text-amber-700" : "text-slate-400"}>{n}</p>)}
          {!nothing && canEdit && <Button type="button" size="sm" className="h-8" onClick={() => { setInput(""); setOpen(true); }}>Gắn thật</Button>}
        </div>
      )}
      {err && <p className="text-red-600">{err}</p>}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setInput(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gắn tài sản vào &quot;{rec.name}&quot;?</DialogTitle>
            <DialogDescription>Chỉ tạo liên kết tới tài sản sẵn có của chiến dịch gốc — không đổi nội dung tài sản.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={confirmId} className="text-xs font-medium text-slate-500">Gõ <code className="rounded bg-slate-100 px-1 py-0.5">{confirmText}</code> để xác nhận</label>
            <Input id={confirmId} value={input} onChange={(e) => setInput(e.target.value)} placeholder={confirmText} autoComplete="off" className="h-10" />
          </div>
          <DialogFooter>
            <DialogClose render={<Button className="h-10" variant="outline" />}>Huỷ</DialogClose>
            <Button className="h-10" onClick={apply} disabled={busy || input.trim() !== confirmText}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Gắn</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Đợt 18h: diễn biến theo ngày của 2 chiến dịch (chỉ đọc). */
const STRENGTH_VI: Record<string, { label: string; cls: string }> = {
  EXCELLENT: { label: "Xuất sắc", cls: "text-emerald-700" }, GOOD: { label: "Tốt", cls: "text-emerald-700" },
  AVERAGE: { label: "Trung bình", cls: "text-amber-700" }, POOR: { label: "Kém", cls: "text-red-600" },
  PENDING: { label: "Đang tính", cls: "text-slate-400" }, NO_ADS: { label: "Không có", cls: "text-slate-400" },
};

/**
 * Đợt 19d (18e): quảng cáo bản "· Chung" chép từ chiến dịch thương hiệu → Ad strength thường "Kém" với lượt tìm chung.
 * Mở công cụ sửa RSA sẵn có (AI gợi ý theo từ khoá của bản tách → bạn duyệt → Kiểm trước + XAC NHAN). Tool KHÔNG tự sửa.
 */
function SplitAdsPanel({ rec, company, canEdit }: { rec: SplitRecord; company: Company; canEdit: boolean }) {
  const [groups, setGroups] = useState<SplitAdGroupAds[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<SplitAdGroupAds | null>(null);
  async function load() {
    setBusy(true); setErr(null);
    try { const j = await getJson(`/api/google/search/split?company=${company}&adsOf=${rec.id}`); setGroups(j.adGroups as SplitAdGroupAds[]); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Không đọc được — thử lại sau"); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-2">
      <Button type="button" variant="outline" size="sm" className="h-8 bg-white" onClick={load} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Quảng cáo bản tách (Ad strength)
      </Button>
      {err && <p className="text-red-600">{err}</p>}
      {groups && (groups.length === 0 ? <p className="text-slate-400">Bản tách chưa có quảng cáo RSA nào.</p> : (
        <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
          <p className="text-slate-500">Quảng cáo chép từ chiến dịch thương hiệu thường thiếu từ khoá chung. AI gợi ý viết lại theo từ khoá của nhóm — bạn xem, sửa, rồi Kiểm trước + XAC NHAN mới ghi.</p>
          {groups.map((g) => (
            <div key={g.adGroupId} className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-700">{g.name}</span>
              <span className="text-slate-400">{g.keywords.length} từ khoá ·</span>
              {g.ads.map((a) => <span key={a.id} className={STRENGTH_VI[a.strength]?.cls ?? "text-slate-500"}>{STRENGTH_VI[a.strength]?.label ?? a.strength}</span>)}
              {canEdit && g.ads.length > 0 && (
                <Button type="button" size="sm" variant="outline" className="h-7 bg-white" onClick={() => setEditing(g)}>Sửa bằng AI…</Button>
              )}
            </div>
          ))}
        </div>
      ))}
      {editing && (
        <EditRsaModal isOpen={!!editing} onClose={() => { setEditing(null); void load(); }} company={company}
          adGroupId={editing.adGroupId} adGroupName={editing.name} campaignId={String(rec.newCampaign ?? "").split("/").pop() ?? ""}
          weakest="AD_RELEVANCE" keyword={editing.keywords[0] ?? ""} adGroupKeywords={editing.keywords} />
      )}
    </div>
  );
}

function SeriesPanel({ rec, company }: { rec: SplitRecord; company: Company }) {
  const [data, setData] = useState<SplitSeries | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function load() {
    setBusy(true); setErr(null);
    try { const j = await getJson(`/api/google/search/split?company=${company}&series=${rec.id}`); setData(j.series as SplitSeries); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Không đọc được — thử lại sau"); } finally { setBusy(false); }
  }
  const cpa = (x: { cpa: number | null }) => (x.cpa ? vnd(x.cpa) : "—");
  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-2">
      <Button type="button" variant="outline" size="sm" className="h-8 bg-white" onClick={load} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Diễn biến theo ngày
      </Button>
      {err && <p className="text-red-600">{err}</p>}
      {data && (
        <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
          <p>Chiến dịch mới: {data.newStatus ?? "—"}{data.learning ? ` · ${data.learning}` : ""}{data.sourceLostBudget7d != null ? ` · Gốc (thương hiệu) mất hiển thị vì ngân sách 7 ngày: ${Math.round(data.sourceLostBudget7d * 100)}%` : ""}</p>
          <p>Tổng {data.from.slice(5).split("-").reverse().join("/")}–{data.to.slice(5).split("-").reverse().join("/")}: gốc {vnd(data.totals.source.cost)} · {num(data.totals.source.conv)} CĐ · CPA {cpa(data.totals.source)} | mới {vnd(data.totals.split.cost)} · {num(data.totals.split.conv)} CĐ · CPA {cpa(data.totals.split)}</p>
          <div className="max-h-48 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="text-slate-400"><tr><th className="text-left">Ngày</th><th className="text-right">Chi gốc</th><th className="text-right">CĐ gốc</th><th className="text-right">Chi mới</th><th className="text-right">CĐ mới</th></tr></thead>
              <tbody>{[...data.points].reverse().map((p) => (
                <tr key={p.date} className="border-t border-slate-100"><td>{p.date.slice(5).split("-").reverse().join("/")}</td><td className="text-right tabular-nums">{vnd(p.source.cost)}</td><td className="text-right tabular-nums">{num(p.source.conv)}</td><td className="text-right tabular-nums">{vnd(p.split.cost)}</td><td className="text-right tabular-nums">{num(p.split.conv)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="text-slate-400">CĐ = chuyển đổi Google tự báo (chưa phải đơn đã thu tiền).</p>
        </div>
      )}
    </div>
  );
}

const STEP_BUTTONS: Record<string, { action: SplitAction; label: string; variant: "default" | "outline" | "destructive" }[]> = {
  created: [
    { action: "enable", label: "Bật chiến dịch mới", variant: "default" },
    { action: "pause", label: "Tạm dừng", variant: "outline" },
    { action: "move", label: "Chuyển từ khoá chung (bước 3)", variant: "default" },
    { action: "clear_tcpa", label: "Bỏ mục tiêu CPA", variant: "outline" },
    { action: "source_budget", label: "Ngân sách chiến dịch gốc…", variant: "outline" },
    { action: "remove", label: "Gỡ chiến dịch mới", variant: "destructive" },
  ],
  moved: [
    { action: "unmove", label: "Hoàn tác chuyển từ khoá", variant: "outline" },
    { action: "pause", label: "Tạm dừng", variant: "outline" },
    { action: "clear_tcpa", label: "Bỏ mục tiêu CPA", variant: "outline" },
    { action: "source_budget", label: "Ngân sách chiến dịch gốc…", variant: "outline" },
  ],
};

function SplitRecordCard({
  rec, company, confirmText, canEdit, onChanged,
}: {
  rec: SplitRecord; company: Company; confirmText: string; canEdit: boolean; onChanged: (rec: SplitRecord) => void;
}) {
  const confirmId = useId();
  const [logOpen, setLogOpen] = useState(false);
  const [pending, setPending] = useState<{ action: SplitAction; label: string } | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [checkpointLoading, setCheckpointLoading] = useState(false);
  const [checkpointErr, setCheckpointErr] = useState<string | null>(null);
  const [checkpointData, setCheckpointData] = useState<CheckpointResponse | null>(null);

  const buttons = STEP_BUTTONS[rec.step] ?? [];

  async function run() {
    if (!pending) return;
    setRunning(true); setErr(null);
    try {
      const json = await postJson("/api/google/search/split", { company, op: "action", id: rec.id, action: pending.action, confirmText: confirmInput, ...(pending.action === "source_budget" ? { amount: Number(amount) } : {}) });
      onChanged(json.record as SplitRecord);
      setPending(null); setConfirmInput("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không thực hiện được — thử lại sau");
    } finally { setRunning(false); }
  }

  async function doCheckpoint() {
    setCheckpointOpen(true); setCheckpointLoading(true); setCheckpointErr(null);
    try {
      const json = await getJson(`/api/google/search/split?company=${company}&checkpoint=${rec.id}`);
      setCheckpointData(json.checkpoint as CheckpointResponse);
    } catch (e) {
      setCheckpointErr(e instanceof ApiError ? e.message : "Không đo được — thử lại sau");
    } finally { setCheckpointLoading(false); }
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate font-semibold text-slate-800" title={rec.name}>{rec.name}</p>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", STEP_CLS[rec.step])}>{STEP_LABEL[rec.step]}</span>
      </div>
      <p className="text-slate-400">Từ &quot;{rec.sourceName}&quot; · {rec.keywordsCount} từ khoá · {rec.adGroupsCount} nhóm quảng cáo · {vnd(rec.budgetPerDay)}/ngày</p>
      {rec.movedAt && <p className="text-slate-400">Chuyển lúc {new Date(rec.movedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>}
      {rec.errors.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-red-700">{rec.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {rec.goalReport && <p className="text-slate-400">{rec.goalReport}</p>}
      {rec.log.length > 0 && (
        <div>
          <button type="button" onClick={() => setLogOpen((o) => !o)} className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
            {logOpen ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />} Nhật ký ({rec.log.length})
          </button>
          {logOpen && <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-500">{rec.log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        </div>
      )}

      {(rec.checkpoints?.["7"] || rec.checkpoints?.["14"]) && (
        <div className="space-y-1 border-t border-slate-100 pt-2">
          {(["7", "14"] as const).filter((d) => rec.checkpoints?.[d]).map((d) => (
            <div key={d}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-500">Tự đo mốc {d} ngày · {new Date(rec.checkpoints![d]!.at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</span>
                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", VERDICT_CLS[rec.checkpoints![d]!.verdict])}>{VERDICT_LABEL[rec.checkpoints![d]!.verdict]}</span>
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-slate-600">{rec.checkpoints![d]!.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          ))}
        </div>
      )}

      {(rec.step === "created" || rec.step === "moved") && rec.newCampaign && (
        <>
          <AssetPanel rec={rec} company={company} confirmText={confirmText} canEdit={canEdit} onChanged={onChanged} />
          <SeriesPanel rec={rec} company={company} />
          <SplitAdsPanel rec={rec} company={company} canEdit={canEdit} />
        </>
      )}

      {rec.step === "moved" && (
        <div className="border-t border-slate-100 pt-2">
          <Button type="button" variant="outline" size="sm" className="h-8 bg-white" onClick={doCheckpoint} disabled={checkpointLoading}>
            {checkpointLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Đo lại (mốc 7/14 ngày)
          </Button>
          {checkpointOpen && (
            <div className="mt-2 space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
              {checkpointErr && <p className="text-red-600">{checkpointErr}</p>}
              {checkpointData?.result && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500">Đo {checkpointData.days} ngày</span>
                    <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", VERDICT_CLS[checkpointData.result.verdict])}>{VERDICT_LABEL[checkpointData.result.verdict]}</span>
                  </div>
                  <ul className="list-disc space-y-0.5 pl-4 text-slate-600">{checkpointData.result.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                </>
              )}
              {checkpointData?.note && <p className="text-slate-400">{checkpointData.note}</p>}
            </div>
          )}
        </div>
      )}
      {rec.sourceBudget && (
        <p className="border-t border-slate-100 pt-2 text-slate-600">
          <span className="font-semibold text-slate-700">Ngân sách chiến dịch gốc: </span>
          {rec.sourceBudget.appliedAt
            ? <>đã đổi {rec.sourceBudget.before ? `${vnd(rec.sourceBudget.before)} → ` : ""}{vnd(rec.sourceBudget.target)}/ngày{rec.step === "moved" ? " (hoàn tác chuyển từ khoá sẽ trả về mức cũ)" : ""}</>
            : <>sẽ hạ về {vnd(rec.sourceBudget.target)}/ngày lúc Chuyển từ khoá chung (phương án Giữ tổng ngân sách)</>}
        </p>
      )}
      {rec.step === "created" && (
        <p className="border-t border-slate-100 pt-2 text-slate-400">Sau khi bật + chuyển từ khoá, tool tự đo ở mốc 7 và 14 ngày và báo Teams kênh Ads (nên bổ sung tài sản trước khi chuyển).</p>
      )}

      {canEdit && buttons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
          {buttons.map((b) => (
            <Button key={b.action} type="button" size="sm" variant={b.variant} className="h-8"
              onClick={() => { setPending(b); setConfirmInput(""); setErr(null); setAmount(rec.sourceBudget ? String(rec.sourceBudget.target) : ""); }}>
              {b.label}
            </Button>
          ))}
        </div>
      )}

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setErr(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.label} — &quot;{rec.name}&quot;?</DialogTitle>
            <DialogDescription>Ghi thẳng lên tài khoản thật {company}.</DialogDescription>
          </DialogHeader>
          {pending?.action === "clear_tcpa" && (
            <p className="text-xs text-slate-600">Chiến dịch mới chuyển sang <b>Tối đa chuyển đổi KHÔNG mục tiêu CPA</b> — khuyên dùng 2 tuần đầu để Google học; đặt lại mục tiêu sau khi có ~30 chuyển đổi.</p>
          )}
          {pending?.action === "source_budget" && (
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-600">Ngân sách/ngày mới cho &quot;{rec.sourceName}&quot; (₫)</span>
              <Input type="number" min={50000} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10" />
              <span className="block text-slate-400">Giữ tổng: ngân sách gốc + {vnd(rec.budgetPerDay)} (chiến dịch mới) = tổng mong muốn. Tool ghi lại mức cũ để hoàn tác.</span>
            </label>
          )}
          <div className="space-y-1.5">
            <label htmlFor={confirmId} className="text-xs font-medium text-slate-500">
              Gõ <code className="rounded bg-slate-100 px-1 py-0.5">{confirmText}</code> để xác nhận
            </label>
            <Input id={confirmId} value={confirmInput} onChange={(e) => setConfirmInput(e.target.value)} placeholder={confirmText} autoComplete="off" className="h-10" />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <DialogFooter>
            <DialogClose render={<Button className="h-10" variant="outline" />}>Huỷ</DialogClose>
            <Button className="h-10" variant="destructive" onClick={run} disabled={running || confirmInput.trim() !== confirmText || (pending?.action === "source_budget" && !(Number(amount) >= 50000))}>
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Root ──

export function SearchSplitDialog({
  company, range, campaignId, open, onOpenChange, onChanged,
}: {
  company: Company; range: Range; campaignId: string | null; open: boolean;
  onOpenChange: (open: boolean) => void; onChanged: () => void;
}) {
  const [data, setData] = useState<SplitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true); setError(null); setData(null);
    try {
      const json = await getJson(`/api/google/search/split?company=${company}&campaignId=${campaignId}&from=${range.from}&to=${range.to}`);
      setData(json as SplitResponse);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Lỗi kết nối tới Google Ads");
    } finally { setLoading(false); }
  }, [campaignId, company, range.from, range.to]);

  useEffect(() => { if (open && campaignId) load(); }, [open, campaignId, load]);

  function patchSplit(rec: SplitRecord) {
    setData((prev) => {
      if (!prev) return prev;
      const exists = prev.splits.some((s) => s.id === rec.id);
      const splits = exists ? prev.splits.map((s) => (s.id === rec.id ? rec : s)) : [rec, ...prev.splits];
      return { ...prev, splits };
    });
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5"><SplitIcon className="h-4 w-4" aria-hidden="true" /> Tách lượt tìm chung</DialogTitle>
          <DialogDescription>Dựng chiến dịch riêng cho lượt tìm chung/mua, giữ lượt tìm thương hiệu ở chiến dịch gốc không bị ăn ngân sách.</DialogDescription>
        </DialogHeader>

        {loading && <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
        {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span></div>}

        {data && (
          <div className="space-y-5">
            {!data.canEdit && (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">🔒 Cần quyền sửa để tách chiến dịch — xem được, không ghi được.</p>
            )}

            {data.splits.some((s) => s.sourceId === campaignId && (s.step === "created" || s.step === "moved")) ? (
              // Đã có bản tách đang dùng → không mời tạo bản thứ hai (user 01/10 bấm Kiểm trước lần nữa tưởng chưa làm). Máy chủ cũng chặn tạo trùng (409).
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                ✓ Chiến dịch này <b>đã có bản tách</b> — không cần tách lại. Làm tiếp ở thẻ bên dưới: Bổ sung tài sản → Bật chiến dịch mới → Chuyển từ khoá chung (bước 3).
                Muốn tách lại từ đầu thì bấm &quot;Gỡ chiến dịch mới&quot; ở bản cũ trước.
              </p>
            ) : data.plan ? (
              data.canEdit ? (
                <PlanView plan={data.plan} assessment={data.assessment} company={company} range={range} confirmText={data.confirmText} onCreated={patchSplit} />
              ) : (
                <p className="text-xs text-slate-500">Chiến dịch mới sẽ tên &quot;{data.plan.newName}&quot;, {data.plan.adGroups.length} nhóm quảng cáo.</p>
              )
            ) : (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">Không dựng được kế hoạch tách cho chiến dịch này.</p>
            )}

            {data.splits.length > 0 && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <p className="text-xs font-bold text-slate-700">Các bản tách đã có ({data.splits.length})</p>
                <div className="space-y-2">
                  {data.splits.map((s) => (
                    <SplitRecordCard key={s.id} rec={s} company={company} confirmText={data.confirmText} canEdit={data.canEdit} onChanged={patchSplit} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
