import { GoogleAdsApi, Customer } from "google-ads-api"
import { companyDef, companyIds } from "@/lib/companies/registry"

const client = new GoogleAdsApi({
  client_id:       process.env.GOOGLE_ADS_CLIENT_ID!,
  client_secret:   process.env.GOOGLE_ADS_CLIENT_SECRET!,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
})

// Map company → Customer ID. Đợt 21a: theo danh sách công ty của bản cài (GOOGLE_ADS_CUSTOMER_ID_<hậu tố>), đọc LÚC TRA
// (không chụp lúc import) để khoá dán ở Cài đặt (21e) có hiệu lực ngay. Bản Mắt Bão: { MBC, MBI } như cũ.
const customerIdOf = (company: string): string => {
  const suf = companyDef(company)?.envSuffix ?? company
  return process.env[`GOOGLE_ADS_CUSTOMER_ID_${suf}`] as string
}
export const GOOGLE_CUSTOMER_IDS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, k) => (typeof k === "string" && companyIds().includes(k) ? customerIdOf(k) : undefined),
  has: (_t, k) => typeof k === "string" && companyIds().includes(k),
  ownKeys: () => companyIds(),
  getOwnPropertyDescriptor: (_t, k) => (typeof k === "string" && companyIds().includes(k) ? { enumerable: true, configurable: true, value: customerIdOf(k) } : undefined),
})

// Khởi tạo customer client
export function getGoogleAdsCustomer(company: string): Customer {
  return client.Customer({
    customer_id:      GOOGLE_CUSTOMER_IDS[company],
    refresh_token:    process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  })
}

// Helper: Format Customer ID (loại bỏ dấu gạch)
export function formatCustomerId(id: string): string {
  return id.replace(/-/g, "")
}

export default client
