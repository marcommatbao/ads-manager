"use client";

import { useState, useCallback } from "react";
import {
  ChevronRight, ChevronLeft, Loader2, Sparkles,
  Globe, FileText, Users, Settings, Check, RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BriefPreview } from "./BriefPreview";
import { PRODUCTS_BY_COMPANY } from "@/app/(dashboard)/creative/_constants";
import type { AudienceSegment } from "@/app/(dashboard)/creative/_types";
import type { BriefInput, CreativeBrief, BriefCompany, BriefPlatform, BriefObjective, BriefFunnelStage } from "@/lib/creative-brief/types";
import { companyIds } from "@/lib/companies/registry";

// ── Step config ───────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Sản phẩm",   icon: <Globe className="h-4 w-4" /> },
  { id: 2, label: "Audience",   icon: <Users className="h-4 w-4" /> },
  { id: 3, label: "Chiến lược", icon: <Settings className="h-4 w-4" /> },
  { id: 4, label: "Brief",      icon: <FileText className="h-4 w-4" /> },
];

const OBJECTIVE_OPTIONS: { value: BriefObjective; label: string; desc: string }[] = [
  { value: "awareness",     label: "Nhận biết",    desc: "Brand mới hoặc sản phẩm mới ra mắt" },
  { value: "consideration", label: "Cân nhắc",     desc: "Khách biết vấn đề, đang so sánh" },
  { value: "conversion",    label: "Chuyển đổi",   desc: "Khách warm — push mua / đăng ký" },
  { value: "retention",     label: "Giữ chân",     desc: "Gia hạn, upsell khách cũ" },
];

const FUNNEL_OPTIONS: { value: BriefFunnelStage; label: string; tag: string }[] = [
  { value: "top",    label: "Top of Funnel (TOFU)", tag: "Cold audience" },
  { value: "mid",    label: "Mid Funnel (MOFU)",    tag: "Warm audience" },
  { value: "bottom", label: "Bottom Funnel (BOFU)", tag: "Hot audience" },
];

const PLATFORM_OPTIONS: { value: BriefPlatform; label: string }[] = [
  { value: "facebook", label: "Facebook / Meta" },
  { value: "google",   label: "Google Ads" },
  { value: "both",     label: "Cả hai" },
];

// ── Sub-components ─────────────────────────────────────────────

function RadioCard<T extends string>({
  value, selected, onClick, label, desc,
}: { value: T; selected: T; onClick: (v: T) => void; label: string; desc?: string }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "w-full text-left rounded-xl border px-3 py-2.5 transition-all text-xs",
        selected === value
          ? "border-indigo-400 bg-indigo-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn("h-3.5 w-3.5 rounded-full border-2 shrink-0 transition-colors",
          selected === value ? "border-indigo-500 bg-indigo-500" : "border-slate-300"
        )} />
        <span className={cn("font-semibold", selected === value ? "text-indigo-700" : "text-slate-700")}>{label}</span>
      </div>
      {desc && <p className="text-[10px] text-slate-400 ml-5.5 mt-0.5 pl-5">{desc}</p>}
    </button>
  );
}

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <div className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all",
            step > s.id  ? "bg-indigo-500 text-white"
            : step === s.id ? "border-2 border-indigo-500 text-indigo-600 bg-white"
            : "bg-slate-100 text-slate-400"
          )}>
            {step > s.id ? <Check className="h-3.5 w-3.5" /> : s.id}
          </div>
          <span className={cn("text-[10px] hidden sm:block", step === s.id ? "text-indigo-600 font-semibold" : "text-slate-400")}>
            {s.label}
          </span>
          {i < STEPS.length - 1 && <div className={cn("w-6 h-px", step > s.id ? "bg-indigo-300" : "bg-slate-200")} />}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

interface Props {
  initialCompany?: BriefCompany;
  onBriefGenerated?: (brief: CreativeBrief) => void;
}

