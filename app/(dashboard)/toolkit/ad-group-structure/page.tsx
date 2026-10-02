"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Layers, Loader2, XCircle, AlertTriangle, Info, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isHiddenPage } from "@/lib/hidden-pages";
import { companyIds } from "@/lib/companies/registry";

interface KeywordEntry {
  text: string; matchType: string; intent: string; matchedOn: string | null;
  cost: number; clicks: number; conversions: number; qualityScore: number | null;
}
interface Split {
  intent: string; label: string; rationale: string; count: number;
  cost: number; conversions: number; avgQualityScore: number | null;
  scoredCount: number; keywords: KeywordEntry[]; worthSplitting: boolean;
  costShare: number;
}
interface Oversized {
  adGroupId: string; adGroupName: string; campaignName: string;
  keywordCount: number; totalCost: number; totalConversions: number;
  splits: Split[]; viableSplits: number;
  verdict: "SPLIT" | "KEEP"; verdictReason: string;
  dominantShare: number; cpa: number | null;
  matchTypeMix: Record<string, number>;
}
interface DupPlace { adGroupName: string; campaignName: string; matchType: string; cost: number; conversions: number }
interface Duplicate { text: string; places: DupPlace[]; totalCost: number; crossCampaign: boolean; sameMatchType: boolean }

interface ApiResult {
  dateRange: string; brandTermsUsed: string[]; needsBrandTerms: boolean;
  duplicates: Duplicate[]; duplicateCrossCampaignCost: number;
  genericCost: number; genericShare: number; needsCompetitorTerms: boolean;
  totalAdGroups: number; oversized: Oversized[];
  undersized: { adGroupId: string; adGroupName: string; campaignName: string; keywordCount: number; cost: number }[];
  truncated: boolean; cap: number;
}

const INTENT_COLOR: Record<string, string> = {
  BRAND: "bg-emerald-100 text-emerald-800 border-emerald-200",
  COMPETITOR: "bg-rose-100 text-rose-800 border-rose-200",
  TRANSACTIONAL: "bg-blue-100 text-blue-800 border-blue-200",
  TOOL_FREE: "bg-amber-100 text-amber-800 border-amber-200",
  INFORMATIONAL: "bg-violet-100 text-violet-800 border-violet-200",
  GENERIC: "bg-slate-100 text-slate-700 border-slate-200",
};

const vnd = (n: number) => n.toLocaleString("vi-VN") + "₫";

