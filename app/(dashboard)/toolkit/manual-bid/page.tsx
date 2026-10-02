"use client";

// ============================================================
// Giá thầu thủ công — đề xuất từ dữ liệu đã chạy
// ============================================================
// Bày kết quả của lib/google-manual-bid.ts và cho áp dụng có duyệt.
// Hai điều màn hình này CỐ Ý luôn nói ra, vì thiếu chúng là dễ đặt nhầm giá:
//   • chiến dịch đang chạy đấu thầu tự động thì đừng chuyển sang thủ công
//   • con số đề xuất luôn kèm KHOẢNG và mức tin cậy, không phải một số chắc nịch

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Gauge, RefreshCw, AlertTriangle, Loader2, ChevronDown, Info,
  TrendingDown, TrendingUp, Minus, Ban, HelpCircle, Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";
import type { CampaignBidSummary, KeywordBidRec, BidVerdict } from "@/lib/google-manual-bid";
import { companyIds } from "@/lib/companies/registry";

const fetcher = (url: string) => fetch(url).then(async (r) => {
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as { campaigns: CampaignBidSummary[]; warnings: string[]; generatedAt: string };
});

const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`;

const VERDICT_META: Record<BidVerdict, { label: string; cls: string; Icon: typeof Minus }> = {
  giam:            { label: "Nên giảm",        cls: "bg-red-50 text-red-700 border-red-200",         Icon: TrendingDown },
  tang:            { label: "Có thể tăng",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: TrendingUp },
  giu:             { label: "Đang hợp lý",     cls: "bg-slate-50 text-slate-600 border-slate-200",   Icon: Minus },
  khong_dat_duoc:  { label: "Không đạt được",  cls: "bg-amber-50 text-amber-700 border-amber-200",   Icon: Ban },
  thieu_du_lieu:   { label: "Thiếu dữ liệu",   cls: "bg-slate-50 text-slate-400 border-slate-200",   Icon: HelpCircle },
};

const CONFIDENCE_LABEL: Record<string, string> = {
  du: "Đủ dữ liệu",
  tam: "Tạm đủ — mượn tỷ lệ chiến dịch",
  thieu: "Mỏng — đọc kỹ khoảng",
};

function KeywordRow({
  kw, checked, onToggle,
}: { kw: KeywordBidRec; checked: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  const meta = VERDICT_META[kw.verdict];
  const selectable = kw.recommendedBid !== null && kw.verdict !== "giu";

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="pt-0.5">
          <Checkbox checked={checked} onCheckedChange={onToggle} disabled={!selectable} />
        </div>

        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium text-slate-800">{kw.text}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{kw.matchType}</span>
            <span className={cn("flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium", meta.cls)}>
              <meta.Icon className="h-3 w-3" /> {meta.label}
            </span>
            {kw.qualityScore !== null && (
              <span className={cn("rounded px-1.5 py-0.5 text-[10px]", kw.qualityScore <= 4 ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500")}>
                QS {kw.qualityScore}
              </span>
            )}
            <ChevronDown className={cn("h-3 w-3 text-slate-300 transition", open && "rotate-180")} />
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {kw.clicks} nhấp · {kw.conversions} chuyển đổi · đã tiêu {vnd(kw.cost)} · thực trả {vnd(kw.avgCpc)}/nhấp
          </p>
          {open && (
            <div className="mt-1.5 rounded-md bg-slate-50 px-2 py-1.5">
              <p className="text-[11px] leading-relaxed text-slate-600">{kw.reason}</p>
              <p className="mt-1 text-[10px] text-slate-400">
                Mức tin cậy: {CONFIDENCE_LABEL[kw.confidence]} · Mục tiêu CPA {vnd(kw.targetCpa)}
                {kw.targetCpaSource === "noi_bo" ? " (mốc nội bộ, chiến dịch không khai target CPA)" : " (lấy từ Google)"}
                {kw.firstPageCpc !== null && ` · Google ước tính trang đầu ${vnd(kw.firstPageCpc)}`}
                {kw.topOfPageCpc !== null && ` · đầu trang ${vnd(kw.topOfPageCpc)}`}
              </p>
            </div>
          )}
        </button>

        <div className="shrink-0 text-right">
          <p className="text-[10px] text-slate-400">đang đặt</p>
          <p className="text-xs tabular-nums text-slate-600">{kw.currentBid > 0 ? vnd(kw.currentBid) : "—"}</p>
        </div>
        <div className="w-px self-stretch bg-slate-100" />
        <div className="shrink-0 text-right">
          <p className="text-[10px] text-slate-400">đề xuất</p>
          <p className={cn("text-xs font-bold tabular-nums", kw.recommendedBid === null ? "text-slate-300" : "text-slate-800")}>
            {kw.recommendedBid === null ? "—" : vnd(kw.recommendedBid)}
          </p>
          {kw.bidRange && kw.recommendedBid !== null && (
            <p className="text-[10px] text-slate-400">{vnd(kw.bidRange[0])}–{vnd(kw.bidRange[1])}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ManualBidPage() {
  const { toast } = useToast();
  const [company, setCompany] = useState<string>("MBC");
  const [days, setDays] = useState(30);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string | null>(null);

  const { data, error, isLoading, mutate, isValidating } = useSWR(
    `/api/google/manual-bid?company=${company}&days=${days}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const campaigns = useMemo(() => data?.campaigns ?? [], [data]);
  const totalOverspend = campaigns.reduce((s, c) => s + c.overspendPerMonth, 0);

  function toggle(rn: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rn)) next.delete(rn); else next.add(rn);
      return next;
    });
  }

  async function apply(camp: CampaignBidSummary, dryRun: boolean) {
    const rns = camp.keywords.filter((k) => selected.has(k.resourceName)).map((k) => k.resourceName);
    if (rns.length === 0) { toast({ title: "Chưa chọn từ khoá nào trong chiến dịch này" }); return; }
    setApplying(camp.campaignId);
    try {
      const res = await fetch("/api/google/manual-bid/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, days, campaignId: camp.campaignId, resourceNames: rns, dryRun }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (dryRun) {
        const lines = (j.preview ?? []).slice(0, 5).map((p: { keyword: string; from: number; to: number }) => `${p.keyword}: ${vnd(p.from)} → ${vnd(p.to)}`);
        toast({ title: `Xem trước ${j.preview?.length ?? 0} thay đổi${lines.length ? " · " + lines.join(" · ") : ""}` });
      } else {
        toast({ title: `✅ Đã cập nhật ${j.applied} từ khoá trên Google Ads` });
        setSelected(new Set());
        mutate();
      }
      if (j.skipped?.length) {
        toast({ title: `Bỏ qua ${j.skipped.length} từ khoá: ${j.skipped.slice(0, 3).map((s: { keyword: string; why: string }) => `${s.keyword} (${s.why})`).join("; ")}` });
      }
      (j.warnings ?? []).forEach((w: string) => toast({ title: `⚠️ ${w}` }));
    } catch (err) {
      toast({ title: `❌ ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-indigo-100 p-2"><Gauge className="h-5 w-5 text-indigo-600" /></div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Giá thầu thủ công</h1>
            <p className="text-xs text-slate-400">Đề xuất mức giá thầu cho từng từ khoá, dựa trên dữ liệu đã chạy</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {companyIds().map((c) => (
            <button key={c} onClick={() => { setCompany(c); setSelected(new Set()); }}
              className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium",
                company === c ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500")}>
              {c}
            </button>
          ))}
          <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setSelected(new Set()); }}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600">
            <option value={14}>14 ngày</option>
            <option value={30}>30 ngày</option>
            <option value={60}>60 ngày</option>
            <option value={90}>90 ngày</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isValidating}>
            <RefreshCw className={cn("h-3.5 w-3.5", isValidating && "animate-spin")} /> Làm mới
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <div>
          <p><strong>Cách tính:</strong> mỗi từ khoá có hai ràng buộc. <strong>Trần chi trả</strong> = mục tiêu CPA × tỷ lệ chuyển đổi (cao hơn mức này là lỗ). <strong>Sàn thị trường</strong> = ước tính của chính Google để lên trang đầu (thấp hơn là gần như không hiện). Đề xuất là chỗ dung hoà hai bên; khi trần thấp hơn sàn thì không có giá nào đúng, và công cụ nói thẳng thay vì đưa một con số vô nghĩa.</p>
          <p className="mt-1"><strong>Mức vượt/tháng</strong> tính theo giá THỰC TRẢ, và giả định lượt nhấp giữ nguyên — thực tế hạ giá thầu thường kéo lượt nhấp xuống, nên coi đó là mức trần của khoản tiết kiệm, không phải con số chắc chắn.</p>
        </div>
      </div>

      {campaigns.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-6 py-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Chiến dịch Search</p>
              <p className="text-xl font-bold text-slate-800">{campaigns.length}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Đang trả vượt trần / tháng</p>
              <p className="text-xl font-bold text-red-600">{vnd(totalOverspend)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Từ khoá nên giảm</p>
              <p className="text-xl font-bold text-slate-800">{campaigns.reduce((s, c) => s + c.countGiam, 0)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Chạy Manual CPC</p>
              <p className="text-xl font-bold text-slate-800">{campaigns.filter((c) => c.isManualCpc).length}/{campaigns.length}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="flex items-center gap-2 py-8 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Đang đọc dữ liệu từ Google Ads…</p>}

      {error && (
        <EmptyState icon={AlertTriangle} title="Không tải được dữ liệu"
          description={error instanceof Error ? error.message : String(error)} />
      )}

      {data?.warnings?.map((w, i) => (
        <p key={i} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}
        </p>
      ))}

      {!isLoading && !error && campaigns.length === 0 && (
        <EmptyState icon={Gauge} title="Không có chiến dịch Search nào đang chạy"
          description="Công cụ này chỉ áp dụng cho chiến dịch Search — PMax và Demand Gen không có giá thầu thủ công." />
      )}

      {campaigns.map((camp) => {
        const selectedHere = camp.keywords.filter((k) => selected.has(k.resourceName)).length;
        return (
          <Card key={camp.campaignId}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm">{camp.campaignName}</CardTitle>
                <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium",
                  camp.isManualCpc ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-500")}>
                  {camp.biddingStrategy}
                </span>
                {camp.overspendPerMonth > 0 && (
                  <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                    vượt {vnd(camp.overspendPerMonth)}/tháng
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {camp.days} ngày · {camp.clicks} nhấp · {camp.conversions.toFixed(0)} chuyển đổi · {vnd(camp.cost)} ·
                {" "}{camp.countGiam} nên giảm, {camp.countTang} có thể tăng, {camp.countGiu} đang hợp lý
                {camp.countKhongDatDuoc > 0 && `, ${camp.countKhongDatDuoc} không đạt được`}
                {camp.countThieuDuLieu > 0 && `, ${camp.countThieuDuLieu} thiếu dữ liệu`}
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              {camp.gateNote && (
                <p className={cn("mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed",
                  camp.gateNote.includes("ĐỪNG") ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{camp.gateNote}
                </p>
              )}

              <div className="rounded-lg border border-slate-100">
                {camp.keywords.slice(0, 40).map((kw) => (
                  <KeywordRow key={kw.resourceName} kw={kw}
                    checked={selected.has(kw.resourceName)} onToggle={() => toggle(kw.resourceName)} />
                ))}
              </div>
              {camp.keywords.length > 40 && (
                <p className="mt-1 text-[11px] text-slate-400">Hiển thị 40/{camp.keywords.length} từ khoá, xếp theo mức vượt trần giảm dần.</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">{selectedHere} từ khoá đã chọn</span>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" disabled={selectedHere === 0 || applying === camp.campaignId}
                    onClick={() => apply(camp, true)}>
                    {applying === camp.campaignId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Info className="h-3.5 w-3.5" />} Xem trước
                  </Button>
                  <Button variant="default" size="sm"
                    disabled={selectedHere === 0 || !camp.canApply || applying === camp.campaignId}
                    title={!camp.canApply ? `Chiến dịch đang chạy ${camp.biddingStrategy} — Google bỏ qua giá thầu đặt tay` : undefined}
                    onClick={() => {
                      if (!confirm(`Ghi giá thầu mới cho ${selectedHere} từ khoá của "${camp.campaignName}" lên Google Ads?\n\nĐây là thay đổi THẬT, ảnh hưởng tới chi tiêu.`)) return;
                      apply(camp, false);
                    }}>
                    {applying === camp.campaignId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Áp dụng lên Google
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
