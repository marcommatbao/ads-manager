"use client";

// ============================================================
// ConnectorHealth — live status panel for all integrations
// Shows: status badge, last checked, masked config, test button
// Used in: settings/page.tsx (API Connections tab)
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle, XCircle, AlertTriangle, Ban, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConnectorHealthRecord, ConnectorStatus } from "@/lib/connectors/types";

// ── Types ────────────────────────────────────────────────

interface ConnectorMeta {
  id: string;
  displayName: string;
  supportsLiveTest: boolean;
  color: string;
  icon: string;
}

interface HealthResponse {
  records: Record<string, ConnectorHealthRecord>;
  connectors: ConnectorMeta[];
  canTest: boolean;
}

// ── Status badge ────────────────────────────────────────

const STATUS_CONFIG: Record<ConnectorStatus, { label: string; icon: React.ReactNode; badgeCls: string }> = {
  healthy:        { label: "Healthy",        icon: <CheckCircle2 className="h-3.5 w-3.5" />,  badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  warning:        { label: "Warning",        icon: <AlertTriangle className="h-3.5 w-3.5" />, badgeCls: "bg-amber-50 text-amber-700 border-amber-200" },
  missing_config: { label: "Not configured", icon: <AlertCircle className="h-3.5 w-3.5" />,  badgeCls: "bg-slate-100 text-slate-600 border-slate-200" },
  auth_error:     { label: "Auth error",     icon: <XCircle className="h-3.5 w-3.5" />,       badgeCls: "bg-red-50 text-red-700 border-red-200" },
  service_error:  { label: "Service error",  icon: <XCircle className="h-3.5 w-3.5" />,       badgeCls: "bg-orange-50 text-orange-700 border-orange-200" },
  disabled:       { label: "Disabled",       icon: <Ban className="h-3.5 w-3.5" />,           badgeCls: "bg-slate-100 text-slate-400 border-slate-200" },
};

function StatusBadge({ status }: { status: ConnectorStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", cfg.badgeCls)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ── Relative time ────────────────────────────────────────

function relTime(iso: string | null): string {
  if (!iso) return "Chưa kiểm tra";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "Chưa kiểm tra";

  // lastChecked is stamped by the server; the browser clock is usually a
  // second or two behind it, which made every freshly-checked connector
  // render "Kiểm tra -1s trước". Clamp to zero and say "vừa xong" for
  // anything inside the skew window instead of printing a negative age.
  const secs = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (secs < 5)     return "vừa xong";
  if (secs < 60)    return `${secs}s trước`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)    return `${mins}m trước`;
  const hrs  = Math.floor(mins / 60);
  if (hrs < 24)     return `${hrs}h trước`;
  return `${Math.floor(hrs / 24)}d trước`;
}

// ── Connector row ─────────────────────────────────────────

function ConnectorRow({
  meta,
  record,
  canTest,
  onTest,
  testing,
}: {
  meta: ConnectorMeta;
  record: ConnectorHealthRecord | null;
  canTest: boolean;
  onTest: () => void;
  testing: boolean;
}) {
  const status = record?.status ?? "missing_config";
  const [expanded, setExpanded] = useState(false);
  const hasDetails = record && (record.failureReason || Object.keys(record.maskedConfig).length > 0 || record.note);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div
        className={cn("flex items-center gap-3 px-4 py-3.5", hasDetails && "cursor-pointer hover:bg-slate-50/60")}
        onClick={() => hasDetails && setExpanded(e => !e)}
      >
        {/* Icon */}
        <span className="text-xl leading-none">{meta.icon}</span>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{meta.displayName}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {record?.lastChecked
              ? `Kiểm tra ${relTime(record.lastChecked)}`
              : "Chưa kiểm tra lần nào"}
            {record?.needsRefresh && (
              <span className="ml-2 text-amber-600 font-medium">· Token cần làm mới</span>
            )}
          </p>
        </div>

        {/* Status badge */}
        <StatusBadge status={status} />

        {/* Test button */}
        {canTest && meta.supportsLiveTest && (
          <Button
            variant="outline"
            size="sm"
            onClick={e => { e.stopPropagation(); onTest(); }}
            disabled={testing}
            className="ml-2 gap-1 text-xs border-slate-200 shrink-0"
          >
            {testing
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <RefreshCw className="h-3 w-3" />}
            Test
          </Button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50/30">
          {record?.failureReason && (
            <div className="flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-500" />
              <p className="text-xs text-red-700">{record.failureReason}</p>
            </div>
          )}
          {record?.note && !record.failureReason && (
            <p className="text-xs text-slate-600">{record.note}</p>
          )}
          {Object.entries(record?.maskedConfig ?? {}).length > 0 && (
            <div className="space-y-1">
              {Object.entries(record!.maskedConfig).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-slate-500 min-w-[180px]">{k}</span>
                  <span className="text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────

interface Props {
  /** If false, only show; no test buttons */
  canTest?: boolean;
}

export function ConnectorHealth({ canTest = false }: Props) {
  const [data, setData]       = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors/health");
      if (res.ok) {
        const json = await res.json() as HealthResponse;
        setData(json);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const testConnector = async (id: string) => {
    setTesting(t => ({ ...t, [id]: true }));
    try {
      const res = await fetch(`/api/connectors/${id}/test`, { method: "POST" });
      if (res.ok) {
        const json = await res.json() as { record: ConnectorHealthRecord };
        setData(d => d ? {
          ...d,
          records: { ...d.records, [id]: json.record },
        } : d);
      }
    } catch { /* ignore */ }
    setTesting(t => ({ ...t, [id]: false }));
  };

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/connectors/health", { method: "POST" });
      if (res.ok) {
        const json = await res.json() as { records: Record<string, ConnectorHealthRecord> };
        setData(d => d ? { ...d, records: json.records } : d);
      }
    } catch { /* ignore */ }
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  if (!data) return null;

  // Count by status for summary pill row
  const summary = data.connectors.reduce(
    (acc, c) => {
      const s = data.records[c.id]?.status ?? "missing_config";
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<ConnectorStatus, number>>,
  );

  const effectiveCanTest = canTest && data.canTest;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Trạng thái kết nối</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {summary.healthy       ? <span className="text-xs text-emerald-700 font-medium">{summary.healthy} healthy</span> : null}
            {summary.warning       ? <span className="text-xs text-amber-700 font-medium">{summary.warning} warning</span>   : null}
            {summary.auth_error    ? <span className="text-xs text-red-700 font-medium">{summary.auth_error} auth error</span> : null}
            {summary.service_error ? <span className="text-xs text-orange-700 font-medium">{summary.service_error} service error</span> : null}
            {summary.missing_config ? <span className="text-xs text-slate-500">{summary.missing_config} not configured</span> : null}
          </div>
        </div>
        {effectiveCanTest && (
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={refreshing}
            className="gap-1.5 text-xs border-slate-200"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Test tất cả
          </Button>
        )}
      </div>

      {/* Connector rows */}
      <div className="space-y-2">
        {data.connectors.map(meta => (
          <ConnectorRow
            key={meta.id}
            meta={meta}
            record={data.records[meta.id] ?? null}
            canTest={effectiveCanTest}
            onTest={() => testConnector(meta.id)}
            testing={!!testing[meta.id]}
          />
        ))}
      </div>
    </div>
  );
}
