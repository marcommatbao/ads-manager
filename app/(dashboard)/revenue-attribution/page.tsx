"use client";

// ============================================================
// Doanh thu thật — đối chiếu tiền quảng cáo với đơn hàng trong Odoo
// ------------------------------------------------------------
// Vì sao là một TRANG RIÊNG, không nhét vào /reports:
//
// /reports hiển thị ROAS lấy từ `conversions_value` / `action_values` do CHÍNH
// NỀN TẢNG QUẢNG CÁO tự khai. Trang này lấy từ ĐƠN HÀNG THẬT trong Odoo. Hai con
// số đo hai thứ khác nhau và lệch rất xa — đo ngày 25/08 (MBC, 01→25/08): nền
// tảng khai ~5,4x, đơn hàng thật cho ~1,09x; riêng nhãn brand thì Google khai
// 630,9tr trong khi Odoo ghi 281,1tr, lệch 2,24 lần.
//
// Để chung một trang thì hai con số sẽ bị đọc như hai cách tính của cùng một
// thứ, và người đọc sẽ tin con số đẹp hơn. Tách ra để mỗi trang nói rõ nó đo cái
// gì, và để trang này gánh được phần giải thích giới hạn mà nó bắt buộc phải có.
//
// Chi phí + doanh thu nền tảng tự khai: /api/dashboard/unified (cùng from/to).
// Doanh thu thật: /api/audience/campaign-revenue (chỉ đọc Odoo).
// ============================================================

