"use client";

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { HealthConnector } from "./types";
import { Badge, CONNECTOR_STATUS_META } from "./badges";
import { absTime } from "./format";

export function ConnectorsTable({ connectors }: { connectors: HealthConnector[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-800">Kết nối</p>
      {connectors.length === 0 ? (
        <p className="text-sm text-slate-400">Chưa đọc được danh sách kết nối.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kết nối</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Lý do</TableHead>
              <TableHead>Kiểm lần cuối</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {connectors.map((c) => {
              const meta = CONNECTOR_STATUS_META[c.status];
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs text-slate-700">{c.id}</TableCell>
                  <TableCell><Badge cls={meta.cls}>{meta.label}</Badge></TableCell>
                  <TableCell className="whitespace-normal max-w-[280px] text-xs text-slate-500">{c.reason ?? "—"}</TableCell>
                  <TableCell className="text-xs text-slate-500">{absTime(c.lastChecked)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