export function BriefBuilder({ initialCompany = "MBC", onBriefGenerated }: Props) {
  const [step, setStep] = useState(1);

  // Step 1
  const [company,   setCompany]   = useState<BriefCompany>(initialCompany);
  const [product,   setProduct]   = useState("");
  const [platform,  setPlatform]  = useState<BriefPlatform>("facebook");

  // Step 2 — audience
  const [segments,     setSegments]     = useState<AudienceSegment[]>([]);
  const [segLoading,   setSegLoading]   = useState(false);
  const [segError,     setSegError]     = useState<string | null>(null);
  const [availableSegs, setAvailableSegs] = useState<AudienceSegment[]>([]);
  const [customNote,   setCustomNote]   = useState("");

  // Step 3
  const [objective,   setObjective]   = useState<BriefObjective>("conversion");
  const [funnelStage, setFunnelStage] = useState<BriefFunnelStage>("bottom");
  const [landingUrl,  setLandingUrl]  = useState("");
  const [overrideCta, setOverrideCta] = useState("");
  const [overrideUsp, setOverrideUsp] = useState("");
  const [promoLabel,  setPromoLabel]  = useState("");
  const [budgetVnd,   setBudgetVnd]   = useState("");
  const [durationDays, setDurationDays] = useState("");

  // Step 4 — result
  const [brief,        setBrief]       = useState<CreativeBrief | null>(null);
  const [generating,   setGenerating]  = useState(false);
  const [genError,     setGenError]    = useState<string | null>(null);

  const products = PRODUCTS_BY_COMPANY[company] ?? [];

  // Load available segments when entering step 2
  const loadSegments = useCallback(async () => {
    if (availableSegs.length > 0) return;
    setSegLoading(true);
    setSegError(null);
    try {
      const res  = await fetch(`/api/audiences?company=${company}&limit=30`);
      const json = await res.json().catch(() => null) as
        { success?: boolean; error?: string; data?: { segments?: AudienceSegment[] } } | null;

      // A failed load used to fall through silently and render an empty
      // picker, which is indistinguishable from "no segments saved yet".
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setAvailableSegs(json.data?.segments ?? []);
    } catch (err) {
      setSegError(
        `Không thể tải danh sách segments (${err instanceof Error ? err.message : "lỗi không rõ"}). ` +
        "Bạn có thể nhập mô tả audience thủ công.",
      );
    } finally {
      setSegLoading(false);
    }
  }, [company, availableSegs.length]);

  const goToStep = (next: number) => {
    if (next === 2) loadSegments();
    setStep(next);
  };

  const toggleSegment = (seg: AudienceSegment) => {
    setSegments(prev =>
      prev.some(s => s.segmentName === seg.segmentName)
        ? prev.filter(s => s.segmentName !== seg.segmentName)
        : [...prev, seg]
    );
  };

  const generate = async () => {
    if (!product) { setGenError("Vui lòng chọn sản phẩm"); return; }

    setGenerating(true);
    setGenError(null);
    setBrief(null);

    const input: BriefInput = {
      company,
      platform,
      product: product as BriefInput["product"],
      objective,
      funnelStage,
      selectedSegments: segments,
      customAudienceNote: customNote || undefined,
      landingPageUrl: landingUrl || undefined,
      promotionContext: promoLabel ? { label: promoLabel } : undefined,
      launchConstraints: budgetVnd ? {
        dailyBudgetVnd: Number(budgetVnd.replace(/[.,\s]/g, "")) || undefined,
        durationDays: Number(durationDays) || undefined,
      } : undefined,
      overrides: {
        cta: overrideCta || undefined,
        mainUsp: overrideUsp || undefined,
      },
    };

    try {
      const res  = await fetch("/api/creative/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const json = await res.json() as { success?: boolean; data?: { brief: CreativeBrief }; error?: string };
      if (json.success && json.data?.brief) {
        setBrief(json.data.brief);
        setStep(4);
        onBriefGenerated?.(json.data.brief);
      } else {
        setGenError(json.error ?? "Lỗi không xác định");
      }
    } catch {
      setGenError("Lỗi kết nối. Thử lại.");
    } finally {
      setGenerating(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl mx-auto space-y-5">
      {/* Step indicator */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
        <StepIndicator step={step} total={STEPS.length} />
      </div>

      {/* ── Step 1: Product ───────────────────────────────── */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <h2 className="text-sm font-bold text-slate-800">Sản phẩm & Platform</h2>

          {/* Company toggle */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 mb-2">CÔNG TY</p>
            <div className="flex gap-2">
              {companyIds().map(c => (
                <button
                  key={c}
                  onClick={() => { setCompany(c); setProduct(""); }}
                  className={cn(
                    "flex-1 py-2 rounded-lg border text-xs font-bold transition-all",
                    company === c ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  )}
                >{c}</button>
              ))}
            </div>
          </div>

          {/* Product grid */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 mb-2">SẢN PHẨM</p>
            <div className="grid grid-cols-2 gap-2">
              {products.map(p => (
                <button
                  key={p.id}
                  onClick={() => setProduct(p.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs text-left transition-all",
                    product === p.id
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700 font-semibold"
                      : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <p.icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{p.label}</span>
                  {p.badge && <span className="ml-auto text-[9px] text-amber-600">{p.badge}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 mb-2">PLATFORM</p>
            <div className="space-y-2">
              {PLATFORM_OPTIONS.map(opt => (
                <RadioCard key={opt.value} value={opt.value} selected={platform} onClick={setPlatform} label={opt.label} />
              ))}
            </div>
          </div>

          <Button
            className="w-full gap-2"
            onClick={() => goToStep(2)}
            disabled={!product}
          >
            Tiếp tục <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ── Step 2: Audience ──────────────────────────────── */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <h2 className="text-sm font-bold text-slate-800">Audience</h2>

          {/* Segment library */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 mb-2">
              CHỌN TỪ SEGMENT LIBRARY {segments.length > 0 && <span className="text-indigo-600">({segments.length} đã chọn)</span>}
            </p>
            {segLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải segments...
              </div>
            )}
            {segError && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded p-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> {segError}
              </p>
            )}
            {!segLoading && availableSegs.length === 0 && !segError && (
              <p className="text-xs text-slate-400 py-2">Chưa có segments. Nhập mô tả audience bên dưới.</p>
            )}
            {availableSegs.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {availableSegs.map(seg => {
                  const selected = segments.some(s => s.segmentName === seg.segmentName);
                  return (
                    <button
                      key={seg.segmentName}
                      onClick={() => toggleSegment(seg)}
                      className={cn(
                        "w-full text-left rounded-lg border px-3 py-2 text-xs transition-all",
                        selected ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("font-semibold", selected ? "text-indigo-700" : "text-slate-700")}>
                          {seg.segmentName}
                        </span>
                        {selected && <Check className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
                      </div>
                      {seg.painPoints?.[0] && (
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{seg.painPoints[0]}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Custom note */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 mb-2">MÔ TẢ AUDIENCE (tuỳ chọn)</p>
            <textarea
              value={customNote}
              onChange={e => setCustomNote(e.target.value)}
              placeholder="Ví dụ: Chủ doanh nghiệp SME HCM, 30-45 tuổi, đang dùng hosting cũ chậm..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-1 text-xs"><ChevronLeft className="h-3.5 w-3.5" /> Quay lại</Button>
            <Button className="flex-1 gap-2" onClick={() => goToStep(3)}>
              Tiếp tục <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Strategy ──────────────────────────────── */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
          <h2 className="text-sm font-bold text-slate-800">Chiến lược</h2>

          {/* Objective */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 mb-2">MỤC TIÊU</p>
            <div className="space-y-2">
              {OBJECTIVE_OPTIONS.map(opt => (
                <RadioCard key={opt.value} value={opt.value} selected={objective} onClick={setObjective} label={opt.label} desc={opt.desc} />
              ))}
            </div>
          </div>

          {/* Funnel stage */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 mb-2">GIAI ĐOẠN PHỄU</p>
            <div className="space-y-2">
              {FUNNEL_OPTIONS.map(opt => (
                <RadioCard key={opt.value} value={opt.value} selected={funnelStage} onClick={setFunnelStage}
                  label={opt.label} desc={opt.tag} />
              ))}
            </div>
          </div>

          {/* Optional fields */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-slate-500">THÔNG TIN THÊM (tuỳ chọn)</p>
            <Input placeholder="Landing page URL" value={landingUrl} onChange={e => setLandingUrl(e.target.value)} className="text-xs" />
            <Input placeholder="USP chính (để trống = tự động từ KB)" value={overrideUsp} onChange={e => setOverrideUsp(e.target.value)} className="text-xs" />
            <Input placeholder="CTA tuỳ chỉnh (để trống = tự động)" value={overrideCta} onChange={e => setOverrideCta(e.target.value)} className="text-xs" />
            <Input placeholder="Promotion (vd: Khuyến mãi 11/11)" value={promoLabel} onChange={e => setPromoLabel(e.target.value)} className="text-xs" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Ngân sách/ngày (₫)" value={budgetVnd} onChange={e => setBudgetVnd(e.target.value)} className="text-xs" />
              <Input placeholder="Số ngày chạy" value={durationDays} onChange={e => setDurationDays(e.target.value)} className="text-xs" />
            </div>
          </div>

          {genError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {genError}
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-1 text-xs"><ChevronLeft className="h-3.5 w-3.5" /> Quay lại</Button>
            <Button className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700" onClick={generate} disabled={generating}>
              {generating
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang tạo brief...</>
                : <><Sparkles className="h-4 w-4" /> Tạo Brief</>}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Result ────────────────────────────────── */}
      {step === 4 && brief && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Creative Brief</h2>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => { setBrief(null); setStep(1); }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Tạo lại
            </Button>
          </div>
          <BriefPreview brief={brief} />
        </div>
      )}
    </div>
  );
}
