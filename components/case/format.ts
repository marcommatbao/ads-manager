// ============================================================
// Format nhỏ dùng chung cho các trang "Xử lý chiến dịch"
// ------------------------------------------------------------
// KHÔNG đặt trong lib/case/ — thư mục đó là backend đã khoá (xem AGENTS.md
// của phần việc này). Đây chỉ là format hiển thị, không phải nghiệp vụ.
// ============================================================

export const vnd = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : `₫${Math.round(n).toLocaleString("vi-VN")}`;

export const num = (n: number | null | undefined, opts?: Intl.NumberFormatOptions): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("vi-VN", opts);

export const pct = (n: number | null | undefined, decimals = 1): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—"
    : `${(n * 100).toLocaleString("vi-VN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;

export const roas = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "—"
    : `${n.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;

/** "2026-09-25" → "25/09/2026". Không tự đổi múi giờ — chuỗi ngày đã là YYYY-MM-DD của server. */
export function ddmmyyyy(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export function datetimeVN(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });
}
