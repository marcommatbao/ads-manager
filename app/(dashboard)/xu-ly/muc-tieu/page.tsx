"use client";

// ============================================================
// Mục tiêu theo sản phẩm — mỗi (công ty × sản phẩm) có 2 ngưỡng: mục tiêu
// (muốn đạt) và trần (vượt là cắt). Dùng bởi bảng Tổng quan + bước 3 của
// phiên xử lý (lib/case/targets.ts targetFor()).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { getJson, putJson, ApiError } from "@/components/case/api";
import { PRODUCT_LABEL } from "@/lib/case/product";
import type { ProductGroup } from "@/lib/case/product";
import type { Company } from "@/lib/case/types";
import type { TargetBasis } from "@/lib/case/verdict";

interface TargetRow { company: Company; group: ProductGroup; basis: TargetBasis; target: number; ceiling: number }
type Draft = { basis: TargetBasis; target: string; ceiling: string };

const GROUPS = Object.keys(PRODUCT_LABEL) as ProductGroup[];
const COMPANIES: Company[] = ["MBI", "MBC"];

function keyOf(company: Company, group: ProductGroup) { return `${company}:${group}`; }

function validateDraft(basis: TargetBasis, target: number, ceiling: number): string | null {
  if (!(target > 0) || !(ceiling > 0)) return "Mục tiêu và trần phải > 0";
  if (basis === "cpa" && target > ceiling) return "Chi phí/đơn mục tiêu phải ≤ trần";
  if (basis === "roas" && target < ceiling) return "ROAS mục tiêu phải ≥ ROAS trần";
  return null;
}

export default function CaseTargetsPage() {
  const { data, error, isLoading, mutate } = useSWR<{ success: true; rows: TargetRow[] }>("/api/case-targets", getJson);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [prefilled, setPrefilled] = useState(false);
  const [savingCompany, setSavingCompany] = useState<Company | null>(null);
  const [saveErr, setSaveErr] = useState<Record<Company, string | null>>({ MBI: null, MBC: null });
  const [saveOk, setSaveOk] = useState<Record<Company, boolean>>({ MBI: false, MBC: false });

  useEffect(() => {
    if (prefilled || !data) return;
    const next: Record<string, Draft> = {};
    for (const r of data.rows) {
      next[keyOf(r.company, r.group)] = { basis: r.basis, target: String(r.target), ceiling: String(r.ceiling) };
    }
    setDrafts(next);
    setPrefilled(true);
  }, [data, prefilled]);

  const emptyDraft: Draft = { basis: "cpa", target: "", ceiling: "" };

  function setDraft(company: Company, group: ProductGroup, patch: Partial<Draft>) {
    const k = keyOf(company, group);
    setDrafts((prev) => {
      const base = prev[k] ?? emptyDraft;
      return { ...prev, [k]: { ...base, ...patch } };
    });
  }

  async function saveCompany(company: Company) {
    const rows: TargetRow[] = [];
    const errors: string[] = [];
    for (const group of GROUPS) {
      const d = drafts[keyOf(company, group)];
      if (!d || (!d.target.trim() && !d.ceiling.trim())) continue; // bỏ trống = chưa muốn đặt
      const target = Number(d.target), ceiling = Number(d.ceiling);
      const err = validateDraft(d.basis, target, ceiling);
      if (err) { errors.push(`${PRODUCT_LABEL[group]}: ${err}`); continue; }
      rows.push({ company, group, basis: d.basis, target, ceiling });
    }
    if (errors.length > 0) { setSaveErr((p) => ({ ...p, [company]: errors.join(" · ") })); return; }
    if (rows.length === 0) { setSaveErr((p) => ({ ...p, [company]: "Chưa có dòng nào để lưu — điền ít nhất một sản phẩm" })); return; }

    setSavingCompany(company);
    setSaveErr((p) => ({ ...p, [company]: null }));
    setSaveOk((p) => ({ ...p, [company]: false }));
    try {
      await putJson("/api/case-targets", { rows });
      await mutate();
      setSaveOk((p) => ({ ...p, [company]: true }));
    } catch (e) {
      setSaveErr((p) => ({ ...p, [company]: e instanceof ApiError ? e.message : "Không lưu được mục tiêu" }));
    } finally {
      setSavingCompany(null);
    }
  }

  const rowsByCompany = useMemo(() => {
    const m: Record<Company, TargetRow[]> = { MBI: [], MBC: [] };
    for (const r of data?.rows ?? []) m[r.company]?.push(r);
    return m;
  }, [data]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Mục tiêu theo sản phẩm</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Mỗi sản phẩm có 2 ngưỡng: <b>mục tiêu</b> (muốn đạt) và <b>trần</b> (vượt là cắt). cpa: chi phí/đơn mục tiêu và trần ·
          roas: ROAS mục tiêu và ROAS tối thiểu (dưới là đỏ). Mục tiêu cuối cho cả Google và Facebook: <b>Mua hàng</b>.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-56 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      )}

      {!isLoading && error && (
        <EmptyState
          icon={AlertTriangle}
          title="Không tải được mục tiêu hiện có"
          description={error instanceof ApiError ? error.message : "Có lỗi khi tải dữ liệu."}
          action={<Button className="h-10" onClick={() => mutate()}>Thử lại</Button>}
        />
      )}

      {!isLoading && !error && data && COMPANIES.map((company) => (
        <div key={company} className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-800">{company}</span>
            <span className="text-xs text-slate-400">{rowsByCompany[company].length} sản phẩm đã có mục tiêu</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Sản phẩm</th>
                <th className="px-3 py-2 font-medium">Cách chấm</th>
                <th className="px-3 py-2 text-right font-medium">Mục tiêu</th>
                <th className="px-3 py-2 text-right font-medium">Trần</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((group) => {
                const k = keyOf(company, group);
                const d = drafts[k] ?? { basis: "cpa" as TargetBasis, target: "", ceiling: "" };
                return (
                  <tr key={group} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2 font-medium text-slate-700">{PRODUCT_LABEL[group]}</td>
                    <td className="px-3 py-2">
                      <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
                        {(["cpa", "roas"] as TargetBasis[]).map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setDraft(company, group, { basis: b })}
                            className={cn(
                              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                              d.basis === b ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50",
                            )}
                          >
                            {b === "cpa" ? "CPA" : "ROAS"}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        inputMode="numeric"
                        aria-label={`Mục tiêu ${PRODUCT_LABEL[group]} ${company}`}
                        value={d.target}
                        onChange={(e) => setDraft(company, group, { target: e.target.value })}
                        className="ml-auto w-28 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        inputMode="numeric"
                        aria-label={`Trần ${PRODUCT_LABEL[group]} ${company}`}
                        value={d.ceiling}
                        onChange={(e) => setDraft(company, group, { ceiling: e.target.value })}
                        className="ml-auto w-28 text-right tabular-nums"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
            <div className="text-sm">
              {saveErr[company] && <span className="text-red-600">{saveErr[company]}</span>}
              {!saveErr[company] && saveOk[company] && <span className="text-emerald-600">Đã lưu — bảng tổng quan sẽ chấm lại theo ngưỡng mới.</span>}
            </div>
            <Button className="h-10" onClick={() => saveCompany(company)} disabled={savingCompany === company}>
              {savingCompany === company && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />} Lưu mục tiêu {company}
            </Button>
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <div className="mb-1 font-semibold text-slate-800">Facebook</div>
        Mục tiêu cuối: <b>Mua hàng</b> (sự kiện Purchase của pixel) — MBI và MBC. Dự kiến dùng chung ngưỡng theo sản phẩm với Google (đợt 3).
      </div>
    </div>
  );
}
