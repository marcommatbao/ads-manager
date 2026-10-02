"use client";

// ============================================================
// Quản lý chiến dịch Google Search
// ------------------------------------------------------------
// Vì sao là một trang riêng: tool ĐÃ tạo được campaign Search (luôn ở trạng
// thái TẠM DỪNG), nhưng sau đó không có chỗ nào để BẬT nó lên, đổi ngân sách,
// hay chặn cụm tìm kiếm đang đốt tiền — phải sang Google Ads làm tay. Tạo được
// mà không quản được thì vòng làm việc đứt ngay chỗ quan trọng nhất.
//
// Đợt 11e: trang chia làm 4 tab.
//   🩻 X-quang & việc nên làm  — chẩn đoán + đề xuất áp dụng được (mặc định)
//   🔍 Cụm tìm kiếm            — nội dung gốc của trang (thêm/chặn cụm tìm kiếm)
//   ✍️ Quảng cáo RSA           — dòng yếu + viết lại bằng Gemini
//   🧾 Nhật ký ghi             — mọi lần ghi qua lớp an toàn dùng chung + Hoàn tác
// Công ty (MBC/MBI) dùng CHUNG cho cả 4 tab. Khoảng ngày dùng CHUNG cho
// X-quang + RSA (component DateRangeControl, mặc định 30 ngày) — tab Cụm tìm
// kiếm giữ khoảng ngày riêng của nó (7N/30N/90N, đã có từ trước).
// ============================================================

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangeControl, type DateRangeValue } from "@/components/DateRangeControl";
import { DEFAULT_VIEW_DAYS, MAX_RANGE_DAYS, lastDays } from "@/lib/case/dates";
import { SearchTermsTab } from "@/components/search/SearchTermsTab";
import { SearchXrayTab } from "@/components/search/SearchXrayTab";
import { SearchRsaTab } from "@/components/search/SearchRsaTab";
import { SearchLogTab } from "@/components/search/SearchLogTab";
import { companyIds } from "@/lib/companies/registry";

type Company = string;

const TABS = [
  { id: "xray", label: "🩻 X-quang & việc nên làm" },
  { id: "terms", label: "🔍 Cụm tìm kiếm" },
  { id: "rsa", label: "✍️ Quảng cáo RSA" },
  { id: "log", label: "🧾 Nhật ký ghi" },
] as const;
type TabId = typeof TABS[number]["id"];

function initialTab(sp: URLSearchParams): TabId {
  const t = sp.get("tab");
  return TABS.some((x) => x.id === t) ? (t as TabId) : "xray";
}

// useSearchParams bắt buộc Suspense boundary khi build tĩnh (xem
// node_modules/next/dist/docs/.../use-search-params.md, cùng mẫu /google-pmax).
export default function GoogleSearchPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="h-8 w-8 animate-spin text-red-500" /></div>}>
      <GoogleSearchPageInner />
    </Suspense>
  );
}

function GoogleSearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [company, setCompany] = useState<Company>("MBC");
  const [tab, setTab] = useState<TabId>(() => initialTab(searchParams));
  // Khoảng ngày dùng chung cho X-quang + RSA — tab Cụm tìm kiếm tự quản khoảng
  // ngày riêng của nó (bên trong SearchTermsTab), không đụng state này.
  const [range, setRange] = useState<DateRangeValue>(() => lastDays(DEFAULT_VIEW_DAYS));

  function changeTab(next: TabId) {
    setTab(next);
    if (searchParams.toString()) router.replace("/google-search", { scroll: false });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Search className="h-5 w-5 text-red-600" /> Quản lý Google Search
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Chẩn đoán, bật/tắt, đổi ngân sách, chặn cụm tìm kiếm đốt tiền, viết lại quảng cáo RSA — cho campaign Search.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(tab === "xray" || tab === "rsa") && (
            <DateRangeControl value={range} onChange={setRange} maxDays={MAX_RANGE_DAYS} />
          )}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {companyIds().map((v) => (
              <button key={v} onClick={() => setCompany(v)}
                className={cn("px-3 py-1.5 text-xs font-semibold transition-colors",
                  company === v ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => changeTab(t.id)}
            className={cn("flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-all",
              tab === t.id ? "bg-white text-red-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "terms" && <SearchTermsTab company={company} />}
      {tab === "xray" && <SearchXrayTab company={company} range={range} />}
      {tab === "rsa" && <SearchRsaTab company={company} range={range} />}
      {tab === "log" && <SearchLogTab company={company} />}
    </div>
  );
}
