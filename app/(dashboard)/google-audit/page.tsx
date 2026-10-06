"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ShieldCheck, Loader2, RefreshCw, AlertTriangle, CheckCircle, XCircle, Wand2, Sparkles, Info, HelpCircle, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AuditResult } from "@/lib/google-audit-engine";
import { companyIds, companyLabel, orderedCompanyIds } from "@/lib/companies/registry";

interface PreviewItem { label: string; detail: string }

interface AuditGuide {
  why: string;
  steps: string[];
  path?: string;
  caution?: string;
}

interface FixState {
  name: string;
  kind: "MUTATION" | "ADVISORY";
  mode: "preview" | "applied" | "advice" | "nothing-to-do";
  actionTaken: string;
  preview?: PreviewItem[];
  truncated?: boolean;
  warnings?: string[];
  guide?: AuditGuide | null;
}

export default function GoogleAuditPage() {
  const [company, setCompany] = useState<string>(() => orderedCompanyIds(["MBC"])[0] ?? "MBC") // Đợt 25: công ty theo bản cài (bản Mắt Bão y như cũ);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fixing, setFixing] = useState<string | null>(null);
  const [fixState, setFixState] = useState<FixState | null>(null);
  const [fixError, setFixError] = useState<{ name: string; msg: string } | null>(null);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setFixState(null);
    setFixError(null);
    try {
      const res = await fetch(`/api/google/audit?company=${company}`);
      const json = await res.json();
      // Trước đây chỉ có `if (json.success) setResult(...)` và KHÔNG có nhánh
      // else: API lỗi 500 thì trang đứng im, trắng trơn, không một dòng báo.
      if (json.success) {
        setResult(json.data);
      } else {
        setResult(null);
        setLoadError(json.error || "Không tải được kết quả audit.");
      }
    } catch (err) {
      setResult(null);
      setLoadError(err instanceof Error ? err.message : "Không kết nối được tới máy chủ.");
    } finally {
      setLoading(false);
    }
  }, [company]);

  const runFix = async (checkName: string, checkId: string, confirm: boolean) => {
    setFixing(checkName);
    setFixError(null);
    if (!confirm) setFixState(null);
    try {
      const res = await fetch("/api/google/audit/auto-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, checkName, checkId, confirm }),
      });
      const data = await res.json();
      if (data.success) {
        setFixState({
          name: checkName,
          kind: data.kind ?? "ADVISORY",
          mode: data.mode ?? "advice",
          actionTaken: data.actionTaken,
          preview: data.preview,
          truncated: data.truncated,
          warnings: data.warnings,
          guide: data.guide,
        });
      } else {
        // Tương tự: bản cũ không có else — bấm xong nút hết quay, và không có
        // gì xảy ra trên màn hình dù lệnh đã hỏng.
        setFixError({ name: checkName, msg: data.error || "Thao tác thất bại." });
      }
    } catch (e) {
      setFixError({ name: checkName, msg: e instanceof Error ? e.message : "Không kết nối được tới máy chủ." });
    } finally {
      setFixing(null);
    }
  };

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const getColor = (grade: string) => {
    if (grade === "?") return "text-slate-400 border-slate-300 shadow-slate-200";
    if (grade.startsWith("A")) return "text-emerald-500 border-emerald-500 shadow-emerald-200";
    if (grade.startsWith("B")) return "text-blue-500 border-blue-500 shadow-blue-200";
    if (grade.startsWith("C")) return "text-amber-500 border-amber-500 shadow-amber-200";
    return "text-red-500 border-red-500 shadow-red-200";
  };

  const getStatusIcon = (status: "PASS" | "WARNING" | "FAIL", unreadable: boolean) => {
    if (unreadable) return <HelpCircle className="h-5 w-5 text-slate-400" />;
    switch (status) {
      case "PASS": return <CheckCircle className="h-5 w-5 text-emerald-500" />;
      case "WARNING": return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case "FAIL": return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const readable = result?.checks.filter(c => c.dataStatus !== "UNREADABLE") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 shadow-lg shadow-emerald-200">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            Google Ads Account Audit
          </h1>
          <p className="text-sm text-slate-500 mt-1">Hệ thống chẩn đoán 14 tiêu chí tài khoản Google Ads + 3 tiêu chí PMax (khi tài khoản chạy PMax)</p>
          <p className="text-xs text-slate-400 mt-1">
            Xem thêm: <Link href="/google-pmax" className="text-blue-500 hover:underline">Chi tiết Asset PMax</Link>
            {" · "}
            <Link href="/improvements" className="text-blue-500 hover:underline">Danh sách gợi ý ưu tiên</Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {companyIds().map(c => (
            <button
              key={c}
              onClick={() => setCompany(c)}
              className={cn("rounded-lg px-4 py-2 text-sm font-semibold transition-all border-2", company === c ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:border-slate-300")}
            >
              {c === "MBC" ? "🌐 Mắt Bão (MBC)" : c === "MBI" ? "🧾 MBI" : companyLabel(c)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-3">
          <div className="flex items-center gap-2 text-red-800 font-bold">
            <XCircle className="h-5 w-5" /> Không chạy được audit
          </div>
          <p className="text-sm text-red-700 break-words">{loadError}</p>
          <p className="text-xs text-red-600">
            Chưa có kết quả nào để hiển thị. Đây là lỗi tải dữ liệu, KHÔNG có nghĩa là tài khoản không có vấn đề.
          </p>
          <Button variant="outline" size="sm" onClick={fetchAudit} className="gap-2 border-red-300 text-red-700">
            <RefreshCw className="h-3.5 w-3.5" /> Thử lại
          </Button>
        </div>
      ) : result && (
        <div className="space-y-6">

          {result.scoredCount === 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm text-red-900">
                <strong>Không đọc được bất kỳ tiêu chí nào.</strong> Đây là sự cố kết nối tới Google Ads, KHÔNG phải đánh giá về tài khoản — không có điểm nào được chấm.
              </div>
            </div>
          )}

          {result.unreadableCount > 0 && result.scoredCount > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <EyeOff className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <strong>{result.unreadableCount}/{result.checks.length} tiêu chí không đọc được dữ liệu</strong> và đã bị loại khỏi điểm tổng.
                Điểm bên dưới tính trên {result.scoredCount} tiêu chí đọc được, không phải toàn bộ tài khoản.
              </div>
            </div>
          )}

          {/* Top Overview */}
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="flex flex-col items-center justify-center text-center border-r border-slate-100">
                <div className={cn("h-32 w-32 rounded-full border-8 flex items-center justify-center shadow-lg relative", getColor(result.letterGrade))}>
                   <span className="text-5xl font-black">{result.letterGrade}</span>
                   <div className="absolute -bottom-3 bg-white px-3 py-0.5 rounded-full border shadow-sm text-xs font-bold text-slate-600">
                     {result.overallScore}/100
                   </div>
                </div>
                <h3 className="text-sm font-bold text-slate-600 mt-6 uppercase tracking-widest">Account Score</h3>
                <p className="text-[10px] text-slate-400 mt-1">trên {result.scoredCount}/{result.checks.length} tiêu chí đọc được</p>
             </div>

             <div className="col-span-2 flex flex-col justify-center space-y-4">
                <div>
                   <h3 className="text-lg font-bold text-slate-800">Tổng quan chẩn đoán</h3>
                   <p className="text-sm text-slate-500 mt-1">Đã kiểm tra {result.scoredCount} điểm neo ảnh hưởng trực tiếp đến chi phí và tỷ lệ chuyển đổi (CPA/ROAS).</p>
                </div>
                <div className="grid grid-cols-4 gap-3">
                   <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                     <p className="text-2xl font-black text-emerald-600">{readable.filter(c => c.status === "PASS").length}</p>
                     <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mt-1">Đạt</p>
                   </div>
                   <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                     <p className="text-2xl font-black text-amber-600">{readable.filter(c => c.status === "WARNING").length}</p>
                     <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mt-1">Cần chú ý</p>
                   </div>
                   <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                     <p className="text-2xl font-black text-red-600">{readable.filter(c => c.status === "FAIL").length}</p>
                     <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mt-1">Nghiêm trọng</p>
                   </div>
                   <div className="rounded-lg bg-slate-100 border border-slate-200 p-3">
                     <p className="text-2xl font-black text-slate-500">{result.unreadableCount}</p>
                     <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Chưa kiểm được</p>
                   </div>
                </div>
             </div>
          </div>

          {result.aiInsight && (
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-indigo-900">AI Insight (Gemini)</h3>
              </div>
              <p className="text-sm text-indigo-950/80 leading-relaxed whitespace-pre-line">{result.aiInsight}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Chi tiết {result.checks.length} tiêu chí đánh giá</h2>
            <Button variant="outline" size="sm" onClick={fetchAudit} className="h-8 gap-2 border-slate-300">
              <RefreshCw className="h-3.5 w-3.5 text-slate-500" /> Quét lại (Re-audit)
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...result.checks].sort((a, b) => {
              // Không đọc được thì xuống cuối — nó không phải kết luận về tài khoản.
              const rank = (s: typeof a) =>
                s.dataStatus === "UNREADABLE" ? 3 : s.status === "FAIL" ? 0 : s.status === "WARNING" ? 1 : 2;
              return rank(a) - rank(b);
            }).map((check, i) => {
              const unreadable = check.dataStatus === "UNREADABLE";
              const showingFix = fixState?.name === check.name;
              const showingErr = fixError?.name === check.name;
              return (
              <div key={i} className={cn("rounded-xl border bg-white p-5 shadow-sm space-y-3 relative overflow-hidden",
                unreadable ? "border-slate-200 bg-slate-50/60" :
                check.status === "FAIL" ? "border-red-200" :
                check.status === "WARNING" ? "border-amber-200" : "border-slate-200"
              )}>
                {!unreadable && check.status === "FAIL" && <div className="absolute top-0 right-0 w-8 h-8 bg-red-100 rotate-45 transform translate-x-4 -translate-y-4" />}

                <div className="flex items-start gap-3">
                  <div className="pt-0.5">{getStatusIcon(check.status, unreadable)}</div>
                  <div>
                    <h3 className={cn("text-sm font-bold leading-tight", unreadable ? "text-slate-500" : "text-slate-800")}>{check.name}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={cn("text-[10px] font-bold uppercase rounded px-1.5 py-0.5",
                        unreadable ? "bg-slate-200 text-slate-600" :
                        check.status === "FAIL" ? "bg-red-100 text-red-700" :
                        check.status === "WARNING" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                      )}>{unreadable ? "CHƯA KIỂM ĐƯỢC" : check.status}</span>
                      {!unreadable && <span className="text-[10px] text-slate-400 font-medium">Score: {check.score}/10</span>}
                      {check.dataStatus === "PARTIAL" && (
                        <span className="text-[10px] font-bold uppercase rounded px-1.5 py-0.5 bg-sky-100 text-sky-700">Dữ liệu một phần</span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-500">{check.description}</p>

                <div className={cn("mt-3 p-2.5 rounded-lg text-[11px] leading-snug border",
                    unreadable ? "bg-slate-100 text-slate-600 border-slate-200" :
                    check.status === "FAIL" ? "bg-red-50 text-red-800 border-red-100 font-medium" :
                    check.status === "WARNING" ? "bg-amber-50 text-amber-800 border-amber-100" : "bg-slate-50 text-slate-600 border-slate-100"
                )}>
                  <strong className={cn(
                     unreadable ? "text-slate-700" :
                     check.status === "FAIL" ? "text-red-900" :
                     check.status === "WARNING" ? "text-amber-900" : "text-emerald-700"
                  )}>Chẩn đoán:</strong> {check.recommendation}
                </div>

                {check.dataStatus === "PARTIAL" && check.dataNote && (
                  <p className="text-[10px] text-sky-700 bg-sky-50 border border-sky-100 rounded p-2">{check.dataNote}</p>
                )}

                {/* Fix / hướng dẫn — chỉ khi dữ liệu đọc được */}
                {!unreadable && (check.status === "FAIL" || check.status === "WARNING") && (
                   <div className="mt-2 pt-3 border-t border-slate-100 space-y-2">
                     {showingErr && (
                       <div className="flex items-start gap-2 bg-red-50 text-red-800 p-2.5 rounded-lg border border-red-200 text-[11px]">
                         <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                         <p><strong>Thất bại:</strong> {fixError!.msg}</p>
                       </div>
                     )}

                     {showingFix && (
                       <div className={cn("rounded-lg border p-2.5 text-[11px] space-y-2",
                         fixState!.mode === "applied" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                         : fixState!.mode === "preview" ? "bg-indigo-50 border-indigo-200 text-indigo-900"
                         : "bg-slate-50 border-slate-200 text-slate-700"
                       )}>
                         <div className="flex items-start gap-2">
                           {fixState!.mode === "applied"
                             ? <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                             : <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                           <p className="font-medium">{fixState!.actionTaken}</p>
                         </div>

                         {fixState!.guide && (
                           <div className="space-y-2 border-t border-current/10 pt-2 max-h-80 overflow-y-auto">
                             <p className="opacity-90"><strong>Vì sao đáng sửa:</strong> {fixState!.guide.why}</p>
                             {fixState!.guide.path && (
                               <p className="opacity-75"><strong>Đường đi:</strong> {fixState!.guide.path}</p>
                             )}
                             <ol className="list-decimal pl-4 space-y-1">
                               {fixState!.guide.steps.map((st, k) => <li key={k} className="leading-snug">{st}</li>)}
                             </ol>
                             {fixState!.guide.caution && (
                               <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                                 ⚠️ <strong>Coi chừng:</strong> {fixState!.guide.caution}
                               </p>
                             )}
                           </div>
                         )}

                         {fixState!.preview && fixState!.preview.length > 0 && (
                           <ul className="max-h-44 overflow-y-auto space-y-1 pl-1 border-t border-current/10 pt-2">
                             {fixState!.preview.map((p, k) => (
                               <li key={k} className="leading-snug">
                                 <span className="font-semibold">{p.label}</span>
                                 <span className="opacity-75"> — {p.detail}</span>
                               </li>
                             ))}
                           </ul>
                         )}

                         {fixState!.truncated && (
                           <p className="text-[10px] opacity-80 border-t border-current/10 pt-1.5">
                             ⚠️ Danh sách đã chạm trần số dòng — có thể còn mục khác chưa được liệt kê.
                           </p>
                         )}

                         {fixState!.warnings && fixState!.warnings.length > 0 && (
                           <ul className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 space-y-1">
                             {fixState!.warnings.map((w, k) => <li key={k}>⚠️ {w}</li>)}
                           </ul>
                         )}

                         {fixState!.mode !== "preview" && (
                           <div className="pt-1">
                             <Button size="sm" variant="outline" onClick={() => setFixState(null)} className="h-7 w-full text-[11px]">
                               Đóng
                             </Button>
                           </div>
                         )}

                         {fixState!.mode === "preview" && (
                           <div className="flex gap-2 pt-1">
                             <Button
                               size="sm"
                               onClick={() => runFix(check.name, check.id, true)}
                               disabled={fixing !== null}
                               className="h-7 flex-1 text-[11px] font-bold bg-red-600 hover:bg-red-700 text-white"
                             >
                               {fixing === check.name
                                 ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Đang ghi…</>
                                 : "Xác nhận ghi vào Google Ads"}
                             </Button>
                             <Button size="sm" variant="outline" onClick={() => setFixState(null)} disabled={fixing !== null} className="h-7 text-[11px]">
                               Huỷ
                             </Button>
                           </div>
                         )}
                       </div>
                     )}

                     {/* Đã hiện kết quả rồi thì giấu nút đi. Bản trước chỉ giấu ở
                         chế độ xem-trước, nên với hướng dẫn thì nút vẫn nằm ngay
                         dưới đúng nội dung nó sắp lấy về — bấm nữa chỉ gọi lại
                         cùng một thứ. */}
                     {!showingFix && (
                       <Button
                         variant="outline"
                         size="sm"
                         onClick={() => runFix(check.name, check.id, false)}
                         disabled={fixing !== null}
                         className={cn(
                           "w-full h-8 flex items-center justify-center gap-1.5 shadow-sm text-xs font-bold transition-all",
                           fixing === check.name
                             ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                             : check.fixable
                               ? "bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white border-transparent"
                               : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                         )}
                       >
                         {fixing === check.name ? (
                           <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang kiểm…</>
                         ) : check.fixable ? (
                           <><Wand2 className="h-3.5 w-3.5 text-indigo-100" /> Xem trước cách sửa</>
                         ) : (
                           <><Info className="h-3.5 w-3.5 text-slate-400" /> Xem hướng dẫn xử lý</>
                         )}
                       </Button>
                     )}

                     {!check.fixable && !showingFix && (
                       <p className="text-[10px] text-slate-400 text-center">
                         Tiêu chí này chưa có bước sửa tự động — công cụ chỉ đưa hướng dẫn.
                       </p>
                     )}
                   </div>
                )}
              </div>
            );})}
          </div>

        </div>
      )}
    </div>
  );
}
