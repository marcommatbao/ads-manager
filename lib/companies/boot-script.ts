// Đợt 21 A3b (tách ra Đợt 25 để dùng chung dashboard + trang đăng nhập) — nạp cấu hình công ty của BẢN CÀI vào trình duyệt
// TRƯỚC khi React chạy. Bản Mắt Bão: cấu hình = mặc định → KHÔNG chèn gì, HTML y nguyên. `<` thoát thành <.
import { companiesConfig } from "@/lib/companies"
import { DEFAULT_COMPANIES } from "@/lib/companies/defaults"
import { publicIdsFromEnv } from "@/lib/companies/public-ids"

export function companiesBootScript(opts: { publicIds?: boolean } = {}): string | null {
  const cfg = companiesConfig()
  if (JSON.stringify(cfg) === JSON.stringify(DEFAULT_COMPANIES)) return null
  const esc = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c")
  return `window.__adsCompanies=${esc({ current: cfg, refresh: null })};` + (opts.publicIds === false ? "" : `window.__adsPublicIds=${esc(publicIdsFromEnv())};`)
}
