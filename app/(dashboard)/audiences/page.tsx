"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Users, ArrowRight, ArrowLeft, Check, Upload,
  Rocket, ChevronDown, Building2, Calendar,
  ShieldCheck, Sparkles, AlertTriangle, Loader2,
  Target, Zap, Copy, FileText, X, Table,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AUDIENCE_SOURCES,
  LOOKALIKE_OPTIONS,
  TIME_RANGES,
  MIN_AMOUNTS,
  MIN_AUDIENCE_SIZE,
  estimateAudienceSize,
  type AudienceSource,
  type AudienceConfig,
  type LookalikeRatio,
  type AudienceResult,
  type CustomerRecord,
} from "@/lib/audience-builder";
import { orderedCompanyIds } from "@/lib/companies/registry";

// ─────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────

const STEPS = [
  { num: 1, label: "Nguồn Data", icon: "📊" },
  { num: 2, label: "Filter", icon: "🔍" },
  { num: 3, label: "Tạo Lookalike", icon: "🚀" },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.num} className="flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all",
            current === s.num
              ? "bg-amber-500 text-amber-950 shadow-lg shadow-amber-200"
              : current > s.num
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-400"
          )}>
            {current > s.num ? <Check className="h-3.5 w-3.5" /> : <span>{s.icon}</span>}
            <span className="hidden sm:inline">{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn(
              "hidden sm:block w-12 h-0.5 rounded-full transition-colors",
              current > s.num ? "bg-emerald-300" : "bg-slate-200"
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function AudiencesPage() {
  const [step, setStep] = useState(1);

  // Step 1
  const [source, setSource] = useState<AudienceSource>("offline_orders");

  // Step 2
  const [company, setCompany] = useState<string | "both">(() => orderedCompanyIds(["MBC"])[0] ?? "MBC") // Đợt 25: công ty theo bản cài (bản Mắt Bão y như cũ);
  const [days, setDays] = useState(90);
  const [minAmount, setMinAmount] = useState(500000);

  // Step 3
  const [selectedRatios, setSelectedRatios] = useState<LookalikeRatio[]>([0.01, 0.02]);

  // Results
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<AudienceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Uploaded file state
  const [uploadedFile, setUploadedFile] = useState<{
    file: File;
    name: string;
    size: string;
    rows: number;
    columns: string[];
    preview: string[][];
    hasEmail: boolean;
    hasPhone: boolean;
  } | null>(null);

  const parseUploadedFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      // Detect delimiter
      const firstLine = text.split('\n')[0] || '';
      const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length === 0) return;

      const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
      const dataRows = lines.slice(1);

      const hasEmail = headers.some(h => h.includes('email') || h.includes('mail'));
      const hasPhone = headers.some(h => h.includes('phone') || h.includes('sdt') || h.includes('dien_thoai') || h.includes('số điện thoại'));

      // Preview first 5 rows
      const preview = dataRows.slice(0, 5).map(row =>
        row.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, ''))
      );

      const sizeKB = file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(1)} KB`
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

      setUploadedFile({
        file,
        name: file.name,
        size: sizeKB,
        rows: dataRows.length,
        columns: headers,
        preview,
        hasEmail,
        hasPhone,
      });
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  // FB Token status
  const [tokenStatus, setTokenStatus] = useState<{ valid: boolean; name?: string; error?: string } | null>(null);

  useEffect(() => {
    fetch('/api/facebook/check-token')
      .then(r => r.json())
      .then(data => setTokenStatus({ valid: data.valid, name: data.name, error: data.error }))
      .catch(() => setTokenStatus({ valid: false, error: 'Không thể kiểm tra token' }));
  }, []);

  // Real MBI offline-order customers (source=offline_orders, company=MBI
  // only — see app/api/audiences/offline-customers/route.ts). Not a CSV;
  // fetched live from Odoo whenever the relevant filters change. For any
  // other company (MBC / both) this source has no real query — see the
  // "offline_orders" comment in lib/audience-builder.ts — so `supported`
  // stays false and the existing CSV-upload path is used instead.
  const [mbiOffline, setMbiOffline] = useState<{
    loading: boolean;
    error: string | null;
    supported: boolean;
    customers: CustomerRecord[];
  }>({ loading: false, error: null, supported: false, customers: [] });

  useEffect(() => {
    if (source !== "offline_orders") {
      return;
    }
    if (company !== "MBI") {
      setMbiOffline({ loading: false, error: null, supported: false, customers: [] });
      return;
    }
    let cancelled = false;
    setMbiOffline(prev => ({ ...prev, loading: true, error: null }));
    const params = new URLSearchParams({
      company,
      days: String(days),
      minAmount: String(minAmount || 0),
    });
    fetch(`/api/audiences/offline-customers?${params}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.success && data.supported) {
          setMbiOffline({ loading: false, error: null, supported: true, customers: data.customers ?? [] });
        } else if (data.success && !data.supported) {
          setMbiOffline({ loading: false, error: null, supported: false, customers: [] });
        } else {
          setMbiOffline({ loading: false, error: data.error || "Lỗi tải dữ liệu Odoo", supported: true, customers: [] });
        }
      })
      .catch(err => {
        if (cancelled) return;
        setMbiOffline({ loading: false, error: err instanceof Error ? err.message : "Network error", supported: true, customers: [] });
      });
    return () => { cancelled = true; };
  }, [source, company, days, minAmount]);

  const isMbiRealOffline = source === "offline_orders" && company === "MBI";
  const isWebVisitors = source === "web_visitors";

  // Existing audiences from FB ad account
  const [existingAudiences, setExistingAudiences] = useState<Array<{
    id: string; name: string; type: string; size: number; sizeMax: number; createdAt: string | null; status: string;
  }>>([]);
  const [loadingAudiences, setLoadingAudiences] = useState(false);

  useEffect(() => {
    setLoadingAudiences(true);
    fetch('/api/audiences/list')
      .then(r => r.json())
      .then(data => {
        if (data.success) setExistingAudiences(data.data || []);
      })
      .catch(() => {})
      .finally(() => setLoadingAudiences(false));
  }, [result]); // refresh after creating new audience

  const config: AudienceConfig = useMemo(() => ({
    source,
    company,
    days,
    minAmount: minAmount || undefined,
    lookalikeRatios: selectedRatios,
  }), [source, company, days, minAmount, selectedRatios]);

  // realCount: the actual real number to feed estimateAudienceSize, for the
  // two sources that now have one — csv_upload (parsed row count) and
  // offline_orders+MBI (real Odoo query, see mbiOffline above). Every other
  // source/company combo still falls through to the (currently always-0)
  // guessed heuristic in estimateAudienceSize.
  const realCount = source === "csv_upload"
    ? uploadedFile?.rows
    : isMbiRealOffline
      ? mbiOffline.customers.length
      : undefined;

  const estimatedSize = useMemo(
    () => estimateAudienceSize(config, realCount),
    [config, realCount]
  );
  // web_visitors (WEBSITE audience) has no pre-creation size at all — Meta
  // never exposes one — so the MIN_AUDIENCE_SIZE gate doesn't apply; the
  // only real precondition is having picked exactly one company (a Pixel
  // belongs to one company, see app/api/audiences/create-website-audience).
  // offline_orders+MBI while the real Odoo fetch is still loading should
  // not (falsely) gate on a 0 that's just "not loaded yet".
  const canCreateLookalike = isWebVisitors
    ? company !== "both"
    : (isMbiRealOffline && mbiOffline.loading)
      ? false
      : estimatedSize >= MIN_AUDIENCE_SIZE;

  const toggleRatio = (ratio: LookalikeRatio) => {
    setSelectedRatios(prev =>
      prev.includes(ratio) ? prev.filter(r => r !== ratio) : [...prev, ratio]
    );
  };

  const handleCreate = async () => {
    // web_visitors: entirely different Meta object (WEBSITE Custom
    // Audience) — no customer list, no CSV, no size gate. Calls a separate
    // route (see app/api/audiences/create-website-audience/route.ts).
    if (isWebVisitors) {
      setIsCreating(true);
      setError(null);
      try {
        const res = await fetch("/api/audiences/create-website-audience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config }),
        });
        const json = await res.json();
        if (json.success) {
          setResult(json.data);
        } else {
          setError(json.error || "Có lỗi xảy ra");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setIsCreating(false);
      }
      return;
    }

    if (source === "csv_upload" && !uploadedFile) {
      setError("Vui lòng upload file CSV trước");
      return;
    }
    if (isMbiRealOffline && mbiOffline.customers.length === 0) {
      setError(mbiOffline.error || "Không tìm thấy khách hàng thực từ Odoo cho khoảng lọc này");
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      let customers: CustomerRecord[] = [];

      if (isMbiRealOffline) {
        // Real Odoo-fetched customers (see mbiOffline effect above) — no
        // CSV involved for this company.
        customers = mbiOffline.customers;
      } else if (source === "csv_upload" && uploadedFile) {
        // Parse uploaded file into customer records
        const text = await uploadedFile.file.text();
        const delimiter = text.split('\n')[0]?.includes('\t') ? '\t' : text.split('\n')[0]?.includes(';') ? ';' : ',';
        const lines = text.split('\n').filter(l => l.trim());
        const headers = lines[0]?.split(delimiter).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase()) ?? [];
        const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('mail'));
        const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('sdt') || h.includes('dien_thoai'));

        customers = lines.slice(1).map(line => {
          const cells = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
          return {
            email: emailIdx >= 0 ? cells[emailIdx] : undefined,
            phone: phoneIdx >= 0 ? cells[phoneIdx] : undefined,
          };
        }).filter(c => c.email || c.phone);
      } else {
        setError("Nguồn dữ liệu này yêu cầu upload file CSV");
        setIsCreating(false);
        return;
      }

      if (customers.length === 0) {
        setError("Không tìm thấy email hoặc số điện thoại hợp lệ trong file");
        setIsCreating(false);
        return;
      }

      const res = await fetch("/api/audiences/create-lookalike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, customers }),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
      } else {
        setError(json.error || "Có lỗi xảy ra");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 p-2.5 shadow-lg shadow-violet-200">
              <Users className="h-5 w-5 text-white" />
            </div>
            🎯 Audiences AI
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Tạo Custom Audience + Lookalike từ dữ liệu khách hàng nội bộ
          </p>
        </div>
      </div>

      {/* FB Token status banner */}
      {tokenStatus && (
        <div className={cn(
          "rounded-xl border px-4 py-3 flex items-center justify-between",
          tokenStatus.valid
            ? "border-emerald-200 bg-emerald-50"
            : "border-red-200 bg-red-50"
        )}>
          {tokenStatus.valid ? (
            <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
              ✅ Facebook đã kết nối {tokenStatus.name ? `— ${tokenStatus.name}` : ''}
            </p>
          ) : (
            <div className="flex items-center justify-between w-full">
              <p className="text-xs font-medium text-red-700 flex items-center gap-1.5">
                ❌ Token Facebook không hợp lệ: {tokenStatus.error}
              </p>
              <Button variant="outline" size="sm" className="text-xs gap-1 border-red-300 text-red-600 hover:bg-red-100"
                onClick={() => window.location.href = '/settings'}>
                🔗 Kết nối lại Facebook
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Existing Audiences (from FB) ── */}
      {step === 1 && !result && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
            <Target className="h-4 w-4 text-violet-500" /> Audiences hiện có (Facebook Ad Account)
          </h2>
          {loadingAudiences ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
            </div>
          ) : existingAudiences.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Chưa có custom audience nào trong tài khoản</p>
          ) : (
            <div className="space-y-2">
              {existingAudiences.map(a => (
                <div key={a.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-2.5">
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    a.type === "CUSTOM" ? "bg-violet-100 text-violet-700" :
                    a.type === "LOOKALIKE" ? "bg-blue-100 text-blue-700" :
                    "bg-slate-100 text-slate-600"
                  )}>
                    {a.type === "CUSTOM" ? "Custom" : a.type === "LOOKALIKE" ? "LAL" : a.type}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 flex-1 truncate" title={a.name}>{a.name}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {a.size >= 1000000
                      ? `${(a.size / 1000000).toFixed(1)}M`
                      : a.size >= 1000
                        ? `${(a.size / 1000).toFixed(0)}K`
                        : a.size > 0 ? `${a.size}` : "Đang xử lý"} người
                  </span>
                  {a.createdAt && (
                    <span className="text-[10px] text-slate-300 shrink-0">{a.createdAt}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Result Screen ── */}
      {result && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">🎉 Tạo Audiences thành công!</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            {typeof result.customerCount === "number"
              ? `Đã tạo ${result.customAudienceName} với ${result.customerCount.toLocaleString("vi-VN")} khách hàng`
              : `Đã tạo ${result.customAudienceName} — Meta sẽ tự tính kích thước theo lưu lượng Pixel thực tế`}
          </p>

          <div className="space-y-3 max-w-md mx-auto text-left">
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-violet-700">
                  {typeof result.customerCount === "number" ? "Custom Audience" : "Website Custom Audience"}
                </p>
                <p className="text-[10px] text-violet-500 mt-0.5">{result.customAudienceName}</p>
              </div>
              <span className="text-xs font-bold text-violet-700">
                {typeof result.customerCount === "number" ? `${result.customerCount.toLocaleString()} KH` : "Đang tính"}
              </span>
            </div>

            {result.lookalikes.map(lal => (
              <div key={lal.id} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-blue-700">{lal.name}</p>
                  <p className="text-[10px] text-blue-500 mt-0.5">
                    Meta đang tính kích thước — kiểm tra lại sau vài giờ trong Meta Ads Manager
                  </p>
                </div>
                <span className="text-xs font-bold text-blue-700">{lal.ratio * 100}%</span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => { setResult(null); setStep(1); }}
            >
              Tạo audience khác
            </Button>
            <Button
              size="sm"
              className="text-xs bg-amber-500 text-amber-950 hover:bg-amber-600 gap-1"
              onClick={() => window.location.href = "/creative"}
            >
              <Sparkles className="h-3 w-3" /> Dùng trong Creative AI
            </Button>
          </div>
        </div>
      )}

      {/* ── Wizard ── */}
      {!result && (
        <>
          <StepIndicator current={step} />

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* ━━━━━━━━━━━━━━━━━━━━ STEP 1: Nguồn data ━━━━━━━━━━━━━━━━━━━━ */}
            {step === 1 && (
              <div className="p-6 space-y-5">
                <div>
                  <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    📊 Bước 1: Chọn nguồn data
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Chọn nguồn khách hàng để tạo Custom Audience trên Facebook
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {AUDIENCE_SOURCES.map(src => (
                    <button
                      key={src.id}
                      onClick={() => setSource(src.id)}
                      className={cn(
                        "relative rounded-xl border-2 p-5 text-left transition-all",
                        source === src.id
                          ? "border-violet-400 bg-violet-50 shadow-md ring-2 ring-violet-100"
                          : "border-slate-200 bg-white hover:border-violet-200 hover:shadow-sm"
                      )}
                    >
                      {source === src.id && (
                        <div className="absolute top-3 right-3">
                          <div className="h-5 w-5 rounded-full bg-violet-500 flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        </div>
                      )}
                      <span className="text-2xl">{src.icon}</span>
                      <h3 className="text-sm font-bold text-slate-800 mt-2">{src.label}</h3>
                      <p className="text-[10px] text-slate-400 mt-1">{src.description}</p>
                      <div className="mt-3 flex items-center gap-2">
                        {src.estimatedCount > 0 && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            {src.estimatedCount.toLocaleString("vi-VN")} người
                          </span>
                        )}
                        {src.requiresPixel && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                            Cần Pixel
                          </span>
                        )}
                        {src.requiresUpload && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 flex items-center gap-0.5">
                            <Upload className="h-2.5 w-2.5" /> Upload
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {/* CSV upload area */}
                {source === "csv_upload" && !uploadedFile && (
                  <label className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-8 text-center cursor-pointer block hover:bg-amber-100/50 transition-colors">
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".csv,.txt,.xlsx,.xls"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          parseUploadedFile(file);
                        }
                      }}
                    />
                    <Upload className="h-10 w-10 text-amber-400 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-amber-800">Kéo thả file vào đây</p>
                    <p className="text-[10px] text-amber-600 mt-1">
                      Cần có cột: email, phone (tối thiểu 1 cột)
                    </p>
                    <div className="mt-3 inline-flex items-center justify-center gap-1 text-xs font-medium border border-amber-300 text-amber-700 bg-white px-3 py-2 rounded-md shadow-sm pointer-events-none">
                      <Upload className="h-3 w-3" /> Chọn file
                    </div>
                  </label>
                )}

                {/* File preview after upload */}
                {source === "csv_upload" && uploadedFile && (
                  <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/50 p-5 space-y-4">
                    {/* File info header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-emerald-800">{uploadedFile.name}</p>
                          <p className="text-[10px] text-emerald-600">
                            {uploadedFile.size} • {uploadedFile.rows.toLocaleString("vi-VN")} dòng dữ liệu
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setUploadedFile(null)}
                        className="h-7 w-7 rounded-full bg-red-100 text-red-500 hover:bg-red-200 flex items-center justify-center transition-colors"
                        title="Xóa file"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Column detection */}
                    <div className="flex flex-wrap gap-2">
                      {uploadedFile.hasEmail && (
                        <span className="rounded-full bg-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 flex items-center gap-1">
                          <Check className="h-2.5 w-2.5" /> Có cột Email
                        </span>
                      )}
                      {uploadedFile.hasPhone && (
                        <span className="rounded-full bg-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 flex items-center gap-1">
                          <Check className="h-2.5 w-2.5" /> Có cột Phone
                        </span>
                      )}
                      {!uploadedFile.hasEmail && !uploadedFile.hasPhone && (
                        <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 flex items-center gap-1">
                          <AlertTriangle className="h-2.5 w-2.5" /> Không tìm thấy cột email/phone
                        </span>
                      )}
                      <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                        {uploadedFile.columns.length} cột: {uploadedFile.columns.join(", ")}
                      </span>
                    </div>

                    {/* Data count summary */}
                    <div className="rounded-lg bg-white p-3 border border-emerald-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Table className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-xs font-bold text-emerald-800">Xem trước ({Math.min(5, uploadedFile.preview.length)} / {uploadedFile.rows.toLocaleString("vi-VN")} dòng)</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="border-b border-emerald-100">
                              <th className="px-2 py-1 text-left text-emerald-700 font-bold">#</th>
                              {uploadedFile.columns.map((col, ci) => (
                                <th key={ci} className="px-2 py-1 text-left text-emerald-700 font-bold">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {uploadedFile.preview.map((row, ri) => (
                              <tr key={ri} className={ri % 2 === 0 ? "bg-emerald-50/50" : ""}>
                                <td className="px-2 py-1 text-slate-400">{ri + 1}</td>
                                {row.map((cell, ci) => (
                                  <td key={ci} className="px-2 py-1 text-slate-700 max-w-[150px] truncate">{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Confirmation */}
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-xs text-emerald-700">
                        ✅ Sẵn sàng tạo Custom Audience từ <b>{uploadedFile.rows.toLocaleString("vi-VN")}</b> bản ghi
                      </p>
                      <label className="text-[10px] text-amber-700 font-medium cursor-pointer hover:underline">
                        <input type="file" className="hidden" accept=".csv,.txt,.xlsx,.xls" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) parseUploadedFile(file);
                        }} />
                        Đổi file khác
                      </label>
                    </div>
                  </div>
                )}

                {/* Next */}
                <div className="flex justify-end pt-3 border-t border-slate-100">
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs bg-amber-500 text-amber-950 hover:bg-amber-600"
                    onClick={() => setStep(2)}
                  >
                    Tiếp theo <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* ━━━━━━━━━━━━━━━━━━━━ STEP 2: Filter ━━━━━━━━━━━━━━━━━━━━ */}
            {step === 2 && (
              <div className="p-6 space-y-5">
                <div>
                  <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    🔍 Bước 2: Filter nâng cao
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Lọc khách hàng chất lượng để tạo audience chính xác nhất
                  </p>
                </div>

                {/* Company */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-2 block flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" /> Công ty
                  </label>
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 w-fit">
                    {([...orderedCompanyIds(["MBC", "MBI"]), "both"] as const).map(c => (
                      <button
                        key={c}
                        onClick={() => setCompany(c)}
                        className={cn(
                          "rounded-md px-4 py-2 text-xs font-medium transition-colors",
                          company === c ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        {c === "both" ? "Cả hai" : c}
                      </button>
                    ))}
                  </div>
                  {source === "offline_orders" && (
                    <p className={cn(
                      "text-[10px] mt-2 rounded-md px-3 py-2 border",
                      company === "MBI"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    )}>
                      {company === "MBI"
                        ? "✅ MBI: danh sách khách hàng lấy trực tiếp (thực) từ Odoo — không cần upload CSV."
                        : "⚠️ MBC / Cả hai: chưa có kết nối Odoo thực cho công ty này — nguồn này vẫn cần Upload CSV."}
                    </p>
                  )}
                  {source === "web_visitors" && company === "both" && (
                    <p className="text-[10px] mt-2 rounded-md px-3 py-2 border border-amber-200 bg-amber-50 text-amber-700">
                      ⚠️ web_visitors cần chọn đúng 1 công ty (MBC hoặc MBI) — một Pixel chỉ thuộc về một công ty.
                    </p>
                  )}
                </div>

                {/* Time range */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-2 block flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" /> Khoảng thời gian
                  </label>
                  <div className="space-y-1.5">
                    {TIME_RANGES.map(tr => (
                      <button
                        key={tr.days}
                        onClick={() => setDays(tr.days)}
                        className={cn(
                          "flex items-center gap-3 w-full rounded-lg border-2 px-4 py-3 text-left transition-all",
                          days === tr.days
                            ? "border-violet-300 bg-violet-50"
                            : "border-slate-200 bg-white hover:border-violet-200"
                        )}
                      >
                        <div className={cn(
                          "h-4 w-4 rounded-full border-2 flex items-center justify-center",
                          days === tr.days ? "border-violet-500" : "border-slate-300"
                        )}>
                          {days === tr.days && <div className="h-2 w-2 rounded-full bg-violet-500" />}
                        </div>
                        <span className="text-xs font-medium text-slate-700">{tr.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Min amount (for offline_orders) */}
                {(source === "offline_orders" || source === "good_cpl") && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-2 block flex items-center gap-1.5">
                      💰 Giá trị đơn hàng
                    </label>
                    <div className="space-y-1.5">
                      {MIN_AMOUNTS.map(ma => (
                        <button
                          key={ma.value}
                          onClick={() => setMinAmount(ma.value)}
                          className={cn(
                            "flex items-center gap-3 w-full rounded-lg border-2 px-4 py-3 text-left transition-all",
                            minAmount === ma.value
                              ? "border-violet-300 bg-violet-50"
                              : "border-slate-200 bg-white hover:border-violet-200"
                          )}
                        >
                          <div className={cn(
                            "h-4 w-4 rounded-full border-2 flex items-center justify-center",
                            minAmount === ma.value ? "border-violet-500" : "border-slate-300"
                          )}>
                            {minAmount === ma.value && <div className="h-2 w-2 rounded-full bg-violet-500" />}
                          </div>
                          <span className="text-xs font-medium text-slate-700">{ma.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* CPL threshold for good_cpl source */}
                {source === "good_cpl" && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-2 block">
                      CPL tối đa (₫)
                    </label>
                    <Input
                      type="number"
                      value={company === "MBI" ? 250000 : 60000}
                      className="text-sm w-40"
                      readOnly
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      {company === "MBI" ? "MBI: CPL < ₫250K" : "MBC: CPL < ₫60K"} — theo benchmark nội bộ
                    </p>
                  </div>
                )}

                {/* Nav */}
                <div className="flex justify-between pt-3 border-t border-slate-100">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setStep(1)}>
                    <ArrowLeft className="h-3.5 w-3.5" /> Quay lại
                  </Button>
                  <Button size="sm" className="gap-1.5 text-xs bg-amber-500 text-amber-950 hover:bg-amber-600" onClick={() => setStep(3)}>
                    Tiếp theo <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* ━━━━━━━━━━━━━━━━━━━━ STEP 3: Tạo Lookalike ━━━━━━━━━━━━━━━━━━━━ */}
            {step === 3 && (
              <div className="p-6 space-y-5">
                <div>
                  <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    🚀 Bước 3: Tạo Lookalike
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Xem trước audience size và chọn tỷ lệ Lookalike
                  </p>
                </div>

                {/* Audience size estimate */}
                {isWebVisitors ? (
                  <div className={cn(
                    "rounded-xl border-2 p-5",
                    canCreateLookalike
                      ? "border-blue-200 bg-gradient-to-br from-blue-50 to-white"
                      : "border-red-200 bg-gradient-to-br from-red-50 to-white"
                  )}>
                    <h3 className="text-sm font-bold text-slate-800 mb-2">Website Custom Audience (Pixel)</h3>
                    <p className="text-xs text-slate-600">
                      Meta sẽ tự tính kích thước theo lưu lượng Pixel thực tế sau khi tạo — loại audience này
                      không có số ước tính trước khi tạo, kể cả từ Meta.
                    </p>
                    <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
                      <span>📊 Nguồn: {AUDIENCE_SOURCES.find(s => s.id === source)?.label}</span>
                      <span>🏢 {company === "both" ? "Cần chọn MBC hoặc MBI" : company}</span>
                      <span>📅 Retention {days} ngày</span>
                    </div>
                    {!canCreateLookalike && (
                      <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs font-bold text-red-700">
                          Cần quay lại Bước 2 và chọn đúng 1 công ty (MBC hoặc MBI)
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={cn(
                    "rounded-xl border-2 p-5",
                    canCreateLookalike
                      ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
                      : "border-red-200 bg-gradient-to-br from-red-50 to-white"
                  )}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-slate-800">Custom Audience size</h3>
                      <span className={cn(
                        "rounded-full px-3 py-1 text-xs font-bold",
                        canCreateLookalike ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      )}>
                        {canCreateLookalike ? "✅ Đủ điều kiện" : "❌ Chưa đủ"}
                      </span>
                    </div>

                    {isMbiRealOffline && mbiOffline.loading ? (
                      <div className="flex items-center gap-2 text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-xs">Đang tải danh sách khách hàng thực từ Odoo (MBI)...</span>
                      </div>
                    ) : (
                      <div className="flex items-end gap-2">
                        <span className={cn(
                          "text-3xl font-bold",
                          canCreateLookalike ? "text-emerald-700" : "text-red-700"
                        )}>
                          {isMbiRealOffline ? "" : "~"}{estimatedSize.toLocaleString("vi-VN")}
                        </span>
                        <span className="text-sm text-slate-400 mb-1">người</span>
                        {isMbiRealOffline && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 mb-1">
                            Số thực từ Odoo
                          </span>
                        )}
                      </div>
                    )}

                    {isMbiRealOffline && mbiOffline.error && (
                      <p className="text-[10px] text-red-600 mt-2">⚠️ {mbiOffline.error}</p>
                    )}

                    <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
                      <span>📊 Nguồn: {AUDIENCE_SOURCES.find(s => s.id === source)?.label}</span>
                      <span>🏢 {company === "both" ? "MBC + MBI" : company}</span>
                      <span>📅 {days} ngày</span>
                      {minAmount > 0 && <span>💰 ≥ ₫{(minAmount / 1000).toFixed(0)}K</span>}
                    </div>

                    {!canCreateLookalike && !(isMbiRealOffline && mbiOffline.loading) && (
                      <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-red-700">
                            Cần tối thiểu {MIN_AUDIENCE_SIZE} người
                          </p>
                          <p className="text-[10px] text-red-500 mt-0.5">
                            Thử mở rộng thời gian, bớt filter giá trị, hoặc chọn cả 2 công ty
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Lookalike ratios */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-2 block flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-violet-500" /> Tạo Lookalike
                  </label>
                  <div className="space-y-2">
                    {LOOKALIKE_OPTIONS.map(opt => (
                      <button
                        key={opt.ratio}
                        onClick={() => toggleRatio(opt.ratio)}
                        disabled={!canCreateLookalike}
                        className={cn(
                          "flex items-center gap-3 w-full rounded-xl border-2 px-5 py-4 text-left transition-all",
                          selectedRatios.includes(opt.ratio)
                            ? "border-violet-300 bg-violet-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-violet-200",
                          !canCreateLookalike && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className={cn(
                          "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0",
                          selectedRatios.includes(opt.ratio)
                            ? "border-violet-500 bg-violet-500"
                            : "border-slate-300"
                        )}>
                          {selectedRatios.includes(opt.ratio) && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-800">{opt.label}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">{opt.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                {canCreateLookalike && selectedRatios.length > 0 && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                    <h3 className="text-xs font-bold text-blue-700 mb-2">📋 Tóm tắt sẽ tạo:</h3>
                    <div className="space-y-1 text-xs text-slate-600">
                      <p>
                        • {isWebVisitors
                          ? "1 Website Custom Audience (kích thước theo Meta, sau khi tạo)"
                          : `1 Custom Audience: ~${estimatedSize.toLocaleString("vi-VN")} KH`}
                      </p>
                      {selectedRatios.sort().map(r => {
                        const opt = LOOKALIKE_OPTIONS.find(o => o.ratio === r);
                        return (
                          <p key={r}>• {opt?.label} (kích thước: Meta tính sau khi tạo)</p>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                    ❌ {error}
                  </div>
                )}

                {/* Nav */}
                <div className="flex justify-between pt-3 border-t border-slate-100">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setStep(2)}>
                    <ArrowLeft className="h-3.5 w-3.5" /> Quay lại
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-200"
                    onClick={handleCreate}
                    disabled={!canCreateLookalike || selectedRatios.length === 0 || isCreating}
                  >
                    {isCreating ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tạo...</>
                    ) : (
                      <><Rocket className="h-3.5 w-3.5" /> Tạo Audiences</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
