// ============================================================
// Bước 3 — Chốt mục tiêu cuối trước khi hệ thống xếp hạng nguyên nhân.
// ============================================================
"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { getJson, postJson, ApiError } from "./api";
import { vnd } from "./format";
import { productGroupOf, PRODUCT_LABEL } from "@/lib/case/product";
import type { CampaignCase } from "@/lib/case/store";
import type { Company } from "@/lib/case/types";
import type { TargetBasis } from "@/lib/case/verdict";

// Hình dạng tối thiểu của một dòng /api/case-targets — chỉ lấy phần cần để
// gợi ý mục tiêu, KHÔNG import lib/case/targets.ts (đó là file backend có fs).
interface TargetRow {
  company: Company;
  group: string;
  basis: TargetBasis;
  target: number;
  ceiling: number;
}

export function Step3Goal({
  c,
  onBack,
  onSubmitted,
  busy,
}: {
  c: CampaignCase;
  onBack: () => void;
  onSubmitted: (next: CampaignCase) => void;
  busy?: boolean;
}) {
  const group = productGroupOf(c.campaignName);
  const groupLabel = PRODUCT_LABEL[group];
  const { data } = useSWR<{ success: true; rows: TargetRow[] }>("/api/case-targets", getJson);

  const existing = data?.rows.find((r) => r.company === c.company && r.group === group)
    ?? data?.rows.find((r) => r.company === c.company && r.group === "DEFAULT");

  const [basis, setBasis] = useState<TargetBasis>(c.goal?.basis ?? existing?.basis ?? "cpa");
  const [target, setTarget] = useState<string>(String(c.goal?.target ?? existing?.target ?? ""));
  const [ceiling, setCeiling] = useState<string>(String(c.goal?.ceiling ?? existing?.ceiling ?? ""));
  const [where, setWhere] = useState<string>(c.goal?.where ?? "");
  const [saveAsDefault, setSaveAsDefault] = useState(!c.goal);
  const [prefilled, setPrefilled] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Chỉ điền sẵn MỘT LẦN khi mục tiêu hiện có tải xong — sau đó để người dùng
  // tự gõ, không ghi đè giữa lúc họ đang sửa.
  useEffect(() => {
    if (prefilled || c.goal || !existing) return;
    setBasis(existing.basis);
    setTarget(String(existing.target));
    setCeiling(String(existing.ceiling));
    setPrefilled(true);
  }, [existing, prefilled, c.goal]);

  const targetN = Number(target);
  const ceilingN = Number(ceiling);
  const clientError =
    !target || !ceiling ? null
    : !(targetN > 0) || !(ceilingN > 0) ? "Mục tiêu và trần phải > 0"
    : basis === "cpa" && targetN > ceilingN ? "Chi phí/đơn mục tiêu phải ≤ trần"
    : basis === "roas" && targetN < ceilingN ? "ROAS mục tiêu phải ≥ ROAS trần"
    : null;

  async function submit() {
    if (clientError || !target || !ceiling) { setErr(clientError ?? "Điền đủ mục tiêu và trần"); return; }
    setSaving(true);
    setErr(null);
    try {
      const json = await postJson(`/api/cases/${c.id}/goal`, {
        basis, target: targetN, ceiling: ceilingN, where: where.trim(), saveAsDefault,
      });
      onSubmitted(json.case);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Không chốt được mục tiêu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">Chốt mục tiêu trước khi kết luận</h2>
        <p className="mt-0.5 text-sm text-slate-500">Nguyên nhân ở bước 4 được chấm theo đúng mục tiêu chốt ở đây · sản phẩm: <b>{groupLabel}</b></p>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Cách chấm</label>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {([["cpa", "Chi phí/đơn (CPA)"], ["roas", "ROAS"]] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setBasis(v)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  basis === v ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="ac-where" className="mb-1.5 block text-sm font-medium text-slate-700">Nơi ghi nhận đơn</label>
          <Input
            id="ac-where"
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            placeholder="Trang ghi nhận đơn, vd trang cảm ơn sau thanh toán"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ac-target" className="mb-1.5 block text-sm font-medium text-slate-700">
              {basis === "cpa" ? "Chi phí/đơn mục tiêu" : "ROAS mục tiêu ≥"} <span className="text-red-500">*</span>
            </label>
            <Input id="ac-target" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="ac-cap" className="mb-1.5 block text-sm font-medium text-slate-700">
              {basis === "cpa" ? "Trần chi phí/đơn" : "Trần ROAS (đỏ khi dưới)"} <span className="text-red-500">*</span>
            </label>
            <Input id="ac-cap" inputMode="numeric" value={ceiling} onChange={(e) => setCeiling(e.target.value)} required />
          </div>
        </div>
        {basis === "cpa" && targetN > 0 && ceilingN > 0 && (
          <p className="text-xs text-slate-400">Vượt trần = {vnd(ceilingN)}/đơn trở lên bị đánh đỏ.</p>
        )}

        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={saveAsDefault} onCheckedChange={setSaveAsDefault} />
          Lưu làm mặc định cho sản phẩm <b>{groupLabel} ({c.company})</b>
        </label>

        {(clientError || err) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err ?? clientError}</div>
        )}
      </div>

      <div className="flex justify-between">
        <Button className="h-10" variant="outline" onClick={onBack} disabled={busy || saving}>← Bước 2</Button>
        <Button className="h-10" onClick={submit} disabled={busy || saving || !!clientError}>
          {saving ? "Đang chốt…" : "Chốt mục tiêu & xem nguyên nhân →"}
        </Button>
      </div>
    </div>
  );
}
