"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Sparkles, Loader2, ArrowLeft, ArrowRight, Copy, Check,
  CheckCircle, AlertTriangle, Search, Zap, Target, Download,
  ChevronDown, ChevronUp, Plus, Rocket, ExternalLink, RefreshCw,
  DollarSign, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { groupKeywordVariants, alreadyHasKeyword, normalizeKeywordKey } from "@/lib/google-keyword-variants";
import { splitTrackingUrl } from "@/lib/google-tracking-url";
import { Button } from "@/components/ui/button";
import GooglePlaybookPanel, { type GooglePlaybookLaunchState } from "@/components/playbook/GooglePlaybookPanel";
import { companyLabel } from "@/lib/companies/registry";

// ── Google Products by Company ──

const GOOGLE_PRODUCTS: Record<string, Array<{ id: string; icon: string; label: string }>> = {
  MBC: [
    { id: "DOMAIN",           icon: "🌐", label: "Tên miền" },
    { id: "HOSTING",          icon: "🖥️",  label: "Hosting / Cloud" },
    { id: "EMAIL_BUSINESS",   icon: "📧", label: "Email BIZ" },
    { id: "SALE_AI",          icon: "🤖", label: "Sale.ai" },
    { id: "SSL",              icon: "🔒", label: "SSL" },
    { id: "MICROSOFT_365",    icon: "💼", label: "Microsoft 365" },
    { id: "GOOGLE_WORKSPACE", icon: "🔵", label: "Google Workspace" },
  ],
  MBI: [
    { id: "HOA_DON_DIEN_TU",  icon: "🧾", label: "Hóa đơn điện tử" },
    { id: "CHU_KY_SO",        icon: "✍️",  label: "Chữ ký số" },
    { id: "HOP_DONG_DIEN_TU", icon: "📄", label: "Hợp đồng điện tử" },
    { id: "HOA_DON_ECOM",     icon: "🛒", label: "Hóa đơn Ecom" },
  ],
};

const CAMPAIGN_TYPES = [
  { value: "SEARCH", label: "Search (RSA)",      icon: Search },
  { value: "PMAX",   label: "Performance Max",   icon: Zap },
  { value: "BOTH",   label: "Cả hai",            icon: Target },
] as const;

type CampaignType = "SEARCH" | "PMAX" | "BOTH";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJSON = any;

// Map kebab-case IDs from _constants.ts → UPPER_CASE IDs used by google-creative-engine
const PRODUCT_ID_MAP: Record<string, string> = {
  "ten-mien":          "DOMAIN",
  "hosting":           "HOSTING",
  "microsoft-365":     "MICROSOFT_365",
  "google-workspace":  "GOOGLE_WORKSPACE",
  "email-dn":          "EMAIL_BUSINESS",
  "ssl":               "SSL",
  "sale-ai":           "SALE_AI",
  "hoa-don-dien-tu":   "HOA_DON_DIEN_TU",
  "chu-ky-so":         "CHU_KY_SO",
  "hop-dong-dien-tu":  "HOP_DONG_DIEN_TU",
  "hoa-don-ecom":      "HOA_DON_ECOM",
};
// Đợt 7b — chiều ngược lại: Sổ kinh nghiệm dùng mã sản phẩm kebab-case của
// wizard (như PRODUCT_ID_MAP ở trên), còn selectedProduct trong panel này là
// UPPER_CASE sau khi map. "custom"/sản phẩm không có trong bảng → "" (Sổ trả
// rỗng, không suy đoán).
const GOOGLE_TO_WIZARD_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(PRODUCT_ID_MAP).map(([kebab, upper]) => [upper, kebab]),
);

interface GoogleCreativePanelProps {
  company: string;
  segment: AnyJSON;
  onBack: () => void;
  /** Pre-selected product ID from Step 1 (kebab-case or UPPER_CASE or "custom") */
  initialProductId?: string;
  /** Custom product name when initialProductId === "custom" */
  initialProductName?: string;
  /** Campaign type pre-selected in Step 1 */
  initialCampaignType?: CampaignType;
}

