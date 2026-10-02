// ============================================================
// Format helper riêng cho /settings/health — mirror phong cách relTime/absTime
// của app/(dashboard)/settings/jobs/page.tsx (không export ở đó nên lặp lại
// một bản nhỏ ở đây thay vì import chéo từ một trang khác).
// ============================================================

export function relTime(iso: string | null): string {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (Number.isNaN(d)) return "—";
  if (d < 60) return `${Math.max(d, 0)}s trước`;
  if (d < 3600) return `${Math.floor(d / 60)}p trước`;
  if (d < 86400) return `${Math.floor(d / 3600)}h trước`;
  return `${Math.floor(d / 86400)}ngày trước`;
}

export function absTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Rút gọn một chuỗi dài (lastSummary/lastError) — bấm để xem đủ ở nơi gọi. */
export function truncate(text: string | null, max = 60): { short: string; isLong: boolean } {
  if (!text) return { short: "—", isLong: false };
  if (text.length <= max) return { short: text, isLong: false };
  return { short: `${text.slice(0, max)}…`, isLong: true };
}