import { useState } from "react";
import useSWR from "swr";
import { Wallet, TrendingUp, Receipt, AlertTriangle, RefreshCw, Info, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { orderedCompanyIds } from "@/lib/companies/registry";

interface Row { campaign: string; orders: number; revenue: number; aov: number }
interface Report {
  from: string; to: string; company: string;
  rows: Row[];
  totalOrders: number; totalRevenue: number;
  ordersWithoutCampaign: number; revenueWithoutCampaign: number;
  error: string | null;
}
interface Channel { spend: number; declaredValue: number; error: string | null }
interface Unified {
  summary: {
    total: { spend: number; declaredValue: number };
    facebook: Channel;
    google: Channel;
  };
}

type Company = string /* mã công ty hoặc "ALL" */;

const vnd = (n: number) => `₫${Math.round(n).toLocaleString("vi-VN")}`;
const short = (n: number) =>
  n >= 1_000_000_000 ? `₫${(n / 1e9).toFixed(2)} tỷ`
  : n >= 1_000_000 ? `₫${(n / 1e6).toFixed(1)} tr`
  : vnd(n);

function ymd(d: Date) {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface Loaded {
  report: Report | null;
  reportError: string | null;
  summary: Unified["summary"] | null;
  spendError: string | null;
}

/** Hai đường độc lập: Odoo hỏng thì vẫn thấy chi phí, và ngược lại. Mất một nửa
 *  số liệu vẫn hơn mất sạch, nên không dùng Promise.all-rồi-throw. */
async function loadBoth(qs: string): Promise<Loaded> {
  const [rev, spend] = await Promise.allSettled([
    fetch(`/api/audience/campaign-revenue?${qs}`).then(r => r.json() as Promise<{ report?: Report; error?: string }>),
    fetch(`/api/dashboard/unified?${qs}`).then(r => r.json() as Promise<Partial<Unified>>),
  ]);

  const out: Loaded = { report: null, reportError: null, summary: null, spendError: null };

  if (rev.status === "fulfilled") {
    out.report = rev.value.report ?? null;
    out.reportError = rev.value.report?.error ?? (rev.value.report ? null : rev.value.error ?? "Không đọc được Odoo");
  } else {
    out.reportError = "Không gọi được API doanh thu";
  }

  if (spend.status === "fulfilled" && spend.value.summary) {
    const s = spend.value.summary;
    out.summary = s;
    const errs = [
      s.facebook.error && `Facebook: ${s.facebook.error}`,
      s.google.error && `Google: ${s.google.error}`,
    ].filter(Boolean);
    out.spendError = errs.length ? errs.join(" · ") : null;
  } else {
    out.spendError = "Không lấy được chi phí quảng cáo cho kỳ này";
  }

  return out;
}

export default function RevenueAttributionPage() {
  const now = new Date();
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(ymd(now));
  const [company, setCompany] = useState<Company>(() => orderedCompanyIds(["MBC"])[0] ?? "MBC") // Đợt 25: công ty theo bản cài (bản Mắt Bão y như cũ);

  const { data, isLoading, isValidating, mutate } = useSWR(
    `from=${from}&to=${to}&company=${company}`,
    loadBoth,
    // Kỳ đã chốt thì số không đổi; đây lại là trang gọi thẳng Meta/Google nên
    // mỗi lần focus lại tab mà tự gọi là đốt quota vô ích.
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const loading = isLoading || isValidating;
  const report = data?.report ?? null;
  const spendData = data?.summary ?? null;
  const spendError = data?.spendError ?? null;
  const error = data?.reportError ?? null;

  const spend = spendData?.total.spend ?? 0;
  const declared = spendData?.total.declaredValue ?? 0;
  const tagged = report ? report.rows.reduce((n, r) => n + r.revenue, 0) : 0;
  const taggedOrders = report ? report.rows.reduce((n, r) => n + r.orders, 0) : 0;
  // Chỉ tính ROAS khi CẢ HAI vế đo được. Thiếu một vế mà vẫn chia thì ra một con
  // số trông như kết luận.
  const canRoas = spend > 0 && !spendError && report !== null && report.error === null;
  const roasReal = canRoas ? tagged / spend : null;
  const roasDeclared = spend > 0 && !spendError && declared > 0 ? declared / spend : null;
  const gap = roasReal !== null && roasDeclared !== null && roasReal > 0 ? roasDeclared / roasReal : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600" /> Doanh thu thật
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Đối chiếu tiền quảng cáo với <b>đơn hàng thật trong Odoo</b>. Khác với ROAS ở trang Reports —
            con số đó do chính nền tảng quảng cáo tự khai.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {([["MBC", "MBC"], ["ALL", "Tất cả"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setCompany(v)}
                className={cn("px-3 py-1.5 text-xs font-semibold transition-colors",
                  company === v ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
                {label}
              </button>
            ))}
          </div>
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
          <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
          <button onClick={() => void mutate()} disabled={loading}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Tải lại
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
          <div className="flex items-start justify-between">
            <span className="text-xs font-semibold text-slate-500">CHI QUẢNG CÁO</span>
            <Wallet className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-xl font-black text-slate-800 mt-2">{spendError ? "—" : short(spend)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {spendData
              ? `Google ${short(spendData.google.spend)} · Facebook ${short(spendData.facebook.spend)}`
              : "Đang lấy…"}
          </p>
          {spendError && <p className="text-[11px] text-amber-600 mt-1">⚠️ {spendError}</p>}
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
          <div className="flex items-start justify-between">
            <span className="text-xs font-semibold text-slate-500">DOANH THU ĐƠN THẬT (CÓ NHÃN)</span>
            <Receipt className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-xl font-black text-emerald-700 mt-2">{report ? short(tagged) : "—"}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {taggedOrders.toLocaleString("vi-VN")} đơn trong Odoo mang nhãn campaign
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
          <div className="flex items-start justify-between">
            <span className="text-xs font-semibold text-slate-500">ROAS ĐO BẰNG ĐƠN THẬT</span>
            <TrendingUp className="h-4 w-4 text-indigo-500" />
          </div>
          <p className={cn("text-xl font-black mt-2",
            roasReal === null ? "text-slate-400"
            : roasReal >= 2 ? "text-emerald-700" : roasReal >= 1 ? "text-amber-600" : "text-red-600")}>
            {roasReal === null ? "—" : `${roasReal.toFixed(2)}x`}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {roasReal === null ? "Thiếu một vế nên không chia" : "Doanh thu Odoo ÷ chi quảng cáo"}
          </p>
        </div>
      </div>

      {/* Đối chiếu hai cách đo — lý do trang này tồn tại */}
      {roasDeclared !== null && roasReal !== null && (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-slate-400" /> Nền tảng khai bao nhiêu, thật sự vào bao nhiêu
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
            <div>
              <p className="text-[11px] font-semibold text-slate-500">NỀN TẢNG TỰ KHAI</p>
              <p className="text-lg font-bold text-slate-700 mt-1">{roasDeclared.toFixed(2)}x</p>
              <p className="text-[11px] text-slate-400">{short(declared)} — con số Reports đang dùng</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500">ĐƠN HÀNG THẬT</p>
              <p className="text-lg font-bold text-emerald-700 mt-1">{roasReal.toFixed(2)}x</p>
              <p className="text-[11px] text-slate-400">{short(tagged)} — tiền vào tài khoản công ty</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500">CHÊNH LỆCH</p>
              <p className={cn("text-lg font-bold mt-1", (gap ?? 1) >= 1.5 ? "text-red-600" : "text-slate-700")}>
                {gap === null ? "—" : `${gap.toFixed(2)}×`}
              </p>
              <p className="text-[11px] text-slate-400">nền tảng khai cao hơn bấy nhiêu lần</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            Chênh lệch này <b>không có nghĩa nền tảng nói dối</b>. Nền tảng đếm mọi chuyển đổi nó cho là
            do mình tạo ra (kể cả view-through, kể cả người đã định mua sẵn), còn Odoo chỉ ghi đơn đã
            chốt. Con số bên phải là con số dùng để quyết định ngân sách; con số bên trái dùng để tối ưu
            trong từng nền tảng.
          </p>
        </div>
      )}

      {/* Bảng theo nhãn campaign */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-700">Theo nhãn campaign</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Nhãn lấy từ <code>campaign_id</code> của đơn hàng Odoo — do người gắn UTM đặt (dòng sản phẩm),
            không phải tên chiến dịch trên nền tảng.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-5 py-2 font-semibold">Nhãn</th>
                <th className="text-right px-5 py-2 font-semibold">Đơn</th>
                <th className="text-right px-5 py-2 font-semibold">Doanh thu</th>
                <th className="text-right px-5 py-2 font-semibold">TB/đơn</th>
                <th className="text-right px-5 py-2 font-semibold">% DT có nhãn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!report && (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400 text-xs">
                  {loading ? "Đang đọc Odoo…" : "Chưa có dữ liệu."}
                </td></tr>
              )}
              {report && report.rows.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400 text-xs">
                  Không có đơn nào mang nhãn campaign trong kỳ này.
                </td></tr>
              )}
              {report?.rows.map(r => (
                <tr key={r.campaign} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-medium text-slate-800">
                    {r.campaign}
                    {r.revenue === 0 && (
                      <span className="ml-2 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        0đ — kiểm lại đơn trong Odoo
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right text-slate-600 tabular-nums">{r.orders.toLocaleString("vi-VN")}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-slate-800 tabular-nums">{vnd(r.revenue)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-600 tabular-nums">{vnd(r.aov)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-500 tabular-nums">
                    {tagged > 0 ? `${(r.revenue / tagged * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phần KHÔNG gắn nhãn */}
      {report && report.ordersWithoutCampaign > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <Info className="h-4 w-4 text-slate-400" /> Đơn không mang nhãn campaign
          </h3>
          <p className="text-sm text-slate-700 mt-1">
            <b>{report.ordersWithoutCampaign.toLocaleString("vi-VN")} đơn</b> · {short(report.revenueWithoutCampaign)}
          </p>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Phần lớn là <b>gia hạn tự động, khách cũ, đơn qua điện thoại và kênh chat</b> — những đường
            chưa bao giờ đi qua quảng cáo nên không có UTM để mà mất. Đây <b>không phải</b> dấu hiệu
            tracking hỏng: đo riêng nhóm đơn đến từ quảng cáo trả phí thì <b>97,9%</b> đều có nhãn.
          </p>
        </div>
      )}

      {/* Giới hạn — đặt cạnh số, không giấu trong tài liệu */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <h3 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" /> Đọc con số này thế nào cho đúng
        </h3>
        <ul className="mt-2 space-y-1.5 text-xs text-amber-900 leading-relaxed">
          <li>• <b>Chiến dịch brand không tạo ra toàn bộ nhu cầu.</b> Người gõ đúng tên thương hiệu phần lớn đã định mua — gán trọn doanh thu đó cho quảng cáo là hào phóng, nên ROAS thật có thể còn thấp hơn số hiển thị.</li>
          <li>• <b>Tên miền / hosting là doanh thu lặp lại.</b> Một đơn hôm nay còn gia hạn nhiều năm sau; ROAS một tháng không phản ánh giá trị vòng đời.</li>
          <li>• <b>Chỉ tới cấp NHÃN campaign.</b> Odoo không có trường nào chứa được ad set hay phân khúc, nên không tách nhỏ hơn được.</li>
          <li>• <b>Doanh thu ở đây là <code>amount_untaxed</code> của đơn hàng</b>, khác cách tính doanh thu thuần theo hoá đơn mà card P&amp;L dùng — hai chỗ lệch nhau là bình thường.</li>
          <li>• <b>Ngày của đơn ≠ ngày của click.</b> Đơn chốt hôm nay có thể đến từ chi tiêu tuần trước; kỳ càng ngắn thì sai số này càng lớn.</li>
        </ul>
      </div>
    </div>
  );
}
