// ============================================================
// Phiên bản Graph API của Meta — MỘT chỗ duy nhất cho cả app
// ============================================================
// Trước đây 45 chỗ ghi cứng "v19.0"; lên phiên bản mới phải sửa từng tệp và dễ sót.
// Đổi phiên bản: sửa DEFAULT ở đây, hoặc đặt META_GRAPH_API_VERSION (vd "v21.0") trên
// môi trường để thử trước mà không cần build lại. Giá trị sai định dạng bị bỏ qua.

// 15/10/2026: v19.0 → v25.0. v19 đã hết hạn — Meta âm thầm phục vụ mọi lời gọi v19 bằng v24.0 (header
// facebook-api-version) và cảnh báo các bản dưới v25. Đã so 14 truy vấn đọc app dùng (tài khoản, campaign/adset/ad+creative,
// insights ngày/7d_click+1d_view/age-gender/placement/region/hourly/maximum, pixel, custom conversion/audience): cùng field,
// cùng số. Lời gọi GHI chưa thử (giữ chỉ-đọc) — có lỗi thì đặt META_GRAPH_API_VERSION=v24.0 để lùi, không cần build lại.
const DEFAULT = "v25.0"

function resolveVersion(): string {
  const v = process.env.META_GRAPH_API_VERSION?.trim()
  return v && /^v\d+\.\d+$/.test(v) ? v : DEFAULT
}

export const META_GRAPH_VERSION = resolveVersion()
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`
