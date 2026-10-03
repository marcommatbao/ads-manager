"use client"
import { useState, useEffect, useCallback } from "react"
import { useAdsStore }         from "@/store/useAdsStore"
import { companyIds } from "@/lib/companies/registry";
import { isCompany } from "@/lib/companies/registry";

type Company = string

// Google and Meta expose different CPL semantics, so the API returns
// different field names per channel (see app/api/attribution/route.ts).
interface GoogleChannelStats {
  spend: number
  conv: number
  revenue: number
  roas: number
  share: number
  cpl: number
  viewThrough: number
  conversionBasis: string
  /** Rổ conversion của Google gồm những action nào. Rỗng = không tách được,
   *  KHÔNG phải "tài khoản không có conversion action nào". */
  conversionActions?: Array<{ name: string; category: string; conv: number }>
}

interface FacebookChannelStats {
  spend: number
  conv: number
  revenue: number
  roas: number
  share: number
  cpl_lastClick: number
  conversionBasis: string
  companySplit: string
  unclassifiedSpend: number
  unclassifiedCampaigns: number
}

interface CampaignRow {
  name: string
  /** Trạng thái hiện tại của campaign Google ("PAUSED"/"REMOVED"/"ENABLED").
   *  Rỗng với Facebook — Meta không trả ở mức này. */
  status?: string
  platform: string
  /** Google advertising_channel_type, e.g. SEARCH / PERFORMANCE_MAX. */
  type: string
  spend: number
  conv: number
  revenue: number
  roas: number
  cpl: number
  viewThrough: number
  viewThroughShare: number
  role: string
}

interface AttributionData {
  dateRange: string
  summary?: { totalSpend: number; totalConv: number; totalRevenue: number; totalCPL: number; totalRoas: number }
  channels: { google: GoogleChannelStats; facebook: FacebookChannelStats }
  campaignBreakdown: CampaignRow[]
  facebookBreakdown: CampaignRow[]
  wasted?: {
    google: { campaigns: number; spend: number }
    facebook: { campaigns: number; spend: number }
  }
  dataQuality?: {
    window: { from: string; to: string; days: number }
    metaError: string | null
    revenueSource: string
  }
  keyInsights: string[]
}

const ROLE_BADGE: Record<string, string> = {
  AWARENESS:        "bg-blue-100 text-blue-700",
  CLOSING:          "bg-green-100 text-green-700",
  FULL_CREDIT:      "bg-purple-100 text-purple-700",
  "AWARENESS/ASSIST": "bg-orange-100 text-orange-700",
  "VỪA ĐÓNG VỪA HỖ TRỢ": "bg-amber-100 text-amber-700",
  "CHƯA ĐỦ DỮ LIỆU": "bg-slate-100 text-slate-500",
  "KHÔNG ĐO ĐƯỢC": "bg-slate-100 text-slate-400",
  "KHÔNG CÓ CONVERSION": "bg-red-100 text-red-700",
}

// Doanh thu 0 kèm conversion > 0 KHÔNG phải hiệu quả bằng 0 — đó là chiến dịch
// chưa gắn giá trị chuyển đổi (lead-gen trên Meta mặc định không có giá trị).
// Hiện "₫0 / 0.00x" ở đây đọc thành thất bại, trong khi sự thật là không đo được.
function revenueCell(revenue: number, conv: number): { revenue: string; roas: string; note?: string } {
  if (revenue > 0) return { revenue: fmtVnd(revenue), roas: "" }
  if (conv > 0) return { revenue: "—", roas: "—", note: "Chưa gắn giá trị chuyển đổi" }
  return { revenue: "—", roas: "—" }
}

const fmtVnd = (n: number) => `₫${n.toLocaleString("vi-VN")}`

