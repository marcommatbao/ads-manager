"use client";

import { RefreshCw, Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AdsContentHeaderProps {
  isRefreshing: boolean;
  onRefresh: () => void;
  onExportCurrentView: () => void;
  exportingCurrentView: boolean;
  onExportCurrentViewPdf: () => void;
  exportingCurrentViewPdf: boolean;
  currentViewCount: number;
  generatedAt: string | null;
}

export function AdsContentHeader({
  isRefreshing,
  onRefresh,
  onExportCurrentView,
  exportingCurrentView,
  onExportCurrentViewPdf,
  exportingCurrentViewPdf,
  currentViewCount,
  generatedAt,
}: AdsContentHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Ads Content</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Theo dõi creative đang chạy theo campaign — Facebook, Google Search, Google PMax.
        </p>
      </div>
      <div className="flex items-center gap-3">
        {generatedAt && (
          <span className="text-xs text-slate-400">Cập nhật lúc {new Date(generatedAt).toLocaleTimeString("vi-VN")}</span>
        )}
        <Button variant="outline" size="sm" className="gap-1.5 rounded-lg border-slate-200" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          {isRefreshing ? "Đang tải..." : "Refresh"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-lg border-slate-200"
          onClick={onExportCurrentView}
          disabled={exportingCurrentView || currentViewCount === 0}
        >
          {exportingCurrentView ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export Excel ({currentViewCount})
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-lg border-slate-200"
          onClick={onExportCurrentViewPdf}
          disabled={exportingCurrentViewPdf || currentViewCount === 0}
        >
          {exportingCurrentViewPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          Export PDF
        </Button>
      </div>
    </div>
  );
}
