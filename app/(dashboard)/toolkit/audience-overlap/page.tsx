"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users2, Loader2, AlertTriangle, RefreshCw, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface OverlapPair {
  adSetA: { id: string; name: string; campaignId: string; campaignName: string };
  adSetB: { id: string; name: string; campaignId: string; campaignName: string };
  similarityPct: number;
  signals: {
    interests: number | null;
    customAudiences: number | null;
    geo: number | null;
    age: number;
    gender: number;
  };
}

interface ApiResponse {
  success: boolean;
  totalActiveAdSets: number;
  pairs: OverlapPair[];
  totalQualifyingPairs: number;
  error?: string;
}

function severityColor(pct: number): string {
  if (pct >= 80) return "border-red-200 bg-red-50";
  if (pct >= 65) return "border-amber-200 bg-amber-50";
  return "border-slate-200 bg-slate-50";
}

function SignalBar({ label, value }: { label: string; value: number | null }) {
  if (value === null) {
    return (
      <div className="flex items-center justify-between text-[10px] text-slate-300">
        <span>{label}</span><span>không áp dụng</span>
      </div>
    );
  }
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>{label}</span><span className="font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div className="h-1.5 rounded-full bg-violet-400" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PairCard({ pair }: { pair: OverlapPair }) {
  const sameCampaign = pair.adSetA.campaignId === pair.adSetB.campaignId;
  return (
    <div className={cn("rounded-xl border p-4 space-y-3", severityColor(pair.similarityPct))}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div>
            <p className="text-sm font-medium text-slate-700 truncate">{pair.adSetA.name}</p>
            <p className="text-[10px] text-slate-400 truncate">{pair.adSetA.campaignName}</p>
          </div>
          <div className="text-[10px] text-slate-300 pl-1">×</div>
          <div>
            <p className="text-sm font-medium text-slate-700 truncate">{pair.adSetB.name}</p>
            <p className="text-[10px] text-slate-400 truncate">{pair.adSetB.campaignName}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn(
            "text-2xl font-bold",
            pair.similarityPct >= 80 ? "text-red-600" : pair.similarityPct >= 65 ? "text-amber-600" : "text-slate-600"
          )}>
            {pair.similarityPct}%
          </p>
          <p className="text-[10px] text-slate-400">độ tương đồng targeting</p>
          {!sameCampaign && (
            <p className="text-[10px] font-medium text-red-500 mt-0.5">Khác campaign ⚠️</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1 border-t border-slate-200/60">
        <SignalBar label="Interests/Behaviors" value={pair.signals.interests} />
        <SignalBar label="Custom Audiences" value={pair.signals.customAudiences} />
        <SignalBar label="Vị trí" value={pair.signals.geo} />
        <SignalBar label="Độ tuổi" value={pair.signals.age} />
      </div>
    </div>
  );
}

export default function AudienceOverlapPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meta/audience-overlap");
      const json = await res.json() as ApiResponse;
      // Không dựa vào việc `error` có mặt hay không: bất kỳ phản hồi nào
      // success=false đều là thất bại, kể cả khi server quên kèm lý do. Bản cũ
      // đòi có `error` mới ném, nên nhánh "chưa cấu hình" (không kèm error) lọt
      // xuống và được vẽ thành "không có cặp trùng lặp".
      if (!json.success) throw new Error(json.error ?? "Không lấy được dữ liệu ad set từ Facebook");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pairs = data?.pairs ?? [];
  const sameCampaignCount = pairs.filter(p => p.adSetA.campaignId === p.adSetB.campaignId).length;
  const crossCampaignCount = pairs.length - sameCampaignCount;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
            <Users2 className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Audience Overlap (Độ tương đồng Targeting)</h1>
            <p className="text-sm text-slate-500">
              {data ? `${data.totalActiveAdSets} ad set đang chạy` : "Đang tải..."} — Facebook
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Làm mới
        </button>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3">
        <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Meta không còn cung cấp API tính % trùng audience thật (tính năng này đã bị gỡ khỏi Marketing API công khai từ nhiều năm trước, chỉ còn trong Ads Manager UI). Đây là <span className="font-semibold">độ tương đồng targeting</span> — so sánh interests/custom audiences/vị trí/độ tuổi thật giữa các ad set đang chạy cùng lúc để ước lượng khả năng tự cạnh tranh, không phải % trùng người xem đo được thật.
        </p>
      </div>

      {data && pairs.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="border border-slate-200 bg-white shadow-sm">
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{sameCampaignCount}</p>
              <p className="text-xs text-slate-500 mt-1">Cặp trùng trong cùng campaign</p>
            </CardContent>
          </Card>
          <Card className="border border-slate-200 bg-white shadow-sm">
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-red-600">{crossCampaignCount}</p>
              <p className="text-xs text-slate-500 mt-1">Cặp trùng khác campaign (đáng lo hơn)</p>
            </CardContent>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      ) : pairs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-10 text-center">
          <Users2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">Không có cặp ad set nào tương đồng cao</p>
          <p className="text-xs text-slate-400 mt-1">Đã kiểm tra {data?.totalActiveAdSets ?? 0} ad set đang chạy — không phát hiện targeting trùng lặp đáng kể.</p>
        </div>
      ) : (
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-800">Cặp ad set có targeting tương đồng cao</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Sắp xếp theo độ tương đồng giảm dần — chỉ hiện cặp ≥75%.{" "}
              {data && data.totalQualifyingPairs > pairs.length
                ? `Hiển thị ${pairs.length}/${data.totalQualifyingPairs} cặp (đã lược bớt cặp thấp hơn).`
                : `${pairs.length} cặp.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pairs.map((pair, i) => (
              <PairCard key={`${pair.adSetA.id}-${pair.adSetB.id}-${i}`} pair={pair} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
