"use client";

// ============================================================
// Việc nên làm hôm nay (Đợt 15a) — gộp việc từ PMax/Search/Meta/NBA/phiên xử lý/
// sức khoẻ đo lường thành MỘT hộp, xếp ① Số đo sai → ② Lãng phí rõ → ③ Cơ hội.
// Đọc GET /api/inbox (lib/inbox/store.ts + build.ts), đổi trạng thái qua
// POST /api/inbox. Hộp việc KHÔNG tự ghi gì lên tài khoản quảng cáo.
// Mockup đã duyệt 29/09: docs/mockups/xu-ly-chien-dich/screens/d15-viec-hom-nay.html
// (+ d15-viec-trong.html, d15-viec-loi.html) — xem docs/DESIGN-DOT15.md §2.
// ============================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, Inbox as InboxIcon, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pill, type PillTone } from "@/components/measure/Pill";
import { vnd } from "@/components/case/format";
import { getJson, postJson, ApiError } from "@/components/case/api";
import { useToast } from "@/components/Toast";
import { KIND_LABEL, SOURCE_LABEL, STATUS_LABEL } from "@/lib/inbox/labels";
import type { InboxKind, InboxSource } from "@/lib/inbox/build";
import type { InboxStatus, InboxView } from "@/lib/inbox/store";
import type { Company } from "@/lib/case/types";

// ── Kiểu dữ liệu trả về từ GET /api/inbox (xem app/api/inbox/route.ts) ──
interface InboxApiResponse {
  success: true;
  builtAt: string | null;
  items: InboxView[];
  errors: { company: Company | "ALL"; source: InboxSource; error: string }[];
  digest: { sentAt: string; keys: string[]; sent: boolean; notConfigured?: boolean; error?: string } | null;
  adsChannel: boolean;
  canEdit: boolean;
}

const KIND_ORDER: InboxKind[] = [1, 2, 3];
const KIND_EXPLAIN: Record<InboxKind, string> = {
  1: "Mọi việc khác dựa trên số này — sửa trước khi tối ưu tiếp theo số đang sai.",
  2: "Chi 30 ngày đang rơi vào phần không ra đơn.",
  3: "Ước tính thêm — chưa chắc chắn như ① và ②, chỉ nên làm sau khi đã xử lý xong hai loại trên.",
};
const KIND_TONE: Record<InboxKind, PillTone> = { 1: "red", 2: "amber", 3: "blue" };

const STATUS_TONE: Record<InboxStatus, PillTone> = { new: "blue", seen: "grey", snoozed: "amber", done: "green", dismissed: "grey" };
const STATUS_SYMBOL: Record<InboxStatus, string> = { new: "○", seen: "✓", snoozed: "◷", done: "✓", dismissed: "⏭" };

type StatusFilter = "open" | "snoozed" | "done" | "dismissed" | "all";
const isOpenStatus = (s: InboxStatus) => s === "new" || s === "seen";

/** "2026-09-29T10:13:42.509Z" → "17:13 29/09" (giờ Việt Nam). */
function hhmmDdMm(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")} ${get("day")}/${get("month")}`;
}
function hhmm(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}
/** "2026-10-03T00:00:00+07:00" → "03/10" */
function ddmm(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}
/** Nhãn tiền: gắn "· 30 ngày" trừ khi nhãn đã tự ghi "/ tháng" (NBA). */
function moneySuffix(label: string | null): string {
  if (!label) return "";
  return label.includes("tháng") ? label : `${label} · 30 ngày`;
}
function todayPlusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

type DialogState = { type: "snooze" | "dismiss"; item: InboxView } | null;

