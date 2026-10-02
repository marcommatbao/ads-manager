"use client";

import Link from "next/link";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { vnd, ddmmyyyy, datetimeVN } from "@/components/case/format";
import type { NumbersCheckResult } from "@/lib/jobs/numbers-check";
import { Badge, NUMBERS_STATUS_META } from "./badges";

export function NumbersCheckTable({ numbersCheck }: { numbersCheck: NumbersCheckResult | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-800">Đối chiếu số tuần</p>

      {!numbersCheck ? (
        <p className="text-sm text-slate-400">
          Chưa có lần đối chiếu nào — job chạy thứ Hai 09:30 (hoặc chạy tay ở{" "}
          <Link href="/settings/jobs" className="text-blue-600 hover:underline">Cài đặt → Jobs → Đối chiếu số hằng tuần</Link>).
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Khoảng {ddmmyyyy(numbersCheck.range.from)} → {ddmmyyyy(numbersCheck.range.to)} · lúc {datetimeVN(numbersCheck.at)}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Công ty</TableHead>
                <TableHead>Chỉ số</TableHead>
                <TableHead>Tool</TableHead>
                <TableHead>Gốc</TableHead>
                <TableHead>Lệch</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {numbersCheck.checks.map((c, i) => {
                const meta = NUMBERS_STATUS_META[c.status];
                return (
                  <TableRow key={`${c.company}-${c.name}-${i}`}>
                    <TableCell className="text-xs font-medium text-slate-700">{c.company}</TableCell>
                    <TableCell className="whitespace-normal max-w-[220px] text-xs text-slate-600">{c.name}</TableCell>
                    <TableCell className="text-xs tabular-nums text-slate-700">{vnd(c.tool)}</TableCell>
                    <TableCell className="text-xs tabular-nums text-slate-700">{vnd(c.reference)}</TableCell>
                    <TableCell className="text-xs tabular-nums text-slate-600">
                      {c.diff === null ? "—" : `${Math.round(c.diff * 100)}%`}
                    </TableCell>
                    <TableCell>
                      <Badge cls={meta.cls}>{meta.label}</Badge>
                      {c.note && c.status === "loi" && (
                        <p className="text-[11px] text-slate-400 mt-0.5">{c.note}</p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
