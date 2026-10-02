// ============================================================
// Phiên bản Graph API của Meta — MỘT chỗ duy nhất cho cả app
// ============================================================
// Trước đây 45 chỗ ghi cứng "v19.0"; lên phiên bản mới phải sửa từng tệp và dễ sót.
// Đổi phiên bản: sửa DEFAULT ở đây, hoặc đặt META_GRAPH_API_VERSION (vd "v21.0") trên
// môi trường để thử trước mà không cần build lại. Giá trị sai định dạng bị bỏ qua.

const DEFAULT = "v19.0"

function resolveVersion(): string {
  const v = process.env.META_GRAPH_API_VERSION?.trim()
  return v && /^v\d+\.\d+$/.test(v) ? v : DEFAULT
}

export const META_GRAPH_VERSION = resolveVersion()
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`