export default function ViecHomNayPage() {
  const { data, error, isLoading, mutate } = useSWR<InboxApiResponse>("/api/inbox", getJson);
  const { toast } = useToast();

  const [companyFilter, setCompanyFilter] = useState<"ALL" | Company>("ALL");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | InboxSource>("ALL");
  const [kindFilter, setKindFilter] = useState<"ALL" | InboxKind>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");

  const [dialog, setDialog] = useState<DialogState>(null);
  const [snoozeDate, setSnoozeDate] = useState(() => todayPlusDays(7));
  const [dismissReason, setDismissReason] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  const items = useMemo(() => data?.items ?? [], [data]);

  const filtered = useMemo(
    () =>
      items.filter(
        (it) =>
          (companyFilter === "ALL" || it.company === companyFilter) &&
          (sourceFilter === "ALL" || it.source === sourceFilter) &&
          (kindFilter === "ALL" || it.kind === kindFilter) &&
          (statusFilter === "all" || (statusFilter === "open" ? isOpenStatus(it.status) : it.status === statusFilter)),
      ),
    [items, companyFilter, sourceFilter, kindFilter, statusFilter],
  );

  const grouped = useMemo(() => {
    const m = new Map<InboxKind, InboxView[]>();
    for (const k of KIND_ORDER) m.set(k, []);
    for (const it of filtered) m.get(it.kind)!.push(it);
    return m;
  }, [filtered]);

  async function act(key: string, body: { status: InboxStatus; until?: string; reason?: string }, successMsg: string) {
    setPendingKey(key);
    setActionError((prev) => ({ ...prev, [key]: "" }));
    try {
      await postJson("/api/inbox", { key, ...body });
      await mutate();
      toast({ title: successMsg, variant: "success" });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Lỗi không xác định — thử lại";
      setActionError((prev) => ({ ...prev, [key]: msg }));
      toast({ title: msg, variant: "error" });
    } finally {
      setPendingKey(null);
    }
  }

  function openSnooze(item: InboxView) {
    setSnoozeDate(todayPlusDays(7));
    setDialog({ type: "snooze", item });
  }
  function openDismiss(item: InboxView) {
    setDismissReason("");
    setDialog({ type: "dismiss", item });
  }
  async function submitSnooze() {
    if (!dialog) return;
    await act(dialog.item.key, { status: "snoozed", until: snoozeDate }, "Đã hoãn — sẽ hiện lại đúng ngày, hoặc sớm hơn nếu tiền tăng >50%");
    setDialog(null);
  }
  async function submitDismiss() {
    if (!dialog || dismissReason.trim().length < 3) return;
    await act(dialog.item.key, { status: "dismissed", reason: dismissReason.trim() }, "Đã bỏ qua — sẽ hiện lại nếu tiền tăng >50%");
    setDialog(null);
  }

  const canEdit = !!data?.canEdit;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <InboxIcon className="h-5 w-5 text-blue-600" aria-hidden="true" /> Việc nên làm hôm nay
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Gộp từ PMax, Search, Meta, phiên xử lý &amp; sức khoẻ đo lường — xếp <b>① Số đo sai</b> trước (chặn mọi quyết định khác), rồi <b>② Lãng phí rõ</b>, rồi <b>③ Cơ hội</b>; trong mỗi loại xếp theo tiền.
          </p>
        </div>
        <Button className="h-10" variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading}>
          <RefreshCw className={isLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden="true" /> Tải lại
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      )}

      {!isLoading && error && (
        <EmptyState
          icon={AlertTriangle}
          title={error instanceof ApiError ? error.message : "Không tải được hộp việc"}
          action={<Button className="h-10" onClick={() => mutate()}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Thử lại</Button>}
        />
      )}

      {!isLoading && !error && data && (
        <>
          {/* Hộp việc CHƯA từng dựng (job 07:45 chưa chạy lần nào) */}
          {data.builtAt === null ? (
            <EmptyState
              icon={InboxIcon}
              title="Hộp việc chưa được dựng"
              description="Job dựng hộp việc chạy lúc 07:45 mỗi ngày — quay lại sau, hoặc bấm Tải lại nếu vừa qua giờ đó."
              action={<Button className="h-10" variant="outline" onClick={() => mutate()}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Tải lại</Button>}
            />
          ) : (
            <>
              {/* Dòng cập nhật + digest Teams */}
              <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  <div>Cập nhật <b>{hhmmDdMm(data.builtAt)}</b></div>
                  {data.digest?.sent && (
                    <div>Đã gửi <b>{data.digest.keys.length} việc</b> lên Teams lúc <b>{hhmm(data.digest.sentAt)}</b></div>
                  )}
                  {data.digest?.notConfigured && (
                    <div className="text-blue-600">Chưa cấu hình kênh Teams Ads — việc vẫn hiện ở đây, chỉ không gửi.</div>
                  )}
                  {data.digest?.error && (
                    <div className="flex items-center gap-1.5 text-amber-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Không gửi được thẻ Teams: {data.digest.error}</div>
                  )}
                </div>
              </div>

              {/* Nguồn đọc hỏng — KHÔNG hiện số cũ */}
              {data.errors.length > 0 && (
                <div className="space-y-2">
                  {data.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <div>
                        <div>Không đọc được <b>{SOURCE_LABEL[e.source]}</b> {e.company !== "ALL" ? e.company : ""}: {e.error}</div>
                        <div className="text-xs text-red-500">Việc từ nguồn này không hiện ở đây để tránh xử lý trên số cũ — các nguồn khác bên dưới không bị ảnh hưởng.</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Bộ lọc */}
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[140px]">
                  <div className="mb-1 text-xs font-medium text-slate-400">Công ty</div>
                  <Select value={companyFilter} onValueChange={(v) => setCompanyFilter(v as "ALL" | Company)}>
                    <SelectTrigger aria-label="Công ty"><SelectValue>{(v: string) => (v === "ALL" ? "Tất cả" : v)}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tất cả</SelectItem>
                      <SelectItem value="MBC">MBC</SelectItem>
                      <SelectItem value="MBI">MBI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[180px]">
                  <div className="mb-1 text-xs font-medium text-slate-400">Nguồn</div>
                  <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as "ALL" | InboxSource)}>
                    <SelectTrigger aria-label="Nguồn"><SelectValue>{(v: string) => (v === "ALL" ? "Tất cả" : SOURCE_LABEL[v as InboxSource] ?? v)}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tất cả</SelectItem>
                      {(Object.keys(SOURCE_LABEL) as InboxSource[]).map((s) => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[160px]">
                  <div className="mb-1 text-xs font-medium text-slate-400">Loại</div>
                  <Select value={String(kindFilter)} onValueChange={(v) => setKindFilter(v === "ALL" ? "ALL" : (Number(v) as InboxKind))}>
                    <SelectTrigger aria-label="Loại"><SelectValue>{(v: string) => (v === "ALL" ? "Tất cả" : KIND_LABEL[Number(v) as InboxKind])}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tất cả</SelectItem>
                      {KIND_ORDER.map((k) => <SelectItem key={k} value={String(k)}>{KIND_LABEL[k]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[180px]">
                  <div className="mb-1 text-xs font-medium text-slate-400">Trạng thái</div>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                    <SelectTrigger aria-label="Trạng thái"><SelectValue>{(v: string) => STATUS_FILTER_LABEL[v as StatusFilter] ?? v}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Mới + Đã xem</SelectItem>
                      <SelectItem value="snoozed">Hoãn</SelectItem>
                      <SelectItem value="done">Đã làm</SelectItem>
                      <SelectItem value="dismissed">Bỏ qua</SelectItem>
                      <SelectItem value="all">Tất cả</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Danh sách việc, gộp theo loại */}
              {filtered.length === 0 ? (
                <EmptyState compact title="Không có việc nào cần làm" description="Đổi lại bộ lọc ở trên, hoặc mọi việc trong bộ lọc này đã xử lý xong." />
              ) : (
                KIND_ORDER.filter((k) => grouped.get(k)!.length > 0).map((k) => (
                  <section key={k} className="space-y-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">{KIND_LABEL[k]}</h2>
                      <p className="text-xs text-slate-500">{KIND_EXPLAIN[k]}</p>
                    </div>
                    <div className="grid gap-3">
                      {grouped.get(k)!.map((it) => (
                        <ItemCard
                          key={it.key}
                          item={it}
                          canEdit={canEdit}
                          pending={pendingKey === it.key}
                          error={actionError[it.key]}
                          onSeen={() => act(it.key, { status: "seen" }, "Đã đánh dấu Đã xem")}
                          onDone={() => act(it.key, { status: "done" }, "Đã đánh dấu Đã làm")}
                          onReopen={() => act(it.key, { status: "new" }, "Đã mở lại — chuyển về Mới")}
                          onSnooze={() => openSnooze(it)}
                          onDismiss={() => openDismiss(it)}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </>
          )}
        </>
      )}

      {/* Dialog: Hoãn */}
      <Dialog open={dialog?.type === "snooze"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Hoãn việc này</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="hoan-ngay">Hoãn đến ngày</label>
              <Input id="hoan-ngay" type="date" value={snoozeDate} min={todayPlusDays(1)} onChange={(e) => setSnoozeDate(e.target.value)} />
            </div>
            <p className="text-xs text-slate-400">Việc hoãn sẽ tự hiện lại sớm hơn nếu tiền liên quan tăng &gt; 50%, hoặc khi hết hạn hoãn.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pendingKey === dialog?.item.key}>Huỷ</Button>
            <Button onClick={submitSnooze} disabled={!snoozeDate || pendingKey === dialog?.item.key}>{pendingKey === dialog?.item.key ? "Đang lưu…" : "Hoãn việc"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Bỏ qua */}
      <Dialog open={dialog?.type === "dismiss"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bỏ qua việc này</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="boqua-ly-do">Lý do <span className="text-red-500">*</span></label>
              <Textarea id="boqua-ly-do" value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} placeholder="Bắt buộc — vd: đã biết, chấp nhận trong mùa cao điểm" required />
            </div>
            <p className="text-xs text-slate-400">Việc bị bỏ qua vẫn <b>hiện lại</b> nếu tiền liên quan tăng hơn 50% so với lúc bỏ qua.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pendingKey === dialog?.item.key}>Huỷ</Button>
            <Button variant="destructive" onClick={submitDismiss} disabled={dismissReason.trim().length < 3 || pendingKey === dialog?.item.key}>
              {pendingKey === dialog?.item.key ? "Đang lưu…" : "Bỏ qua"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = { open: "Mới + Đã xem", snoozed: "Hoãn", done: "Đã làm", dismissed: "Bỏ qua", all: "Tất cả" };

function ItemCard({
  item, canEdit, pending, error, onSeen, onDone, onReopen, onSnooze, onDismiss,
}: {
  item: InboxView;
  canEdit: boolean;
  pending: boolean;
  error?: string;
  onSeen: () => void;
  onDone: () => void;
  onReopen: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={KIND_TONE[item.kind]}>{KIND_LABEL[item.kind]}</Pill>
            <span className="text-xs text-slate-400">{item.company} · {SOURCE_LABEL[item.source]}</span>
          </div>
          <div className="text-sm font-semibold text-slate-800">{item.title}</div>
          <div className="text-xs text-slate-500">{item.why}</div>
          {item.resurfaced && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
              <span aria-hidden="true">↺</span> {item.resurfaced}
            </div>
          )}
          {item.status === "dismissed" && item.state?.reason && (
            <div className="text-xs text-slate-500"><b>Lý do bỏ qua:</b> {item.state.reason}</div>
          )}
        </div>
        <div className="w-full min-w-0 text-left sm:w-auto sm:max-w-xs sm:text-right">
          {item.money != null && (
            <>
              <div className="tabular-nums text-sm font-bold text-red-600">{vnd(item.money)}</div>
              <div className="text-xs text-slate-400">{moneySuffix(item.moneyLabel)}</div>
            </>
          )}
          <div className="mt-1.5">
            <Pill tone={STATUS_TONE[item.status]}>
              {STATUS_SYMBOL[item.status]} {item.status === "snoozed" && item.state?.until ? `Hoãn đến ${ddmm(item.state.until)}` : STATUS_LABEL[item.status]}
            </Pill>
          </div>
        </div>
      </div>

      {item.children && item.children.length > 0 && (
        <details className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs">
          <summary className="cursor-pointer select-none font-medium text-slate-600">{item.children.length} mục bên trong — xem danh sách</summary>
          <ul className="mt-2 space-y-1.5">
            {item.children.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-3 border-t border-slate-100 pt-1.5 first:border-0 first:pt-0">
                <div>
                  <div className="font-medium text-slate-700">{c.name}</div>
                  <div className="text-slate-400">{c.detail}</div>
                </div>
                {c.money != null && <div className="shrink-0 tabular-nums text-slate-600">{vnd(c.money)}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" render={<Link href={item.href} />}>{item.hrefLabel} →</Button>
          <Button size="sm" variant="outline" onClick={onSnooze} disabled={pending}>Hoãn…</Button>
          <Button size="sm" variant="outline" onClick={onDismiss} disabled={pending}>Bỏ qua…</Button>
          <Button size="sm" variant="ghost" onClick={onSeen} disabled={pending}>Đã xem</Button>
          <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>Đã làm</Button>
          {!isOpenStatus(item.status) && (
            <Button size="sm" variant="ghost" onClick={onReopen} disabled={pending}>Mở lại</Button>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}
