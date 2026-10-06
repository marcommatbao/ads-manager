"use client";

// ============================================================
// Settings → KPI: nhập chỉ tiêu 12 tháng/năm (DT MBC, Chi QC MBC/MBI, Đơn MBI)
// DT Quý = tự cộng 3 tháng; Tổng Chi QC = MBC + MBI (tự tính).
//
// Chi QC mỗi công ty còn phân bổ được theo kênh (Google/Facebook/TikTok/Zalo)
// để Dashboard nói được "kênh nào sắp vượt trần". Phân bổ là TUỲ CHỌN: bỏ trống
// hết thì mọi thứ chạy y như trước, chỉ không có thanh theo kênh. Tổng các kênh
// không được vượt tổng Chi QC của tháng — vượt là lưu không được, vì lưu được
// thì từng kênh đều "trong hạn mức" mà cộng lại đã quá KPI tháng.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import { Save, RefreshCw, AlertTriangle, CheckCircle2, Lock, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUILTIN_AD_CHANNELS, type AdChannelDef } from "@/lib/settings/ad-channels-def";

// Danh sách kênh lấy từ sổ kênh dùng chung (GET /api/settings/kpi trả `channels`); kênh gốc là giá trị khởi tạo.
type Channel = string;
type ChannelBudget = Record<string, number>;

/** Kênh nào có số liệu chi phí thực tế tự động, kênh nào phải khai tay. Nói ra
 *  ngay tại chỗ nhập trần, vì đặt trần cho một kênh không ai khai chi phí thì
 *  thanh tiến độ mãi mãi là 0% — trông như đang tiêu rất ít. */
const channelSource = (c: AdChannelDef): string =>
  c.key === "google" ? "Chi phí thực tế lấy tự động qua Google Ads API"
    : c.key === "facebook" ? "Chi phí thực tế lấy tự động qua Meta API"
      : "Chi phí thực tế phải khai tay ở Settings → Chi phí kênh khác";

const emptyChannels = (chs: AdChannelDef[]): ChannelBudget =>
  Object.fromEntries(chs.map(c => [c.key, 0]));

interface MonthKpi {
  revenueMbc: number;
  adSpendMbc: number;
  adSpendMbi: number;
  ordersMbi: number;
  adSpendMbcByChannel: ChannelBudget;
  adSpendMbiByChannel: ChannelBudget;
}

const emptyMonth = (chs: AdChannelDef[]): MonthKpi => ({
  revenueMbc: 0, adSpendMbc: 0, adSpendMbi: 0, ordersMbi: 0,
  adSpendMbcByChannel: emptyChannels(chs),
  adSpendMbiByChannel: emptyChannels(chs),
});

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const QUARTERS = [
  { label: "QUÝ I", months: [1, 2, 3] },
  { label: "QUÝ II", months: [4, 5, 6] },
  { label: "QUÝ III", months: [7, 8, 9] },
  { label: "QUÝ IV", months: [10, 11, 12] },
];

const fmt = (v: number) => v.toLocaleString("vi-VN");
type TotalField = "revenueMbc" | "adSpendMbc" | "adSpendMbi" | "ordersMbi";
type ChannelField = "adSpendMbcByChannel" | "adSpendMbiByChannel";

const sumChannels = (b: ChannelBudget | undefined) =>
  Object.values(b ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);

/** Một công ty = một ô tổng + một bảng phân bổ kênh. */
const SPEND_SIDES: { total: TotalField; channels: ChannelField; label: string }[] = [
  { total: "adSpendMbc", channels: "adSpendMbcByChannel", label: "Chi QC MBC" },
  { total: "adSpendMbi", channels: "adSpendMbiByChannel", label: "Chi QC MBI" },
];

