// ============================================================
// Sổ kinh nghiệm — bảng "Nên dùng" / "Nên tránh" (Đợt 7a)
// ------------------------------------------------------------
// Dùng chung một cấu trúc bảng cho cả hai hướng (direction "use"/"avoid"),
// chỉ khác viền màu + văn bản "Vì sao". KHÔNG import giá trị từ lib/playbook/*
// (xem components/playbook/labels.ts) — chỉ `import type`.
// ============================================================
"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/measure/Pill";
import { vnd, num, datetimeVN } from "@/components/case/format";
import {
  METRIC_LABEL,
  PLATFORM_LABEL,
  KIND_GROUP,
  STATUS_LABEL,
  CONFIDENCE_LABEL,
  VERDICT_LABEL,
} from "@/components/playbook/labels";
import type { PlaybookEntry, EntryStatus } from "@/lib/playbook/store";

type Decision = "approved" | "rejected" | "suggested";

/** Các dòng văn bản ngắn giải thích "vì sao" — khác nhau giữa hướng dùng/tránh. */
function reasonLines(e: PlaybookEntry): string[] {
  const lines: string[] = [];
  if (e.direction === "avoid") {
    lines.push(`Đã chi ${vnd(e.stat.cost)} · 0 kết quả · ${num(e.stat.loseUnits)} đơn vị thua`);
  } else {
    if (e.stat.cpr !== null && e.stat.lift !== null) {
      lines.push(`Chi phí/kết quả ${vnd(e.stat.cpr)} khi có · rẻ hơn ×${e.stat.lift}`);
    } else if (e.stat.cpr !== null) {
      lines.push(`Chi phí/kết quả ${vnd(e.stat.cpr)} khi có đặc điểm`);
    }
    lines.push(`${num(e.stat.winUnits)} đơn vị thắng · ${num(e.stat.campaigns)} chiến dịch`);
  }
  lines.push(e.stat.halvesAgree ? "✓ đúng cả 2 nửa kỳ" : "chưa kiểm được 2 nửa kỳ");
  return lines;
}

function actionsFor(status: EntryStatus): { label: string; decision: Decision; variant?: "outline" | "default" }[] {
  switch (status) {
    case "auto":
      return [{ label: "Bỏ", decision: "rejected", variant: "outline" }];
    case "suggested":
      return [
        { label: "Duyệt", decision: "approved" },
        { label: "Bỏ", decision: "rejected", variant: "outline" },
      ];
    case "approved":
      return [
        { label: "Bỏ", decision: "rejected", variant: "outline" },
        { label: "Trả về gợi ý", decision: "suggested", variant: "outline" },
      ];
    case "rejected":
      return [{ label: "Trả về gợi ý", decision: "suggested", variant: "outline" }];
    case "expired":
      return [];
  }
}

function Row({
  entry,
  canDecide,
  acting,
  onDecide,
}: {
  entry: PlaybookEntry;
  canDecide: boolean;
  acting: boolean;
  onDecide: (decision: Decision) => void;
}) {
  const statusInfo = STATUS_LABEL[entry.status];
  const isIntermediate = entry.metric !== "purchase";
  const actions = canDecide ? actionsFor(entry.status) : [];

  return (
    <tr className="border-b border-slate-50 align-top last:border-0">
      <td className="px-4 py-3">
        <div className="font-semibold text-slate-900">{entry.label}</div>
        <div className="mt-0.5 text-xs text-slate-400">
          {PLATFORM_LABEL[entry.platform]} · {entry.company} · {entry.product} · {KIND_GROUP[entry.kind]}
          <span className="ml-1 text-slate-300">({entry.unitType})</span>
        </div>
        {entry.note && (
          <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
            ⚠ {entry.note}
          </div>
        )}
        {entry.outcome && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Pill tone="blue">✓ xác nhận {entry.outcome.confirmed} · ✕ bác {entry.outcome.refuted}</Pill>
            {entry.demoted ? (
              <Pill tone="amber">⚠ Tạm hạ xuống gợi ý — bị bác ở ≥ 2 chiến dịch</Pill>
            ) : entry.status === "approved" && entry.outcome.demoted ? (
              <Pill tone="amber">⚠ Bị bác ≥ 2 chiến dịch — nên xem lại</Pill>
            ) : null}
          </div>
        )}
      </td>
      <td className="px-3 py-3 text-slate-600">
        <div className="space-y-0.5">
          {reasonLines(entry).map((line, i) => (
            <div key={i} className={i === reasonLines(entry).length - 1 ? "text-xs text-slate-400" : ""}>{line}</div>
          ))}
        </div>
        {entry.evidence.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-blue-600">
              Bằng chứng ({entry.evidence.length})
            </summary>
            <div className="mt-1.5 space-y-1 text-xs text-slate-500">
              {entry.evidence.map((ev, i) => {
                const v = VERDICT_LABEL[ev.verdict];
                return (
                  <div key={i} className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-slate-700">{ev.unitName}</span>
                    <span>· {ev.campaignName}</span>
                    <span>· {vnd(ev.cost)}</span>
                    <span>· {num(ev.results)} kết quả</span>
                    <Pill tone={v.tone}>{v.text}</Pill>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="font-medium text-slate-800">{METRIC_LABEL[entry.metric]}</div>
        {isIntermediate && (
          <div className="mt-1">
            <Pill tone="amber">⚠ chỉ số trung gian</Pill>
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        <Pill tone={CONFIDENCE_LABEL[entry.confidence].tone}>{CONFIDENCE_LABEL[entry.confidence].text}</Pill>
      </td>
      <td className="px-3 py-3">
        <Pill tone={statusInfo.tone}>{statusInfo.text}</Pill>
        {entry.decidedAt && (
          <div className="mt-1 text-[11px] text-slate-400">
            {entry.decidedBy ? `${entry.decidedBy} · ` : ""}
            {datetimeVN(entry.decidedAt)}
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a) => (
              <Button
                key={a.decision}
                size="sm"
                variant={a.variant ?? "default"}
                disabled={acting}
                onClick={() => onDecide(a.decision)}
              >
                {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

export function PlaybookTable({
  title,
  description,
  entries,
  accent,
  canDecide,
  actingId,
  onDecide,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  description?: string;
  entries: PlaybookEntry[];
  accent: "use" | "avoid";
  canDecide: boolean;
  actingId: string | null;
  onDecide: (entry: PlaybookEntry, decision: Decision) => void;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      <div
        className={
          accent === "avoid"
            ? "overflow-hidden rounded-xl border border-slate-200 border-l-4 border-l-red-400 bg-white"
            : "overflow-hidden rounded-xl border border-slate-200 bg-white"
        }
      >
        {entries.length === 0 ? (
          <EmptyState compact title={emptyTitle} description={emptyDescription} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="min-w-[200px] px-4 py-2.5 font-medium">Điều rút ra</th>
                  <th className="min-w-[260px] px-3 py-2.5 font-medium">Vì sao</th>
                  <th className="px-3 py-2.5 font-medium">Chỉ số</th>
                  <th className="px-3 py-2.5 font-medium">Độ tin cậy</th>
                  <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                  <th className="px-3 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <Row
                    key={e.id}
                    entry={e}
                    canDecide={canDecide}
                    acting={actingId === e.id}
                    onDecide={(decision) => onDecide(e, decision)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
