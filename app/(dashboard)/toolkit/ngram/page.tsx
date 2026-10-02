"use client";

import { useState, useEffect, useCallback } from "react";
import { resolveCompanyScope } from "@/lib/permissions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Info, Loader2, AlertTriangle, ShieldOff, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { useGuardedWrite, type GuardedCall } from "@/components/ConfirmWriteDialog";

// ============================================================
// N-Gram Finder — wired to the real GAQL-backed API
// ============================================================
// This page used to be a client-only toy tokenizer (paste search
// terms manually, count locally) while a fully real GAQL-backed
// endpoint (app/api/google/toolkit/ngram) sat unused. This rewrite
// calls the real endpoint instead.

interface NGramRow {
  ngram: string;
  cost: number;
  conversions: number;
  clicks: number;
  /** null = chưa có chuyển đổi nào — không phải CPA bằng 0. */
  cpa: number | null;
  vsAvgPct: number | null;
  nScore: number;
  confidence: "high" | "medium" | "low";
  potentialSavings: number;
  recommendation: "NEGATIVE" | "MONITOR" | "KEEP";
  campaigns: string[];
}

interface NGramResponse {
  avgCPA: number;
  totalSavings: number;
  ngramCount: number;
  ngrams: NGramRow[];
  campaigns: { id: string; name: string }[];
  error?: string;
}

type PhraseRecommendation = "ADD_KEYWORD" | "ADD_NEGATIVE" | "MONITOR" | "EXISTS_KEYWORD" | "EXISTS_NEGATIVE";

interface PhraseCampaignRow {
  campaignId: string;
  campaignName: string;
  cost: number;
  conversions: number;
  clicks: number;
  impressions: number;
  cpa: number;
  vsAvgPct: number;
  topAdGroupId: string;
  topAdGroupName: string;
  recommendation: PhraseRecommendation;
  reason: string;
}

interface PhraseSearchResponse {
  phrase: string;
  avgCPA: number;
  matchedTermCount: number;
  campaigns: PhraseCampaignRow[];
  error?: string;
}

function phraseRecLabel(rec: PhraseRecommendation) {
  switch (rec) {
    case "ADD_KEYWORD": return "Nên thêm từ khóa";
    case "ADD_NEGATIVE": return "Nên phủ định";
    case "MONITOR": return "Theo dõi thêm";
    case "EXISTS_KEYWORD": return "Đã có từ khóa";
    case "EXISTS_NEGATIVE": return "Đã phủ định";
  }
}

function phraseRecColor(rec: PhraseRecommendation) {
  switch (rec) {
    case "ADD_KEYWORD": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "ADD_NEGATIVE": return "bg-red-50 text-red-700 border-red-200";
    case "MONITOR": return "bg-amber-50 text-amber-700 border-amber-200";
    case "EXISTS_KEYWORD": return "bg-slate-100 text-slate-500 border-slate-200";
    case "EXISTS_NEGATIVE": return "bg-slate-100 text-slate-500 border-slate-200";
  }
}

// GAQL's DURING operator only accepts a fixed set of literals — there is
// no LAST_90_DAYS/LAST_180_DAYS (the original, never-actually-called
// backend route defaulted to "LAST_90_DAYS", an invalid literal that
// only surfaced once this page started calling it for real).
const RANGE_OPTIONS = [
  { value: "LAST_7_DAYS", label: "7 ngày qua" },
  { value: "LAST_14_DAYS", label: "14 ngày qua" },
  { value: "LAST_30_DAYS", label: "30 ngày qua" },
];

function formatVND(v: number) {
  if (v >= 1_000_000) return `₫${(v / 1_000_000).toFixed(1)}Tr`;
  if (v >= 1_000) return `₫${(v / 1_000).toFixed(0)}K`;
  return `₫${v}`;
}