type ResultTab = "rsa" | "pmax" | "keywords";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function GoogleCreativePanel({
  company, segment, onBack,
  initialProductId, initialProductName, initialCampaignType,
}: GoogleCreativePanelProps) {
  // Resolve initial product ID to UPPER_CASE format used by the API
  const resolvedInitialId = initialProductId
    ? (initialProductId === "custom" ? "custom" : (PRODUCT_ID_MAP[initialProductId] ?? initialProductId))
    : "";

  // ── State ──
  const [selectedProduct, setSelectedProduct] = useState(resolvedInitialId);
  const [customProductName, setCustomProductName] = useState(initialProductName ?? "");
  const [campaignType, setCampaignType] = useState<CampaignType>(initialCampaignType ?? "BOTH");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results
  const [result, setResult] = useState<{
    rsa: AnyJSON;
    pmax: AnyJSON;
    keywords: AnyJSON;
    product: { name: string; finalUrl: string };
    id: string;
  } | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>("rsa");

  // Expand states
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["headlines", "descriptions"]));
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [intentFilter, setIntentFilter] = useState<string>("ALL");

  // Launch state
  const [launchCampaignName, setLaunchCampaignName] = useState("");
  /** UTM gắn vào MỌI link của chiến dịch qua `final_url_suffix` của Google.
   *  Chiến dịch tool tạo ra TRƯỚC BẢN NÀY không có tham số nào, trong khi các
   *  chiến dịch đang chạy của tài khoản đều có — GA4 vì thế không tách được
   *  lưu lượng theo chiến dịch. */
  /** Ghi đè trang đích; rỗng = dùng link mặc định của sản phẩm. */
  const [urlOverride, setUrlOverride] = useState("");
  /** Ô dán link đầy đủ — tool tự tách thành trang đích + tham số UTM. */
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [utmSuffix, setUtmSuffix] = useState(
    "utm_source=google_ads&utm_medium=cpc&utm_campaign={campaign}&utm_term={keyword}");
  const [dailyBudget, setDailyBudget] = useState(500000);
  const [launching, setLaunching] = useState(false);
  /** Cổng xác nhận cho nút "Tạo & Chạy Ngay" — một cú bấm nhầm là tiền bắt đầu
   *  chảy thật, khác hẳn nút tạo-rồi-tắt vốn sửa lại được. */
  const [confirmRunNow, setConfirmRunNow] = useState(false);
  const [launchResult, setLaunchResult] = useState<AnyJSON | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  /** Chủ đề chính sách Google gắn cờ + đúng chữ gây ra nó. Câu lỗi gốc chỉ nói
   *  "policy topics of type PROHIBITED" — không nói chủ đề nào, không nói dòng
   *  nào phải sửa. */
  interface PolicyHit {
    topic: string; type: string; texts: string[]; websites: string[];
    destination?: { url?: string; httpErrorCode?: string; dnsError?: string };
    exemptible: boolean;
  }
  const [launchPolicy, setLaunchPolicy] = useState<PolicyHit[]>([]);
  /** Dữ liệu thô khi Google trả chi tiết theo hình dạng tool chưa bóc được. */
  const [launchRawDetails, setLaunchRawDetails] = useState<unknown>(null);
  /** Kết quả mở thử trang đích — tool chặn TRƯỚC khi tạo gì nếu trang hỏng. */
  const [urlCheck, setUrlCheck] = useState<{ url: string; status: number | null; finalUrl?: string; problem?: string } | null>(null);

  const products = GOOGLE_PRODUCTS[company];
  const brandName = company === "MBI" ? "Matbao Invoice" : company === "MBC" ? "Mắt Bão" : companyLabel(company);
  // Đợt 7b — mã sản phẩm Sổ kinh nghiệm hiểu (kebab-case của wizard).
  const playbookProductKey = GOOGLE_TO_WIZARD_KEY[selectedProduct] ?? "";
  const playbookStateRef = useRef<GooglePlaybookLaunchState>({ keptEntryIds: [], overriddenAvoidIds: [], extraNegativeKeywords: [] });

  // ── Copy helper ──
  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // ── Toggle section ──
  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ── Generate ──
  const handleGenerate = useCallback(async () => {
    if (!selectedProduct) return;
    if (selectedProduct === "custom" && !customProductName.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const resolvedProductId = selectedProduct === "custom"
      ? `custom_${customProductName.trim()}`
      : selectedProduct;

    try {
      const res = await fetch("/api/google/generate-creative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment,
          productId: resolvedProductId,
          company,
          campaignType,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Lỗi tạo creative");
      }
      setResult(data);
      setResultTab(campaignType === "PMAX" ? "pmax" : "rsa");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [selectedProduct, customProductName, company, campaignType, segment]);

  // ── Copy all RSA ──
  const copyAllRSA = useCallback(() => {
    if (!result?.rsa?.headlines) return;
    const lines = [
      "=== HEADLINES ===",
      ...result.rsa.headlines.map((h: AnyJSON) => `${h.id}. [${h.type}] ${h.text} (${h.charCount} chars)`),
      "",
      "=== DESCRIPTIONS ===",
      ...result.rsa.descriptions.map((d: AnyJSON) => `${d.id}. ${d.text} (${d.charCount} chars)`),
    ];
    copyToClipboard(lines.join("\n"), "rsa-all");
  }, [result, copyToClipboard]);

  // ── Export keywords CSV ──
  const exportKeywordsCSV = useCallback(() => {
    if (!result?.keywords?.keywords) return;
    const headers = "Keyword,Match Type,Intent Level,Note";
    const rows = result.keywords.keywords.map((k: AnyJSON) =>
      `"${k.keyword}","${k.matchType}","${k.intentLevel}","${k.note || ""}"`
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keywords_${selectedProduct}_${company}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, selectedProduct, company]);

  // ── Sửa tay tiêu đề / mô tả ─────────────────────────────────────────────
  // Gemini vẫn viết vượt hạn (đo 27/08: 3/4 mô tả ra 91-92 ký tự, giới hạn 90).
  // Vượt hạn KHÔNG chặn launch — nó bị BỎ, nên nếu không sửa được thì quảng cáo
  // lên Google thiếu mất mấy dòng mà không ai hay.
  //
  // Sửa PHẢI lưu xuống đĩa: đường launch nạp creative từ file theo ID, sửa mỗi
  // state trình duyệt thì Google vẫn nhận bản gốc.
  const [editing, setEditing] = useState<{ section: "rsa" | "pmax"; field: string; index: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const startEdit = (field: string, index: number, current: string, section: "rsa" | "pmax" = "rsa") => {
    setEditing({ section, field, index });
    setDraft(current);
    setEditError(null);
  };

  const saveEdit = useCallback(async () => {
    if (!editing || !result?.id) return;
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch("/api/google/creative-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creativeId: result.id, section: editing.section, field: editing.field, index: editing.index, text: draft }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Không lưu được");
      // Đồng bộ lại state từ thứ SERVER đã ghi, không tự tính ở client —
      // charCount/isValid là hai trường quyết định dòng này có lên Google không.
      setResult((prev: AnyJSON) => {
        const sec = editing.section;
        if (!prev?.[sec]) return prev;
        const next = { ...prev, [sec]: { ...prev[sec] } };
        const arr = [...(next[sec][editing.field] as AnyJSON[])];
        arr[editing.index] = data.item;
        next[sec][editing.field] = arr;
        return next;
      });
      setEditing(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Lỗi không rõ");
    } finally {
      setSaving(false);
    }
  }, [editing, draft, result]);

  /** Ô sửa dùng chung cho tiêu đề và mô tả. */
  const editorRow = (field: "headlines" | "descriptions", index: number, limit: number) => {
    const over = draft.trim().length > limit;
    return (
      <div className="flex-1 flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !over) void saveEdit();
            if (e.key === "Escape") setEditing(null);
          }}
          className={cn("flex-1 rounded border px-2 py-1 text-sm outline-none",
            over ? "border-red-400 bg-red-50" : "border-blue-400")}
        />
        <span className={cn("text-xs font-mono w-14 text-right", over ? "text-red-600 font-bold" : "text-slate-500")}>
          {draft.trim().length}/{limit}
        </span>
        <Button size="sm" className="h-7 text-xs" disabled={saving || over || draft.trim().length === 0}
          onClick={() => void saveEdit()}>
          {saving ? "Đang lưu..." : "Lưu"}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(null)}>Huỷ</Button>
      </div>
    );
  };

  // ── Lượng tìm kiếm THẬT từ Keyword Planner ──────────────────────────────
  // Nhãn HIGH/MED/LOW cạnh mỗi từ khoá là "mức độ ý định mua" do Gemini TỰ
  // CHẤM — không phải lượng tìm kiếm. Đây là chỗ hỏi chính Google con số thật.
  interface KwMetric {
    keyword: string;
    avgMonthlySearches: number | null;
    competition: string | null;
    topOfPageBidLowVnd: number | null;
    topOfPageBidHighVnd: number | null;
  }
  const [volumes, setVolumes] = useState<Map<string, KwMetric> | null>(null);
  const [kwSuggestions, setKwSuggestions] = useState<KwMetric[]>([]);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [kwNote, setKwNote] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [volumeError, setVolumeError] = useState<string | null>(null);

  const measureVolumes = useCallback(async () => {
    if (!result?.keywords?.keywords) return;
    setMeasuring(true);
    setVolumeError(null);
    try {
      const list = (result.keywords.keywords as AnyJSON[]).map(k => String(k.keyword));
      const res = await fetch("/api/google/keyword-volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, keywords: list }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Không đo được");
      const map = new Map<string, KwMetric>();
      for (const m of (data.requested ?? []) as KwMetric[]) map.set(m.keyword.toLowerCase(), m);
      setVolumes(map);
      setKwSuggestions((data.suggestions ?? []) as KwMetric[]);
      setKwNote(data.note ?? null);
    } catch (e) {
      setVolumeError(e instanceof Error ? e.message : "Lỗi không rõ");
    } finally {
      setMeasuring(false);
    }
  }, [result, company]);

  // TỰ ĐỘNG đo ngay khi có bộ từ khoá mới.
  //
  // Trước bản này đo lượng tìm kiếm là một nút RỜI, bấm thì mới chạy. Nghĩa là
  // người dùng hoàn toàn có thể tạo và chạy chiến dịch với 25 từ khoá do AI tự
  // nghĩ mà CHƯA TỪNG đo lần nào — tool không cản, không nhắc. Nhãn
  // HIGH/MED/LOW cạnh mỗi từ lại là mức ý định mua do Gemini tự chấm, rất dễ
  // đọc nhầm thành "nhiều người tìm".
  //
  // Đo tự động, nhưng KHÔNG chặn và KHÔNG tự xoá từ khoá nào — quyết định giữ
  // hay bỏ vẫn là của người chạy quảng cáo. Từ khoá mới/ngách thường có 0 lượt
  // tìm mà vẫn đáng chạy.
  const autoMeasuredFor = useRef<string | null>(null);
  useEffect(() => {
    const id = result?.id ? String(result.id) : null;
    if (!id || autoMeasuredFor.current === id) return;
    if (!result?.keywords?.keywords) return;
    autoMeasuredFor.current = id;
    void measureVolumes();
  }, [result, measureVolumes]);

  /** Từ khoá Google nói gần như KHÔNG AI TÌM (0 lượt/tháng).
   *  Khác hẳn `null` = Google không có dữ liệu — gộp hai cái làm một là nói
   *  dối bằng con số 0. */
  const deadKeywords = (() => {
    if (!volumes || !result?.keywords?.keywords) return [];
    return (result.keywords.keywords as AnyJSON[])
      .map(k => String(k.keyword))
      .filter(k => volumes.get(k.toLowerCase())?.avgMonthlySearches === 0);
  })();

  /** Ô số liệu cạnh mỗi từ khoá. Chưa đo thì KHÔNG hiện gì — hiện "0" sẽ bị
   *  đọc thành "không ai tìm từ này". */
  const volumeBadge = (keyword: string) => {
    if (!volumes) return null;
    const m = volumes.get(keyword.toLowerCase());
    if (!m) return null;
    if (m.avgMonthlySearches === null) {
      return <span className="text-[10px] text-slate-400 italic whitespace-nowrap">Google không có dữ liệu</span>;
    }
    return (
      <span className="text-[10px] whitespace-nowrap">
        <b className={cn(
          m.avgMonthlySearches >= 1000 ? "text-emerald-700"
          : m.avgMonthlySearches >= 100 ? "text-slate-700" : "text-slate-400",
        )}>{m.avgMonthlySearches.toLocaleString("vi-VN")}</b>
        <span className="text-slate-400">/tháng</span>
        {m.competition && <span className="ml-1.5 text-slate-400">· {m.competition}</span>}
        {m.topOfPageBidHighVnd ? (
          <span className="ml-1.5 text-slate-400">· thầu ₫{m.topOfPageBidHighVnd.toLocaleString("vi-VN")}</span>
        ) : null}
      </span>
    );
  };

  // ── Sửa bộ từ khoá ──────────────────────────────────────────────────────
  // Bộ từ khoá AI sinh là ĐIỂM XUẤT PHÁT. Người chạy quảng cáo biết thứ AI
  // không biết: từ nào từng đốt tiền, từ nào đối thủ giữ, sản phẩm nào sắp
  // ngừng bán. Không sửa được thì phải sang Google Ads làm lại từ đầu.
  const [kwBusy, setKwBusy] = useState(false);
  const [kwError, setKwError] = useState<string | null>(null);
  const [kwWarning, setKwWarning] = useState<string | null>(null);
  const [newKw, setNewKw] = useState("");
  const [newKwType, setNewKwType] = useState<"EXACT" | "PHRASE" | "BROAD">("PHRASE");

  const patchKeywords = useCallback(async (payload: Record<string, unknown>) => {
    if (!result?.id) return;
    setKwBusy(true);
    setKwError(null);
    try {
      const res = await fetch("/api/google/creative-keywords", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creativeId: result.id, ...payload }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Không lưu được");
      setResult((prev: AnyJSON) => prev?.keywords
        ? { ...prev, keywords: { ...prev.keywords, keywords: data.keywords } }
        : prev);
      setKwWarning(data.warning ?? null);
    } catch (e) {
      setKwError(e instanceof Error ? e.message : "Lỗi không rõ");
    } finally {
      setKwBusy(false);
    }
  }, [result]);

  const addKeyword = (keyword: string, matchType: string) =>
    patchKeywords({ action: "add", keyword, matchType });

  // ── Hành động chuyển đổi để tối ưu ──────────────────────────────────────
  // Không chọn ⇒ `maximize_conversions` đuổi theo TOÀN BỘ hành động đang bật ở
  // cấp tài khoản (đơn hàng, xem trang liên hệ, gọi điện… trộn làm một), tức để
  // Google tự quyết tiền chảy về đâu.
  interface ConvAction {
    resourceName: string; id: string; name: string; category: string;
    countsAsConversion: boolean; origin: string; categoryVi?: string;
    conversions30d: number | null; conversionValue30d: number | null; recommended: boolean;
  }
  const [convActions, setConvActions] = useState<ConvAction[]>([]);
  const [selectedConvActions, setSelectedConvActions] = useState<string[]>([]);
  const [convError, setConvError] = useState<string | null>(null);
  /** Đọc được danh sách hành động nhưng KHÔNG đọc được số chuyển đổi — gợi ý
   *  mặc định khi đó chỉ dựa vào LOẠI, chưa được dữ liệu xác nhận. */
  const [convMetricsError, setConvMetricsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setConvError(null);
    fetch(`/api/google/conversion-actions?company=${company}`)
      .then(r => r.json())
      .then((j: { success?: boolean; actions?: ConvAction[]; error?: string; metricsAvailable?: boolean; metricsError?: string }) => {
        if (cancelled) return;
        if (!j.success || !Array.isArray(j.actions)) {
          setConvError(j.error ?? "Không đọc được hành động chuyển đổi");
          return;
        }
        setConvActions(j.actions);
        setConvMetricsError(j.metricsAvailable === false ? String(j.metricsError ?? "không rõ") : null);
        // Mặc định: đơn hàng (Purchase) và phải CÓ dữ liệu thật. Không có cái
        // nào đạt thì để TRỐNG — thà giữ hành vi cũ còn hơn tự chọn bừa một
        // tín hiệu rồi bắt Google tối ưu theo nó.
        setSelectedConvActions(j.actions.filter(a => a.recommended).map(a => a.resourceName));
      })
      .catch(() => { if (!cancelled) setConvError("Không gọi được API hành động chuyển đổi"); });
    return () => { cancelled = true; };
  }, [company]);

  // ── Tiện ích hình ảnh cho Search ────────────────────────────────────────
  // Quảng cáo Search KHÔNG có ảnh trong bản thân nó — đó là bản chất của Google
  // Search. Nhưng Google cho gắn ảnh ở cấp campaign, hiện BÊN CẠNH quảng cáo
  // (chủ yếu trên di động).
  //
  // Đọc kích thước NGAY TRÊN TRÌNH DUYỆT trước khi gửi: sai tỉ lệ thì báo bằng
  // tiếng Việt kèm kích thước đúng, thay vì để Google trả về một mã lỗi tiếng
  // Anh sau khi đã tốn một lượt gọi.
  interface UploadedImage { resourceName: string; name: string; fieldType: string; ratioLabel: string; sizeKb: number; warning?: string | null; cropNote?: string | null }
  /** MARKETING hay LOGO — KHÔNG suy ra được từ tỉ lệ: logo vuông và ảnh
   *  marketing vuông đều là 1:1. Người tải lên phải nói. */
  const [imgPurpose, setImgPurpose] = useState<"MARKETING" | "LOGO">("MARKETING");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  /** Cắt giữa ảnh về đúng một tỉ lệ Google chấp nhận.
   *
   *  VÌ SAO CẦN: ảnh 2560×1440 (16:9 = 1,78) lệch 6,9% so với 1.91:1 nên công
   *  cụ từ chối, trong khi tải thẳng lên Google Ads thì được — vì giao diện
   *  Google TỰ CẮT cho bạn. Bắt người dùng ra ngoài cắt tay rồi quay lại là
   *  đẩy việc của máy sang cho người. Cắt giữa, giữ nguyên cạnh dài nhất có
   *  thể, không phóng to nên không vỡ ảnh. */
  const cropToRatio = (dataUrl: string, w: number, h: number, targetRatio: number) =>
    new Promise<{ dataUrl: string; w: number; h: number }>((resolve, reject) => {
      const im = new window.Image();
      im.onload = () => {
        let cw = w, ch = h;
        if (w / h > targetRatio) cw = Math.round(h * targetRatio);
        else ch = Math.round(w / targetRatio);
        const canvas = document.createElement("canvas");
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Trình duyệt không cắt được ảnh"));
        ctx.drawImage(im, Math.round((w - cw) / 2), Math.round((h - ch) / 2), cw, ch, 0, 0, cw, ch);
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), w: cw, h: ch });
      };
      im.onerror = () => reject(new Error("Không mở được ảnh để cắt"));
      im.src = dataUrl;
    });

  const handleImagePick = useCallback(async (file: File) => {
    setUploading(true);
    setImageError(null);
    try {
      let dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error("Không đọc được tệp"));
        r.readAsDataURL(file);
      });
      let dim = await new Promise<{ w: number; h: number }>((res, rej) => {
        const im = new window.Image();
        im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = () => rej(new Error("Tệp không phải ảnh hợp lệ"));
        im.src = dataUrl;
      });

      // Lệch tỉ lệ thì cắt về tỉ lệ GẦN NHẤT trong nhóm đang chọn, thay vì từ chối.
      const allowed = imgPurpose === "LOGO"
        ? [{ r: 1, label: "Logo vuông 1:1" }, { r: 4, label: "Logo ngang 4:1" }]
        : [{ r: 1.91, label: "Ngang 1.91:1" }, { r: 1, label: "Vuông 1:1" }, { r: 0.8, label: "Dọc 4:5" }];
      const ratio = dim.w / dim.h;
      const exact = allowed.find(a => Math.abs(ratio - a.r) <= a.r * 0.02);
      let cropNote: string | null = null;
      if (!exact) {
        const nearest = allowed.reduce((best, a) =>
          Math.abs(ratio - a.r) < Math.abs(ratio - best.r) ? a : best, allowed[0]);
        const cropped = await cropToRatio(dataUrl, dim.w, dim.h, nearest.r);
        cropNote = `đã tự cắt ${dim.w}×${dim.h} → ${cropped.w}×${cropped.h} (${nearest.label})`;
        dataUrl = cropped.dataUrl;
        dim = { w: cropped.w, h: cropped.h };
      }

      const res = await fetch("/api/google/image-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, name: file.name, dataUrl, width: dim.w, height: dim.h, campaignType, purpose: imgPurpose, currentCount: images.length }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Google từ chối ảnh");
      // Cắt rồi thì NÓI RA — người dùng phải biết ảnh gửi đi khác ảnh họ chọn.
      setImages(prev => [...prev, { ...(data.asset as UploadedImage), cropNote } as UploadedImage]);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Lỗi không rõ");
    } finally {
      setUploading(false);
    }
  }, [company, campaignType, images.length, imgPurpose]);

  // ── Thư viện tài sản: chọn lại ảnh ĐÃ CÓ trong tài khoản ────────────────
  // Phần lớn ảnh cần dùng đã nằm sẵn trong tài khoản — do lần chạy trước tải
  // lên, hoặc đội thiết kế đưa thẳng lên Google Ads. Bắt tải lại từ máy vừa
  // mất công vừa sinh bản trùng trong thư viện, mỗi bản một tên khác nhau.
  interface LibraryImage {
    resourceName: string; id: string; name: string;
    width: number; height: number; sizeKb: number;
    fieldType: string; ratioLabel: string;
    usableForSearch: boolean; usableForPMax: boolean;
    blockedReason: string | null;
  }
  const [libOpen, setLibOpen] = useState(false);
  const [libImages, setLibImages] = useState<LibraryImage[] | null>(null);
  const [libOddRatio, setLibOddRatio] = useState(0);
  const [libLoading, setLibLoading] = useState(false);
  const [libError, setLibError] = useState<string | null>(null);

  const loadImageLibrary = useCallback(async () => {
    setLibLoading(true);
    setLibError(null);
    try {
      const res = await fetch(`/api/google/assets/library?company=${company}&type=IMAGE`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Không đọc được thư viện tài sản");
      setLibImages(data.images as LibraryImage[]);
      setLibOddRatio(Number(data.oddRatioCount ?? 0));
    } catch (e) {
      setLibError(e instanceof Error ? e.message : "Lỗi không rõ");
    } finally {
      setLibLoading(false);
    }
  }, [company]);

  // ── Sitelink: tiện ích rẻ nhất mà tác dụng rõ nhất của quảng cáo Search ──
  // Không tốn thêm tiền, chỉ làm mẩu quảng cáo cao hơn và cho người đọc nhảy
  // thẳng vào đúng trang. Google KHÔNG tự gắn cho campaign mới — trước nay
  // campaign tool tạo ra đều không có cái nào.
  interface SitelinkRow {
    resourceName: string; id: string; linkText: string;
    description1: string | null; description2: string | null; finalUrl: string | null;
  }
  const [sitelinks, setSitelinks] = useState<SitelinkRow[]>([]);
  const [slOpen, setSlOpen] = useState(false);
  const [slLibrary, setSlLibrary] = useState<SitelinkRow[] | null>(null);
  const [slLoading, setSlLoading] = useState(false);
  const [slError, setSlError] = useState<string | null>(null);

  // ── Chiến lược đấu thầu ─────────────────────────────────────────────────
  // Trước bản này KHÔNG chọn được: Search luôn Tối đa chuyển đổi, PMax luôn
  // Tối đa giá trị chuyển đổi. Và khối "💰 Bidding Recommendation" ở màn
  // creative trông như gợi ý, nhưng con số Target CPA trong đó được áp thẳng
  // vào campaign thật — nay nó nằm ngay trong ô sửa được bên dưới.
  type BidStrategy = "MAXIMIZE_CONVERSIONS" | "MAXIMIZE_CONVERSION_VALUE" | "MAXIMIZE_CLICKS" | "MANUAL_CPC" | "TARGET_IMPRESSION_SHARE";
  const [bidStrategy, setBidStrategy] = useState<BidStrategy>("MAXIMIZE_CONVERSIONS");
  const [targetCpaVnd, setTargetCpaVnd] = useState<number | null>(null);
  const [targetRoasPct, setTargetRoasPct] = useState<number | null>(null);
  const [cpcCeilingVnd, setCpcCeilingVnd] = useState<number | null>(null);
  const [manualCpcVnd, setManualCpcVnd] = useState<number>(5000);
  const [isLocation, setIsLocation] = useState<"ANYWHERE_ON_PAGE" | "TOP_OF_PAGE" | "ABSOLUTE_TOP_OF_PAGE">("TOP_OF_PAGE");
  const [isPercent, setIsPercent] = useState<number>(65);

  /** Gói lại đúng hình dạng route đợi. `targetRoas` gửi dạng tỉ lệ (3 = 300%)
   *  còn giao diện nhập phần trăm — đổi ở MỘT chỗ, không để hai nơi tự quy đổi. */
  /** Dán nguyên link → tách địa chỉ trang và tham số theo dõi về đúng hai ô.
   *  Google để tham số ở `final_url_suffix` chứ không ở địa chỉ trang, để nó
   *  áp cho CẢ sitelink và tiện ích — không thì chỉ mẩu quảng cáo có UTM còn
   *  các đường bấm khác vẫn trần. */
  const applyPastedUrl = useCallback(() => {
    const r = splitTrackingUrl(pasteUrl);
    if (!r.ok) { setPasteNote(`❌ ${r.problem}`); return; }
    setUrlOverride(r.finalUrl);
    if (r.params.length > 0) setUtmSuffix(r.suffix);
    setPasteUrl("");
    setPasteNote(
      r.params.length > 0
        ? `✅ Đã tách: trang đích → ${r.finalUrl} · ${r.params.length} tham số (${r.params.map(p => p.key).join(", ")}) → ô UTM.`
          + (r.droppedHash ? ` ${r.problem}` : "")
        : `✅ Đã đặt trang đích → ${r.finalUrl}. Link không có tham số theo dõi nào nên ô UTM giữ nguyên.`);
  }, [pasteUrl]);

  const biddingPayload = useCallback(() => ({
    strategy: bidStrategy,
    targetCpaVnd: bidStrategy === "MAXIMIZE_CONVERSIONS" ? targetCpaVnd : null,
    targetRoas: bidStrategy === "MAXIMIZE_CONVERSION_VALUE" && targetRoasPct ? targetRoasPct / 100 : null,
    cpcCeilingVnd: (bidStrategy === "MAXIMIZE_CLICKS" || bidStrategy === "TARGET_IMPRESSION_SHARE") ? cpcCeilingVnd : null,
    manualCpcVnd: bidStrategy === "MANUAL_CPC" ? manualCpcVnd : null,
    impressionShareLocation: bidStrategy === "TARGET_IMPRESSION_SHARE" ? isLocation : undefined,
    impressionSharePercent: bidStrategy === "TARGET_IMPRESSION_SHARE" ? isPercent : null,
  }), [bidStrategy, targetCpaVnd, targetRoasPct, cpcCeilingVnd, manualCpcVnd, isLocation, isPercent]);

  // ── Vị trí nhắm ─────────────────────────────────────────────────────────
  // Trước bản này vị trí ghim cứng "Việt Nam cả nước" trong code. Không chọn
  // được TP.HCM hay Hà Nội — việc cơ bản nhất của chạy quảng cáo.
  interface GeoRow {
    resourceName: string; id: string; name: string; nameVi: string;
    canonicalName: string; targetType: string;
    tier: "country" | "province" | "city";
    parentName: string | null; searchKey: string;
  }
  const [geoOpen, setGeoOpen] = useState(false);
  const [geoList, setGeoList] = useState<GeoRow[] | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoQuery, setGeoQuery] = useState("");
  const [selectedGeo, setSelectedGeo] = useState<GeoRow[]>([]);
  /** PRESENCE = chỉ người ĐANG Ở trong vùng. Mặc định theo quyết định nghiệp
   *  vụ: chỉ bán trong nước. */
  const [geoTargetType, setGeoTargetType] = useState<"PRESENCE" | "PRESENCE_OR_INTEREST">("PRESENCE");

  const loadGeoTargets = useCallback(async () => {
    setGeoLoading(true);
    setGeoError(null);
    try {
      const res = await fetch(`/api/google/geo-targets?company=${company}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Không đọc được danh sách vị trí");
      setGeoList(data.locations as GeoRow[]);
    } catch (e) {
      setGeoError(e instanceof Error ? e.message : "Lỗi không rõ");
    } finally {
      setGeoLoading(false);
    }
  }, [company]);

  // ── Video YouTube (chỉ Performance Max) ─────────────────────────────────
  // Không đưa video thì Google TỰ DỰNG video từ ảnh + chữ — vẫn chạy, nhưng
  // thường rất thô và mình không kiểm soát được nội dung mang tên thương hiệu.
  // Đã đo: campaign Search KHÔNG nhận video, nên khối này chỉ hiện cho PMax.
  interface VideoRow { resourceName: string; id: string; youtubeId: string; title: string; thumbnailUrl: string; watchUrl: string }
  const [vidOpen, setVidOpen] = useState(false);
  const [vidLibrary, setVidLibrary] = useState<VideoRow[] | null>(null);
  const [vidLoading, setVidLoading] = useState(false);
  const [vidError, setVidError] = useState<string | null>(null);
  const [videos, setVideos] = useState<Array<{ resourceName?: string; youtubeId?: string; input?: string; title: string }>>([]);
  const [vidPaste, setVidPaste] = useState("");

  const loadVideoLibrary = useCallback(async () => {
    setVidLoading(true);
    setVidError(null);
    try {
      const res = await fetch(`/api/google/assets/library?company=${company}&type=VIDEO`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Không đọc được video");
      setVidLibrary(data.videos as VideoRow[]);
    } catch (e) {
      setVidError(e instanceof Error ? e.message : "Lỗi không rõ");
    } finally {
      setVidLoading(false);
    }
  }, [company]);

  const loadSitelinkLibrary = useCallback(async () => {
    setSlLoading(true);
    setSlError(null);
    try {
      const res = await fetch(`/api/google/assets/library?company=${company}&type=SITELINK`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Không đọc được sitelink");
      setSlLibrary(data.sitelinks as SitelinkRow[]);
    } catch (e) {
      setSlError(e instanceof Error ? e.message : "Lỗi không rõ");
    } finally {
      setSlLoading(false);
    }
  }, [company]);

  // ── Trạng thái duyệt chính sách của campaign VỪA TẠO ────────────────────
  // Google duyệt BẤT ĐỒNG BỘ: ngay sau khi tạo, mọi thứ đều "đang duyệt". Nên
  // khối này không phải để đọc một lần rồi thôi — nó có nút xem lại, vì kết
  // quả thật chỉ có sau vài phút tới vài giờ.
  interface PolicyRow {
    kind: string; name: string; campaign: string | null;
    approval: string; review: string;
    level: "ok" | "warn" | "bad" | "pending";
    meaning: string; topics: string[];
  }
  const [policyRows, setPolicyRows] = useState<PolicyRow[] | null>(null);
  const [policySummary, setPolicySummary] = useState<Record<string, number> | null>(null);
  /** Mục ĐÃ DUYỆT gập lại mặc định. Chúng không cần làm gì, mà lại đông nhất —
   *  trải hết ra thì phần BỊ TỪ CHỐI (thứ duy nhất cần xử lý) bị đẩy khuất
   *  sau hàng chục dòng xanh giống hệt nhau. */
  const [showApprovedPolicy, setShowApprovedPolicy] = useState(false);
  const [policyPartial, setPolicyPartial] = useState<string[] | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policyCheckedAt, setPolicyCheckedAt] = useState<string | null>(null);

  const loadPolicyStatus = useCallback(async (campaignResourceName?: string) => {
    setPolicyLoading(true);
    setPolicyError(null);
    try {
      // resource name dạng customers/123/campaigns/456 → lấy id ở cuối.
      const campaignId = campaignResourceName?.split("/").pop();
      const qs = new URLSearchParams({ company });
      if (campaignId && /^\d+$/.test(campaignId)) qs.set("campaignId", campaignId);
      const res = await fetch(`/api/google/policy-status?${qs}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Không đọc được");
      setPolicyRows(data.rows as PolicyRow[]);
      setPolicySummary(data.summary as Record<string, number>);
      setPolicyPartial(data.partial ? (data.queryErrors as string[]) : null);
      setPolicyCheckedAt(new Date().toLocaleTimeString("vi-VN"));
    } catch (e) {
      setPolicyError(e instanceof Error ? e.message : "Lỗi không rõ");
    } finally {
      setPolicyLoading(false);
    }
  }, [company]);

  // ── Kiểm trước khi tạo (validate_only) ──
  // Google kiểm bằng đúng bộ luật của lệnh thật rồi trả lỗi mà KHÔNG ghi gì lên
  // tài khoản. Đây là câu trả lời cho nỗi lo "tạo thử rồi bị chặn tài khoản":
  // không tạo gì thì không có gì để bị chặn, và bấm bao nhiêu lần cũng được.
  interface PolicyFinding { severity: "block" | "warn"; rule: string; where: string; detail: string }
  const [precheck, setPrecheck] = useState<{
    verdict: string; summary: string; caveat?: string; googleErrors?: unknown;
    checked?: Record<string, unknown>;
    campaignType?: string;
    unchecked?: string | null;
    /** Phần phép kiểm KHÔNG chạm tới được (mục tiêu chuyển đổi chỉ tồn tại sau khi tạo). */
    notCheckable?: string | null;
    policy?: { findings: PolicyFinding[]; clean: boolean };
    /** Kết quả mở thử trang đích. `ok: false` là chặn thật; `ok: true` kèm
     *  `problem` nghĩa là không kiểm được từ phía máy chủ, chưa chắc trang hỏng. */
    finalUrlCheck?: { url: string; ok: boolean; status: number | null; finalUrl?: string; problem?: string };
    /** Từ khoá vượt trần Google (>10 từ hoặc >80 ký tự) — sẽ bị BỎ khi tạo thật. */
    rejectedKeywords?: Array<{ keyword: string; problem: string }>;
  } | null>(null);
  const [prechecking, setPrechecking] = useState(false);

  const handlePrecheck = useCallback(async () => {
    if (!result || !launchCampaignName) return;
    setPrechecking(true);
    setPrecheck(null);
    try {
      const res = await fetch("/api/google/launch/precheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company, googleCreativeId: result.id, dailyBudgetVnd: dailyBudget,
          campaignName: launchCampaignName, conversionActions: selectedConvActions,
          campaignType, imageAssets: images.map(i => ({ resourceName: i.resourceName, fieldType: i.fieldType })),
          // Kiểm trước PHẢI dùng đúng vị trí/kiểu nhắm sắp tạo, không thì nó
          // kiểm một campaign khác với campaign thật.
          locations: selectedGeo.map(g => g.resourceName),
          geoTargetType,
          bidding: biddingPayload(),
        }),
      });
      const data = await res.json();
      setPrecheck(data.success
        ? data
        : { verdict: "KHÔNG KIỂM ĐƯỢC", summary: data.error ?? "Lỗi không rõ", googleErrors: data.detail });
    } catch (err) {
      setPrecheck({ verdict: "KHÔNG KIỂM ĐƯỢC", summary: err instanceof Error ? err.message : "Lỗi mạng" });
    } finally {
      setPrechecking(false);
    }
  }, [result, launchCampaignName, company, dailyBudget, selectedConvActions, images, campaignType, selectedGeo, geoTargetType, biddingPayload]);

  // ── Launch Campaign ──
  // `launchActive` = tạo xong BẬT CHẠY LUÔN. Mặc định false (tạo ở PAUSED).
  // Backend bật ở bước CUỐI, sau khi đã đặt mục tiêu chuyển đổi và gắn tài
  // sản — bật sớm là để campaign tiêu tiền trước khi biết đuổi theo cái gì.
  const handleLaunch = useCallback(async (launchActive = false) => {
    if (!result || !launchCampaignName) return;
    setLaunching(true);
    setLaunchError(null);
    setLaunchPolicy([]);
    setLaunchRawDetails(null);
    setUrlCheck(null);

    const payload = {
      company,
      googleCreativeId: result.id,
      dailyBudgetVnd: dailyBudget,
      campaignName: launchCampaignName,
      conversionActions: selectedConvActions,
      launchActive,
      imageAssets: images.map(i => ({ resourceName: i.resourceName, fieldType: i.fieldType })),
      // Chỉ Search dùng sitelink — PMax không có tiện ích này, gửi sang đó thì
      // route pmax bỏ qua, nhưng lọc ở đây cho khỏi hiểu nhầm là đã gắn.
      sitelinkAssets: sitelinks.map(s => ({ resourceName: s.resourceName, linkText: s.linkText })),
      // Rỗng = cả nước (route tự rơi về GEO_VIETNAM). Gửi mã tài nguyên chứ
      // không gửi tên — tên có bản trùng, mã thì không.
      locations: selectedGeo.map(g => g.resourceName),
      geoTargetType,
      bidding: biddingPayload(),
      // {campaign} là chỗ giữ chỗ của TOOL, thay ngay ở đây. {keyword},
      // {adgroupid}… là chỗ giữ chỗ của GOOGLE — giữ nguyên, Google tự thay.
      finalUrlOverride: urlOverride.trim(),
      finalUrlSuffix: utmSuffix.replace(/\{campaign\}/g,
        launchCampaignName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/đ/gi, "d").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()),
      // Chỉ PMax có video — đã đo, campaign Search từ chối field_type này.
      videoAssets: campaignType === "SEARCH"
        ? []
        : videos.map(v => ({ resourceName: v.resourceName, youtubeId: v.youtubeId, input: v.input })),
      // PMax không có từ khoá — thứ tương đương là Search Themes (tối đa 50).
      // Lấy từ danh sách từ khoá đã nghiên cứu, bỏ dấu ngoặc/nháy của kiểu
      // khớp vì Search Theme là cụm chữ thuần, không mang kiểu khớp.
      searchThemes: ((result.keywords?.keywords ?? []) as AnyJSON[])
        .map(k => String(k.keyword ?? "").replace(/^[["']|[\]"']$/g, "").trim())
        .filter(Boolean),
      // Đợt 7b — chỉ để ghi Sổ kinh nghiệm, không đổi logic launch.
      productKey: playbookProductKey,
      playbookEntryIds: playbookStateRef.current.keptEntryIds,
      playbookOverriddenAvoidIds: playbookStateRef.current.overriddenAvoidIds,
      extraNegativeKeywords: playbookStateRef.current.extraNegativeKeywords,
    };
    const opts: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };

    try {
      if (campaignType === "SEARCH" || campaignType === "PMAX") {
        const endpoint = campaignType === "SEARCH"
          ? "/api/google/launch/search"
          : "/api/google/launch/pmax";
        const res = await fetch(endpoint, opts);
        const data = await res.json();
        if (!res.ok) {
          // Server đã tự dọn phần tạo dở trên Google. Nếu còn sót thì người dùng
          // PHẢI biết để vào Google Ads xoá tay — nuốt dòng này đi là để lại
          // campaign rỗng nằm trong tài khoản mà không ai hay.
          if (Array.isArray(data.policyTopics)) setLaunchPolicy(data.policyTopics as PolicyHit[]);
          if (data.rawErrorDetails) setLaunchRawDetails(data.rawErrorDetails);
          if (data.finalUrlCheck) setUrlCheck(data.finalUrlCheck);
          throw new Error(
            [data.error || "Launch failed", data.rollback].filter(Boolean).join(" — "),
          );
        }
        // Wrap in LaunchSuccessScreen format
        setLaunchResult({
          success: data.success,
          message: data.message,
          results: campaignType === "SEARCH" ? { search: data } : { pmax: data },
          summary: { succeeded: data.success ? 1 : 0, total: 1 },
          // Tên vị trí lấy từ ĐÚNG những mục vừa gửi đi, không tra ngược từ mã
          // ở màn kết quả — màn đó là component riêng, không có danh sách vị
          // trí, và đoán tên từ mã là chỗ dễ nói sai.
          geoNames: selectedGeo.map(g => g.nameVi),
        });
        // Đọc trạng thái duyệt ngay. Sẽ ra "đang duyệt" — đó là câu trả lời
        // ĐÚNG ở thời điểm này, và nói ra còn hơn để màn hình trống.
        if (data.success) void loadPolicyStatus(data.campaignResourceName);
      } else {
        // BOTH — run sequentially, report combined result
        const [searchRes, pmaxRes] = await Promise.all([
          fetch("/api/google/launch/search", opts),
          fetch("/api/google/launch/pmax", opts),
        ]);
        const [searchData, pmaxData] = await Promise.all([
          searchRes.json(),
          pmaxRes.json(),
        ]);
        const succeeded = [searchData.success, pmaxData.success].filter(Boolean).length;
        // Chạy cả hai thì lỗi của từng cái không ném ra ngoài — gom lý do + kết
        // quả dọn dẹp lại để màn hình kết quả nói được cái nào hỏng và vì sao.
        const failNotes = [
          !searchData.success && [`Search: ${searchData.error ?? "thất bại"}`, searchData.rollback].filter(Boolean).join(" — "),
          !pmaxData.success && [`PMax: ${pmaxData.error ?? "thất bại"}`, pmaxData.rollback].filter(Boolean).join(" — "),
        ].filter(Boolean) as string[];
        if (failNotes.length > 0) setLaunchError(failNotes.join(" | "));
        const pol = [...(searchData.policyTopics ?? []), ...(pmaxData.policyTopics ?? [])];
        if (pol.length > 0) setLaunchPolicy(pol as PolicyHit[]);
        const raw = searchData.rawErrorDetails ?? pmaxData.rawErrorDetails;
        if (raw) setLaunchRawDetails(raw);
        const uc = searchData.finalUrlCheck ?? pmaxData.finalUrlCheck;
        if (uc) setUrlCheck(uc);
        setLaunchResult({
          success: succeeded === 2,
          partialSuccess: succeeded === 1,
          message: succeeded === 2
            ? "Tạo cả Search + PMax thành công!"
            : succeeded === 1
            ? "Tạo một phần thành công"
            : "Cả hai campaign thất bại",
          results: { search: searchData, pmax: pmaxData },
          summary: { succeeded, total: 2 },
          geoNames: selectedGeo.map(g => g.nameVi),
        });
        if (searchData.success) void loadPolicyStatus(searchData.campaignResourceName);
      }
    } catch (e: unknown) {
      setLaunchError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLaunching(false);
    }
    // `images` và `selectedConvActions` PHẢI nằm trong danh sách phụ thuộc.
    // Thiếu chúng thì hàm này giữ bản CŨ của hai giá trị đó: ảnh tải lên sau
    // lần dựng hàm gần nhất sẽ không được gửi đi. Đó chính là ca "tải logo lên
    // rồi mà Preflight vẫn báo thiếu Logo vuông 1:1" — màn hình đọc `images`
    // mới nên báo đủ, còn lệnh launch gửi danh sách cũ nên báo thiếu.
    //
    // Nguy hơn: `selectedConvActions` cũ thì hành động chuyển đổi vừa tích
    // KHÔNG được gửi, và Google sẽ đuổi theo TOÀN BỘ hành động của tài khoản.
    // Chuyện này không báo lỗi gì — campaign vẫn tạo, chỉ là tối ưu sai mục
    // tiêu, và chỉ lộ ra sau nhiều ngày tiêu tiền.
    //
    // ESLint đã cảnh báo đúng dòng này từ đầu (react-hooks/exhaustive-deps),
    // nhưng ở mức warning nên lẫn vào 7 cảnh báo khác và không ai đọc.
  }, [result, launchCampaignName, dailyBudget, company, campaignType, images, sitelinks, videos, selectedGeo, geoTargetType, biddingPayload, utmSuffix, urlOverride, selectedConvActions, loadPolicyStatus, playbookProductKey]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER — Product Selection
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Product label for display
  const productLabel = selectedProduct === "custom"
    ? (customProductName || "Tùy chỉnh")
    : (products.find(p => p.id === selectedProduct)?.label ?? selectedProduct);

  // True when product was pre-filled from Step 1 and hasn't been changed
  const isPreFilled = !!resolvedInitialId && selectedProduct === resolvedInitialId;

  if (!result) {
    return (
      <div className="space-y-6">
        {/* Product Selector — collapsed when pre-filled from Step 1 */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {isPreFilled && selectedProduct ? (
            // Already selected in Step 1 — show summary, allow changing
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-xl">
                  {products.find(p => p.id === selectedProduct)?.icon ?? "✏️"}
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sản phẩm</p>
                  <p className="text-sm font-bold text-slate-800">{productLabel}</p>
                </div>
                <CheckCircle className="h-4 w-4 text-emerald-500 ml-1" />
              </div>
              <button
                onClick={() => { setSelectedProduct(""); }}
                className="text-xs text-slate-400 underline hover:text-slate-600"
              >
                Đổi sản phẩm
              </button>
            </div>
          ) : (
            <>
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            🔴 Chọn sản phẩm muốn quảng cáo — {brandName}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map(p => {
              const isSelected = selectedProduct === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedProduct(p.id)}
                  className={cn(
                    "relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all hover:shadow-md",
                    isSelected
                      ? "border-red-500 bg-red-50/50 shadow-md ring-2 ring-red-200"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  )}
                >
                  {isSelected && (
                    <span className="absolute top-2 right-2">
                      <CheckCircle className="h-4 w-4 text-red-600" />
                    </span>
                  )}
                  <span className="text-2xl">{p.icon}</span>
                  <span className={cn("text-xs font-semibold", isSelected ? "text-red-700" : "text-slate-600")}>
                    {p.label}
                  </span>
                </button>
              );
            })}
            {/* Custom product button */}
            <button
              onClick={() => setSelectedProduct("custom")}
              className={cn(
                "relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all hover:shadow-md",
                selectedProduct === "custom"
                  ? "border-red-500 bg-red-50/50 shadow-md ring-2 ring-red-200"
                  : "border-dashed border-slate-300 hover:border-red-300 bg-white"
              )}
            >
              {selectedProduct === "custom" && (
                <span className="absolute top-2 right-2">
                  <CheckCircle className="h-4 w-4 text-red-600" />
                </span>
              )}
              <span className="text-2xl">✏️</span>
              <span className={cn("text-xs font-semibold", selectedProduct === "custom" ? "text-red-700" : "text-slate-500")}>
                Tùy chỉnh
              </span>
            </button>
          </div>

          {/* Custom product name input */}
          {selectedProduct === "custom" && (
            <div className="mt-4 rounded-xl border-2 border-red-200 bg-red-50/40 p-4 space-y-1.5">
              <label className="block text-xs font-semibold text-red-700 uppercase tracking-wide">
                ✏️ Tên sản phẩm / dịch vụ <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                autoFocus
                value={customProductName}
                onChange={e => setCustomProductName(e.target.value)}
                placeholder="Ví dụ: Vibe Hosting, Phần mềm ABC…"
                className="w-full rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
              />
              <p className="text-[11px] text-red-400">Nhập tên sản phẩm mới hoặc đang test — AI sẽ gen keywords và ad copy dựa trên tên này.</p>
            </div>
          )}
            </>
          )}
        </div>

        {/* Campaign Type — compact summary when pre-filled from Step 1 */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {initialCampaignType && isPreFilled ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Loại campaign</p>
                <p className="text-sm font-bold text-slate-800">
                  {initialCampaignType === "SEARCH" ? "🔎 Search (RSA)" : initialCampaignType === "PMAX" ? "⚡ Performance Max" : "🔎⚡ Search + PMax"}
                </p>
              </div>
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Loại campaign</h3>
              <div className="flex gap-3">
                {CAMPAIGN_TYPES.map(ct => {
                  const Icon = ct.icon;
                  const isSelected = campaignType === ct.value;
                  return (
                    <button
                      key={ct.value}
                      onClick={() => setCampaignType(ct.value as CampaignType)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border-2 px-5 py-3 text-sm font-semibold transition-all",
                        isSelected
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {ct.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button variant="outline" className="gap-1.5 text-xs" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" /> Quay lại
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!selectedProduct || (selectedProduct === "custom" && !customProductName.trim()) || loading}
            className="gap-2 bg-gradient-to-r from-red-600 to-orange-600 text-white hover:from-red-700 hover:to-orange-700 disabled:opacity-40 shadow-lg px-6 py-5"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Đang tạo...</>
            ) : (
              <><Sparkles className="h-4 w-4" /> ✨ Tạo Creative AI</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RENDER — Results (3 Tabs)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const hasRSA = result.rsa?.headlines?.length > 0;
  const hasPMax = result.pmax?.headlines?.length > 0;
  const hasKW = result.keywords?.keywords?.length > 0;

  return (
    <div className="space-y-5">
      {/* Result Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
        {hasRSA && (
          <button
            onClick={() => setResultTab("rsa")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
              resultTab === "rsa" ? "bg-white text-red-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            📝 RSA
          </button>
        )}
        {hasPMax && (
          <button
            onClick={() => setResultTab("pmax")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
              resultTab === "pmax" ? "bg-white text-red-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            ⚡ PMax
          </button>
        )}
        {hasKW && (
          <button
            onClick={() => setResultTab("keywords")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
              resultTab === "keywords" ? "bg-white text-red-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            🔍 Keywords
          </button>
        )}
      </div>

      {/* ── TAB: RSA ── */}
      {resultTab === "rsa" && hasRSA && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-red-50 to-orange-50 border-b border-slate-200 px-6 py-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              📝 Responsive Search Ad — {result.product.name}
            </h3>
            <p className="text-xs text-slate-500 mt-1">Segment: {(segment?.name ?? segment?.segmentName ?? "N/A") as string}</p>
          </div>
          <div className="p-6 space-y-5">
            {/* Headlines */}
            <div>
              <button onClick={() => toggleSection("headlines")} className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3 hover:text-slate-900">
                {expandedSections.has("headlines") ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                HEADLINES ({result.rsa.headlines.length}/15)
              </button>
              {expandedSections.has("headlines") && (
                <div className="space-y-1.5">
                  {result.rsa.headlines.map((h: AnyJSON) => (
                    <div key={h.id} className={cn(
                      "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm",
                      h.isValid ? "border-slate-200 bg-slate-50" : "border-amber-300 bg-amber-50"
                    )}>
                      <span className="text-xs font-bold text-slate-400 w-5">{h.id}.</span>
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold",
                        h.type === "KW" ? "bg-blue-100 text-blue-700" :
                        h.type === "USP" ? "bg-emerald-100 text-emerald-700" :
                        h.type === "PRICE" ? "bg-amber-100 text-amber-700" :
                        h.type === "BRAND" ? "bg-purple-100 text-purple-700" :
                        h.type === "TRUST" ? "bg-teal-100 text-teal-700" :
                        h.type === "CTA" ? "bg-rose-100 text-rose-700" :
                        "bg-slate-100 text-slate-600"
                      )}>
                        {h.type}
                      </span>
                      {editing?.field === "headlines" && editing.index === h.id - 1
                        ? editorRow("headlines", h.id - 1, 30)
                        : (<>
                          <span className="flex-1 text-slate-700">{h.text}</span>
                          <span className={cn("text-xs font-mono w-8 text-right", h.isValid ? "text-emerald-600" : "text-amber-600")}>
                            {h.charCount}
                          </span>
                          <span>{h.isValid ? "✅" : "⚠️"}</span>
                          <button onClick={() => startEdit("headlines", h.id - 1, String(h.text))}
                            className="text-slate-400 hover:text-blue-600 text-xs px-1" title="Sửa">✏️</button>
                        </>)}
                    </div>
                  ))}
                  {editError && <p className="text-xs text-red-600 mt-2">❌ {editError}</p>}
                  {(() => {
                    const valid = result.rsa.headlines.filter((h: AnyJSON) => h.isValid !== false).length;
                    const over = result.rsa.headlines.length - valid;
                    if (over === 0) return null;
                    return (
                      <p className={cn("text-xs mt-2 flex items-start gap-1 rounded px-2 py-1.5",
                        valid < 3 ? "bg-red-50 border border-red-200 text-red-700" : "bg-amber-50 border border-amber-200 text-amber-700")}>
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>
                          {over} tiêu đề vượt 30 ký tự sẽ <b>bị BỎ</b> khi launch (không phải bị chặn) — còn lại <b>{valid}</b>.
                          {valid < 3 && <> Google đòi <b>tối thiểu 3 tiêu đề</b>, quảng cáo sẽ không tạo được.</>}
                          {" "}Bấm ✏️ để sửa ngắn lại.
                        </span>
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Descriptions */}
            <div>
              <button onClick={() => toggleSection("descriptions")} className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3 hover:text-slate-900">
                {expandedSections.has("descriptions") ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                DESCRIPTIONS ({result.rsa.descriptions?.length ?? 0}/4)
              </button>
              {expandedSections.has("descriptions") && result.rsa.descriptions && (
                <div className="space-y-1.5">
                  {result.rsa.descriptions.map((d: AnyJSON) => (
                    <div key={d.id} className={cn(
                      "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm",
                      d.isValid ? "border-slate-200 bg-slate-50" : "border-amber-300 bg-amber-50"
                    )}>
                      <span className="text-xs font-bold text-slate-400 w-5">{d.id}.</span>
                      {editing?.field === "descriptions" && editing.index === d.id - 1
                        ? editorRow("descriptions", d.id - 1, 90)
                        : (<>
                          <span className="flex-1 text-slate-700">{d.text}</span>
                          <span className={cn("text-xs font-mono w-8 text-right", d.isValid ? "text-emerald-600" : "text-amber-600")}>
                            {d.charCount}
                          </span>
                          <span>{d.isValid ? "✅" : "⚠️"}</span>
                          <button onClick={() => startEdit("descriptions", d.id - 1, String(d.text))}
                            className="text-slate-400 hover:text-blue-600 text-xs px-1" title="Sửa">✏️</button>
                        </>)}
                    </div>
                  ))}
                  {(() => {
                    const valid = result.rsa.descriptions.filter((d: AnyJSON) => d.isValid !== false).length;
                    const over = result.rsa.descriptions.length - valid;
                    if (over === 0) return null;
                    return (
                      <p className={cn("text-xs mt-2 flex items-start gap-1 rounded px-2 py-1.5",
                        valid < 2 ? "bg-red-50 border border-red-200 text-red-700" : "bg-amber-50 border border-amber-200 text-amber-700")}>
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>
                          {over} mô tả vượt 90 ký tự sẽ <b>bị BỎ</b> khi launch — còn lại <b>{valid}</b>.
                          {valid < 2 && <> Google đòi <b>tối thiểu 2 mô tả</b>, quảng cáo sẽ không tạo được.</>}
                          {" "}Bấm ✏️ để sửa ngắn lại.
                        </span>
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Pin Suggestions */}
            {result.rsa.pinSuggestions && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                <p className="text-xs font-semibold text-blue-700 mb-2">💡 Pin Suggestions:</p>
                <div className="flex gap-6 text-xs text-blue-600">
                  {result.rsa.pinSuggestions.position1 && (
                    <span>Vị trí 1: Headlines {result.rsa.pinSuggestions.position1.join(", ")}</span>
                  )}
                  {result.rsa.pinSuggestions.position2 && (
                    <span>Vị trí 2: Headlines {result.rsa.pinSuggestions.position2.join(", ")}</span>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={copyAllRSA}>
                {copiedId === "rsa-all" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                {copiedId === "rsa-all" ? "Đã copy!" : "Copy tất cả"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: PMax ── */}
      {resultTab === "pmax" && hasPMax && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border-b border-slate-200 px-6 py-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              ⚡ Performance Max — Asset Groups
            </h3>
            <p className="text-xs text-slate-500 mt-1">{result.pmax.assetGroupName}</p>
          </div>
          <div className="p-6 space-y-5">
            {/* Headlines */}
            {([
              ["Headlines (30 chars)", "headlines", "pmax-h"],
              ["Long Headlines (90 chars)", "longHeadlines", "pmax-lh"],
              ["Descriptions (90 chars)", "descriptions", "pmax-d"],
            ] as const).map(([title, field, key]) => (
              <Section
                key={key}
                title={title}
                items={result.pmax[field]}
                expanded={expandedSections}
                toggle={toggleSection}
                sectionKey={key}
                onEdit={(i, cur) => startEdit(field, i, cur, "pmax")}
                editingIndex={editing?.section === "pmax" && editing.field === field ? editing.index : null}
                draft={draft}
                setDraft={setDraft}
                onSave={saveEdit}
                onCancel={() => setEditing(null)}
                saving={saving}
                editError={editError}
              />
            ))}

            {/* Image Guidance */}
            {result.pmax.imageGuidance && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-700 mb-3">🖼️ Image Guidance:</p>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(result.pmax.imageGuidance).map(([key, val]) => (
                    <div key={key} className="rounded-md bg-white border border-slate-200 p-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{key}</p>
                      <p className="text-xs text-slate-600">{val as string}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Audience Signals */}
            {result.pmax.audienceSignals && (
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-4">
                <p className="text-xs font-semibold text-purple-700 mb-3">
                  🎯 Audience Signals {company === "MBI" ? "(MBI — Kế toán / CFO / Thuế)" : "(MBC — SMB / IT / Marketing)"}:
                </p>
                <div className="space-y-2 text-xs text-purple-600">
                  {result.pmax.audienceSignals.inMarketSegments && (
                    <div>
                      <span className="font-semibold">In-market:</span>{" "}
                      {(result.pmax.audienceSignals.inMarketSegments as string[]).join(", ")}
                    </div>
                  )}
                  {result.pmax.audienceSignals.interests && (
                    <div>
                      <span className="font-semibold">Interests:</span>{" "}
                      {(result.pmax.audienceSignals.interests as string[]).join(", ")}
                    </div>
                  )}
                  {result.pmax.audienceSignals.customIntent && (
                    <div>
                      <span className="font-semibold">Custom Intent:</span>{" "}
                      {(result.pmax.audienceSignals.customIntent as string[]).join(", ")}
                    </div>
                  )}
                  {result.pmax.audienceSignals.customerList && (
                    <div>
                      <span className="font-semibold">Customer List:</span>{" "}
                      {result.pmax.audienceSignals.customerList as string}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Additional Asset Group Ideas */}
            {result.pmax.additionalAssetGroupIdeas?.length > 0 && (
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4">
                <p className="text-xs font-semibold text-indigo-700 mb-3">💡 Gợi ý thêm Asset Group:</p>
                <div className="space-y-2">
                  {(result.pmax.additionalAssetGroupIdeas as AnyJSON[]).map((idea: AnyJSON, i: number) => (
                    <div key={i} className="flex items-center gap-3 rounded-md bg-white border border-indigo-200 p-3">
                      <Plus className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700">{idea.theme}</p>
                        <p className="text-[10px] text-slate-500 truncate">{idea.angle} — {idea.targetPainPoint}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Keywords ── */}
      {resultTab === "keywords" && hasKW && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                🔍 Keyword Research — {result.product.name}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={measureVolumes} disabled={measuring}
                title="Hỏi Google Keyword Planner lượng tìm kiếm thật — miễn phí, không tính vào hạn mức Meta">
                {measuring ? <><Loader2 className="h-3 w-3 animate-spin" /> Đang hỏi Google...</> : <>📊 Đo lượng tìm thật</>}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportKeywordsCSV}>
                <Download className="h-3 w-3" /> Export CSV
              </Button>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <GooglePlaybookPanel
              company={company}
              productKey={playbookProductKey}
              resultId={result?.id ?? null}
              existingKeywords={(result.keywords?.keywords ?? []) as AnyJSON[]}
              onAddKeyword={addKeyword}
              negatives={(result.keywords?.negativeKeywords ?? []) as AnyJSON[]}
              onAddNegative={(item) => setResult((prev: AnyJSON) => {
                if (!prev) return prev;
                const list = (prev.keywords?.negativeKeywords ?? []) as AnyJSON[];
                return { ...prev, keywords: { ...prev.keywords, negativeKeywords: [...list, item] } };
              })}
              onRemoveNegativeByEntry={(entryId, keyword) => setResult((prev: AnyJSON) => {
                if (!prev) return prev;
                const list = (prev.keywords?.negativeKeywords ?? []) as AnyJSON[];
                return { ...prev, keywords: { ...prev.keywords, negativeKeywords: list.filter((n) => !(n.entryId === entryId && n.keyword === keyword)) } };
              })}
              landingUrl={urlOverride.trim() || null}
              onUseLandingUrl={setUrlOverride}
              onStateChange={(s) => { playbookStateRef.current = s; }}
            />
            {volumeError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">❌ {volumeError}</p>
            )}
            {!volumes && !measuring && (
              // Nói thẳng nhãn HIGH/MED/LOW là gì. Màu đỏ/vàng rất dễ bị đọc
              // thành "nhiều người tìm", trong khi nó chỉ là AI tự chấm.
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                ℹ️ Nhãn <b>HIGH/MED/LOW</b> là <b>mức độ ý định mua do AI tự chấm</b> — không phải lượng tìm kiếm.
                Bấm <b>📊 Đo lượng tìm thật</b> để hỏi chính Google xem mỗi tháng có bao nhiêu người gõ.
              </p>
            )}
            {kwNote && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">⚠️ {kwNote}</p>}
            {kwSuggestions.length > 0 && (() => {
              // GỘP BIẾN THỂ DẤU. Google trả "vps giá rẻ" / "vps giá rẽ" /
              // "vps gia re" thành ba dòng riêng với SỐ LƯỢT TÌM BẰNG NHAU —
              // dấu hiệu chúng là cùng một nhu cầu. Thêm cả ba là tự đấu giá
              // với chính mình, và báo cáo bị chia nhỏ. Google đã tự khớp
              // biến thể chính tả với PHRASE/BROAD nên gõ đúng một lần là đủ.
              const groups = groupKeywordVariants(kwSuggestions);
              const existing = (result.keywords?.keywords ?? []) as AnyJSON[];
              const negs = (result.keywords?.negativeKeywords ?? []) as AnyJSON[];
              const shown = showAllSuggestions ? groups : groups.slice(0, 40);

              return (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                  <p className="text-xs font-bold text-emerald-800">
                    💡 Google gợi ý {groups.length} cụm từ khoá kèm lượt tìm thật
                  </p>
                  <p className="text-[10px] text-emerald-700/80 mb-2">
                    Gộp từ {kwSuggestions.length} dòng Google trả về — các cách viết khác dấu của cùng một cụm
                    đã nhập làm một. Xếp theo lượt tìm giảm dần. Bấm để thêm (loại khớp <b>PHRASE</b>, đổi được sau).
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {shown.map((g, i) => {
                      const added = alreadyHasKeyword(
                        existing.map(k => ({ keyword: String(k.keyword) })), g.canonical.keyword);
                      // Từ khoá bị chính từ phủ định của mình chặn: Google áp
                      // phủ định TRƯỚC khi khớp, nên thêm vào là từ khoá chết
                      // ngay — im lặng, không lỗi nào báo.
                      const blockedBy = negs.find(n => {
                        const nk = normalizeKeywordKey(String(n.keyword)).split(" ").filter(Boolean);
                        const kw = normalizeKeywordKey(g.canonical.keyword).split(" ").filter(Boolean);
                        if (nk.length === 0 || kw.length < nk.length) return false;
                        for (let st = 0; st + nk.length <= kw.length; st++) {
                          let hit = true;
                          for (let j = 0; j < nk.length; j++) if (kw[st + j] !== nk[j]) { hit = false; break; }
                          if (hit) return true;
                        }
                        return false;
                      });

                      return (
                        <button key={i} disabled={kwBusy || added || !!blockedBy}
                          onClick={() => void addKeyword(g.canonical.keyword, "PHRASE")}
                          title={blockedBy
                            ? `Không thêm được: từ khoá phủ định "${blockedBy.keyword}" sẽ chặn cụm này. Bỏ cụm phủ định đó trước nếu vẫn muốn dùng.`
                            : added ? "Đã có trong bộ từ khoá"
                            : g.variants.length > 0
                              ? `Thêm "${g.canonical.keyword}". Gộp ${g.variants.length} cách viết khác: ${g.variants.map(v => v.keyword).join(" · ")}`
                              : `Thêm "${g.canonical.keyword}" vào bộ từ khoá`}
                          className={cn("rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                            blockedBy ? "bg-amber-50 border-amber-300 text-amber-800 cursor-not-allowed"
                            : added ? "bg-slate-100 border-slate-200 text-slate-400 cursor-default"
                            : "bg-white border-emerald-200 hover:bg-emerald-100 hover:border-emerald-400 disabled:opacity-50")}>
                          {blockedBy ? "⚠" : added ? "✓" : "+"} {g.canonical.keyword}
                          <b className={cn("ml-1", added ? "text-slate-400" : "text-emerald-700")}>
                            {(g.volume ?? 0).toLocaleString("vi-VN")}/th
                          </b>
                          {g.variants.length > 0 && (
                            <span className="ml-1 text-slate-400">+{g.variants.length} cách viết</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {groups.length > 40 && (
                    <button onClick={() => setShowAllSuggestions(v => !v)}
                      className="mt-2 text-[10px] font-semibold text-emerald-800 underline hover:text-emerald-900">
                      {showAllSuggestions ? "Thu gọn" : `Xem thêm ${groups.length - 40} cụm nữa`}
                    </button>
                  )}

                  <p className="text-[10px] text-emerald-700/70 mt-1.5">
                    <span className="text-amber-700">⚠</span> = đang bị từ khoá phủ định của bạn chặn ·
                    <span className="text-slate-500"> ✓</span> = đã có trong bộ từ khoá
                  </p>
                </div>
              );
            })()}
            {/* Thêm từ khoá tay */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-bold text-slate-700">➕ Thêm từ khoá</p>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  value={newKw}
                  onChange={e => setNewKw(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newKw.trim()) {
                      void addKeyword(newKw.trim(), newKwType);
                      setNewKw("");
                    }
                  }}
                  placeholder="VD: đăng ký tên miền .com giá rẻ"
                  className="flex-1 min-w-[220px] rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-blue-400"
                />
                <div className="flex rounded border border-slate-300 overflow-hidden">
                  {(["EXACT", "PHRASE", "BROAD"] as const).map(t => (
                    <button key={t} onClick={() => setNewKwType(t)}
                      className={cn("px-2.5 py-1.5 text-[11px] font-semibold",
                        newKwType === t ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100")}>
                      {t}
                    </button>
                  ))}
                </div>
                <Button size="sm" className="h-8 text-xs" disabled={kwBusy || !newKw.trim()}
                  onClick={() => { void addKeyword(newKw.trim(), newKwType); setNewKw(""); }}>
                  Thêm
                </Button>
              </div>
              {kwError && <p className="text-[11px] text-red-600">❌ {kwError}</p>}
              {kwWarning && <p className="text-[11px] text-amber-700">⚠️ {kwWarning}</p>}
              <p className="text-[10px] text-slate-400">
                <b>EXACT</b> khớp đúng cụm — chính xác nhất, ít lượt hiện nhất.
                <b className="ml-2">PHRASE</b> khớp cụm kèm biến thể gần.
                <b className="ml-2">BROAD</b> rộng nhất, dễ hiện cho truy vấn không liên quan — nên giữ dưới 20%.
              </p>
            </div>

            {/* Intent Filter */}
            <div className="flex gap-2">
              {["ALL", "HIGH", "MED", "LOW"].map(level => (
                <button
                  key={level}
                  onClick={() => setIntentFilter(level)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold transition-all border",
                    intentFilter === level
                      ? level === "HIGH" ? "bg-red-100 border-red-300 text-red-700"
                      : level === "MED" ? "bg-amber-100 border-amber-300 text-amber-700"
                      : level === "LOW" ? "bg-slate-100 border-slate-300 text-slate-600"
                      : "bg-blue-100 border-blue-300 text-blue-700"
                      : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                  )}
                >
                  {level === "ALL" ? "Tất cả" : level === "HIGH" ? "🔴 HIGH" : level === "MED" ? "🟡 MED" : "⚪ LOW"}
                </button>
              ))}
            </div>

            {/* Keywords by Ad Group */}
            {result.keywords.adGroupSuggestions && (
              <div className="space-y-4">
                {(result.keywords.adGroupSuggestions as AnyJSON[]).map((group: AnyJSON, gi: number) => (
                  <div key={gi} className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                      <p className="text-xs font-bold text-slate-700">{group.name}</p>
                      <p className="text-[10px] text-slate-500">{group.theme}</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {(result.keywords.keywords as AnyJSON[])
                        .filter((k: AnyJSON) => {
                          if (intentFilter !== "ALL" && k.intentLevel !== intentFilter) return false;
                          return (group.keywords as string[])?.some((gk: string) =>
                            k.keyword.toLowerCase().includes(gk.toLowerCase()) || gk.toLowerCase().includes(k.keyword.toLowerCase())
                          ) ?? true;
                        })
                        .map((kw: AnyJSON, ki: number) => (
                          <div key={ki} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-slate-50">
                            <span className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-bold",
                              kw.matchType === "EXACT" ? "bg-emerald-100 text-emerald-700" :
                              kw.matchType === "PHRASE" ? "bg-blue-100 text-blue-700" :
                              "bg-slate-100 text-slate-600"
                            )}>
                              {kw.matchType}
                            </span>
                            <span className="flex-1 text-slate-700 font-medium">{kw.keyword}</span>
                            {volumeBadge(String(kw.keyword))}
                            <span className={cn(
                              "text-[10px] font-bold",
                              kw.intentLevel === "HIGH" ? "text-red-500" :
                              kw.intentLevel === "MED" ? "text-amber-500" : "text-slate-400"
                            )} title="Mức độ ý định mua do AI tự chấm — không phải lượng tìm kiếm">
                              {kw.intentLevel}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Standalone keywords list (filtered) */}
            {!result.keywords.adGroupSuggestions && (
              <div className="space-y-1">
                {(result.keywords.keywords as AnyJSON[])
                  .filter((k: AnyJSON) => intentFilter === "ALL" || k.intentLevel === intentFilter)
                  .map((kw: AnyJSON) => {
                    // Vị trí THẬT trong mảng gốc, không phải vị trí sau khi lọc —
                    // lọc rồi xoá theo chỉ số hiển thị sẽ xoá nhầm dòng khác.
                    const realIndex = (result.keywords.keywords as AnyJSON[]).indexOf(kw);
                    return (
                    <div key={realIndex} className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-2 text-xs">
                      <div className="flex rounded overflow-hidden border border-slate-200">
                        {(["EXACT", "PHRASE", "BROAD"] as const).map(t => (
                          <button key={t} disabled={kwBusy || kw.matchType === t}
                            onClick={() => void patchKeywords({ action: "setMatchType", index: realIndex, matchType: t })}
                            title={`Đổi sang ${t}`}
                            className={cn("px-1.5 py-0.5 text-[9px] font-bold transition-colors",
                              kw.matchType === t
                                ? (t === "EXACT" ? "bg-emerald-100 text-emerald-700"
                                  : t === "PHRASE" ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700")
                                : "bg-white text-slate-300 hover:bg-slate-100 hover:text-slate-600")}>
                            {t[0]}
                          </button>
                        ))}
                      </div>
                      <span className="flex-1 text-slate-700">
                        {kw.keyword}
                        {kw.addedBy === "user" && <span className="ml-1.5 text-[9px] text-slate-400">(thêm tay)</span>}
                      </span>
                      {volumeBadge(String(kw.keyword))}
                      <span className="text-[10px] font-bold text-slate-400" title="Mức độ ý định mua do AI tự chấm — không phải lượng tìm kiếm">{kw.intentLevel}</span>
                      <button disabled={kwBusy}
                        onClick={() => void patchKeywords({ action: "remove", index: realIndex })}
                        title="Xoá từ khoá này" className="text-slate-300 hover:text-red-600 px-1">✕</button>
                    </div>
                    );
                  })}
              </div>
            )}

            {/* Negative Keywords */}
            {result.keywords.negativeKeywords && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <p className="text-xs font-semibold text-red-700 mb-1">
                  🚫 Từ khoá phủ định ({(result.keywords.negativeKeywords as AnyJSON[]).length}) — chặn lượt tìm không liên quan
                </p>
                <p className="text-[10px] text-red-600/80 mb-2">
                  Gắn ở <b>cấp chiến dịch</b>, áp cho mọi nhóm quảng cáo. Bỏ cái nào bạn thấy không đúng —
                  ví dụ đang chạy khuyến mãi tặng gói dùng thử thì nên bỏ nhóm &quot;miễn phí&quot;.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(result.keywords.negativeKeywords as AnyJSON[]).map((nk: AnyJSON, i: number) => (
                    <span key={i}
                      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                        nk.source === "ai" ? "bg-violet-100 text-violet-800"
                        : nk.source === "manual" ? "bg-slate-200 text-slate-800"
                        : "bg-red-100 text-red-700")}>
                      {nk.source === "ai" && <span title="AI sinh theo phân khúc bạn chọn">✨</span>}
                      {nk.keyword}
                      <button
                        onClick={() => setResult((prev: AnyJSON) => {
                          if (!prev) return prev;
                          const next = { ...prev, keywords: { ...prev.keywords,
                            negativeKeywords: (prev.keywords.negativeKeywords as AnyJSON[]).filter((_, j) => j !== i) } };
                          return next;
                        })}
                        className="opacity-50 hover:opacity-100 hover:text-red-900" title="Bỏ cụm này">✕</button>
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  <span className="text-violet-700">✨</span> = AI sinh theo phân khúc · còn lại là bộ chặn mặc định của ngành.
                </p>

                {/* Cụm bị LOẠI vì sẽ chặn chính từ khoá của mình. Google áp từ
                    phủ định TRƯỚC khi khớp từ khoá, nên để lọt là giết chết
                    đúng từ khoá đó — im lặng, không lỗi, không cảnh báo. */}
                {Array.isArray(result.keywords.negativeConflicts) && (result.keywords.negativeConflicts as AnyJSON[]).length > 0 && (
                  <div className="mt-2 rounded bg-amber-50 border border-amber-200 px-2 py-1.5">
                    <p className="text-[10px] font-semibold text-amber-900">
                      Đã tự bỏ {(result.keywords.negativeConflicts as AnyJSON[]).length} cụm vì chúng sẽ chặn chính từ khoá của bạn:
                    </p>
                    <ul className="mt-0.5 space-y-0.5 text-[10px] text-amber-800">
                      {(result.keywords.negativeConflicts as AnyJSON[]).map((cf: AnyJSON, i: number) => (
                        <li key={i}>· &quot;{cf.negative}&quot; sẽ chặn: {(cf.blocks as string[]).join(" · ")}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Chưa có từ phủ định nào — nói thẳng, vì đây đúng là trạng thái
                của MỌI chiến dịch tool tạo ra trước bản này. */}
            {!result.keywords.negativeKeywords && (
              <div className="rounded-lg bg-amber-50 border border-amber-300 p-3">
                <p className="text-xs font-semibold text-amber-900">⚠️ Chiến dịch này chưa có từ khoá phủ định nào</p>
                <p className="text-[11px] text-amber-800 mt-1">
                  Với match type BROAD và PHRASE, tiền dễ chảy vào &quot;tuyển dụng&quot;, &quot;miễn phí&quot;,
                  &quot;crack&quot;, &quot;cách tự làm&quot;… Sinh lại nội dung để tool bổ sung bộ chặn,
                  hoặc tự thêm trong Google Ads sau khi tạo.
                </p>
              </div>
            )}

            {/* Bidding Recommendation */}
            {result.keywords.biddingRecommendation && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                <p className="text-xs font-semibold text-emerald-700 mb-2">💰 Bidding Recommendation:</p>
                <div className="text-xs text-emerald-600 space-y-1">
                  <p><span className="font-semibold">Strategy:</span> {result.keywords.biddingRecommendation.strategy}</p>
                  <p><span className="font-semibold">Target CPA:</span> {new Intl.NumberFormat("vi-VN").format(result.keywords.biddingRecommendation.targetCPA ?? 0)}₫</p>
                  <p><span className="font-semibold">Lý do:</span> {result.keywords.biddingRecommendation.reasoning}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Launch Result Screen ── */}
      {launchResult && (
        <LaunchSuccessScreen
          data={launchResult}
          company={company}
          pmax={result.pmax}
          onNewCampaign={() => { setResult(null); setLaunchResult(null); setSelectedProduct(""); }}
          onBack={onBack}
        />
      )}

      {/* ── Trạng thái duyệt chính sách của campaign vừa tạo ──
          Đặt ngay dưới màn hình kết quả launch. Google duyệt BẤT ĐỒNG BỘ nên
          lần đọc đầu gần như luôn ra "đang duyệt" — khối này có nút xem lại
          thay vì giả vờ đã có kết quả. */}
      {launchResult && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-bold text-slate-800">🛡️ Google duyệt chính sách</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Phán quyết <b>thật</b> đọc trực tiếp từ tài khoản — cho cả quảng cáo lẫn ảnh.
                {policyCheckedAt && <span className="text-slate-400"> · đọc lúc {policyCheckedAt}</span>}
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={policyLoading}
              onClick={() => void loadPolicyStatus(
                (launchResult as AnyJSON)?.results?.search?.campaignResourceName,
              )}>
              {policyLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Đang đọc...</> : <>🔄 Xem lại</>}
            </Button>
          </div>

          {policyError && <p className="text-[11px] text-red-600">❌ {policyError}</p>}
          {policyPartial && (
            <p className="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] text-red-800">
              ⚠️ <b>Đọc CHƯA đủ</b> — {policyPartial.join(" · ")}. Kết quả bên dưới không đầy đủ.
            </p>
          )}

          {policySummary && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {policySummary.bad > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-bold">❌ {policySummary.bad} bị từ chối</span>}
              {policySummary.warn > 0 && <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-bold">⚠️ {policySummary.warn} bị giới hạn</span>}
              {policySummary.pending > 0 && <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 font-bold">⏳ {policySummary.pending} đang duyệt</span>}
              {policySummary.ok > 0 && <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 font-bold">✅ {policySummary.ok} được duyệt</span>}
            </div>
          )}

          {policyRows && policyRows.length === 0 && (
            <p className="text-[11px] text-slate-500">
              Chưa có mục nào để đọc. Google thường mất vài phút mới ghi nhận quảng cáo mới — bấm <b>Xem lại</b> sau ít phút.
            </p>
          )}

          {policyRows && policyRows.length > 0 && (() => {
            // Thứ tự theo MỨC CẦN XỬ LÝ, không theo thứ tự Google trả về:
            // bị từ chối → bị giới hạn → đang duyệt → đã duyệt.
            const rank = { bad: 0, warn: 1, pending: 2, ok: 3 } as Record<string, number>;
            const sorted = [...policyRows].sort((a, b) => (rank[a.level] ?? 9) - (rank[b.level] ?? 9));
            const needAction = sorted.filter(r => r.level !== "ok");
            const approved = sorted.filter(r => r.level === "ok");
            const shown = showApprovedPolicy ? sorted : needAction;
            return (
            <div className="space-y-1.5 max-h-[26rem] overflow-y-auto">
              {needAction.length === 0 && approved.length > 0 && !showApprovedPolicy && (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
                  ✅ <b>Không có mục nào bị từ chối hay giới hạn.</b> Cả {approved.length} mục đều được duyệt và đang chạy bình thường.
                </p>
              )}
              {shown.map((r, i) => (
                <div key={i} className={cn("rounded-lg border text-[11px]",
                  // Mục đã duyệt gọn còn MỘT hàng: chúng không cần làm gì, mà
                  // lại đông nhất. Mục cần xử lý giữ nguyên đầy đủ.
                  r.level === "ok" ? "px-3 py-1" : "px-3 py-2",
                  r.level === "bad" ? "border-red-200 bg-red-50"
                  : r.level === "warn" ? "border-amber-200 bg-amber-50"
                  : r.level === "pending" ? "border-slate-200 bg-slate-50"
                  : "border-emerald-200 bg-emerald-50/50")}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">{r.kind}</span>
                    <span className="font-semibold text-slate-800 truncate max-w-[22rem]">{r.name}</span>
                    {r.campaign && <span className="text-slate-400 truncate max-w-[16rem]">· {r.campaign}</span>}
                    <span className="ml-auto font-mono text-[10px] text-slate-500">{r.approval}</span>
                  </div>
                  {/* "Được duyệt — chạy bình thường" lặp lại đúng thứ nhãn
                      APPROVED bên phải đã nói. Bỏ cho gọn. */}
                  {r.level !== "ok" && <p className="mt-0.5 text-slate-700">{r.meaning}</p>}
                  {r.topics.length > 0 && (
                    // Mã chính sách của Google là tiếng Anh và không dịch được
                    // an toàn — in NGUYÊN VĂN để tra được trên trang trợ giúp
                    // của Google, thay vì diễn giải sai đi.
                    <p className="mt-1 text-[10px] text-slate-500">
                      Google nêu lý do: <b className="font-mono">{r.topics.join(", ")}</b>
                      {" "}— tra đúng mã này trong Trung tâm trợ giúp Google Ads để biết cách sửa.
                    </p>
                  )}
                </div>
              ))}

              {/* Nút gập — mục đã duyệt không cần làm gì, nhưng phải mở xem
                  được, không thì thành giấu dữ liệu. */}
              {approved.length > 0 && (
                <button onClick={() => setShowApprovedPolicy(v => !v)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                  {showApprovedPolicy
                    ? `▲ Thu gọn ${approved.length} mục đã duyệt`
                    : `▼ Xem ${approved.length} mục đã duyệt (không cần làm gì)`}
                </button>
              )}
            </div>
            );
          })()}

          <p className="text-[10px] text-slate-400 leading-snug">
            Google duyệt <b>bất đồng bộ</b>: quảng cáo mới tạo sẽ ở trạng thái đang duyệt vài giờ, có khi tới 1 ngày làm việc.
            Quảng cáo bị từ chối <b>chỉ khiến riêng nó không chạy</b> — tài khoản không bị làm sao.
            <b> Bị giới hạn</b> nghĩa là vẫn chạy nhưng không hiện ở một số vùng/ngữ cảnh, dễ bị đọc nhầm thành ổn.
          </p>
        </div>
      )}

      {/* ── Launch Section (only when no launch result yet) ── */}
      {!launchResult && (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Rocket className="h-4 w-4 text-red-500" /> Launch Google Campaign
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Tên Campaign</label>
            <input
              type="text"
              value={launchCampaignName}
              onChange={e => setLaunchCampaignName(e.target.value)}
              placeholder={`${result.product.name} — ${company}`}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Budget / ngày (₫)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="number"
                value={dailyBudget}
                onChange={e => setDailyBudget(Number(e.target.value))}
                step={100000}
                min={100000}
                className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm text-slate-700 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {new Intl.NumberFormat("vi-VN").format(dailyBudget)}₫/ngày
            </p>
          </div>
        </div>

        {/* ── Mục tiêu tối ưu ── */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <div>
            <p className="text-xs font-bold text-slate-700">🎯 Google tối ưu cho hành động nào</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Không chọn ⇒ Google đuổi theo <b>toàn bộ</b> hành động đang bật ở cấp tài khoản
              (đơn hàng, xem trang liên hệ, gọi điện… trộn làm một).
            </p>
          </div>

          {convError && <p className="text-[11px] text-red-600">❌ {convError}</p>}
          {convMetricsError && (
            <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] text-amber-900">
              ⚠️ Không đọc được số chuyển đổi 30 ngày ({convMetricsError}). Các mục hiện <b>&quot;chưa đo được&quot;</b>,
              không phải <b>bằng không</b> — và gợi ý <b>NÊN CHỌN</b> bên dưới chỉ dựa vào loại hành động,
              chưa được dữ liệu xác nhận.
            </p>
          )}
          {!convError && convActions.length === 0 && (
            <p className="text-[11px] text-slate-400">Đang đọc từ Google Ads…</p>
          )}

          <div className="space-y-1">
            {convActions.map(a => {
              const on = selectedConvActions.includes(a.resourceName);
              // 0 chuyển đổi trong 30 ngày = tín hiệu đang chết. Bảo Google tối
              // ưu theo thứ chưa từng xảy ra thì nó không có gì để học.
              // null = CHƯA ĐO ĐƯỢC, khác hẳn 0 = đo rồi và bằng không.
              const dead = a.conversions30d === 0;
              const unmeasured = a.conversions30d === null;
              return (
                <label key={a.resourceName}
                  className={cn("flex items-start gap-2 rounded-md border px-2 py-1.5 cursor-pointer transition-colors",
                    on ? "border-red-300 bg-red-50/50" : "border-slate-200 hover:bg-slate-50")}>
                  <input type="checkbox" checked={on} className="mt-0.5"
                    onChange={() => setSelectedConvActions(prev =>
                      prev.includes(a.resourceName) ? prev.filter(x => x !== a.resourceName) : [...prev, a.resourceName])} />
                  <span className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-slate-800">{a.name}</span>
                    {a.recommended && <span className="ml-1.5 text-[9px] font-bold text-emerald-700 bg-emerald-100 rounded px-1 py-0.5">NÊN CHỌN</span>}
                    {!a.countsAsConversion && <span className="ml-1.5 text-[9px] font-bold text-slate-500 bg-slate-100 rounded px-1 py-0.5">không tính vào Conversions</span>}
                    {dead && <span className="ml-1.5 text-[9px] font-bold text-amber-800 bg-amber-100 rounded px-1 py-0.5">0 chuyển đổi 30 ngày</span>}
                    {unmeasured && <span className="ml-1.5 text-[9px] font-bold text-slate-600 bg-slate-100 rounded px-1 py-0.5">chưa đo được</span>}
                    <span className="block text-[10px] text-slate-400">
                      {a.categoryVi ?? a.category} · {a.origin} ·{" "}
                      {a.conversions30d === null ? "chưa đo được số chuyển đổi" : `${a.conversions30d.toLocaleString("vi-VN")} chuyển đổi`}
                      {(a.conversionValue30d ?? 0) > 0 && ` · ₫${a.conversionValue30d!.toLocaleString("vi-VN")}`}
                      {a.conversions30d !== null && " (30 ngày)"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {selectedConvActions.length === 0 && convActions.length > 0 && (
            <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-800">
              ⚠️ Chưa chọn mục tiêu nào — Google sẽ tối ưu theo <b>mọi</b> hành động đang bật. Campaign vẫn tạo được, nhưng bạn sẽ không biết nó đang đuổi theo cái gì.
            </p>
          )}
        </div>

        {/* ── Tiện ích hình ảnh ── */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <div>
            <p className="text-xs font-bold text-slate-700">🖼️ Tiện ích hình ảnh (không bắt buộc)</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Quảng cáo Search không có ảnh bên trong — ảnh này hiện <b>bên cạnh</b> quảng cáo, chủ yếu trên di động.
              Google nhận <b>ngang 1.91:1</b> (1200×628) · <b>vuông 1:1</b> (1200×1200) · <b>dọc 4:5</b> (960×1200), tối đa 5MB.
              Riêng <b>ảnh dọc chỉ chạy ở Performance Max</b> — campaign Search nhận nhưng không bao giờ hiển thị.
            </p>
          </div>

          {/* Mục đích PHẢI chọn tay: logo vuông và ảnh marketing vuông cùng
              là 1:1, đoán hộ là đoán sai một nửa số lần. */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Loại:</span>
            <div className="flex rounded border border-slate-200 overflow-hidden">
              {([["MARKETING", "Ảnh quảng cáo"], ["LOGO", "Logo"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setImgPurpose(v)}
                  className={cn("px-2.5 py-1 text-[11px] font-semibold",
                    imgPurpose === v ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-slate-400">
              {imgPurpose === "LOGO" ? "vuông 1:1 (≥128×128) hoặc ngang 4:1 (≥512×128)" : "ngang 1.91:1 · vuông 1:1 · dọc 4:5"}
            </span>
          </div>

          <label className={cn(
            "flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-3 text-xs cursor-pointer transition-colors",
            uploading ? "border-slate-200 text-slate-400" : "border-slate-300 text-slate-600 hover:border-blue-400 hover:bg-blue-50/40",
          )}>
            <input type="file" accept="image/png,image/jpeg" multiple className="hidden" disabled={uploading}
              onChange={e => {
                // Tải TUẦN TỰ, không song song: mỗi ảnh cần biết số ảnh hiện có
                // để kiểm trần 20, bắn cùng lúc thì cả loạt cùng đọc một con số cũ.
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void (async () => { for (const f of files) await handleImagePick(f); })();
              }} />
            {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải lên Google...</> : <>➕ Tải ảnh mới từ máy (PNG/JPG)</>}
          </label>

          {/* Chọn lại ảnh ĐÃ CÓ trong tài khoản — không phải tải lên lần nữa. */}
          <button
            onClick={() => { setLibOpen(o => !o); if (!libImages && !libLoading) void loadImageLibrary(); }}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50/40">
            {libLoading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang đọc thư viện tài khoản {company}...</>
              : <>📚 Chọn ảnh có sẵn trong tài khoản {company} {libOpen ? "▲" : "▼"}</>}
          </button>

          {libOpen && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 space-y-1.5">
              {libError && <p className="text-[11px] text-red-600">❌ {libError}</p>}
              {libImages && libImages.length === 0 && (
                <p className="text-[11px] text-slate-500">Tài khoản chưa có ảnh nào dùng được cho quảng cáo.</p>
              )}
              {libImages && libImages.length > 0 && (
                <>
                  <p className="text-[10px] text-slate-500">
                    {libImages.length} ảnh trong thư viện tài khoản. Ảnh mờ là loại campaign đang tạo
                    ({campaignType === "PMAX" ? "Performance Max" : campaignType === "BOTH" ? "Search + PMax" : "Search"}) không dùng được — bấm vào để xem lý do.
                  </p>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {libImages.map(img => {
                      const picked = images.some(i => i.resourceName === img.resourceName);
                      const usable = campaignType === "SEARCH" ? img.usableForSearch : img.usableForPMax;
                      return (
                        <button
                          key={img.resourceName}
                          disabled={picked || images.length >= 20}
                          title={img.blockedReason ?? undefined}
                          onClick={() => {
                            if (!usable) { setImageError(img.blockedReason ?? "Ảnh này không dùng được cho loại campaign đang tạo."); return; }
                            setImageError(null);
                            setImages(prev => [...prev, {
                              resourceName: img.resourceName, name: img.name, fieldType: img.fieldType,
                              ratioLabel: img.ratioLabel, sizeKb: img.sizeKb, warning: img.blockedReason, cropNote: null,
                            }]);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2 rounded border px-2 py-1.5 text-left text-[11px] transition-colors",
                            picked ? "border-emerald-300 bg-emerald-50 cursor-default"
                              : usable ? "border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40"
                                : "border-slate-200 bg-white opacity-50 hover:opacity-100",
                          )}>
                          <span className={picked ? "text-emerald-600" : "text-slate-300"}>{picked ? "✓" : "＋"}</span>
                          <span className="flex-1 truncate text-slate-700">{img.name}</span>
                          <span className="text-slate-400 whitespace-nowrap">{img.width}×{img.height} · {img.sizeKb}KB</span>
                          {!usable && <span className="text-amber-600">⚠️</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {/* Ảnh tỉ lệ lạ KHÔNG hiện được — nhưng phải nói là có, không thì
                  người dùng nhớ mình có tấm đó lại tưởng tool đọc thiếu. */}
              {libImages && libOddRatio > 0 && (
                <p className="text-[10px] text-slate-400 border-t border-slate-200 pt-1.5">
                  Còn <b>{libOddRatio}</b> ảnh nữa trong tài khoản không hiện ở đây vì tỉ lệ không khớp khuôn nào Google nhận
                  (ngang 1.91:1 · vuông 1:1 · dọc 4:5 · logo 1:1 / 4:1). Ảnh trong thư viện <b>không cắt lại được</b> —
                  muốn dùng thì tải lên từ máy, tool sẽ tự cắt.
                </p>
              )}
            </div>
          )}

          {imageError && <p className="text-[11px] text-red-600">❌ {imageError}</p>}
          <p className="text-[10px] text-slate-400">
            Đã chọn <b className={images.length >= 20 ? "text-red-600" : "text-slate-600"}>{images.length}/20</b> ảnh — Google giới hạn 20 ảnh mỗi campaign.
          </p>

          {/* PMax KHÔNG PHỤC VỤ ĐƯỢC nếu thiếu logo + ảnh ngang + ảnh vuông.
              Google không chặn lúc tạo — nó chỉ lặng lẽ không hiển thị. Phải
              nói TRƯỚC khi bấm Launch, không thì người dùng tưởng đã xong. */}
          {(campaignType === "PMAX" || campaignType === "BOTH") && (() => {
            const have = new Set(images.map(i => i.fieldType));
            const need = [
              ["LOGO", "Logo vuông 1:1"],
              ["MARKETING_IMAGE", "Ảnh ngang 1.91:1"],
              ["SQUARE_MARKETING_IMAGE", "Ảnh vuông 1:1"],
            ] as const;
            const missing = need.filter(([ft]) => !have.has(ft));
            if (missing.length === 0) {
              return (
                <p className="rounded bg-emerald-50 border border-emerald-200 px-2 py-1.5 text-[11px] text-emerald-800">
                  ✅ Đủ <b>logo + ảnh ngang + ảnh vuông</b> — nhóm tài sản PMax đủ điều kiện phục vụ.
                </p>
              );
            }
            return (
              <p className="rounded bg-red-50 border border-red-300 px-2 py-1.5 text-[11px] text-red-800">
                ⛔ <b>PMax sẽ KHÔNG hiển thị lượt nào</b> nếu thiếu: {missing.map(([, l]) => l).join(" · ")}.
                Google không chặn lúc tạo — nó chỉ <b>lặng lẽ không phục vụ</b>. Bổ sung trước khi Launch.
              </p>
            );
          })()}

          {images.length > 0 && (
            <div className="space-y-1">
              {images.map((img, i) => (
                <div key={img.resourceName} className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-[11px]">
                  <span className="text-emerald-600">✓</span>
                  <span className="flex-1 truncate text-slate-700">{img.name}</span>
                  <span className="text-slate-400">{img.ratioLabel} · {img.sizeKb}KB</span>
                  {img.warning && <span className="text-amber-600" title={img.warning}>⚠️</span>}
                  {img.cropNote && <span className="text-sky-600 text-[10px]" title={img.cropNote}>✂️ {img.cropNote}</span>}
                  <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                    className="text-slate-300 hover:text-red-600 px-1" title="Bỏ khỏi campaign này">✕</button>
                </div>
              ))}
              {/* Xoá khỏi danh sách chỉ là không gắn vào campaign — ảnh vẫn nằm
                  trong thư viện tài sản của tài khoản. Nói rõ để khỏi tưởng đã xoá hẳn. */}
              <p className="text-[10px] text-slate-400">
                Bỏ ở đây chỉ là không gắn vào campaign này; ảnh vẫn còn trong thư viện tài sản của tài khoản Google Ads.
              </p>
            </div>
          )}
        </div>

        {/* ── Video YouTube (PMax) ───────────────────────────────────────── */}
        {campaignType !== "SEARCH" && (
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div>
              <h4 className="text-xs font-bold text-slate-700">🎬 Video YouTube</h4>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Performance Max chạy cả trên YouTube. <b>Không đưa video thì Google tự dựng một cái</b> từ
                ảnh và chữ của bạn — vẫn chạy, nhưng thường rất thô và bạn không kiểm soát được nội dung
                mang tên thương hiệu mình. Chỉ Performance Max dùng được, quảng cáo Tìm kiếm không có video.
              </p>
            </div>

            <button
              onClick={() => { setVidOpen(o => !o); if (!vidLibrary && !vidLoading) void loadVideoLibrary(); }}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50/40">
              {vidLoading
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang đọc video của tài khoản {company}...</>
                : <>📺 Chọn video có sẵn trong tài khoản {company} {vidOpen ? "▲" : "▼"}</>}
            </button>

            {vidOpen && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 space-y-1.5">
                {vidError && <p className="text-[11px] text-red-600">❌ {vidError}</p>}
                {vidLibrary && vidLibrary.length === 0 && (
                  <p className="text-[11px] text-slate-500">Tài khoản chưa có video nào. Dán link YouTube bên dưới.</p>
                )}
                {vidLibrary && vidLibrary.length > 0 && (
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {vidLibrary.map(v => {
                      const picked = videos.some(x => x.resourceName === v.resourceName || x.youtubeId === v.youtubeId);
                      return (
                        <button key={v.resourceName}
                          onClick={() => setVideos(prev => picked
                            ? prev.filter(x => x.resourceName !== v.resourceName && x.youtubeId !== v.youtubeId)
                            : [...prev, { resourceName: v.resourceName, youtubeId: v.youtubeId, title: v.title }])}
                          className={cn("w-full flex items-center gap-2 rounded border px-2 py-1.5 text-left text-[11px] transition-colors",
                            picked ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40")}>
                          <span className={picked ? "text-emerald-600" : "text-slate-300"}>{picked ? "✓" : "＋"}</span>
                          {/* Ảnh thu nhỏ dựng thẳng từ mã video — không tốn lượt gọi API nào.
                              Dùng <img> chứ không next/image: ảnh nằm trên miền của
                              YouTube, cho qua bộ tối ưu của Next chỉ thêm một chặng
                              mạng cho một tấm 320px. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={v.thumbnailUrl} alt="" className="h-9 w-16 shrink-0 rounded object-cover bg-slate-200" />
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-slate-700 truncate">{v.title}</span>
                            <span className="block text-slate-400 truncate">{v.youtubeId}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Dán link — nhận mọi dạng người ta hay copy */}
            <div className="flex items-center gap-1.5">
              <input
                value={vidPaste}
                onChange={e => setVidPaste(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== "Enter" || !vidPaste.trim()) return;
                  e.preventDefault();
                  setVideos(prev => [...prev, { input: vidPaste.trim(), title: vidPaste.trim() }]);
                  setVidPaste("");
                }}
                placeholder="hoặc dán link YouTube rồi Enter (watch / youtu.be / shorts / embed)"
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-[11px]" />
              <button
                onClick={() => { if (!vidPaste.trim()) return; setVideos(prev => [...prev, { input: vidPaste.trim(), title: vidPaste.trim() }]); setVidPaste(""); }}
                disabled={!vidPaste.trim()}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                Thêm
              </button>
            </div>

            {videos.length > 0 && (
              <div className="space-y-1">
                {videos.map((v, i) => (
                  <div key={`${v.resourceName ?? v.input}-${i}`}
                    className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-[11px]">
                    <span className="text-emerald-600">✓</span>
                    <span className="flex-1 truncate text-slate-700">{v.title}</span>
                    {v.resourceName
                      ? <span className="text-[9px] font-bold text-slate-500 bg-slate-100 rounded px-1 py-0.5">có sẵn</span>
                      : <span className="text-[9px] font-bold text-blue-700 bg-blue-100 rounded px-1 py-0.5">link mới</span>}
                    <button onClick={() => setVideos(prev => prev.filter((_, j) => j !== i))}
                      className="text-slate-300 hover:text-red-600 px-1" title="Bỏ khỏi campaign này">✕</button>
                  </div>
                ))}
                <p className="text-[10px] text-slate-400">
                  Link mới sẽ được tạo thành tài sản video trong tài khoản lúc bấm tạo campaign.
                  Link không đọc được mã sẽ bị bỏ kèm lý do, không làm hỏng cả lượt tạo.
                </p>
              </div>
            )}

            {videos.length === 0 && (
              <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-800">
                ⚠️ Chưa chọn video — <b>Google sẽ tự dựng một video</b> từ ảnh và chữ của bạn để chạy trên YouTube.
                Nó không hỏi trước, và kết quả thường không dùng để quảng bá thương hiệu được.
              </p>
            )}
          </div>
        )}

        {/* ── Sitelink ──────────────────────────────────────────────────────
            Google KHÔNG tự gắn sitelink cho campaign mới. Campaign tool tạo ra
            trước nay đều trống phần này, nên phải vào Google Ads gắn tay sau
            mỗi lần tạo. Tài khoản đã có sẵn sitelink dựng đầy đủ — dùng lại. */}
        {/* Sitelink dùng được cho CẢ Search lẫn PMax — đã đo, PMax gắn ở cấp
            campaign (nhóm tài sản từ chối field_type này). */}
        {true && (
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div>
              <h4 className="text-xs font-bold text-slate-700">🔗 Sitelink (liên kết trang)</h4>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Các đường dẫn phụ hiện <b>ngay dưới</b> quảng cáo (&quot;Bảng giá&quot;, &quot;Đăng ký tên miền&quot;…).
                <b> Không tốn thêm tiền</b> — chỉ làm mẩu quảng cáo cao hơn và cho người đọc nhảy thẳng vào đúng trang
                thay vì rơi vào trang chủ. Google thường chỉ hiển thị khi campaign có <b>từ 4 cái trở lên</b>, tối đa 20.
              </p>
            </div>

            <button
              onClick={() => { setSlOpen(o => !o); if (!slLibrary && !slLoading) void loadSitelinkLibrary(); }}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50/40">
              {slLoading
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang đọc sitelink của tài khoản {company}...</>
                : <>📚 Chọn sitelink có sẵn trong tài khoản {company} {slOpen ? "▲" : "▼"}</>}
            </button>

            {slOpen && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 space-y-1.5">
                {slError && <p className="text-[11px] text-red-600">❌ {slError}</p>}
                {slLibrary && slLibrary.length === 0 && (
                  <p className="text-[11px] text-slate-500">
                    Tài khoản chưa có sitelink nào. Dựng trong Google Ads ở mục Tài sản → Liên kết trang, rồi quay lại đây chọn.
                  </p>
                )}
                {slLibrary && slLibrary.length > 0 && (
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {slLibrary.map(sl => {
                      const picked = sitelinks.some(s => s.resourceName === sl.resourceName);
                      return (
                        <button
                          key={sl.resourceName}
                          disabled={!picked && sitelinks.length >= 20}
                          onClick={() => setSitelinks(prev => picked
                            ? prev.filter(s => s.resourceName !== sl.resourceName)
                            : [...prev, sl])}
                          className={cn(
                            "w-full flex items-start gap-2 rounded border px-2 py-1.5 text-left text-[11px] transition-colors",
                            picked ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40",
                          )}>
                          <span className={cn("mt-0.5", picked ? "text-emerald-600" : "text-slate-300")}>{picked ? "✓" : "＋"}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-slate-700 truncate">{sl.linkText}</span>
                            {(sl.description1 || sl.description2) && (
                              <span className="block text-slate-500 truncate">
                                {[sl.description1, sl.description2].filter(Boolean).join(" · ")}
                              </span>
                            )}
                            {/* URL đích PHẢI hiện: sitelink trỏ sai trang là tiền
                                đổ vào đúng chỗ không bán được gì. */}
                            <span className="block text-slate-400 truncate">{sl.finalUrl ?? "(không có URL — Google sẽ từ chối)"}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {sitelinks.length > 0 && (
              <>
                <p className="text-[10px] text-slate-400">
                  Đã chọn <b className="text-slate-600">{sitelinks.length}/20</b> sitelink.
                </p>
                <div className="flex flex-wrap gap-1">
                  {sitelinks.map(sl => (
                    <span key={sl.resourceName}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">
                      {sl.linkText}
                      <button onClick={() => setSitelinks(prev => prev.filter(s => s.resourceName !== sl.resourceName))}
                        className="text-emerald-400 hover:text-red-600" title="Bỏ khỏi campaign này">✕</button>
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* Cảnh báo NGƯỠNG HIỂN THỊ, không phải ngưỡng kỹ thuật: 2 cái vẫn
                tạo được, chỉ là gần như không bao giờ thấy chúng ngoài SERP. */}
            {sitelinks.length > 0 && sitelinks.length < 4 && (
              <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-800">
                ⚠️ Mới có <b>{sitelinks.length}</b> sitelink. Google thường <b>chỉ hiển thị</b> tiện ích này khi campaign
                có từ <b>4</b> cái trở lên — chọn thêm {4 - sitelinks.length} cái nữa.
              </p>
            )}
            {sitelinks.length === 0 && (
              <p className="rounded bg-slate-50 border border-slate-200 px-2 py-1.5 text-[11px] text-slate-600">
                Chưa chọn sitelink nào — campaign vẫn tạo được, nhưng quảng cáo sẽ hiện <b>trơ một dòng</b>,
                không có liên kết phụ. Đây là thứ dễ thêm nhất mà ảnh hưởng rõ nhất tới tỉ lệ bấm.
              </p>
            )}
          </div>
        )}

        {/* ── Nhắm mục tiêu ────────────────────────────────────────────────
            Trước bản này màn hình KHÔNG hề nói campaign sẽ nhắm vào đâu. Vị trí
            và ngôn ngữ đặt ngầm trong code, hỏng thì chỉ ghi console.warn —
            người dùng không có cách nào biết campaign của mình có được nhắm
            vị trí hay không, mà campaign thiếu vị trí được Google phục vụ ra
            TOÀN THẾ GIỚI. */}
        <div className="border border-slate-200 rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-bold text-slate-700">🎯 Nhắm mục tiêu</h4>

          {/* Vị trí ────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">Vị trí</span>
              <span className="text-[10px] text-slate-400">
                {selectedGeo.length === 0 ? "mặc định: cả nước" : `đã chọn ${selectedGeo.length}`}
              </span>
            </div>

            {selectedGeo.length === 0 ? (
              <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-700">
                🇻🇳 Việt Nam (cả nước)
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {selectedGeo.map(g => (
                  <span key={g.resourceName}
                    className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-900">
                    {g.nameVi}
                    <button onClick={() => setSelectedGeo(prev => prev.filter(x => x.resourceName !== g.resourceName))}
                      className="text-blue-400 hover:text-red-600" title="Bỏ vị trí này">✕</button>
                  </span>
                ))}
                <button onClick={() => setSelectedGeo([])}
                  className="text-[10px] text-slate-400 hover:text-slate-700 underline px-1">bỏ hết, quay về cả nước</button>
              </div>
            )}

            <button
              onClick={() => { setGeoOpen(o => !o); if (!geoList && !geoLoading) void loadGeoTargets(); }}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50/40">
              {geoLoading
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Đang đọc danh sách vị trí...</>
                : <>📍 Chọn tỉnh / thành phố cụ thể {geoOpen ? "▲" : "▼"}</>}
            </button>

            {geoError && <p className="text-[11px] text-red-600">❌ {geoError}</p>}

            {geoOpen && geoList && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 space-y-1.5">
                <input
                  value={geoQuery}
                  onChange={e => setGeoQuery(e.target.value)}
                  placeholder="Gõ tên: Hà Nội, TPHCM, Đà Nẵng, Sài Gòn..."
                  className="w-full rounded border border-slate-300 px-2 py-1 text-[11px]"
                />
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {(() => {
                    // Chuẩn hoá y hệt server (bỏ dấu + bỏ khoảng trắng) rồi so
                    // với searchKey server đã dựng sẵn — gõ "TPHCM" hay
                    // "Sài Gòn" đều ra "Ho Chi Minh".
                    const q = geoQuery
                      .normalize("NFD").replace(/[̀-ͯ]/g, "")
                      .replace(/đ/gi, "d").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
                    const rows = q ? geoList.filter(g => g.searchKey.includes(q)) : geoList;
                    if (rows.length === 0) {
                      return <p className="text-[11px] text-slate-500 px-1 py-2">Không tìm thấy. Thử gõ không dấu, ví dụ &quot;ha noi&quot;.</p>;
                    }
                    return rows.slice(0, 120).map(g => {
                      const picked = selectedGeo.some(x => x.resourceName === g.resourceName);
                      return (
                        <button
                          key={g.resourceName}
                          onClick={() => setSelectedGeo(prev => picked
                            ? prev.filter(x => x.resourceName !== g.resourceName)
                            : [...prev, g])}
                          className={cn(
                            "w-full flex items-center gap-2 rounded border px-2 py-1 text-left text-[11px] transition-colors",
                            picked ? "border-blue-300 bg-blue-50" : "border-transparent bg-white hover:border-blue-300",
                          )}>
                          <span className={picked ? "text-blue-600" : "text-slate-300"}>{picked ? "✓" : "＋"}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-slate-700 truncate">{g.nameVi}</span>
                            {/* canonical_name là thứ DUY NHẤT phân biệt hai mục
                                trùng tên ("Hanoi,Ha Noi,Vietnam" vs
                                "Ha Noi,Vietnam") — giấu đi là để người dùng
                                chọn nhầm vùng hẹp mà không biết. */}
                            <span className="block text-slate-400 truncate">{g.canonicalName}</span>
                          </span>
                          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold",
                            g.tier === "country" ? "bg-slate-200 text-slate-700"
                              : g.tier === "province" ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800")}>
                            {g.tier === "country" ? "Cả nước" : g.tier === "province" ? "Tỉnh/TP" : "Vùng hẹp hơn"}
                          </span>
                        </button>
                      );
                    });
                  })()}
                </div>
                <p className="text-[10px] text-slate-400 border-t border-slate-200 pt-1.5">
                  Sau sáp nhập 2025, Google giữ <b>cả hai</b> bộ đơn vị. <b className="text-emerald-700">Tỉnh/TP</b> là
                  đơn vị cấp tỉnh đầy đủ; <b className="text-amber-700">Vùng hẹp hơn</b> chỉ là một phần bên trong nó
                  (vd &quot;Hà Nội (nội thành)&quot;). Hai cái tên gần giống nhau nhưng vùng phủ khác hẳn — đọc dòng
                  xám bên dưới tên để chắc.
                </p>
              </div>
            )}
          </div>

          {/* Kiểu nhắm ──────────────────────────────────────────────────── */}
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500">Nhắm ai trong vùng đó</span>
            <div className="flex rounded border border-slate-200 overflow-hidden">
              {([
                ["PRESENCE", "Chỉ người trong vùng"],
                ["PRESENCE_OR_INTEREST", "Thêm người ngoài quan tâm"],
              ] as const).map(([v, label]) => (
                <button key={v} onClick={() => setGeoTargetType(v)}
                  className={cn("flex-1 px-2 py-1 text-[11px] font-semibold",
                    geoTargetType === v ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400">
              {geoTargetType === "PRESENCE"
                ? "Chỉ người đang ở trong vùng đã chọn. Đây là lựa chọn đúng khi bán trong nước."
                : "⚠️ Gồm cả người Ở NƯỚC NGOÀI đang tìm về Việt Nam — đây là lý do quen thuộc của chuyện \"sao quảng cáo hiện ở nước ngoài\"."}
            </p>
          </div>

          {/* Ngôn ngữ ───────────────────────────────────────────────────── */}
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500">Ngôn ngữ</span>
            <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-700">
              Tiếng Việt + Tiếng Anh
            </p>
            <p className="text-[10px] text-slate-400">
              Nhắm cả tiếng Anh có chủ đích: nhiều khách kỹ thuật (hosting, tên miền, máy chủ) để Chrome/Google
              ở tiếng Anh — bỏ nhóm này là tự cắt mất khách thật.
            </p>
          </div>
        </div>

        {/* ── Chiến lược đấu thầu ───────────────────────────────────────── */}
        {(() => {
          // PMax CHỈ nhận hai chiến lược chuyển đổi — đã đo: nó từ chối
          // manual_cpc. Không hiện lựa chọn mà Google không chạy được.
          const pmaxOnly = campaignType === "PMAX";
          const STRATS: Array<{ k: BidStrategy; label: string; what: string; when: string; pmax: boolean }> = [
            { k: "MAXIMIZE_CONVERSIONS", label: "Tối đa chuyển đổi", pmax: true,
              what: "Tiêu hết ngân sách để lấy NHIỀU chuyển đổi nhất, không quan tâm mỗi cái giá bao nhiêu.",
              when: "Mặc định an toàn cho campaign mới." },
            { k: "MAXIMIZE_CONVERSION_VALUE", label: "Tối đa giá trị chuyển đổi", pmax: true,
              what: "Đuổi theo TỔNG TIỀN của chuyển đổi — ưu tiên đơn to hơn đơn nhiều.",
              when: "Chỉ dùng khi hành động chuyển đổi có gửi giá trị tiền về Google." },
            { k: "MAXIMIZE_CLICKS", label: "Tối đa lượt bấm", pmax: false,
              what: "Mua nhiều lượt bấm nhất. KHÔNG nhìn chuyển đổi.",
              when: "Kéo lưu lượng lúc mới mở, hoặc khi chưa đo được chuyển đổi." },
            { k: "MANUAL_CPC", label: "CPC thủ công", pmax: false,
              what: "Bạn tự đặt giá thầu, Google không tự chỉnh.",
              when: "Kiểm soát chặt vài ngày đầu — đổi lại phải theo dõi tay hằng ngày." },
            { k: "TARGET_IMPRESSION_SHARE", label: "Tỉ lệ hiển thị mục tiêu", pmax: false,
              what: "Đấu thầu để quảng cáo XUẤT HIỆN ở vị trí và tần suất bạn chọn.",
              when: "Giữ thương hiệu luôn hiện. Đuổi theo độ hiển thị, KHÔNG đuổi theo đơn hàng." },
          ];
          const avail = STRATS.filter(s => !pmaxOnly || s.pmax);
          const cur = avail.find(s => s.k === bidStrategy) ?? avail[0];
          // Đổi loại campaign sang PMax khi đang chọn chiến lược PMax không có
          // → đưa về mặc định thay vì gửi một chiến lược Google sẽ từ chối.
          if (pmaxOnly && !avail.some(s => s.k === bidStrategy)) {
            setTimeout(() => setBidStrategy("MAXIMIZE_CONVERSION_VALUE"), 0);
          }
          const aiCpa = result?.keywords?.biddingRecommendation?.targetCPA as number | undefined;
          const num = (v: string) => { const n = Number(v.replace(/[^\d]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

          return (
            <div className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div>
                <h4 className="text-xs font-bold text-slate-700">💰 Chiến lược đấu thầu</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Quyết định Google tiêu tiền để đuổi theo cái gì. Chọn sai thì tiền đi lệch ngay từ ngày đầu.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-1">
                {avail.map(s => (
                  <button key={s.k} onClick={() => setBidStrategy(s.k)}
                    className={cn("rounded border px-2 py-1.5 text-left transition-colors",
                      bidStrategy === s.k ? "border-red-300 bg-red-50/60" : "border-slate-200 bg-white hover:bg-slate-50")}>
                    <span className="flex items-center gap-1.5">
                      <span className={bidStrategy === s.k ? "text-red-600" : "text-slate-300"}>{bidStrategy === s.k ? "●" : "○"}</span>
                      <span className="text-[11px] font-bold text-slate-800">{s.label}</span>
                    </span>
                    <span className="block text-[10px] text-slate-500 pl-4">{s.what}</span>
                  </button>
                ))}
              </div>

              <p className="rounded bg-slate-50 border border-slate-200 px-2 py-1.5 text-[10px] text-slate-600">
                <b>Khi nào dùng:</b> {cur.when}
              </p>

              {/* Tham số riêng của từng chiến lược */}
              {bidStrategy === "MAXIMIZE_CONVERSIONS" && (
                <div className="space-y-1">
                  <label className="block text-[10px] text-slate-500">Target CPA — giá bạn chịu được cho mỗi chuyển đổi (để trống = Google tự chạy)</label>
                  <div className="flex items-center gap-2">
                    <input inputMode="numeric" value={targetCpaVnd?.toLocaleString("vi-VN") ?? ""}
                      onChange={e => setTargetCpaVnd(num(e.target.value))}
                      placeholder="để trống cho Google tự chạy"
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-[11px]" />
                    <span className="text-[11px] text-slate-500">₫</span>
                  </div>
                  {/* Con số AI đề xuất TRƯỚC ĐÂY bị áp ngầm. Nay là một nút bấm
                      tuỳ ý, và nói rõ nó từ đâu ra. */}
                  {aiCpa ? (
                    <button onClick={() => setTargetCpaVnd(aiCpa)}
                      className="text-[10px] text-blue-700 underline hover:text-blue-900">
                      Dùng số AI đề xuất: {aiCpa.toLocaleString("vi-VN")}₫
                    </button>
                  ) : null}
                  {targetCpaVnd != null && targetCpaVnd > dailyBudget && (
                    <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-900">
                      ⚠️ Target CPA <b>cao hơn ngân sách ngày</b> ({dailyBudget.toLocaleString("vi-VN")}₫) — mỗi ngày chưa đủ tiền cho một chuyển đổi, Google sẽ rất khó tiêu hết ngân sách.
                    </p>
                  )}
                </div>
              )}

              {bidStrategy === "MAXIMIZE_CONVERSION_VALUE" && (
                <div className="space-y-1">
                  <label className="block text-[10px] text-slate-500">Target ROAS — thu về bao nhiêu % trên mỗi đồng chi (để trống = Google tự chạy)</label>
                  <div className="flex items-center gap-2">
                    <input inputMode="numeric" value={targetRoasPct ?? ""}
                      onChange={e => setTargetRoasPct(num(e.target.value))}
                      placeholder="vd 300 = thu 3đ trên mỗi 1đ chi"
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-[11px]" />
                    <span className="text-[11px] text-slate-500">%</span>
                  </div>
                  {targetRoasPct != null && targetRoasPct < 100 && (
                    <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-900">
                      ⚠️ Dưới 100% nghĩa là <b>thu về ít hơn số tiền bỏ ra</b>. Cố ý thì được, nhưng nói trước để khỏi gõ nhầm.
                    </p>
                  )}
                  {targetRoasPct != null && targetRoasPct > 2000 && (
                    <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-900">
                      ⚠️ {targetRoasPct}% là rất cao — Google sẽ chỉ đấu ở những lượt gần như chắc thắng và thường tiêu được rất ít ngân sách.
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400">
                    Chiến lược này chỉ có nghĩa khi hành động chuyển đổi <b>gửi giá trị tiền</b> về Google.
                    Kiểm ở khối &quot;Google tối ưu cho hành động nào&quot; — mục nào có số tiền thì mới dùng được.
                  </p>
                </div>
              )}

              {(bidStrategy === "MAXIMIZE_CLICKS" || bidStrategy === "TARGET_IMPRESSION_SHARE") && (
                <div className="space-y-1">
                  <label className="block text-[10px] text-slate-500">Trần CPC — giá tối đa cho một lượt bấm</label>
                  <div className="flex items-center gap-2">
                    <input inputMode="numeric" value={cpcCeilingVnd?.toLocaleString("vi-VN") ?? ""}
                      onChange={e => setCpcCeilingVnd(num(e.target.value))}
                      placeholder="vd 20.000"
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-[11px]" />
                    <span className="text-[11px] text-slate-500">₫</span>
                  </div>
                  {cpcCeilingVnd == null && (
                    <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-900">
                      ⚠️ Chưa đặt trần — Google được tự do trả giá cao cho một lượt bấm. Đặt trần là cách rẻ nhất để giữ giá.
                    </p>
                  )}
                </div>
              )}

              {bidStrategy === "TARGET_IMPRESSION_SHARE" && (
                <div className="space-y-1">
                  <label className="block text-[10px] text-slate-500">Muốn hiện ở đâu, với tần suất bao nhiêu</label>
                  <div className="flex rounded border border-slate-200 overflow-hidden">
                    {([
                      ["ABSOLUTE_TOP_OF_PAGE", "Vị trí đầu tiên"],
                      ["TOP_OF_PAGE", "Đầu trang"],
                      ["ANYWHERE_ON_PAGE", "Bất kỳ đâu"],
                    ] as const).map(([v, l]) => (
                      <button key={v} onClick={() => setIsLocation(v)}
                        className={cn("flex-1 px-2 py-1 text-[10px] font-semibold",
                          isLocation === v ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>{l}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="range" min={10} max={100} step={5} value={isPercent}
                      onChange={e => setIsPercent(Number(e.target.value))} className="flex-1" />
                    <span className="text-[11px] font-bold text-slate-700 w-12 text-right">{isPercent}%</span>
                  </div>
                  {isPercent >= 90 && (
                    <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-900">
                      ⚠️ {isPercent}% là gần như luôn muốn xuất hiện — càng cao thì giá mỗi lượt bấm càng đắt rất nhanh.
                    </p>
                  )}
                </div>
              )}

              {bidStrategy === "MANUAL_CPC" && (
                <div className="space-y-1">
                  <label className="block text-[10px] text-slate-500">Giá thầu CPC ở cấp nhóm quảng cáo</label>
                  <div className="flex items-center gap-2">
                    <input inputMode="numeric" value={manualCpcVnd.toLocaleString("vi-VN")}
                      onChange={e => setManualCpcVnd(num(e.target.value) ?? 5000)}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-[11px]" />
                    <span className="text-[11px] text-slate-500">₫</span>
                  </div>
                  <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-900">
                    ⚠️ Không có tự động hoá nào chạy hộ — phải tự theo dõi và chỉnh giá thầu hằng ngày.
                  </p>
                </div>
              )}

              {/* Campaign mới + mục tiêu cứng = Google không có gì để học. */}
              {((bidStrategy === "MAXIMIZE_CONVERSIONS" && targetCpaVnd != null) ||
                (bidStrategy === "MAXIMIZE_CONVERSION_VALUE" && targetRoasPct != null)) && (
                <p className="rounded bg-slate-50 border border-slate-200 px-2 py-1.5 text-[10px] text-slate-600">
                  Campaign mới chưa có lịch sử chuyển đổi mà đặt mục tiêu cứng (CPA/ROAS) thì Google
                  chưa có gì để học và thường <b>tiêu rất ít hoặc gần như không chạy</b>. Cân nhắc để trống
                  vài ngày đầu rồi hãy siết.
                </p>
              )}
            </div>
          );
        })()}

        {/* ── Trang đích + UTM ─────────────────────────────────────────────── */}
        <div className="border border-slate-200 rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-bold text-slate-700">🔗 Trang đích</h4>

          {/* Dán nguyên link quen thuộc — tool tự đặt đúng chỗ. */}
          <div className="flex items-center gap-1.5">
            <input
              value={pasteUrl}
              onChange={e => setPasteUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyPastedUrl(); } }}
              placeholder="Dán nguyên link có sẵn UTM rồi Enter — tool tự tách"
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-[11px]" />
            <button onClick={applyPastedUrl} disabled={!pasteUrl.trim()}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              Tách
            </button>
          </div>
          {pasteNote && (
            <p className="rounded bg-blue-50 border border-blue-200 px-2 py-1.5 text-[10px] text-blue-900">{pasteNote}</p>
          )}

          <div>
            <label className="block text-[10px] text-slate-500">Địa chỉ trang (để trống = dùng link mặc định của sản phẩm)</label>
            <input
              value={urlOverride}
              onChange={e => setUrlOverride(e.target.value)}
              placeholder={(result.product?.finalUrl as string) || "link mặc định của sản phẩm"}
              className="w-full rounded border border-slate-300 px-2 py-1 text-[11px]" />
          </div>

          <h4 className="text-xs font-bold text-slate-700 pt-1">🔖 Tham số UTM</h4>
          <input
            value={utmSuffix}
            onChange={e => setUtmSuffix(e.target.value)}
            placeholder="để trống nếu không muốn gắn"
            className="w-full rounded border border-slate-300 px-2 py-1 text-[11px] font-mono" />
          <p className="text-[10px] text-slate-400">
            Google tự ghép chuỗi này vào <b>mọi link</b> của chiến dịch — quảng cáo, sitelink, tiện ích —
            nên không phải sửa từng chỗ. <code>{"{campaign}"}</code> tool thay bằng tên chiến dịch;
            <code> {"{keyword}"}</code> Google tự thay bằng từ khoá đã khớp.
          </p>
          {!utmSuffix.trim() && (
            <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] text-amber-900">
              ⚠️ Không gắn UTM thì <b>GA4 không tách được</b> lưu lượng của chiến dịch này với các chiến dịch khác,
              và mọi báo cáo quy kết doanh thu sẽ lệch.
            </p>
          )}
        </div>

        {/* ── Tiêu đề có chứa từ khoá chưa ──────────────────────────────────
            Google chấm "Ad strength" dựa vào việc tiêu đề có LẶP LẠI từ khoá
            của nhóm quảng cáo hay không — phép so là so chữ, rất thô. Prompt
            đã dặn AI làm việc này, nhưng dặn không bằng ĐO: đếm thật rồi hiện
            ra, để biết trước khi tạo thay vì đọc "Poor" trên Google Ads. */}
        {(() => {
          const heads = (result.rsa?.headlines ?? []) as AnyJSON[];
          const kws = (result.keywords?.keywords ?? []) as AnyJSON[];
          if (heads.length === 0 || kws.length === 0) return null;
          const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/gi, "d").replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
          const hNorm = heads.map(h => norm(String(h.text ?? "")));
          const inHeads = (k: string) => { const kn = norm(k); return kn.length > 2 && hNorm.some(h => h.includes(kn)); };

          // ĐO THEO TỪ KHOÁ PHỔ BIẾN, không phải "bất kỳ từ khoá nào".
          //
          // Bản trước đếm số tiêu đề có chứa MỘT từ khoá bất kỳ và báo "10/15
          // đạt", trong khi Google vẫn để trống ô "Include popular keywords in
          // your headlines". Đo trên campaign thật ngày 19/09: trong 10 tiêu
          // đề được tính có cả "làm website khách sạn" (10 lượt/tháng) và
          // "tạo web homestay" (0 lượt), còn "mua domain" (1.900 lượt — hạng 3)
          // thì KHÔNG tiêu đề nào chứa. Google nhìn từ khoá PHỔ BIẾN; đếm đều
          // tay mọi từ khoá là đo sai thứ cần đo.
          const ranked = kws
            .map(k => ({ kw: String(k.keyword ?? ""), vol: volumes?.get(String(k.keyword ?? "").toLowerCase())?.avgMonthlySearches ?? null }))
            .filter(x => x.kw)
            .sort((a, b) => (b.vol ?? -1) - (a.vol ?? -1));
          const measured = ranked.some(x => x.vol != null);
          const TOP_N = 5;
          const top = ranked.slice(0, TOP_N);
          const topMissing = top.filter(x => !inHeads(x.kw));
          const covered = ranked.filter(x => inHeads(x.kw)).map(x => x.kw);
          const headsWithKw = hNorm.filter(h =>
            kws.some(k => { const kn = norm(String(k.keyword ?? "")); return kn.length > 2 && h.includes(kn); })).length;
          // Chưa đo được lượt tìm thì quay về phép đếm thô, và NÓI RÕ là thô.
          const weak = measured ? topMissing.length > 0 : headsWithKw < 6;
          return (
            <div className={cn("rounded-lg border px-3 py-2 text-[11px]",
              weak ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50/60")}>
              <p className={cn("font-semibold", weak ? "text-amber-900" : "text-emerald-900")}>
                {weak ? "⚠️" : "✅"} Tiêu đề chứa từ khoá: <b>{headsWithKw}/{heads.length}</b> tiêu đề ·
                phủ <b>{covered.length}/{kws.length}</b> từ khoá
                {measured && <> · <b>{TOP_N - topMissing.length}/{Math.min(TOP_N, top.length)}</b> từ khoá nhiều lượt tìm nhất</>}
              </p>

              {measured && topMissing.length > 0 && (
                <div className="mt-1 rounded bg-white/70 border border-amber-200 px-2 py-1.5">
                  <p className="text-amber-900 font-semibold">
                    Thiếu {topMissing.length} từ khoá <b>nhiều lượt tìm nhất</b> — đây chính là thứ Google đòi ở
                    <i> &quot;Include popular keywords in your headlines&quot;</i>:
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {topMissing.map((x, i) => (
                      <li key={i} className="text-amber-800">
                        · <b>{x.kw}</b> — {x.vol?.toLocaleString("vi-VN") ?? "?"} lượt tìm/tháng
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[10px] text-slate-600">
                    Sửa vài tiêu đề ở phần nội dung phía trên cho chứa nguyên văn các cụm này. Đổi một tiêu đề
                    ít giá trị (cụm 0 lượt tìm) thành cụm nhiều lượt tìm là cách nhanh nhất.
                  </p>
                </div>
              )}

              {measured && topMissing.length === 0 && (
                <p className="mt-0.5 text-emerald-800">
                  Đã phủ đủ {Math.min(TOP_N, top.length)} từ khoá nhiều lượt tìm nhất. Ad strength của Google
                  cập nhật <b>sau vài phút tới vài giờ</b> — con số trong trình soạn thảo lúc đầu chỉ là ước lượng tạm.
                </p>
              )}

              {!measured && (
                <p className="mt-0.5 text-amber-800">
                  Chưa đo được lượt tìm nên đây chỉ là <b>phép đếm thô</b>: đếm tiêu đề có chứa bất kỳ từ khoá nào.
                  Google nhìn từ khoá <b>phổ biến</b> — một tiêu đề chứa cụm 0 lượt tìm vẫn được đếm ở đây nhưng
                  không giúp gì cho Ad strength.
                </p>
              )}
            </div>
          );
        })()}

        {/* Từ khoá Google nói gần như KHÔNG AI TÌM. Cảnh báo, KHÔNG chặn —
            từ khoá mới hoặc ngách thường 0 lượt mà vẫn đáng chạy, và tự xoá
            hộ là quyết thay người chạy quảng cáo. */}
        {measuring && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang hỏi Google lượt tìm kiếm thật của từng từ khoá...
          </p>
        )}
        {!measuring && volumeError && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            ⚠️ <b>Chưa đo được lượt tìm kiếm thật</b>: {volumeError}
            {" "}Bộ từ khoá bên dưới là do <b>AI tự nghĩ</b>, chưa có số liệu Google xác nhận.
            Nhãn HIGH/MED/LOW là mức ý định mua AI tự chấm, <b>không phải</b> lượt tìm kiếm.
          </p>
        )}
        {!measuring && volumes && deadKeywords.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            <p className="font-semibold">
              ⚠️ {deadKeywords.length}/{(result.keywords?.keywords as AnyJSON[])?.length ?? 0} từ khoá được Google báo <b>gần như không ai tìm</b> (0 lượt/tháng)
            </p>
            <p className="mt-0.5 text-amber-800">{deadKeywords.slice(0, 8).join(" · ")}{deadKeywords.length > 8 ? ` … và ${deadKeywords.length - 8} từ nữa` : ""}</p>
            <p className="mt-1 text-amber-800">
              Tool <b>không tự xoá</b> — từ khoá mới hoặc ngách thường 0 lượt mà vẫn đáng chạy.
              Muốn bỏ thì sửa ở bảng từ khoá phía trên trước khi tạo chiến dịch.
            </p>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {campaignType !== "BOTH"
            ? <>Nút <strong>&quot;Tạo campaign (tắt sẵn)&quot;</strong> tạo ở trạng thái PAUSED để bạn review trước.
               Nút <strong>&quot;Tạo &amp; Chạy Ngay&quot;</strong> bật luôn — tiền bắt đầu tiêu từ lúc bấm.
               {campaignType === "PMAX" && " Với Performance Max, tool bật cả campaign lẫn nhóm tài sản — thiếu một trong hai là campaign hiện \"đang chạy\" mà không phục vụ lượt nào."}</>
            : <>Tạo <strong>cả hai</strong> thì campaign ra ở trạng thái <strong>PAUSED</strong> — hai chiến dịch
               chạy song song, bật ngay dễ để lại trạng thái nửa vời. Review trên Google Ads rồi bật tay.</>}
        </div>

        {launchError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{launchError}</span>
          </div>
        )}

        {/* Bị chặn TRƯỚC khi tạo gì vì trang đích hỏng. Đây là ca tool tự bắt
            được, nên nói được chính xác mã lỗi và địa chỉ — khác hẳn lời từ
            chối chung chung của Google. */}
        {urlCheck && (
          <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 space-y-1.5">
            <p className="text-xs font-bold text-red-900">🔗 Trang đích không mở được — đã dừng trước khi tạo</p>
            <p className="text-[11px] text-red-800">{urlCheck.problem}</p>
            <div className="rounded bg-white border border-red-200 px-2 py-1.5 text-[11px] space-y-0.5">
              <p className="text-slate-700">Đường dẫn: <b className="break-all">{urlCheck.url || "(chưa có)"}</b></p>
              {urlCheck.finalUrl && urlCheck.finalUrl !== urlCheck.url && (
                <p className="text-slate-700">Sau chuyển hướng: <b className="break-all">{urlCheck.finalUrl}</b></p>
              )}
              {urlCheck.status != null && <p className="text-slate-700">Mã trả về: <b>{urlCheck.status}</b></p>}
            </div>
            <p className="text-[10px] text-slate-600">
              Tool kiểm trước vì Google từ chối ca này bằng <b>DESTINATION_NOT_WORKING</b> — loại cấm hẳn — mà
              lời từ chối lại không nhắc gì tới đường dẫn, nên rất dễ đi sửa nhầm câu chữ.
              <b> Chưa có gì được tạo trên tài khoản.</b>
            </p>
          </div>
        )}

        {/* Google có trả chi tiết nhưng tool chưa bóc được hình dạng đó —
            hiện thô còn hơn để người dùng cầm một câu lỗi trống rỗng. */}
        {launchPolicy.length === 0 && launchRawDetails != null && (
          <details className="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <summary className="text-xs font-bold text-amber-900 cursor-pointer">
              📋 Google có gửi kèm chi tiết — bấm để xem (tool chưa đọc được dạng này)
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded bg-white/70 p-2 text-[10px] whitespace-pre-wrap text-slate-700">
              {JSON.stringify(launchRawDetails, null, 2)}
            </pre>
            <p className="mt-1 text-[10px] text-amber-800">
              Gửi nguyên khối này cho người phát triển — trong đó có chủ đề chính sách và chữ bị gắn cờ.
            </p>
          </details>
        )}

        {/* Google KHÔNG gửi chi tiết nào. Nói thẳng, và chỉ đường khác. */}
        {launchPolicy.length === 0 && launchRawDetails == null && launchError?.includes("policy") && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900 space-y-1">
            <p className="font-bold">Google không nói rõ chủ đề nào bị vi phạm</p>
            <p>
              Lời từ chối này đến từ <b>bản tóm tắt chính sách</b> của quảng cáo, và lần này Google không gửi
              kèm chi tiết. Hai cách tìm ra nguyên nhân:
            </p>
            <p>
              <b>1.</b> Bấm <b>&quot;Tạo campaign (tắt sẵn)&quot;</b> sau khi <b>tải lại trang</b> (F5) —
              bản mới bóc được chi tiết khi Google có gửi.
            </p>
            <p>
              <b>2.</b> Sửa bớt nội dung nghi ngờ rồi thử lại từng phần. Nhóm hay bị chặn với dịch vụ số:
              nhắc tới <b>thủ tục giấy tờ / hành chính công</b>, <b>cam kết tuyệt đối</b> (&quot;100% đậu&quot;,
              &quot;bao đậu&quot;), <b>tên thương hiệu của bên khác</b>, hoặc trang đích không mở được từ ngoài.
            </p>
          </div>
        )}

        {/* Google từ chối vì CHÍNH SÁCH — hiện chủ đề và ĐÚNG CHỮ phải sửa.
            Câu lỗi gốc ("policy topics of type PROHIBITED") không nói gì trong
            hai thứ đó, nên người dùng nhận một lời từ chối không hành động
            được gì. */}
        {launchPolicy.length > 0 && (
          <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 space-y-2">
            <div>
              {/* KHÔNG phải mọi chủ đề chính sách đều là lỗi câu chữ.
                  DESTINATION_NOT_WORKING là lỗi TRANG ĐÍCH — bảo người dùng
                  "sửa câu chữ" ở ca đó là đẩy họ đi sai hướng, sửa bao nhiêu
                  lần cũng không qua. Đây đúng là ca người dùng gặp ngày 19/09. */}
              {launchPolicy.some(p => p.topic === "DESTINATION_NOT_WORKING") ? (
                <>
                  <p className="text-xs font-bold text-red-900">
                    🔗 Google KHÔNG mở được trang đích của quảng cáo
                  </p>
                  <p className="text-[11px] text-red-800 mt-0.5">
                    Đây <b>không phải lỗi câu chữ</b> và cũng không phải lỗi cấu hình. Google cho trình thu thập
                    vào thử trang đích, vào không được thì từ chối quảng cáo. <b>Sửa câu chữ bao nhiêu lần cũng
                    không qua</b> — phải sửa đường dẫn.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold text-red-900">
                    🚫 Google từ chối nội dung quảng cáo vì chính sách
                  </p>
                  <p className="text-[11px] text-red-800 mt-0.5">
                    Đây <b>không phải lỗi cấu hình</b> — vị trí, ngôn ngữ, đấu thầu đều đúng.
                    Google chặn <b>câu chữ</b> trong quảng cáo. Sửa những dòng bên dưới rồi tạo lại.
                  </p>
                </>
              )}
            </div>

            {launchPolicy.map((p, i) => (
              <div key={i} className="rounded border border-red-300 bg-white p-2 space-y-1">
                <p className="text-[11px]">
                  <b className="text-red-900">{p.topic}</b>
                  <span className={cn("ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold",
                    p.type === "PROHIBITED" ? "bg-red-200 text-red-900" : "bg-amber-200 text-amber-900")}>
                    {p.type === "PROHIBITED" ? "CẤM HẲN" : p.type === "LIMITED" ? "HẠN CHẾ" : p.type}
                  </span>
                </p>

                {p.texts.length > 0 && (
                  <div>
                    <p className="text-[10px] text-red-800 font-semibold">Chữ bị gắn cờ — sửa đúng những dòng này:</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {p.texts.map((t, j) => (
                        <li key={j} className="text-[11px] text-slate-800 bg-red-100 rounded px-1.5 py-0.5">&quot;{t}&quot;</li>
                      ))}
                    </ul>
                  </div>
                )}

                {p.websites.length > 0 && (
                  <p className="text-[10px] text-red-800">Trang bị gắn cờ: {p.websites.join(" · ")}</p>
                )}

                {p.destination && (
                  <p className="text-[10px] text-red-800">
                    Trang đích không mở được: {p.destination.url ?? "(không rõ URL)"}
                    {p.destination.httpErrorCode ? ` · mã HTTP ${p.destination.httpErrorCode}` : ""}
                    {p.destination.dnsError ? ` · lỗi DNS ${p.destination.dnsError}` : ""}
                    {" — "}kiểm tra trang có mở được từ ngoài internet không.
                  </p>
                )}

                {p.topic === "DESTINATION_NOT_WORKING" && p.texts.length === 0 && !p.destination && (
                  <p className="text-[10px] text-red-800">
                    Google không nói rõ đường dẫn nào. Mở thử <b>trang đích của sản phẩm này</b> ở tab ẩn danh —
                    nếu ra 404 thì đó chính là nguyên nhân. Tool nay tự kiểm trang đích trước khi tạo, nên lần
                    sau sẽ chặn sớm kèm mã lỗi cụ thể.
                  </p>
                )}
                <p className="text-[10px] text-slate-500">
                  {p.topic === "DESTINATION_NOT_WORKING"
                    ? "Sửa đường dẫn trang đích, hoặc sửa trang cho mở được. Không liên quan tới câu chữ quảng cáo."
                    : p.type === "PROHIBITED"
                    ? "Nhóm CẤM HẲN không xin miễn trừ được — bắt buộc phải đổi câu chữ."
                    : p.exemptible
                      ? "Nhóm này có thể xin miễn trừ trong Google Ads, hoặc đổi câu chữ cho an toàn."
                      : "Đổi câu chữ, hoặc xử lý trên Google Ads rồi tạo lại."}
                </p>
              </div>
            ))}

            <p className="rounded bg-white border border-red-200 px-2 py-1.5 text-[10px] text-slate-600">
              {launchPolicy.some(p => p.topic === "DESTINATION_NOT_WORKING")
                ? <>Chọn <b>Sản phẩm khác</b> có trang đích còn sống, hoặc báo người phát triển cập nhật đường dẫn
                   cho sản phẩm này. Sửa câu chữ sẽ không giúp gì.</>
                : <>Sửa ở phần nội dung quảng cáo phía trên (bấm vào từng dòng để sửa), hoặc bấm
                   <b> Sản phẩm khác</b> rồi sinh lại nội dung.</>}
            </p>
          </div>
        )}

        {precheck && (
          <div className={cn(
            "rounded-lg border p-3 text-xs space-y-1.5",
            precheck.verdict === "HỢP LỆ" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : precheck.verdict === "TỪ CHỐI" ? "border-red-200 bg-red-50 text-red-700"
            : "border-amber-200 bg-amber-50 text-amber-800",
          )}>
            <p className="font-bold">
              {precheck.verdict === "HỢP LỆ" ? "✅" : precheck.verdict === "TỪ CHỐI" ? "❌" : "⚠️"} Google nói: {precheck.verdict}
              {precheck.campaignType && (
                <span className="ml-1.5 rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  đã kiểm loại: {precheck.campaignType}
                </span>
              )}
              {precheck.unchecked && (
                <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                  ⚠️ CHƯA kiểm: {precheck.unchecked}
                </span>
              )}
            </p>
            <p>{precheck.summary}</p>
            {/* Có thứ phép kiểm KHÔNG chạm tới được, không phải vì lười mà vì
                nó chỉ tồn tại sau khi chiến dịch được tạo. Nói ra, đừng để
                "HỢP LỆ" bao luôn phần chưa hề được kiểm. */}
            {precheck.notCheckable && (
              <p className="rounded bg-amber-50 border border-amber-200 p-2 text-amber-900">
                ⚠️ <strong>Không nằm trong phạm vi kiểm:</strong> {precheck.notCheckable}
              </p>
            )}
            {/* Trang đích — để TRƯỚC phần soi câu chữ vì đo trên hai tài khoản
                ngày 21/09/2026 thì 91% lý do Google từ chối là chuyện trang
                đích, còn lỗi câu chữ là 0. Xếp sau thì người đọc lướt qua đúng
                thứ hay chặn nhất. */}
            {precheck.finalUrlCheck && (
              !precheck.finalUrlCheck.ok ? (
                <div className="rounded border border-red-300 bg-red-50 px-2 py-1.5 space-y-0.5">
                  <p className="text-[11px] font-bold text-red-800">⛔ Trang đích không mở được</p>
                  <p className="text-[10px] leading-snug text-red-700">{precheck.finalUrlCheck.problem}</p>
                  <p className="text-[10px] text-slate-600 break-all">
                    Đã thử:{" "}
                    <a href={precheck.finalUrlCheck.url} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-sky-700 underline hover:text-sky-900">{precheck.finalUrlCheck.url}</a>
                    {precheck.finalUrlCheck.status != null && <> — máy chủ trả mã <b>{precheck.finalUrlCheck.status}</b></>}
                    {precheck.finalUrlCheck.finalUrl && precheck.finalUrlCheck.finalUrl !== precheck.finalUrlCheck.url && (
                      <> · sau chuyển hướng tới <span className="font-mono">{precheck.finalUrlCheck.finalUrl}</span></>
                    )}
                  </p>
                </div>
              ) : precheck.finalUrlCheck.problem ? (
                <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-900">
                  ⚠️ <b>Chưa kiểm được trang đích:</b> {precheck.finalUrlCheck.problem}
                </p>
              ) : (
                <p className="rounded bg-white/60 px-2 py-1.5 text-[11px] text-slate-600">
                  🔗 Trang đích mở được (mã {precheck.finalUrlCheck.status})
                  {precheck.finalUrlCheck.finalUrl && precheck.finalUrlCheck.finalUrl !== precheck.finalUrlCheck.url && (
                    <> — chuyển hướng tới <span className="font-mono break-all">{precheck.finalUrlCheck.finalUrl}</span></>
                  )}
                </p>
              )
            )}
            {/* Từ khoá vượt trần — hiện ngay cạnh phần trang đích vì đây là
                hai thứ làm lượt tạo CHẾT CẢ LÔ. Một từ khoá 11 từ là mất luôn
                campaign, và câu Google trả về chỉ nói số thứ tự trong lô
                ("mutate_operations[10]") nên không lần ra được là từ nào. */}
            {Array.isArray(precheck.rejectedKeywords) && precheck.rejectedKeywords.length > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 space-y-0.5">
                <p className="text-[11px] font-bold text-amber-900">
                  ⚠️ {precheck.rejectedKeywords.length} từ khoá vượt trần Google — sẽ bị <b>BỎ</b> khi tạo (không chặn cả lần tạo)
                </p>
                {precheck.rejectedKeywords.slice(0, 8).map((k, i) => (
                  <p key={i} className="text-[10px] leading-snug text-slate-700">
                    <span className="font-mono font-semibold">&ldquo;{k.keyword}&rdquo;</span> — {k.problem}
                  </p>
                ))}
                {precheck.rejectedKeywords.length > 8 && (
                  <p className="text-[10px] text-amber-700">…và {precheck.rejectedKeywords.length - 8} từ nữa.</p>
                )}
                <p className="text-[10px] text-amber-700/80 italic">
                  Trần đo thật trên tài khoản: tối đa <b>10 từ</b> và <b>80 ký tự</b> mỗi từ khoá.
                </p>
              </div>
            )}
            {precheck.caveat && <p className="italic opacity-80">{precheck.caveat}</p>}
            {precheck.checked && (
              <>
                <p className="opacity-70">
                  Đã kiểm: {String(precheck.checked.headlines)}
                  {precheck.checked.headlinesTotal ? `/${String(precheck.checked.headlinesTotal)}` : ""} tiêu đề ·{" "}
                  {String(precheck.checked.descriptions)} mô tả ·{" "}
                  {String(precheck.checked.keywordsChecked)}/{String(precheck.checked.keywordsTotal)} từ khoá ·{" "}
                  {String(precheck.checked.bidding ?? "")} · {String(precheck.checked.finalUrl)}
                </p>
                {/* Tiêu đề quá dài KHÔNG chặn launch — nó bị BỎ. Không nói ra thì
                    "HỢP LỆ" bị đọc thành "cả 15 tiêu đề đều ổn", launch xong mới
                    phát hiện thiếu mất một cái. */}
                {Array.isArray(precheck.checked.droppedHeadlines) && precheck.checked.droppedHeadlines.length > 0 && (
                  <p className="rounded bg-amber-100/60 border border-amber-300 px-2 py-1 text-amber-900">
                    ⚠️ {precheck.checked.droppedHeadlines.length} tiêu đề vượt 30 ký tự sẽ bị <b>BỎ</b> khi launch (không phải bị chặn):{" "}
                    {(precheck.checked.droppedHeadlines as string[]).join(" · ")}. Sửa ngắn lại nếu muốn giữ.
                  </p>
                )}
              </>
            )}
            {/* Soi chính sách nội dung — TÁCH RIÊNG khỏi phán quyết cấu hình.
                Gộp chung là nói dối: validate_only trả "HỢP LỆ" cho cấu hình,
                còn chính sách nội dung thì Google chỉ duyệt SAU khi quảng cáo
                được tạo thật. Hai câu trả lời khác nhau, phải để cạnh nhau mà
                không lẫn vào nhau. */}
            {precheck.unchecked && (
              <p className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-900">
                Bạn chọn <b>Cả hai</b> — phép kiểm chỉ dựng được một campaign mỗi lượt, nên nó đã kiểm
                <b> Search</b> và <b>CHƯA kiểm {precheck.unchecked}</b>. Muốn kiểm PMax thì chuyển sang
                <b> Perf Max</b> ở bước chọn loại rồi bấm Kiểm trước lần nữa.
              </p>
            )}

            {/* Giới hạn ĐO ĐƯỢC, không phải suy đoán: gửi một quảng cáo có nội
                dung thuộc nhóm cấm rõ ràng qua validate_only thì Google VẪN
                CHẤP NHẬN. Tức phép kiểm này soi được cấu trúc lệnh, nhưng
                KHÔNG soi được chính sách nội dung. Không nói ra thì chữ "HỢP
                LỆ" thành lời hứa sai đúng ở chỗ hay chặn nhất. */}
            <p className="rounded bg-slate-100 border border-slate-300 px-2 py-1.5 text-[11px] text-slate-700">
              ⚠️ Phép kiểm này <b>KHÔNG bắt được lỗi chính sách CÂU CHỮ</b>. Đã đo: gửi thử một quảng cáo
              có nội dung thuộc nhóm Google cấm rõ ràng, chế độ kiểm-không-tạo vẫn trả về <b>chấp nhận</b>.
              Google chỉ duyệt câu chữ khi quảng cáo được <b>tạo thật</b>. Nên &quot;HỢP LỆ&quot; ở đây nghĩa là
              <b> lệnh đúng cấu trúc + trang đích mở được</b>, không phải &quot;quảng cáo sẽ được duyệt&quot;.
            </p>

            {precheck.policy && (
              precheck.policy.clean ? (
                <p className="rounded bg-white/60 px-2 py-1.5 text-[11px] text-slate-600">
                  🛡️ Soi chính sách nội dung: <b>không thấy vi phạm luật biên tập nào</b> (viết hoa toàn bộ,
                  dấu câu lặp, số điện thoại trong chữ, khẳng định tuyệt đối, link rút gọn).
                  Đây là <b>phỏng đoán của tool</b>, không phải phán quyết của Google.
                </p>
              ) : (
                <div className="rounded border border-amber-300 bg-amber-50/80 px-2 py-1.5 space-y-1">
                  <p className="text-[11px] font-bold text-amber-900">
                    🛡️ Soi chính sách nội dung — {precheck.policy.findings.filter(f => f.severity === "block").length} nghiêm trọng,{" "}
                    {precheck.policy.findings.filter(f => f.severity === "warn").length} cần xem lại
                  </p>
                  {precheck.policy.findings.map((f, i) => (
                    <p key={i} className="text-[10px] leading-snug">
                      <span className={f.severity === "block" ? "text-red-700 font-bold" : "text-amber-800 font-bold"}>
                        {f.severity === "block" ? "⛔" : "⚠️"} {f.rule}
                      </span>
                      <span className="text-slate-500"> · {f.where} — </span>
                      <span className="text-slate-700">{f.detail}</span>
                    </p>
                  ))}
                  <p className="text-[10px] text-amber-700/80 italic">
                    Đây là phỏng đoán theo luật biên tập của Google, KHÔNG phải phán quyết. Sạch ở đây không đảm bảo
                    được duyệt; bị bắt ở đây cũng chưa chắc Google từ chối.
                  </p>
                </div>
              )
            )}

            {precheck.googleErrors != null && (
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-white/60 p-2 text-[10px] whitespace-pre-wrap">
                {typeof precheck.googleErrors === "string" ? precheck.googleErrors : JSON.stringify(precheck.googleErrors, null, 2)}
              </pre>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 gap-2 flex-wrap">
          <Button variant="outline" className="gap-1.5 text-xs" onClick={() => setResult(null)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Sản phẩm khác
          </Button>
          <Button
            variant="outline"
            onClick={handlePrecheck}
            disabled={!launchCampaignName || prechecking || launching}
            className="gap-2 text-xs border-slate-300"
            title="Gửi Google kiểm mà KHÔNG tạo gì trên tài khoản"
          >
            {prechecking ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang hỏi Google...</>
            ) : (
              <>🔍 Kiểm trước (không tạo gì)</>
            )}
          </Button>
          <Button
            onClick={() => void handleLaunch(false)}
            disabled={!launchCampaignName || launching}
            className="gap-2 bg-gradient-to-r from-red-600 to-orange-600 text-white hover:from-red-700 hover:to-orange-700 disabled:opacity-40 shadow-lg px-6 py-5"
          >
            {launching ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Đang tạo campaign...</>
            ) : (
              <><Rocket className="h-4 w-4" /> 🚀 Tạo campaign (tắt sẵn)</>
            )}
          </Button>

          {/* Cả Search lẫn PMax bật ngay được. PMax phải lật HAI tầng —
              campaign và nhóm tài sản — route lo phần đó. Với "Cả hai" thì
              không hiện: hai route chạy song song, một cái bật được một cái
              không sẽ để lại trạng thái nửa vời khó hiểu. */}
          {campaignType !== "BOTH" && (
            confirmRunNow ? (
              <Button
                onClick={() => { setConfirmRunNow(false); void handleLaunch(true); }}
                disabled={!launchCampaignName || launching}
                className="gap-2 bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 shadow-lg px-6 py-5"
              >
                {launching
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang tạo và bật...</>
                  : <>⚠️ Bấm lần nữa để CHẠY THẬT</>}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => setConfirmRunNow(true)}
                disabled={!launchCampaignName || launching}
                className="gap-2 border-amber-400 text-amber-700 hover:bg-amber-50 px-6 py-5"
                title="Tạo xong bật chạy luôn — không cần vào Google Ads bật tay"
              >
                ▶️ Tạo &amp; Chạy Ngay
              </Button>
            )
          )}
        </div>

        {confirmRunNow && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            <b>Bấm lần nữa là tiền bắt đầu tiêu ngay</b>, ngân sách {dailyBudget.toLocaleString("vi-VN")}₫/ngày.
            Tool sẽ tạo campaign, đặt mục tiêu chuyển đổi, gắn ảnh và sitelink <b>rồi mới bật</b> — bật trước
            là để campaign chạy khi chưa biết nó đuổi theo cái gì.
            {" "}Đổi ý thì <button onClick={() => setConfirmRunNow(false)} className="underline font-semibold">huỷ</button>,
            hoặc bấm &quot;Tạo campaign (tắt sẵn)&quot; để review trên Google Ads trước.
          </p>
        )}
      </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Launch Success Screen
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LaunchSuccessScreen({ data, company, pmax, onNewCampaign, onBack }: {
  data: AnyJSON;
  company: string;
  pmax: AnyJSON;
  onNewCampaign: () => void;
  onBack: () => void;
}) {
  const allSuccess = data.success;
  const partial = data.partialSuccess;
  /** Tên tiếng Việt của các vị trí đã gửi, do panel đính kèm lúc launch. */
  const geoNames = (data.geoNames ?? []) as string[];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className={cn(
        "rounded-xl border p-6 text-center",
        allSuccess
          ? "bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200"
          : partial
          ? "bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200"
          : "bg-gradient-to-r from-red-50 to-orange-50 border-red-200"
      )}>
        <p className="text-3xl mb-2">{allSuccess ? "🎉" : partial ? "⚠️" : "❌"}</p>
        <h2 className="text-lg font-bold text-slate-800">{data.message}</h2>

        {/* PMax chưa đủ điều kiện phục vụ = campaign tồn tại nhưng KHÔNG hiển
            thị lượt nào. Google không báo lỗi, nó chỉ lặng lẽ không phục vụ —
            nên chỗ này phải to và đỏ, không nấp trong một dòng phụ. */}
        {(() => {
          const p = (data as AnyJSON)?.results?.pmax;
          if (!p?.success || p.serviceable !== false) return null;
          const missing = (p.missingImageTypes ?? []) as Array<{ label: string; recommended: string }>;
          return (
            <div className="mt-3 rounded-lg border-2 border-red-300 bg-red-50 p-3 text-left">
              <p className="text-sm font-bold text-red-800">⛔ Campaign này CHƯA hiển thị được lượt nào</p>
              <p className="mt-1 text-xs text-red-700">
                Nhóm tài sản thiếu: <b>{missing.map(m => `${m.label} (${m.recommended})`).join(" · ")}</b>.
                Google đòi đủ <b>logo + ảnh ngang + ảnh vuông</b> mới phục vụ — và nó <b>không báo lỗi</b>,
                chỉ lặng lẽ không hiển thị.
              </p>
              <p className="mt-1 text-xs text-red-700">
                Bổ sung ở <b>PMax Insights → Khám phá → nhóm tài sản → Thêm ảnh</b>, hoặc trong Google Ads.
              </p>
            </div>
          );
        })()}
        {data.summary && (
          <p className="text-sm text-slate-500 mt-1">
            {data.summary.succeeded}/{data.summary.total} campaigns thành công
          </p>
        )}
      </div>

      {/* ── Những gì THẬT SỰ được gửi lên Google ──────────────────────────
          Không có khối này thì "thành công" chỉ là một chữ. Ba thứ dưới đây
          đều là chỗ hệ thống có thể lặng lẽ làm khác ý người dùng: bỏ bớt nội
          dung quá dài, cắt bớt chủ đề tìm kiếm, hoặc không đặt được mục tiêu
          chuyển đổi. Cái cuối nguy nhất — sai mục tiêu thì campaign vẫn chạy
          bình thường, chỉ tiêu tiền vào đúng thứ mình không muốn. */}
      {(["search", "pmax"] as const).map((k) => {
        const r = (data as AnyJSON)?.results?.[k];
        if (!r?.success) return null;
        const goal = r.conversionGoalReport;
        const dropped = (r.droppedTexts ?? []) as string[];
        const themes = r.searchThemesCreated;
        // Backend đã tính sẵn lý do cụ thể (imageAssetNote) mỗi khi banner trên
        // đầu nói "phần ảnh chưa gắn được — xem ghi chú bên dưới" — nhưng
        // trước bản này KHÔNG có UI nào render nó, nên "ghi chú bên dưới" đó
        // không tồn tại ở đâu cả. Thêm khối hiện đúng lý do thật ở đây.
        const imageNote = r.imageAssetNote as string | undefined;
        const imagesAttached = r.imagesAttached as number | undefined;
        const sitelinkNote = r.sitelinkNote as string | undefined;
        const sitelinksAttached = r.sitelinksAttached as number | undefined;
        const negativesAdded = r.negativesAdded as number | undefined;
        const negativeNote = r.negativeNote as string | undefined;
        const servingReasons = (r.servingReasons ?? []) as string[];
        const assetGroupsActivated = r.assetGroupsActivated as number | undefined;
        const videosLinked = r.videosLinked as number | undefined;
        const videoNote = r.videoNote as string | undefined;
        const targetingApplied = r.targetingApplied as boolean | undefined;
        const targetingError = r.targetingError as string | undefined;
        const bidding = r.bidding as { strategy: string; summary: string } | undefined;
        const biddingWarnings = (r.biddingWarnings ?? []) as string[];
        const targeting = r.targeting as
          { locations: string[]; locationCount: number; wholeCountry: boolean; languages: string[] } | null | undefined;
        if (!goal && dropped.length === 0 && themes === undefined && !imageNote
            && !sitelinkNote && !imagesAttached && !sitelinksAttached
            && targetingApplied === undefined && !bidding && videosLinked === undefined
            && servingReasons.length === 0 && negativesAdded === undefined) return null;
        return (
          <div key={k} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-xs">
            <p className="font-bold text-slate-800 text-sm">
              Đã gửi lên Google — {k === "pmax" ? "Performance Max" : "Search"}
            </p>

            {themes !== undefined && (
              <p className="text-slate-700">
                Chủ đề tìm kiếm: <b>{themes}</b> đã tạo
                {r.searchThemesDropped > 0 && (
                  <span className="text-amber-700"> · bỏ {r.searchThemesDropped} vì vượt trần 50 của Google</span>
                )}
                {" — "}<span className="text-slate-500">đối chiếu ở Google Ads → chiến dịch → Search themes.</span>
              </p>
            )}

            {dropped.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p className="font-semibold text-amber-900">Bị bỏ {dropped.length} dòng nội dung — Google KHÔNG nhận:</p>
                <ul className="mt-1 space-y-0.5 text-amber-800 max-h-32 overflow-y-auto">
                  {dropped.map((d, i) => <li key={i}>· {d}</li>)}
                </ul>
              </div>
            )}

            {/* Chiến lược đấu thầu THẬT SỰ đã dùng — in từ thứ backend trả về,
                không phải từ lựa chọn trên màn trước. Hai cái này lệch nhau là
                dấu hiệu có gì đó rơi giữa đường. */}
            {bidding && (
              <p className="text-slate-700">
                Đấu thầu: <b>{bidding.summary}</b>
                {" — "}<span className="text-slate-500">đối chiếu ở Google Ads → chiến dịch → Cài đặt → Giá thầu.</span>
              </p>
            )}
            {biddingWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p className="font-semibold text-amber-900">Lưu ý về cấu hình đấu thầu:</p>
                <ul className="mt-1 space-y-0.5 text-amber-800">
                  {biddingWarnings.map((w, i) => <li key={i}>· {w}</li>)}
                </ul>
              </div>
            )}

            {/* Nhắm mục tiêu — hiện TRƯỚC mọi thứ khác. Campaign không có tiêu
                chí vị trí được Google phục vụ ra toàn thế giới; đó là hỏng
                nặng hơn hẳn thiếu ảnh hay thiếu sitelink. */}
            {targetingApplied === false && (
              <div className="rounded-lg border-2 border-red-400 bg-red-50 p-2">
                <p className="font-bold text-red-900">⛔ KHÔNG đặt được vị trí / ngôn ngữ</p>
                <p className="mt-1 text-red-800">
                  {targetingError ?? "Lý do không rõ"}
                </p>
                <p className="mt-1 text-red-800">
                  Campaign <b>không có tiêu chí vị trí</b> sẽ được Google phục vụ ra <b>TOÀN THẾ GIỚI</b>.
                  Vào Google Ads → chiến dịch → <b>Vị trí</b> đặt Việt Nam <b>trước khi bật</b>.
                </p>
              </div>
            )}
            {targetingApplied === true && targeting && (
              <p className="text-slate-700">
                Nhắm mục tiêu:{" "}
                <b>
                  {targeting.wholeCountry
                    ? "Việt Nam (cả nước)"
                    : geoNames.length > 0
                      ? geoNames.join(", ")
                      : `${targeting.locationCount} vị trí`}
                </b>
                {" · "}<b>{targeting.languages.join(" + ")}</b>
                {" — "}<span className="text-slate-500">đối chiếu ở Google Ads → chiến dịch → Vị trí / Ngôn ngữ.</span>
              </p>
            )}

            {/* Số ảnh/sitelink GẮN ĐƯỢC phải hiện kể cả khi không có ghi chú —
                đó là bằng chứng kiểm lại được trên Google Ads, khác hẳn với
                câu "đã tạo thành công" vốn chỉ nói về campaign. */}
            {(imagesAttached !== undefined || sitelinksAttached !== undefined) && (
              <p className="text-slate-700">
                Đã gắn: <b>{imagesAttached ?? 0}</b> ảnh · <b>{sitelinksAttached ?? 0}</b> sitelink
                {videosLinked !== undefined && <> · <b>{videosLinked}</b> video</>}
                {negativesAdded !== undefined && <> · <b>{negativesAdded}</b> từ khoá phủ định</>}
                {" — "}<span className="text-slate-500">đối chiếu ở Google Ads → chiến dịch → Tài sản.</span>
              </p>
            )}

            {imageNote && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p className="font-semibold text-amber-900">Ghi chú về ảnh:</p>
                <p className="mt-1 text-amber-800">{imageNote}</p>
              </div>
            )}

            {/* BẬT RỒI CHƯA CHẮC PHỤC VỤ. Google cho biết lý do qua
                primary_status_reasons của nhóm tài sản — đo được các giá trị
                CAMPAIGN_PAUSED · ASSET_GROUP_PAUSED · ASSET_GROUP_DISAPPROVED.
                Không đọc ra thì người dùng thấy "đang chạy" rồi vài ngày sau
                mới phát hiện 0 lượt hiển thị. */}
            {servingReasons.length > 0 && (() => {
              const VI: Record<string, string> = {
                CAMPAIGN_PAUSED: "Chiến dịch đang tắt",
                CAMPAIGN_REMOVED: "Chiến dịch đã xoá",
                CAMPAIGN_PENDING: "Chiến dịch chưa tới ngày chạy",
                CAMPAIGN_ENDED: "Chiến dịch đã kết thúc",
                ASSET_GROUP_PAUSED: "Nhóm tài sản đang tắt",
                ASSET_GROUP_REMOVED: "Nhóm tài sản đã xoá",
                ASSET_GROUP_DISAPPROVED: "Nhóm tài sản bị Google TỪ CHỐI vì chính sách",
                ASSET_GROUP_LIMITED: "Nhóm tài sản bị hạn chế hiển thị",
                ASSET_GROUP_UNDER_REVIEW: "Google đang duyệt — chưa hiển thị",
              };
              // Lọc lý do đã tự hết sau khi bật: campaign/nhóm vừa được bật
              // thì hai lý do này là số liệu CŨ, in ra chỉ gây hoang mang.
              const live = servingReasons.filter(x =>
                !(r.status === "ENABLED" && (x === "CAMPAIGN_PAUSED" || x === "ASSET_GROUP_PAUSED")));
              if (live.length === 0) return null;
              const bad = live.some(x => x.includes("DISAPPROVED") || x.includes("REMOVED"));
              return (
                <div className={cn("rounded-lg border p-2", bad ? "border-red-300 bg-red-50" : "border-amber-200 bg-amber-50")}>
                  <p className={cn("font-semibold", bad ? "text-red-900" : "text-amber-900")}>
                    {bad ? "⛔ Nhóm tài sản CHƯA phục vụ được" : "Nhóm tài sản chưa hiển thị vì:"}
                  </p>
                  <ul className={cn("mt-1 space-y-0.5", bad ? "text-red-800" : "text-amber-800")}>
                    {live.map((x, i) => <li key={i}>· {VI[x] ?? x}</li>)}
                  </ul>
                  <p className={cn("mt-1", bad ? "text-red-800" : "text-amber-800")}>
                    Google <b>không chặn lúc tạo</b> — campaign vẫn hiện &quot;đang chạy&quot; trong khi không
                    phục vụ lượt nào. Xử lý trên Google Ads trước khi trông vào số liệu.
                  </p>
                </div>
              );
            })()}

            {assetGroupsActivated !== undefined && assetGroupsActivated > 0 && (
              <p className="text-slate-700">
                Đã bật thêm <b>{assetGroupsActivated}</b> nhóm tài sản — Performance Max cần cả campaign lẫn
                nhóm tài sản cùng bật thì mới phục vụ.
              </p>
            )}

            {negativeNote && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p className="font-semibold text-amber-900">Từ khoá phủ định:</p>
                <p className="mt-1 text-amber-800">{negativeNote}</p>
              </div>
            )}

            {videoNote && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p className="font-semibold text-amber-900">Ghi chú về video:</p>
                <p className="mt-1 text-amber-800">{videoNote}</p>
              </div>
            )}

            {sitelinkNote && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p className="font-semibold text-amber-900">Ghi chú về sitelink:</p>
                <p className="mt-1 text-amber-800">{sitelinkNote}</p>
              </div>
            )}

            {goal && (
              <div className={cn("rounded-lg border p-2",
                goal.error ? "border-red-300 bg-red-50" : goal.applied ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50")}>
                <p className={cn("font-semibold", goal.error ? "text-red-800" : "text-emerald-900")}>
                  Mục tiêu chuyển đổi: {goal.error ? "KHÔNG đặt được" : goal.applied ? "đã đặt" : "không có gì để đặt"}
                </p>
                {goal.error && (
                  <p className="mt-1 text-red-700">
                    {goal.error} — chiến dịch vẫn được tạo và đang PAUSED. Vào Google Ads → chiến dịch → <b>Goals</b> đặt tay
                    TRƯỚC khi bật, không thì nó sẽ đuổi theo toàn bộ hành động của tài khoản.
                  </p>
                )}
                {!goal.error && (goal.enabled?.length > 0 || goal.disabled?.length > 0) && (
                  <p className="mt-1 text-emerald-800">
                    {/* In TRẠNG THÁI CUỐI, không in số nhóm BỊ ĐỔI. Nhóm vốn
                        đã bật đúng từ trước không vào `enabled`, nên bản cũ in
                        "Bật 0 nhóm" trong khi campaign thật sự đang bật
                        PURCHASE — đọc lên thành "không có mục tiêu nào". */}
                    Đang bật <b>{goal.finalEnabled?.length ?? goal.enabled?.length ?? 0}</b> nhóm mục tiêu
                    {(goal.finalEnabled?.length ?? 0) === 0 && (goal.enabled?.length ?? 0) === 0 && (
                      <span className="text-red-700"> — ⛔ không nhóm nào bật thì Google không biết đuổi theo cái gì</span>
                    )}
                    {". "}
                    <span className="text-slate-500">
                      (lần này đổi: bật thêm {goal.enabled?.length ?? 0} · tắt bớt {goal.disabled?.length ?? 0})
                    </span>
                  </p>
                )}
                {(goal.notes ?? []).map((n: string, i: number) => (
                  <p key={i} className="mt-1 text-slate-600">{n}</p>
                ))}
                <p className="mt-1 text-slate-500">
                  Kiểm chứng: Google Ads → chiến dịch → <b>Goals</b> — phải khớp với thứ đã tích ở đây.
                </p>
              </div>
            )}
          </div>
        );
      })}

      {/* Per-campaign results */}
      <div className="space-y-3">
        {data.results?.search && (
          <div className={cn(
            "rounded-xl border p-4 flex items-center gap-4",
            data.results.search.success
              ? "border-emerald-200 bg-emerald-50/50"
              : "border-red-200 bg-red-50/50"
          )}>
            <Search className="h-5 w-5 text-slate-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                {data.results.search.success ? "✅" : "❌"} Search Campaign
              </p>
              {data.results.search.success ? (
                <p className="text-xs text-slate-500">
                  {/* Đọc trạng thái BACKEND TRẢ VỀ, không in cứng "PAUSED".
                      In cứng thì hôm campaign chạy thật màn này vẫn báo đang
                      tắt — người dùng yên tâm trong khi tiền đang chảy. */}
                  {data.results.search.adGroupsCount} Ad Groups | Status:{" "}
                  <b className={data.results.search.status === "ENABLED" ? "text-emerald-700" : "text-slate-600"}>
                    {data.results.search.status ?? "PAUSED"}
                  </b>
                  {data.results.search.status === "ENABLED" && " — đang chạy, tiền đang tiêu"}
                </p>
              ) : (
                <p className="text-xs text-red-600">
                  Lỗi: {data.results.search.error}
                </p>
              )}
            </div>
          </div>
        )}

        {data.results?.pmax && (
          <div className={cn(
            "rounded-xl border p-4 flex items-center gap-4",
            data.results.pmax.success
              ? "border-emerald-200 bg-emerald-50/50"
              : "border-red-200 bg-red-50/50"
          )}>
            <Zap className="h-5 w-5 text-slate-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                {data.results.pmax.success ? "✅" : "❌"} Performance Max
              </p>
              {data.results.pmax.success ? (
                <p className="text-xs text-slate-500">
                  {/* Đọc trạng thái backend TRẢ VỀ. In cứng "PAUSED" thì hôm
                      campaign chạy thật màn này vẫn báo đang tắt. */}
                  1 Asset Group ({data.results.pmax.assetsCreated?.total ?? 0} assets) | Status:{" "}
                  <b className={data.results.pmax.status === "ENABLED" ? "text-emerald-700" : "text-slate-600"}>
                    {data.results.pmax.status ?? "PAUSED"}
                  </b>
                  {data.results.pmax.status === "ENABLED" && " — đang chạy, tiền đang tiêu"}
                </p>
              ) : (
                <p className="text-xs text-red-600">
                  Lỗi: {data.results.pmax.error}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Trạng thái thật, không phải câu mặc định.
          Ba trường hợp KHÁC HẲN nhau và trước đây gộp làm một:
           · đang chạy thật     → phải cảnh báo tiền đang tiêu
           · bấm chạy mà hỏng   → tưởng đang chạy, thực ra đang tắt
           · tạo tắt sẵn        → câu cũ, đúng */}
      {(() => {
        // Đọc CẢ hai nhánh. Bản trước chỉ nhìn `search`, nên hôm PMax bật
        // chạy thật thì banner vẫn in "Campaign đang PAUSED".
        const s = (data.results?.search?.success ? data.results.search : null)
          ?? (data.results?.pmax?.success ? data.results.pmax : null);
        const kind = data.results?.search?.success ? "Search" : "Performance Max";
        if (s?.success && s.activationError) {
          return (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Bạn bấm &quot;Chạy Ngay&quot; nhưng campaign KHÔNG bật được</p>
                <p className="text-xs">{s.activationError} — campaign đã tạo xong và <b>đang PAUSED</b>. Vào Google Ads bật tay.</p>
              </div>
            </div>
          );
        }
        if (s?.success && s.status === "ENABLED") {
          return (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 flex items-center gap-3">
              <Rocket className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">🚀 Campaign {kind} ĐANG CHẠY — tiền bắt đầu tiêu từ bây giờ</p>
                <p className="text-xs">
                  Không cần vào Google Ads bật nữa. Theo dõi vài giờ đầu ở tab <b>Radar chính sách</b> —
                  quảng cáo bị từ chối thì campaign vẫn &quot;đang chạy&quot; mà không hiển thị lượt nào.
                </p>
              </div>
            </div>
          );
        }
        return (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Campaign đang PAUSED</p>
              <p className="text-xs">Review lần cuối trên Google Ads rồi bật lên để chạy.</p>
            </div>
          </div>
        );
      })()}

      {/* Image Upload Guidance for PMax */}
      {data.results?.pmax?.success && data.results.pmax.imageGuidance && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-sm font-semibold text-violet-700 mb-3 flex items-center gap-2">
            📸 PMax cần upload ảnh thủ công:
          </p>
          <div className="space-y-2">
            {Object.entries(data.results.pmax.imageGuidance).map(([key, val]) => (
              <div key={key} className="rounded-md bg-white border border-violet-200 p-3">
                <p className="text-[10px] font-bold text-violet-500 uppercase">{key}</p>
                <p className="text-xs text-slate-600">{val as string}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        {(data.results?.search?.googleAdsUrl || data.results?.pmax?.googleAdsUrl) && (
          <a
            href={data.results.search?.googleAdsUrl ?? data.results.pmax?.googleAdsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors"
          >
            <ExternalLink className="h-4 w-4" /> 🔗 Mở Google Ads để review
          </a>
        )}
        <Button variant="outline" className="flex-1 gap-2" onClick={() => window.location.href = "/campaigns"}>
          <BarChart3 className="h-4 w-4" /> 📊 Xem trong Campaigns
        </Button>
        <Button
          className="flex-1 gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-amber-950 hover:from-amber-600 hover:to-orange-700"
          onClick={onNewCampaign}
        >
          <Plus className="h-4 w-4" /> ➕ Tạo Campaign mới
        </Button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: Collapsible text list
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Một dòng nội dung có thể là chuỗi thuần, hoặc object {text, charCount,
 *  isValid} do lib/creative-limits.recomputeGoogleAdItems() sinh ra. */
type SectionItem = string | { text?: string; charCount?: number; isValid?: boolean };

/** Lấy chữ ra khỏi cả hai dạng.
 *
 *  VÌ SAO CẦN: generate-creative chạy recomputeGoogleAdItems() nên pmax.headlines
 *  là mảng OBJECT, trong khi Section lại khai kiểu string[]. `result.pmax` được
 *  khai là AnyJSON nên TypeScript không bắt được — y hệt cách `as unknown as`
 *  che mất lỗi device_bid_modifiers. Hệ quả: đếm số dòng vẫn đúng (items.length),
 *  nhưng mở ra thì React ném "Objects are not valid as a React child" và cả khối
 *  không hiện gì. Nhánh RSA không dính vì đã viết lại khi thêm sửa nội dung tại
 *  chỗ; nhánh PMax bị bỏ quên, mà PMax lại mặc định đóng nên không ai bấm để lộ ra. */
function itemText(item: SectionItem): string {
  return typeof item === "string" ? item : (item?.text ?? "");
}

function Section({ title, items, expanded, toggle, sectionKey, onEdit, editingIndex, draft, setDraft, onSave, onCancel, saving, editError }: {
  title: string;
  items: SectionItem[] | undefined;
  expanded: Set<string>;
  toggle: (k: string) => void;
  sectionKey: string;
  onEdit?: (index: number, current: string) => void;
  editingIndex?: number | null;
  draft?: string;
  setDraft?: (v: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  saving?: boolean;
  editError?: string | null;
}) {
  if (!items?.length) return null;
  const isOpen = expanded.has(sectionKey);
  return (
    <div>
      <button onClick={() => toggle(sectionKey)} className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2 hover:text-slate-900">
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {title} ({items.length})
      </button>
      {isOpen && (
        <div className="space-y-1">
          {items.map((item, i) => {
            const text = itemText(item);
            const limit = title.includes("30") ? 30 : 90;
            const ok = text.length <= limit;
            const isEditing = editingIndex === i;

            if (isEditing && setDraft) {
              const len = (draft ?? "").length;
              const draftOk = len > 0 && len <= limit;
              return (
                <div key={i} className="rounded-lg border-2 border-blue-300 bg-white px-3 py-2 space-y-2">
                  <textarea
                    value={draft ?? ""}
                    onChange={e => setDraft(e.target.value)}
                    rows={2}
                    className="w-full text-sm border border-slate-200 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <div className="flex items-center justify-between gap-2">
                    {/* Vượt giới hạn thì dòng này sẽ bị BỎ khi launch — nói bằng
                        chữ, không chỉ đổi màu, vì đây là mất nội dung chứ không
                        phải chuyện thẩm mỹ. */}
                    <span className={cn("text-xs font-mono", draftOk ? "text-emerald-600" : "text-red-600 font-bold")}>
                      {len}/{limit} {draftOk ? "" : "— sẽ KHÔNG được gửi lên Google"}
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={onSave} disabled={saving || !draftOk}>
                        {saving ? "Đang lưu…" : "Lưu"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel} disabled={saving}>Huỷ</Button>
                    </div>
                  </div>
                  {editError && <p className="text-xs text-red-600">{editError}</p>}
                </div>
              );
            }

            return (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
                <span className="text-xs font-bold text-slate-400 w-5">{i + 1}.</span>
                <span className="flex-1 text-slate-700">{text}</span>
                <span className={cn("text-xs font-mono w-8 text-right", ok ? "text-emerald-600" : "text-amber-600")}>
                  {text.length}
                </span>
                <span>{ok ? "✅" : "⚠️"}</span>
                {onEdit && (
                  <button onClick={() => onEdit(i, text)} className="text-xs text-blue-600 hover:underline shrink-0">Sửa</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