export default function KpiSettingsPage() {
  const now = new Date().getFullYear();
  const [year, setYear] = useState(now);
  const [channels, setChannels] = useState<AdChannelDef[]>(BUILTIN_AD_CHANNELS);
  const [canManageChannels, setCanManageChannels] = useState(false);
  const [newChannel, setNewChannel] = useState("");
  const [chBusy, setChBusy] = useState(false);
  const [chError, setChError] = useState<string | null>(null);
  const [chNote, setChNote] = useState<string | null>(null);
  const [months, setMonths] = useState<MonthKpi[]>(() => MONTHS.map(() => emptyMonth(BUILTIN_AD_CHANNELS)));
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState<Record<ChannelField, boolean>>({
    adSpendMbcByChannel: true,
    adSpendMbiByChannel: true,
  });

  const load = useCallback(async () => {
    setLoading(true); setError(null); setSaved(false);
    try {
      const res = await fetch(`/api/settings/kpi?year=${year}`);
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok || !json.success) throw new Error(json.error ?? `Lỗi tải KPI (HTTP ${res.status})`);
      const chs: AdChannelDef[] = Array.isArray(json.channels) && json.channels.length > 0 ? json.channels : BUILTIN_AD_CHANNELS;
      setChannels(chs);
      setCanManageChannels(!!json.canManageChannels);
      setMonths((json.months as Partial<MonthKpi>[]).map(m => ({
        ...emptyMonth(chs),
        ...m,
        // Tháng lưu trước khi có tính năng này không có hai trường kênh — phải
        // bồi vào, nếu không mọi ô kênh đọc ra undefined và React đổi input từ
        // controlled sang uncontrolled giữa chừng.
        adSpendMbcByChannel: { ...emptyChannels(chs), ...(m.adSpendMbcByChannel ?? {}) },
        adSpendMbiByChannel: { ...emptyChannels(chs), ...(m.adSpendMbiByChannel ?? {}) },
      })));
      setCanEdit(!!json.canEdit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally { setLoading(false); }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const setCell = (mIdx: number, field: TotalField, val: string) => {
    setSaved(false);
    setMonths(prev => prev.map((m, i) => i === mIdx ? { ...m, [field]: Math.max(0, Number(val) || 0) } : m));
  };

  const setChannelCell = (mIdx: number, field: ChannelField, ch: Channel, val: string) => {
    setSaved(false);
    setMonths(prev => prev.map((m, i) =>
      i === mIdx ? { ...m, [field]: { ...m[field], [ch]: Math.max(0, Number(val) || 0) } } : m,
    ));
  };

  // Tháng nào phân bổ quá tay thì chặn nút Lưu ngay tại trình duyệt — server
  // cũng chặn (validateKpiYear), nhưng báo tại chỗ thì người nhập sửa được
  // ngay thay vì bấm Lưu rồi mới biết.
  // Kênh hiện ra bảng: kênh chưa ẩn + kênh đã ẩn mà vẫn còn số (để tổng không chứa số vô hình).
  const rowChannels = useMemo(() => channels.filter(c => !c.hidden || months.some(m =>
    (m?.adSpendMbcByChannel?.[c.key] ?? 0) !== 0 || (m?.adSpendMbiByChannel?.[c.key] ?? 0) !== 0)), [channels, months]);
  const manualLabels = useMemo(() => channels.filter(c => c.source === "manual" && !c.hidden).map(c => c.label), [channels]);
  const customChannels = useMemo(() => channels.filter(c => !c.builtIn), [channels]);

  const addChannel = async () => {
    const label = newChannel.trim();
    if (!label || chBusy) return;
    setChBusy(true); setChError(null); setChNote(null);
    try {
      const res = await fetch("/api/settings/ad-channels", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok || !json.channel) throw new Error(json.error ?? `Thêm kênh thất bại (HTTP ${res.status})`);
      const list: AdChannelDef[] = json.channels ?? [...channels, json.channel];
      setChannels(list);
      // Thêm số 0 cho kênh mới vào từng tháng, giữ nguyên các ô đang sửa dở.
      setMonths(prev => prev.map(m => ({
        ...m,
        adSpendMbcByChannel: { ...emptyChannels(list), ...m.adSpendMbcByChannel },
        adSpendMbiByChannel: { ...emptyChannels(list), ...m.adSpendMbiByChannel },
      })));
      setNewChannel("");
      setChNote(`Đã thêm kênh “${json.channel.label ?? label}” — nhập trần rồi bấm Lưu KPI; chi phí thực tế khai ở Settings → Chi phí kênh khác`);
    } catch (err) {
      setChError(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally { setChBusy(false); }
  };

  const toggleChannel = async (c: AdChannelDef) => {
    if (chBusy) return;
    setChBusy(true); setChError(null); setChNote(null);
    try {
      const res = await fetch("/api/settings/ad-channels", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: c.key, hidden: !c.hidden }),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok || !json.channels) throw new Error(json.error ?? `Đổi trạng thái kênh thất bại (HTTP ${res.status})`);
      setChannels(json.channels);
    } catch (err) {
      setChError(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally { setChBusy(false); }
  };

  const overAllocated = useMemo(() => {
    const out: { month: number; label: string; over: number }[] = [];
    months.forEach((m, i) => {
      for (const side of SPEND_SIDES) {
        const over = sumChannels(m[side.channels]) - (m[side.total] ?? 0);
        if (over > 0) out.push({ month: i + 1, label: side.label, over });
      }
    });
    return out;
  }, [months]);

  const save = async () => {
    if (overAllocated.length > 0) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/settings/kpi", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, months }),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok || !json.success) {
        const detail = Array.isArray(json.errors)
          ? json.errors.map((e: { message: string }) => e.message).join(" · ")
          : null;
        throw new Error(detail ?? json.error ?? `Lưu thất bại (HTTP ${res.status})`);
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi lưu");
    } finally { setSaving(false); }
  };

  const quarterRevenue = (qMonths: number[]) => qMonths.reduce((s, m) => s + (months[m - 1]?.revenueMbc ?? 0), 0);
  const totalAdSpend = (mIdx: number) => (months[mIdx]?.adSpendMbc ?? 0) + (months[mIdx]?.adSpendMbi ?? 0);
  const yearTotal = (field: TotalField) => months.reduce((s, m) => s + (m?.[field] ?? 0), 0);
  const yearAdSpend = yearTotal("adSpendMbc") + yearTotal("adSpendMbi");
  const yearChannel = (field: ChannelField, ch: Channel) =>
    months.reduce((s, m) => s + (m?.[field]?.[ch] ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-800">Chỉ tiêu KPI theo tháng</h2>
          <p className="text-sm text-slate-500">
            DT Quý tự cộng 3 tháng · Tổng Chi QC = MBC + MBI tự tính · Chi QC chia được theo kênh.
          </p>
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-amber-400">
          {[now - 1, now, now + 1].map(y => <option key={y} value={y}>Năm {y}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 disabled:opacity-50">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
        {canEdit && (
          <button onClick={save} disabled={saving || overAllocated.length > 0}
            title={overAllocated.length > 0 ? "Còn tháng phân bổ vượt tổng Chi QC — sửa trước khi lưu" : undefined}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-amber-950 text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed">
            <Save className="h-4 w-4" /> {saving ? "Đang lưu…" : "Lưu KPI"}
          </button>
        )}
      </div>

      {!canEdit && !loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
          <Lock className="h-4 w-4 shrink-0" /> Bạn chỉ xem được KPI (chỉ admin được sửa).
        </div>
      )}
      {error && <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3"><AlertTriangle className="h-4 w-4 shrink-0" /> {error}</div>}
      {saved && <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3"><CheckCircle2 className="h-4 w-4 shrink-0" /> Đã lưu KPI năm {year}.</div>}

      {overAllocated.length > 0 && (
        <div className="flex gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Chưa lưu được — có tháng chia cho kênh nhiều hơn tổng Chi QC:</p>
            <ul className="mt-1 space-y-0.5 text-[13px]">
              {overAllocated.map(o => (
                <li key={`${o.month}-${o.label}`}>
                  Tháng {o.month} · {o.label}: vượt <strong>{fmt(o.over)}đ</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!loading && canManageChannels && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newChannel} onChange={e => setNewChannel(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addChannel(); }}
              maxLength={40} placeholder="vd: ChatGPT Ads, Microsoft Ads" aria-label="Tên kênh quảng cáo mới"
              className="w-64 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-amber-400"
            />
            <button type="button" onClick={addChannel} disabled={chBusy || !newChannel.trim()}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-amber-950 text-xs font-semibold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed">
              + Thêm kênh quảng cáo
            </button>
          </div>
          {chError && <p className="text-red-700" role="alert">{chError}</p>}
          {chNote && <p className="text-emerald-700" role="status">{chNote}</p>}
          {customChannels.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {customChannels.map(c => (
                <li key={c.key} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                  <span className={cn("font-medium", c.hidden ? "text-slate-400 line-through" : "text-slate-700")}>{c.label}</span>
                  <button type="button" onClick={() => toggleChannel(c)} disabled={chBusy}
                    className="text-amber-700 hover:underline disabled:opacity-50">{c.hidden ? "Hiện" : "Ẩn"}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!loading && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900 space-y-1">
          <p>
            <strong>Phân bổ theo kênh là tuỳ chọn.</strong> Kênh để trống = chưa đặt trần, Dashboard sẽ không
            vẽ thanh cho kênh đó. Tổng các kênh được phép nhỏ hơn tổng Chi QC — phần chênh hiện ở dòng
            <em> chưa phân bổ</em>.
          </p>
          <p>
            Chi phí thực tế của <strong>Google và Facebook</strong> hệ thống tự lấy qua API. <strong>{manualLabels.length > 0 ? manualLabels.join(" và ") : "TikTok và Zalo"}</strong> không có API — phải khai ở <em>Settings → Chi phí kênh khác</em>, không khai thì trần
            đặt ở đây luôn hiện 0%.
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-6 space-y-2">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-9 rounded bg-slate-100 animate-pulse" />)}</div>
        ) : (
          <table className="w-full border-collapse text-sm min-w-[1100px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-800 text-white text-left px-3 py-2 text-xs font-semibold">Chỉ tiêu</th>
                {QUARTERS.map(q => (
                  <th key={q.label} colSpan={3} className="bg-amber-400 text-slate-900 px-2 py-1.5 text-xs font-bold text-center border-l border-white">{q.label}</th>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-700 text-white text-left px-3 py-1.5 text-[11px] font-semibold">DT Quý (MBC) →</th>
                {QUARTERS.map(q => (
                  <th key={q.label} colSpan={3} className="bg-blue-50 text-blue-700 px-2 py-1.5 text-[11px] font-bold text-center tabular-nums border-l border-white">
                    {fmt(quarterRevenue(q.months))}đ
                  </th>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-100 text-slate-500 text-left px-3 py-1.5 text-[11px]">Tháng</th>
                {MONTHS.map(m => (
                  <th key={m} className={cn("px-2 py-1.5 text-[11px] font-semibold text-slate-500 text-center", m % 3 === 1 && "border-l border-slate-200")}>T{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Doanh thu MBC */}
              <TotalRow label="Doanh thu MBC" field="revenueMbc" months={months} canEdit={canEdit} onChange={setCell} />

              {/* Chi QC MBC / MBI + phân bổ kênh */}
              {SPEND_SIDES.map(side => {
                const expanded = open[side.channels];
                return (
                  <Fragmented key={side.total}>
                    <tr className="border-t border-slate-100">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-xs font-semibold text-slate-600 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setOpen(o => ({ ...o, [side.channels]: !o[side.channels] }))}
                          className="flex items-center gap-1 hover:text-amber-600"
                          title={expanded ? "Thu gọn phân bổ theo kênh" : "Mở phân bổ theo kênh"}
                        >
                          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          {side.label}
                        </button>
                      </td>
                      {MONTHS.map((m, i) => (
                        <td key={m} className={cn("px-1 py-1", m % 3 === 1 && "border-l border-slate-200")}>
                          <input
                            type="number" min={0} disabled={!canEdit}
                            value={months[i]?.[side.total] || ""}
                            onChange={e => setCell(i, side.total, e.target.value)}
                            className="w-full min-w-[88px] text-right tabular-nums rounded-md border border-slate-200 px-1.5 py-1 text-xs focus:outline-none focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-500"
                            placeholder="0"
                          />
                        </td>
                      ))}
                    </tr>

                    {expanded && rowChannels.map(chDef => {
                      const ch = chDef.key;
                      return (
                      <tr key={`${side.channels}-${ch}`} className="bg-slate-50/50">
                        <td className="sticky left-0 z-10 bg-slate-50 px-3 py-1 text-[11px] text-slate-500 whitespace-nowrap" title={channelSource(chDef)}>
                          <span className="text-slate-300 mr-1">└</span>{chDef.label}
                          {chDef.source === "manual" && (
                            <span className="ml-1 text-[9px] text-amber-600" title={channelSource(chDef)}>(nhập tay)</span>
                          )}
                          {chDef.hidden && (
                            <span className="ml-1 text-[9px] text-slate-400">(đã ẩn)</span>
                          )}
                        </td>
                        {MONTHS.map((m, i) => (
                          <td key={m} className={cn("px-1 py-0.5", m % 3 === 1 && "border-l border-slate-200")}>
                            <input
                              type="number" min={0} disabled={!canEdit || !!chDef.hidden}
                              value={months[i]?.[side.channels]?.[ch] || ""}
                              onChange={e => setChannelCell(i, side.channels, ch, e.target.value)}
                              className="w-full min-w-[88px] text-right tabular-nums rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-amber-400 disabled:bg-slate-100 disabled:text-slate-500"
                              placeholder="0"
                            />
                          </td>
                        ))}
                      </tr>
                      );
                    })}

                    {expanded && (
                      <tr className="bg-slate-50/50 border-b border-slate-200">
                        <td className="sticky left-0 z-10 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-500 whitespace-nowrap">
                          <span className="text-slate-300 mr-1">└</span>chưa phân bổ
                        </td>
                        {MONTHS.map((m, i) => {
                          const rest = (months[i]?.[side.total] ?? 0) - sumChannels(months[i]?.[side.channels]);
                          return (
                            <td key={m} className={cn("px-2 py-1 text-right text-[11px] tabular-nums", m % 3 === 1 && "border-l border-slate-200")}>
                              {rest < 0 ? (
                                <span className="font-bold text-red-600" title="Phân bổ cho các kênh đang nhiều hơn tổng Chi QC tháng này">
                                  vượt {fmt(-rest)}đ
                                </span>
                              ) : (
                                <span className={rest === 0 ? "text-slate-300" : "text-slate-500"}>{fmt(rest)}đ</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </Fragmented>
                );
              })}

              {/* Đơn hàng MBI */}
              <TotalRow label="Đơn hàng MBI" field="ordersMbi" months={months} canEdit={canEdit} onChange={setCell} />

              {/* Tổng Chi QC (auto) */}
              <tr className="border-t border-slate-200 bg-violet-50/40">
                <td className="sticky left-0 z-10 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 whitespace-nowrap">Tổng Chi QC (auto)</td>
                {MONTHS.map((m, i) => (
                  <td key={m} className={cn("px-2 py-2 text-right text-xs font-bold text-violet-700 tabular-nums", m % 3 === 1 && "border-l border-slate-200")}>
                    {fmt(totalAdSpend(i))}đ
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* ── Tổng năm ── */}
      {!loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <TotalCard label="Tổng KPI Doanh Thu (MBC)" value={`${fmt(yearTotal("revenueMbc"))}đ`} accent="text-blue-700 bg-blue-50" />
            <TotalCard label="Tổng KPI Đơn Hàng (MBI)" value={fmt(yearTotal("ordersMbi"))} accent="text-emerald-700 bg-emerald-50" />
            <TotalCard label="Tổng Chi QC MBC" value={`${fmt(yearTotal("adSpendMbc"))}đ`} accent="text-slate-700 bg-slate-100" />
            <TotalCard label="Tổng Chi QC MBI" value={`${fmt(yearTotal("adSpendMbi"))}đ`} accent="text-slate-700 bg-slate-100" />
            <TotalCard label="Tổng Chi QC (MBC+MBI)" value={`${fmt(yearAdSpend)}đ`} accent="text-violet-700 bg-violet-50" strong />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-700 mb-3">Phân bổ theo kênh — cả năm {year}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-[11px] uppercase text-slate-400">
                    <th className="text-left font-semibold px-2 py-1.5">Công ty</th>
                    {rowChannels.map(c => <th key={c.key} className="text-right font-semibold px-2 py-1.5">{c.label}</th>)}
                    <th className="text-right font-semibold px-2 py-1.5">Chưa phân bổ</th>
                    <th className="text-right font-semibold px-2 py-1.5">Tổng Chi QC</th>
                  </tr>
                </thead>
                <tbody>
                  {SPEND_SIDES.map(side => {
                    const total = yearTotal(side.total);
                    const allocated = channels.reduce((s, c) => s + yearChannel(side.channels, c.key), 0);
                    const rest = total - allocated;
                    return (
                      <tr key={side.total} className="border-t border-slate-100">
                        <td className="px-2 py-2 text-xs font-semibold text-slate-600 whitespace-nowrap">{side.label}</td>
                        {rowChannels.map(c => (
                          <td key={c.key} className="px-2 py-2 text-right text-xs tabular-nums text-slate-700">
                            {fmt(yearChannel(side.channels, c.key))}đ
                          </td>
                        ))}
                        <td className={cn("px-2 py-2 text-right text-xs tabular-nums font-semibold", rest < 0 ? "text-red-600" : "text-slate-400")}>
                          {rest < 0 ? `vượt ${fmt(-rest)}đ` : `${fmt(rest)}đ`}
                        </td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums font-bold text-violet-700">{fmt(total)}đ</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Số cả năm chỉ để nhìn tổng thể — trần chặn theo <strong>từng tháng</strong>, không phải theo năm.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** Gói nhiều <tr> trong một vòng lặp mà không chèn thẻ lạ vào <tbody>. */
function Fragmented({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function TotalRow({ label, field, months, canEdit, onChange }: {
  label: string; field: TotalField; months: MonthKpi[]; canEdit: boolean;
  onChange: (mIdx: number, field: TotalField, val: string) => void;
}) {
  return (
    <tr className="border-t border-slate-100">
      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-xs font-semibold text-slate-600 whitespace-nowrap">{label}</td>
      {MONTHS.map((m, i) => (
        <td key={m} className={cn("px-1 py-1", m % 3 === 1 && "border-l border-slate-200")}>
          <input
            type="number" min={0} disabled={!canEdit}
            value={months[i]?.[field] || ""}
            onChange={e => onChange(i, field, e.target.value)}
            className="w-full min-w-[88px] text-right tabular-nums rounded-md border border-slate-200 px-1.5 py-1 text-xs focus:outline-none focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-500"
            placeholder="0"
          />
        </td>
      ))}
    </tr>
  );
}

function TotalCard({ label, value, accent, strong }: { label: string; value: string; accent: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-slate-100 p-3", strong ? "" : "bg-white")}>
      <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1 leading-tight">{label}</p>
      <p className={cn("font-black tabular-nums leading-tight", strong ? "text-base" : "text-sm", accent.split(" ")[0])}>{value}</p>
    </div>
  );
}