function recColor(rec: NGramRow["recommendation"]) {
  switch (rec) {
    case "NEGATIVE": return "bg-red-50 text-red-700 border-red-200";
    case "MONITOR": return "bg-amber-50 text-amber-700 border-amber-200";
    case "KEEP": return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
}

function NGramColumn({
  title,
  rows,
  selected,
  onToggle,
}: {
  title: string;
  rows: NGramRow[];
  selected: Set<string>;
  onToggle: (ngram: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <Card className="border border-slate-200 bg-white shadow-sm rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-400 text-center py-4">Không có n-gram nào đủ ngưỡng (chi &gt; ₫50K, ≥5 clicks)</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border border-slate-200 bg-white shadow-sm rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[480px] overflow-y-auto">
        {rows.slice(0, 20).map((g) => (
          <label
            key={g.ngram}
            className={cn(
              "flex items-start gap-2 rounded-lg border p-2 cursor-pointer transition-colors",
              selected.has(g.ngram) ? "border-amber-300 bg-amber-50/50" : "border-slate-100 hover:border-slate-200"
            )}
          >
            <input
              type="checkbox"
              checked={selected.has(g.ngram)}
              onChange={() => onToggle(g.ngram)}
              className="mt-1 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 truncate">{g.ngram}</span>
                <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase", recColor(g.recommendation))}>
                  {g.recommendation}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                <span>{formatVND(g.cost)}</span>
                <span>{g.clicks} clicks</span>
                <span>{g.conversions} conv</span>
                {g.cpa !== null && g.cpa > 0 && <span>CPA {formatVND(g.cpa)} ({(g.vsAvgPct ?? 0) > 0 ? "+" : ""}{g.vsAvgPct ?? 0}%)</span>}
                {g.potentialSavings > 0 && <span className="text-red-500 font-medium">Tiết kiệm {formatVND(g.potentialSavings)}</span>}
              </div>
              {g.confidence === "low" && (
                <p className="mt-0.5 text-[9px] text-amber-500 italic">
                  ⚠️ Ít dữ liệu ({g.clicks} clicks) — điểm số có thể chưa chính xác, theo dõi thêm trước khi chặn.
                </p>
              )}
            </div>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}

export default function NgramPage() {
  const [company, setCompany] = useState<string>("MBC");
  // Chỉ hiện công ty người này được xem. Trước đây nút bấm cứng cả MBC lẫn MBI,
  // nên người chỉ có quyền một bên vẫn thấy nút bên kia và bấm vào là nhận 403.
  const { user } = useSession();
  // resolveCompanyScope, KHÔNG lọc thẳng trên user.companies: trường đó là
  // PHẠM VI và đang mang giá trị ["ALL"] cho mọi tài khoản → lọc thẳng ra rỗng,
  // rồi trang báo "Tài khoản của bạn chưa được gán công ty nào".
  const allowedCompanies = resolveCompanyScope(user?.companies, user?.role);
  // Mặc định "MBC" sai với người chỉ có MBI. Chỉnh state về công ty hợp lệ đầu
  // tiên thay vì dựng biến dẫn xuất — để mọi chỗ đang đọc `company` vẫn đúng.
  useEffect(() => {
    if (allowedCompanies.length > 0 && !allowedCompanies.includes(company)) {
      setCompany(allowedCompanies[0]);
    }
  }, [allowedCompanies, company]);

  const [campaignId, setCampaignId] = useState("ALL");
  const [range, setRange] = useState("LAST_30_DAYS");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ uni: NGramResponse; bi: NGramResponse; tri: NGramResponse } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  // Kiểm trước → hộp thoại "XAC NHAN" → ghi thật → hoàn tác — dùng chung cho
  // cả hai luồng ghi bên dưới (Negative theo n-gram + Áp dụng đề xuất cụm từ).
  const { toast } = useToast();
  const guard = useGuardedWrite();

  // ── Tìm theo cụm từ khóa: đánh giá theo từng campaign ──
  const [phraseInput, setPhraseInput] = useState("");
  const [phraseLoading, setPhraseLoading] = useState(false);
  const [phraseError, setPhraseError] = useState<string | null>(null);
  const [phraseResult, setPhraseResult] = useState<PhraseSearchResponse | null>(null);
  const [phraseSelected, setPhraseSelected] = useState<Set<string>>(new Set());
  const [phraseMatchType, setPhraseMatchType] = useState<"EXACT" | "PHRASE" | "BROAD">("PHRASE");
  const [phraseApplying, setPhraseApplying] = useState(false);
  const [phraseApplyMsg, setPhraseApplyMsg] = useState<string | null>(null);

  async function searchPhrase() {
    const phrase = phraseInput.trim();
    if (!phrase) return;
    setPhraseLoading(true);
    setPhraseError(null);
    setPhraseSelected(new Set());
    try {
      const params = `company=${company}&campaignId=${campaignId}&range=${range}&phrase=${encodeURIComponent(phrase)}`;
      const res = await fetch(`/api/google/toolkit/ngram/search?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPhraseResult(json);
    } catch (e: unknown) {
      setPhraseError(e instanceof Error ? e.message : "Không thể phân tích cụm từ");
      setPhraseResult(null);
    } finally {
      setPhraseLoading(false);
    }
  }

  function togglePhraseRow(campaignId: string) {
    setPhraseSelected((prev) => {
      const next = new Set(prev);
      if (next.has(campaignId)) next.delete(campaignId);
      else next.add(campaignId);
      return next;
    });
  }

  async function applyPhraseRecommendations() {
    if (!phraseResult || phraseSelected.size === 0) return;
    const rows = phraseResult.campaigns.filter((c) => phraseSelected.has(c.campaignId));
    const toAddKeyword = rows.filter((r) => r.recommendation === "ADD_KEYWORD");
    const toAddNegative = rows.filter((r) => r.recommendation === "ADD_NEGATIVE");
    const phrase = phraseResult.phrase;

    // Nhiều lệnh song song (1 lệnh keywords/add gộp hết campaign ADD_KEYWORD +
    // 1 lệnh toolkit/ngram riêng cho MỖI campaign ADD_NEGATIVE) — Kiểm trước
    // TẤT CẢ trước, gộp vào MỘT hộp thoại xác nhận rồi mới ghi.
    const calls: GuardedCall[] = [];
    if (toAddKeyword.length > 0) {
      calls.push({
        url: "/api/google/keywords/add",
        payload: {
          company,
          keywords: toAddKeyword.map((r) => ({
            keyword: phrase,
            matchType: phraseMatchType,
            campaignId: r.campaignId,
            adGroupId: r.topAdGroupId,
          })),
        },
        label: `Thêm từ khoá "${phrase}" vào ${toAddKeyword.length} campaign: ${toAddKeyword.map((r) => r.campaignName).join(", ")}`,
      });
    }
    for (const r of toAddNegative) {
      calls.push({
        url: "/api/google/toolkit/ngram",
        payload: { company, scope: "CAMPAIGN", campaignId: r.campaignId, ngrams: [{ ngram: phrase, matchType: phraseMatchType }] },
        label: `Thêm negative "${phrase}" vào campaign: ${r.campaignName}`,
      });
    }
    if (!calls.length) return;

    setPhraseApplying(true);
    setPhraseApplyMsg(null);
    try {
      await guard.run(
        calls,
        { title: `Áp dụng đề xuất "${phrase}" cho ${rows.length} campaign?`, company },
        {
          onValidateFail: (message) => setPhraseApplyMsg(`⚠️ ${message}`),
          onSuccess: (results) => {
            setPhraseApplyMsg(`✅ Đã áp dụng cho ${results.length} campaign.`);
            setPhraseSelected(new Set());
            const writeIds = results.map((r) => r.writeId);
            toast({
              title: `✅ Đã áp dụng "${phrase}" cho ${results.length} campaign`,
              variant: "success",
              action: guard.undoAction(company, writeIds),
            });
            searchPhrase();
          },
          onFailure: (results) => {
            const ok = results.filter((r) => r.success);
            const failed = results.filter((r) => !r.success);
            setPhraseApplyMsg(`⚠️ ${ok.length} thành công, ${failed.length} lỗi — ${failed[0]?.error ?? ""}`);
            toast({
              title: `⚠️ ${ok.length}/${results.length} campaign ghi được`,
              description: failed.map((r) => `${r.label}: ${r.error}`).join("; "),
              variant: "error",
              action: guard.undoAction(company, ok.map((r) => r.writeId)),
            });
            if (ok.length) searchPhrase();
          },
        }
      );
    } finally {
      setPhraseApplying(false);
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = `company=${company}&campaignId=${campaignId}&range=${range}`;
      const [uni, bi, tri] = await Promise.all(
        [1, 2, 3].map((n) => fetch(`/api/google/toolkit/ngram?${params}&n=${n}`).then((r) => r.json()))
      );
      // Phải kiểm CẢ BA. Bản cũ chỉ kiểm `uni`, nên khi bigram hoặc trigram hỏng,
      // route trả { error, totalSavings: 0, ngrams: [] } và cái mảng rỗng đó được
      // lưu như kết quả thật: tab đó hiện "không có n-gram lãng phí" (nghe như
      // sạch sẽ) và con số "tổng tiết kiệm" ở đầu trang bị thiếu mà không ai biết.
      const failed = [
        { n: 1, r: uni }, { n: 2, r: bi }, { n: 3, r: tri },
      ].filter((x) => x.r?.error);
      if (failed.length > 0) {
        throw new Error(
          `Không tải được ${failed.map((f) => `${f.n}-gram`).join(", ")}: ${failed[0].r.error}`,
        );
      }
      setData({ uni, bi, tri });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Không thể tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [company, campaignId, range]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setSelected(new Set()); }, [company, campaignId, range]);

  function toggle(ngram: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ngram)) next.delete(ngram);
      else next.add(ngram);
      return next;
    });
  }

  // Selects every NEGATIVE-flagged row across all 3 columns in one click —
  // still just fills the checkbox selection, doesn't apply anything, so the
  // existing review-then-confirm flow (and its "sửa tài khoản Google Ads
  // thật" warning) stays intact. Saves ticking rows one at a time when the
  // list is long.
  function selectAllNegative() {
    if (!data) return;
    const all = [...data.uni.ngrams, ...data.bi.ngrams, ...data.tri.ngrams]
      .filter((g) => g.recommendation === "NEGATIVE")
      .map((g) => g.ngram);
    setSelected(new Set(all));
  }

  async function applyNegatives(scope: "ACCOUNT" | "CAMPAIGN") {
    if (selected.size === 0) return;
    if (scope === "CAMPAIGN" && campaignId === "ALL") {
      setApplyMsg("Chọn 1 campaign cụ thể trước khi thêm negative keyword ở phạm vi Campaign.");
      return;
    }
    const scopeLabel = scope === "ACCOUNT" ? "Shared Negative List (toàn tài khoản)" : "campaign đang chọn";
    const ngrams = Array.from(selected);

    setApplying(true);
    setApplyMsg(null);
    try {
      await guard.run(
        [{
          url: "/api/google/toolkit/ngram",
          payload: { company, scope, campaignId: scope === "CAMPAIGN" ? campaignId : undefined, ngrams: ngrams.map((ngram) => ({ ngram, matchType: "BROAD" })) },
          label: `Thêm ${ngrams.length} negative keyword vào ${scopeLabel}: ${ngrams.slice(0, 5).join(", ")}${ngrams.length > 5 ? "…" : ""}`,
        }],
        { title: `Thêm ${ngrams.length} negative keyword vào ${scopeLabel}?`, company },
        {
          onValidateFail: (message) => setApplyMsg(`⚠️ ${message}`),
          onSuccess: (results) => {
            const json = results[0].raw;
            const applied = (json.appliedCount as number | undefined) ?? 0;
            setApplyMsg(`✅ Đã thêm ${applied} negative keyword.`);
            setSelected(new Set());
            toast({ title: `✅ Đã thêm ${applied} negative keyword`, variant: "success", action: guard.undoAction(company, [results[0].writeId]) });
            fetchData();
          },
          onFailure: (results) => {
            // Nguyên văn lỗi từ server — errors[].error mang thông báo thật của
            // Google Ads (hoặc lời giải thích rõ cho ca "chưa có shared list").
            setApplyMsg(`⚠️ ${results[0].error}`);
            toast({ title: "❌ Không thêm được negative keyword", description: results[0].error, variant: "error" });
            fetchData();
          },
        }
      );
    } finally {
      setApplying(false);
    }
  }

  const campaigns = data?.uni.campaigns ?? [];
  const avgCPA = data?.uni.avgCPA ?? 0;
  const totalSavings = (data?.uni.totalSavings ?? 0) + (data?.bi.totalSavings ?? 0) + (data?.tri.totalSavings ?? 0);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
            <Search className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">N-Gram Finder</h1>
            <p className="text-sm text-slate-500">Cụm từ tốn ngân sách nhất trong Search Terms thật — dữ liệu trực tiếp từ Google Ads</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {allowedCompanies.map((c) => (
            <button
              key={c}
              onClick={() => setCompany(c)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition-all border-2",
                company === c ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
              )}
            >
              {c}
            </button>
          ))}
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="h-9 rounded-lg border-2 border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            {RANGE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="h-9 max-w-[220px] rounded-lg border-2 border-slate-200 bg-white px-3 text-sm text-slate-700"
          >
            <option value="ALL">Tất cả campaign</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
        <Info className="mt-0.5 h-5 w-5 text-blue-500 shrink-0" />
        <div className="text-xs text-blue-600">
          <p className="font-medium text-blue-800">CPA trung bình tài khoản: {avgCPA > 0 ? formatVND(avgCPA) : "—"}</p>
          <p className="mt-0.5">Tick chọn cụm từ → nhấn &ldquo;Thêm negative&rdquo; để loại khỏi campaign hoặc toàn tài khoản. Ngưỡng hiển thị: chi &gt; ₫50K và ≥5 clicks.</p>
        </div>
      </div>

      <Card className="border border-slate-200 bg-white shadow-sm rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">Tìm theo cụm từ khóa</CardTitle>
          <p className="text-xs text-slate-400">
            Nhập một cụm từ khóa bất kỳ (khách hàng tìm bằng cụm này) — công cụ sẽ đánh giá theo từng campaign đang chạy: campaign nào nên thêm làm từ khóa, campaign nào nên phủ định.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={phraseInput}
              onChange={(e) => setPhraseInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchPhrase()}
              placeholder="VD: dịch vụ seo tổng thể"
              className="h-9 min-w-[240px] flex-1 rounded-lg border-2 border-slate-200 bg-white px-3 text-sm text-slate-700"
            />
            <select
              value={phraseMatchType}
              onChange={(e) => setPhraseMatchType(e.target.value as "EXACT" | "PHRASE" | "BROAD")}
              className="h-9 rounded-lg border-2 border-slate-200 bg-white px-2 text-sm text-slate-700"
              title="Match type khi áp dụng"
            >
              <option value="EXACT">Exact</option>
              <option value="PHRASE">Phrase</option>
              <option value="BROAD">Broad</option>
            </select>
            <Button size="sm" onClick={searchPhrase} disabled={phraseLoading || !phraseInput.trim()}>
              {phraseLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Phân tích
            </Button>
          </div>

          {phraseError && (
            <p className="text-xs font-medium text-red-600">{phraseError}</p>
          )}

          {phraseResult && !phraseError && (
            phraseResult.campaigns.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">
                Không tìm thấy search term nào chứa &ldquo;{phraseResult.phrase}&rdquo; trong khoảng thời gian đã chọn.
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-400">
                  {phraseResult.matchedTermCount} search term khớp · CPA TB tài khoản {phraseResult.avgCPA > 0 ? formatVND(phraseResult.avgCPA) : "—"}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-400">
                        <th className="py-1.5 pr-2"></th>
                        <th className="py-1.5 pr-2">Campaign</th>
                        <th className="py-1.5 pr-2">Chi phí</th>
                        <th className="py-1.5 pr-2">Clicks</th>
                        <th className="py-1.5 pr-2">Conv</th>
                        <th className="py-1.5 pr-2">CPA</th>
                        <th className="py-1.5 pr-2">Đề xuất</th>
                        <th className="py-1.5 pr-2">Lý do</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phraseResult.campaigns.map((c) => {
                        const actionable = c.recommendation === "ADD_KEYWORD" || c.recommendation === "ADD_NEGATIVE";
                        return (
                          <tr key={c.campaignId} className="border-b border-slate-100 align-top">
                            <td className="py-1.5 pr-2">
                              {actionable && (
                                <input
                                  type="checkbox"
                                  checked={phraseSelected.has(c.campaignId)}
                                  onChange={() => togglePhraseRow(c.campaignId)}
                                />
                              )}
                            </td>
                            <td className="py-1.5 pr-2 font-medium text-slate-700">{c.campaignName}</td>
                            <td className="py-1.5 pr-2 text-slate-500">{formatVND(c.cost)}</td>
                            <td className="py-1.5 pr-2 text-slate-500">{c.clicks}</td>
                            <td className="py-1.5 pr-2 text-slate-500">{c.conversions}</td>
                            <td className="py-1.5 pr-2 text-slate-500">
                              {c.cpa > 0 ? `${formatVND(c.cpa)} (${c.vsAvgPct > 0 ? "+" : ""}${c.vsAvgPct}%)` : "—"}
                            </td>
                            <td className="py-1.5 pr-2">
                              <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase whitespace-nowrap", phraseRecColor(c.recommendation))}>
                                {phraseRecLabel(c.recommendation)}
                              </span>
                            </td>
                            <td className="py-1.5 pr-2 text-slate-400 max-w-[280px]">{c.reason}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {phraseSelected.size > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs font-semibold text-slate-700">{phraseSelected.size} campaign đã chọn</span>
                    <Button size="sm" onClick={applyPhraseRecommendations} disabled={phraseApplying} className="ml-auto">
                      {phraseApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="h-3.5 w-3.5" />} Áp dụng đề xuất
                    </Button>
                  </div>
                )}

                {phraseApplyMsg && (
                  <p className="text-xs font-medium text-slate-600">{phraseApplyMsg}</p>
                )}
              </>
            )
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <NGramColumn title={`Unigram (1 từ) — ${data.uni.ngramCount}`} rows={data.uni.ngrams} selected={selected} onToggle={toggle} />
            <NGramColumn title={`Bigram (2 từ) — ${data.bi.ngramCount}`} rows={data.bi.ngrams} selected={selected} onToggle={toggle} />
            <NGramColumn title={`Trigram (3 từ) — ${data.tri.ngramCount}`} rows={data.tri.ngrams} selected={selected} onToggle={toggle} />
          </div>

          {totalSavings > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-amber-800">Tiềm năng tiết kiệm nếu loại các n-gram &ldquo;NEGATIVE&rdquo;: {formatVND(totalSavings)}/kỳ</p>
              <Button variant="outline" size="sm" onClick={selectAllNegative} className="gap-1.5 text-xs border-amber-300 text-amber-800 hover:bg-amber-100">
                <ShieldOff className="h-3.5 w-3.5" /> Chọn tất cả NEGATIVE
              </Button>
            </div>
          )}
        </>
      ) : null}

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto flex w-full max-w-xl flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <span className="text-sm font-semibold text-slate-700">{selected.size} đã chọn</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => applyNegatives("CAMPAIGN")} disabled={applying}>
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />} Negative — Campaign
            </Button>
            <Button variant="default" size="sm" onClick={() => applyNegatives("ACCOUNT")} disabled={applying}>
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />} Negative — Toàn tài khoản
            </Button>
          </div>
        </div>
      )}

      {applyMsg && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg bg-slate-800 px-4 py-2.5 text-sm text-white shadow-lg">
          {applyMsg}
        </div>
      )}
      {guard.dialog}
    </div>
  );
}