export default function AdGroupStructurePage() {
  const [company, setCompany] = useState<string>("MBC");
  const [brand, setBrand] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResult | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ company, brand, competitor });
      const res = await fetch(`/api/google/toolkit/ad-group-structure?${qs}`);
      const json = await res.json();
      if (json.success) setData(json);
      else { setData(null); setError(json.error || "Không tải được dữ liệu."); }
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Không kết nối được tới máy chủ.");
    } finally { setLoading(false); }
  }, [company, brand, competitor]);

  // CỐ Ý không tự chạy khi mở trang. Mỗi lần phân tích là một truy vấn
  // Google Ads thật; trang tự gọi lúc mở là đúng cái kiểu đốt hạn mức âm
  // thầm mà không ai chủ động bấm. Người dùng cũng cần nhập từ khoá thương
  // hiệu trước thì kết quả mới đúng.

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 shadow-lg shadow-blue-200">
            <Layers className="h-5 w-5 text-white" />
          </div>
          Cấu trúc nhóm quảng cáo
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Ad group quá nhiều từ khoá buộc một bộ quảng cáo phải nói vừa lòng quá nhiều ý định — Ad Relevance tụt, Ad Rank tụt, CPC tăng.
          Màn hình này chỉ ra nhóm nào đang như vậy và tách được theo ý định nào.
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Liên quan:{" "}
          {!isHiddenPage("/google-audit") && (
            <>
              <Link href="/google-audit" className="text-blue-500 hover:underline">Google Audit</Link>
              {" · "}
            </>
          )}
          <Link href="/toolkit/quality-score" className="text-blue-500 hover:underline">Quality Score</Link>
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            {companyIds().map(c => (
              <button key={c} onClick={() => setCompany(c)}
                className={cn("rounded-lg px-3 py-2 text-sm font-semibold border-2 transition-all",
                  company === c ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500")}>
                {c}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Từ khoá thương hiệu (cách nhau bởi dấu phẩy)</label>
            <input value={brand} onChange={e => setBrand(e.target.value)}
              placeholder="mat bao, matbao, mắt bão"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tên đối thủ (tuỳ chọn)</label>
            <input value={competitor} onChange={e => setCompetitor(e.target.value)}
              placeholder="pa vietnam, tenten, nhan hoa"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <Button onClick={run} disabled={loading} className="h-10">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Đang phân tích…</> : "Phân tích"}
          </Button>
        </div>
        <p className="text-[11px] text-slate-400">
          Phân loại bằng LUẬT, không phải AI — cùng danh sách từ khoá luôn ra cùng kết quả, và mỗi từ khoá đều chỉ ra được vì sao rơi vào nhóm đó.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 space-y-2">
          <div className="flex items-center gap-2 text-red-800 font-bold"><XCircle className="h-5 w-5" /> Không phân tích được</div>
          <p className="text-sm text-red-700 break-words">{error}</p>
          <p className="text-xs text-red-600">Đây là lỗi tải dữ liệu — KHÔNG có nghĩa là cấu trúc tài khoản đang ổn.</p>
        </div>
      )}

      {!data && !error && !loading && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Layers className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-600 font-medium">Nhập từ khoá thương hiệu rồi bấm <strong>Phân tích</strong>.</p>
          <p className="text-xs text-slate-400 mt-1">Mỗi lần phân tích là một truy vấn Google Ads thật — trang không tự chạy khi mở.</p>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {data.needsBrandTerms && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <strong>Chưa khai báo từ khoá thương hiệu.</strong> Mọi từ khoá thương hiệu đang bị xếp nhầm vào nhóm khác,
                nên bảng bên dưới chưa phản ánh đúng. Nhập tên thương hiệu ở ô trên rồi bấm Phân tích lại — đây thường là
                nhóm rẻ nhất và sinh lời nhất, tách sai là hỏng cả kế hoạch.
              </div>
            </div>
          )}

          {data.truncated && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              Đã chạm trần {data.cap.toLocaleString("vi-VN")} từ khoá — danh sách tính trên phần đọc được, không phải toàn bộ tài khoản.
            </div>
          )}

          {data.needsCompetitorTerms && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <strong>Chưa khai báo tên đối thủ</strong>, mà nhóm &quot;Chung&quot; đang giữ {vnd(data.genericCost)} ({data.genericShare}% chi phí).
                Nếu trong đó có tên đối thủ thì chúng đang bị xếp nhầm — từ khoá đối thủ có Quality Score thấp và CPA cao hẳn,
                gộp chung vào &quot;Chung&quot; sẽ che mất điều đó. Nhập tên đối thủ ở ô trên rồi Phân tích lại.
              </div>
            </div>
          )}

          {data.duplicates.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-white overflow-hidden">
              <div className="bg-rose-50 border-b border-rose-200 p-4">
                <h3 className="font-bold text-rose-900 text-sm">
                  {data.duplicates.length} từ khoá đang chạy ở nhiều nhóm cùng lúc
                </h3>
                <p className="text-xs text-rose-800 mt-1">
                  Google chỉ cho MỘT quảng cáo của bạn vào mỗi phiên đấu giá, nên hai nhóm KHÔNG đẩy giá của nhau lên.
                  Cái mất là lưu lượng bị chia không đoán trước được giữa hai nhóm, nên dữ liệu chuyển đổi bị xé nhỏ và cả hai cùng học chậm.
                  Chỉ tính là trùng thật khi <strong>cùng kiểu khớp</strong> — cùng chữ mà Broad ở nhóm này, Phrase ở nhóm kia thì đó là hai tập truy vấn khác nhau.
                  {data.duplicateCrossCampaignCost > 0 && (
                    <> Tổng chi phí phần trùng chéo chiến dịch: <strong>{vnd(data.duplicateCrossCampaignCost)}</strong>/30 ngày.</>
                  )}
                </p>
              </div>
              <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
                {data.duplicates.map((d, i) => (
                  <div key={i} className="border-b border-slate-100 pb-2 last:border-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-800">{d.text}</span>
                      {d.crossCampaign && d.sameMatchType && (
                        <span className="text-[10px] font-bold uppercase rounded px-1.5 py-0.5 bg-rose-100 text-rose-700 border border-rose-200">
                          trùng thật · khác chiến dịch
                        </span>
                      )}
                      {d.crossCampaign && !d.sameMatchType && (
                        <span className="text-[10px] font-bold uppercase rounded px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200">
                          khác kiểu khớp — không phải trùng
                        </span>
                      )}
                      <span className="text-xs text-slate-500">{vnd(d.totalCost)}</span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {d.places.map((p, k) => (
                        <div key={k} className="text-[11px] text-slate-600 flex justify-between gap-3">
                          <span className="truncate">
                            <span className="font-semibold text-slate-700">{p.matchType}</span>{" "}
                            {p.adGroupName} <span className="text-slate-400">· {p.campaignName}</span>
                          </span>
                          <span className="shrink-0">{vnd(p.cost)} · {Math.round(p.conversions * 100) / 100} chuyển đổi</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            Đọc {data.totalAdGroups} nhóm quảng cáo đang bật ·{" "}
            <strong className="text-red-600">{data.oversized.length}</strong> nhóm quá nhiều từ khoá ·{" "}
            <strong className="text-amber-600">{data.undersized.length}</strong> nhóm quá ít
          </div>

          {data.oversized.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
              Không có nhóm nào vượt 20 từ khoá. Cấu trúc đang gọn.
            </div>
          ) : data.oversized.map(g => {
            const isOpen = open === g.adGroupId;
            return (
              <div key={g.adGroupId} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : g.adGroupId)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 text-left">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                      <span className="font-bold text-slate-800 truncate">{g.adGroupName}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 ml-6 truncate">{g.campaignName}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 ml-6">
                      Kiểu khớp: {Object.entries(g.matchTypeMix).map(([m, n]) => `${m} ${n}`).join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <div><p className="text-lg font-black text-red-600">{g.keywordCount}</p><p className="text-[10px] text-slate-500 uppercase">từ khoá</p></div>
                    <div><p className="text-sm font-bold text-slate-700">{vnd(g.totalCost)}</p><p className="text-[10px] text-slate-500 uppercase">30 ngày</p></div>
                    <div><p className="text-sm font-bold text-slate-700">{g.totalConversions}</p><p className="text-[10px] text-slate-500 uppercase">chuyển đổi</p></div>
                    <div><p className="text-sm font-bold text-slate-900">{g.cpa !== null ? vnd(g.cpa) : "—"}</p><p className="text-[10px] text-slate-500 uppercase">CPA</p></div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50">
                    <div className={cn("rounded-lg border p-3 text-sm flex gap-2",
                      g.verdict === "SPLIT" ? "bg-blue-50 border-blue-200 text-blue-900" : "bg-emerald-50 border-emerald-200 text-emerald-900")}>
                      <Info className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{g.verdictReason}</span>
                    </div>

                    {g.splits.map(s => (
                      <div key={s.intent} className={cn("rounded-lg border p-3 space-y-2", s.worthSplitting ? "bg-white border-slate-200" : "bg-slate-100/60 border-slate-200")}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-[11px] font-bold uppercase rounded px-2 py-0.5 border", INTENT_COLOR[s.intent])}>{s.label}</span>
                            <span className="text-xs text-slate-600">{s.count} từ khoá · {Math.round(s.costShare * 100)}% chi phí</span>
                            {!s.worthSplitting && <span className="text-[10px] text-slate-500">(quá nhỏ để tách riêng — gộp vào nhóm chung)</span>}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-600">
                            <span>{vnd(s.cost)}</span>
                            <span>{s.conversions} chuyển đổi</span>
                            <span title={`${s.scoredCount}/${s.count} từ khoá được Google chấm điểm`}>
                              QS {s.avgQualityScore ?? "chưa chấm"}
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-snug">{s.rationale}</p>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                          {s.keywords.map((k, i) => (
                            <span key={i} className="text-[11px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700"
                              title={`${k.matchType} · ${vnd(Math.round(k.cost))} · ${k.conversions} chuyển đổi${k.matchedOn ? ` · khớp "${k.matchedOn}"` : ""}`}>
                              {k.text}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {data.undersized.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-white p-4">
              <h3 className="font-bold text-slate-800 text-sm mb-2">Nhóm quá ít từ khoá (nên gộp)</h3>
              <p className="text-xs text-slate-500 mb-3">Dưới 3 từ khoá thì không đủ dữ liệu để tối ưu riêng — gộp vào nhóm cùng ý định.</p>
              <div className="space-y-1">
                {data.undersized.map(u => (
                  <div key={u.adGroupId} className="flex items-center justify-between text-sm border-b border-slate-100 py-1.5 last:border-0">
                    <div className="min-w-0"><span className="text-slate-700 truncate">{u.adGroupName}</span>
                      <span className="text-xs text-slate-400 ml-2 truncate">{u.campaignName}</span></div>
                    <div className="flex gap-4 shrink-0 text-xs text-slate-600">
                      <span>{u.keywordCount} từ khoá</span><span>{vnd(u.cost)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