export default function AttributionPage() {

  const storeCompany         = useAdsStore(s => s.selectedCompany)
  // /api/attribution resolves a single Google Ads customer, so it only accepts
  // MBC or MBI. The store's default is "all", which this page used to forward
  // verbatim — canAccessCompany() rejected it with 403 and the render below
  // then crashed on `data.channels.google`.
  const [company, setCompany] = useState<Company>(
    storeCompany === "MBI" ? "MBI" : "MBC"
  )
  const [range,   setRange]  = useState("LAST_30_DAYS")
  const [data,    setData]   = useState<AttributionData | null>(null)
  const [error,   setError]  = useState<string | null>(null)
  const [loading, setLoading]= useState(true)

  useEffect(() => {
    if (isCompany(storeCompany)) setCompany(storeCompany)
  }, [storeCompany])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/attribution?company=${company}&range=${range}`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json || json.error) {
        throw new Error(json?.error ?? `HTTP ${res.status}`)
      }
      setData(json as AttributionData)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu attribution")
    } finally {
      setLoading(false)
    }
  }, [company, range])

  useEffect(() => { void fetchData() }, [fetchData])

  return (
    <div className="space-y-5 p-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            🔗 So sánh hiệu quả kênh
          </h1>
          <p className="text-sm text-gray-500">
            {/* Đổi từ "Khách đi qua kênh nào trước khi mua?" — hệ thống không có
                dữ liệu điểm chạm đa kênh, nên tiêu đề cũ hứa một thứ số liệu bên
                dưới không đỡ được. Đây là so sánh last-click giữa hai nền tảng. */}
            Kênh nào mang về doanh thu thật, với chi phí bao nhiêu (last-click)
          </p>
        </div>
        <div className="flex items-center gap-2">
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          {companyIds().map(c => (
            <button key={c}
              onClick={() => setCompany(c)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                company === c
                  ? "bg-amber-500 text-amber-950"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          {[
            { label: "30 ngày", value: "LAST_30_DAYS" },
            { label: "60 ngày", value: "LAST_60_DAYS" },
            { label: "90 ngày", value: "LAST_90_DAYS" },
          ].map(opt => (
            <button key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                range === opt.value
                  ? "bg-amber-500 text-amber-950"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          Không tải được dữ liệu attribution: {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i}
              className="h-24 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : data?.channels?.google && data.channels.facebook ? (
        <>
          {/* ── Key Insights Banner ── */}
          {data.keyInsights?.length > 0 && (
            <div className="space-y-2">
              {data.keyInsights.map((ins: string, i: number) => (
                <div key={i}
                  className="rounded-2xl bg-blue-50 border border-blue-200
                               px-5 py-3 flex gap-3">
                  <span className="text-lg">💡</span>
                  <p className="text-sm text-blue-800">{ins}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Channel Comparison ── */}
          <div className="grid grid-cols-2 gap-4">

            {/* Google */}
            <div className="rounded-2xl border border-gray-100 bg-white
                            shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-red-100
                                flex items-center justify-center text-lg">
                  🔴
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Google Ads</h3>
                  <p className="text-xs text-gray-500">
                    {data.channels.google.share}% conversions
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  {
                    label: "Spend",
                    value: `₫${new Intl.NumberFormat("vi-VN")
                      .format(data.channels.google.spend)}`
                  },
                  {
                    label: "Conversions",
                    value: (data.channels.google.conv ?? 0).toFixed(1),
                    note: data.channels.google.conversionBasis,
                  },
                  {
                    label: "Doanh thu",
                    value: revenueCell(data.channels.google.revenue ?? 0, data.channels.google.conv ?? 0).revenue,
                    note: revenueCell(data.channels.google.revenue ?? 0, data.channels.google.conv ?? 0).note,
                  },
                  {
                    label: "ROAS",
                    value: (data.channels.google.revenue ?? 0) > 0
                      ? `${(data.channels.google.roas ?? 0).toFixed(2)}x`
                      : "—",
                  },
                  {
                    label: "CPL (last-click)",
                    value: `₫${new Intl.NumberFormat("vi-VN")
                      .format(data.channels.google.cpl)}`
                  },
                  {
                    label: "View-through conv",
                    value: (data.channels.google.viewThrough ?? 0).toFixed(0),
                    note:  "Assisted bởi Display/PMax"
                  },
                ].map(item => (
                  <div key={item.label}
                    className="flex justify-between text-sm">
                    <span className="text-gray-500">{item.label}</span>
                    <div className="text-right">
                      <span className="font-medium text-gray-800">
                        {item.value}
                      </span>
                      {item.note && (
                        <div className="text-xs text-gray-400">
                          {item.note}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Rổ conversion của Google — thứ quyết định con số ở trên có so
                  được với lead+purchase của Facebook hay không. Không bày ra
                  thì "56% vs 44%" chỉ là hai con số cạnh nhau, không ai kiểm
                  chứng được. */}
              {(data.channels.google.conversionActions?.length ?? 0) > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-1.5">
                    {data.channels.google.conv.toFixed(1)} conversion này gồm:
                  </p>
                  <div className="space-y-1">
                    {data.channels.google.conversionActions!.slice(0, 6).map(a => (
                      <div key={a.name} className="flex justify-between gap-3 text-xs">
                        <span className="text-gray-600 truncate" title={`${a.name} · ${a.category}`}>
                          {a.name}
                          {a.category && (
                            <span className="text-gray-400"> · {a.category}</span>
                          )}
                        </span>
                        <span className="font-medium text-gray-700 shrink-0 tabular-nums">
                          {a.conv.toLocaleString("vi-VN")}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-amber-600 mt-2">
                    ⚠️ Facebook chỉ đếm <b>lead</b> + <b>purchase</b>. Action nào ở trên không
                    tương đương hai loại đó thì % conversion, CPL và ROAS giữa hai kênh
                    <b> không so trực tiếp được</b>.
                  </p>
                </div>
              )}
            </div>

            {/* Facebook */}
            <div className="rounded-2xl border border-gray-100 bg-white
                            shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-blue-100
                                flex items-center justify-center text-lg">
                  🔵
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Facebook Ads</h3>
                  <p className="text-xs text-gray-500">
                    {data.channels.facebook.share}% conversions · tách theo tên campaign
                  </p>
                </div>
              </div>

              {/* Meta lỗi thì phải nói ra. Con số 0 im lặng đọc thành
                  "Facebook không bán được gì" — một câu hoàn toàn khác. */}
              {data.dataQuality?.metaError && (
                <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  Không lấy được dữ liệu Facebook: {data.dataQuality.metaError}
                </div>
              )}

              <div className="space-y-3">
                {[
                  {
                    label: "Spend",
                    value: `₫${new Intl.NumberFormat("vi-VN")
                      .format(data.channels.facebook.spend)}`,
                    note: undefined as string | undefined,
                  },
                  {
                    label: "Conversions",
                    value: String(data.channels.facebook.conv),
                    note: data.channels.facebook.conversionBasis,
                  },
                  {
                    label: "Doanh thu",
                    value: revenueCell(data.channels.facebook.revenue ?? 0, data.channels.facebook.conv ?? 0).revenue,
                    note: revenueCell(data.channels.facebook.revenue ?? 0, data.channels.facebook.conv ?? 0).note,
                  },
                  {
                    label: "ROAS",
                    value: (data.channels.facebook.revenue ?? 0) > 0
                      ? `${(data.channels.facebook.roas ?? 0).toFixed(2)}x`
                      : "—",
                    note: undefined,
                  },
                  {
                    label: "CPL (last-click)",
                    value: `₫${new Intl.NumberFormat("vi-VN")
                      .format(data.channels.facebook.cpl_lastClick)}`,
                    note: undefined,
                  },
                ].map(item => (
                  <div key={item.label}
                    className="flex justify-between text-sm">
                    <span className="text-gray-500">{item.label}</span>
                    <div className="text-right">
                      <span className="font-medium text-gray-800">
                        {item.value}
                      </span>
                      {item.note && (
                        <div className="text-xs text-gray-400 max-w-[220px]">{item.note}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Một ad account Meta dùng chung cho cả hai công ty — campaign
                  không mang dấu MBC/MBI thì không được tính vào công ty nào. */}
              {data.channels.facebook.unclassifiedCampaigns > 0 && (
                <p className="mt-3 text-[11px] text-slate-400">
                  {data.channels.facebook.unclassifiedCampaigns} campaign chưa phân loại được công ty
                  ({fmtVnd(data.channels.facebook.unclassifiedSpend)}) — không tính vào số trên
                </p>
              )}
            </div>
          </div>

          {/* Cross-channel "customer journey" (multi-touch path breakdown)
              previously shown here was fabricated — fixed percentages with
              no real touchpoint/session data behind them. Removed rather
              than kept as fake data; real multi-touch attribution needs a
              real tracking pipeline this app doesn't have yet. */}

          {/* ── Campaign Breakdown — xếp theo doanh thu, không theo CPL rẻ ── */}
          <div className="rounded-2xl border border-gray-100 bg-white
                          shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="font-semibold text-gray-800">
                Từng campaign mang về bao nhiêu
              </h3>
              {/* Campaign tiêu tiền mà không ra conversion từng bị lọc khỏi bảng
                  này — đúng những dòng cần nhìn nhất. Giờ chúng nằm trong bảng
                  và được cộng riêng ở đây để không phải tự dò. */}
              {data.wasted && (data.wasted.google.spend + data.wasted.facebook.spend) > 0 && (
                <p className="mt-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
                  {fmtVnd(data.wasted.google.spend + data.wasted.facebook.spend)} đang chi cho{" "}
                  {data.wasted.google.campaigns + data.wasted.facebook.campaigns} campaign{" "}
                  <strong>không ra conversion nào</strong> trong khoảng này
                  {data.summary?.totalSpend
                    ? ` — ${Math.round(((data.wasted.google.spend + data.wasted.facebook.spend) / data.summary.totalSpend) * 100)}% tổng chi`
                    : ""}
                  {" "}(Google {fmtVnd(data.wasted.google.spend)} · Facebook {fmtVnd(data.wasted.facebook.spend)})
                </p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                Xếp theo doanh thu. &quot;Vai trò&quot; đọc từ tỉ lệ conversion không qua click:
                từ 50% trở lên là chủ yếu hỗ trợ, từ 25% là vừa đóng vừa hỗ trợ, dưới đó là
                đóng đơn. Dưới 5 conversion thì chưa đủ cơ sở gắn nhãn; campaign Facebook
                không đo được vì Meta không trả view-through ở mức này.
              </p>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50 text-left">
                  <th className="px-5 py-3 text-gray-500 font-medium">Campaign</th>
                  <th className="px-5 py-3 text-gray-500 font-medium text-right">Spend</th>
                  <th className="px-5 py-3 text-gray-500 font-medium text-right">Conv</th>
                  <th className="px-5 py-3 text-gray-500 font-medium text-right">Doanh thu</th>
                  <th className="px-5 py-3 text-gray-500 font-medium text-right">ROAS</th>
                  <th className="px-5 py-3 text-gray-500 font-medium text-right">CPL</th>
                  <th className="px-5 py-3 text-gray-500 font-medium text-center">Vai trò</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...(data.campaignBreakdown ?? []), ...(data.facebookBreakdown ?? [])]
                  .sort((a, b) => b.revenue - a.revenue || a.cpl - b.cpl)
                  .map((c: CampaignRow) => (
                  <tr key={`${c.platform}:${c.name}`} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-800 truncate max-w-xs">
                        {c.name}
                      </div>
                      <div className="text-xs text-gray-400">
                        {c.platform === "facebook" ? "FACEBOOK" : c.type}
                        {c.viewThrough > 0 && ` · ${c.viewThroughShare}% view-through`}
                        {/* Campaign đã tắt vẫn nằm đây vì nó ĐÃ tiêu tiền trong
                            kỳ — đánh dấu để không ai tưởng nó đang chạy. */}
                        {c.status && c.status !== "ENABLED" && (
                          <span className="ml-1 text-amber-600">
                            · {c.status === "PAUSED" ? "đã tạm dừng" : "đã xoá"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">
                      ₫{new Intl.NumberFormat("vi-VN").format(c.spend)}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">
                      {(c.conv ?? 0).toFixed(1)}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-gray-800">
                      {c.revenue > 0 ? fmtVnd(c.revenue) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">
                      {c.revenue > 0 ? `${c.roas.toFixed(2)}x` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">
                      ₫{new Intl.NumberFormat("vi-VN").format(c.cpl)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`rounded-full px-3 py-1 text-xs
                                        font-medium ${ROLE_BADGE[c.role] || "bg-gray-100 text-gray-600"}`}>
                        {c.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Nguồn doanh thu + khoảng ngày thật đang dùng cho cả hai kênh. */}
          {data.dataQuality && (
            <p className="text-[11px] text-slate-400">
              Doanh thu theo tracking của chính nền tảng quảng cáo — chưa đối chiếu Odoo ·
              cả hai kênh cùng khoảng {data.dataQuality.window.from} → {data.dataQuality.window.to}
              {" "}({data.dataQuality.window.days} ngày)
            </p>
          )}
        </>
      ) : !error ? (
        <p className="text-sm text-gray-500">Không có dữ liệu attribution cho khoảng thời gian này.</p>
      ) : null}
    </div>
  )
}
