// ============================================================
// Đợt 21a — Danh sách công ty của BẢN CÀI (CHỈ máy chủ). Mặc định = lib/companies/defaults.ts (Mắt Bão).
// ============================================================
// Bản cài khác ghi đè bằng data/companies.json (cùng khuôn CompaniesConfig). Tệp hỏng → GIỮ mặc định + ghi lỗi
// (không để app chết vì một tệp cấu hình), lỗi hiện ở companiesConfigError() cho trang Cài đặt / tự kiểm.
// Đọc lại khi tệp đổi (so mtime) — không cần khởi động lại. Mã chạy cả hai phía import từ "./registry".

import fs from "fs"
import path from "path"
import { DEFAULT_COMPANIES, validateCompanies, type CompaniesConfig } from "./defaults"
import { companyDef, registerCompaniesRefresh, setCompaniesConfig } from "./registry"

export type { CompanyDef, CompaniesConfig } from "./defaults"
export { allCompanyDefs, companiesConfig, companyDef, companyDisplayPath, companyIds, companyLabel, companyUrl, fallbackCompany, hasPack, isCompany, pickCompany } from "./registry"

const FILE = () => path.join(process.cwd(), "data", "companies.json")
let state: { mtime: number; error: string | null } | null = null

function reload(): void {
  let mtime = -1
  try { mtime = fs.statSync(FILE()).mtimeMs } catch { /* không có tệp = mặc định */ }
  if (state && state.mtime === mtime) return
  let cfg: CompaniesConfig = DEFAULT_COMPANIES, error: string | null = null
  if (mtime >= 0) {
    try {
      const raw = JSON.parse(fs.readFileSync(FILE(), "utf-8")) as CompaniesConfig
      const errs = validateCompanies(raw)
      if (errs.length) error = `data/companies.json không hợp lệ — đang dùng mặc định: ${errs.join("; ")}`
      else cfg = raw
    } catch (e) { error = `data/companies.json đọc lỗi — đang dùng mặc định: ${e instanceof Error ? e.message : String(e)}` }
  }
  state = { mtime, error }
  setCompaniesConfig(cfg)
}
registerCompaniesRefresh(reload)

export const companiesConfigError = (): string | null => { reload(); return state?.error ?? null }

/** Đọc biến môi trường theo hậu tố công ty, vd envFor("MBC", "GOOGLE_ADS_CUSTOMER_ID") → GOOGLE_ADS_CUSTOMER_ID_MBC. */
export function envFor(id: string, prefix: string): string {
  const suf = companyDef(id)?.envSuffix ?? id
  return (process.env[`${prefix}_${suf}`] ?? "").trim()
}

/** Chỉ dùng trong test: buộc đọc lại tệp. */
export function __resetCompaniesCache() { state = null; setCompaniesConfig(DEFAULT_COMPANIES) }
