// ============================================================
// Chỉ email công ty được đăng nhập (user yêu cầu 01/10, trước khi mở public)
// ============================================================
// Mặc định: @matbao.com. Đổi danh sách tên miền: ALLOWED_LOGIN_DOMAINS="matbao.com,matbao.net".
// Ngoại lệ từng email (vd tài khoản quản trị cũ dùng gmail): ALLOWED_LOGIN_EMAILS="a@gmail.com,b@x.vn".
// Áp ở: đăng nhập (cả fallback SEO), tạo tài khoản, và mỗi yêu cầu (getCurrentUser) — phiên cũ của email ngoài danh sách
// hết hiệu lực ngay khi deploy.
const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)

export function allowedLoginDomains(): string[] {
  const d = list(process.env.ALLOWED_LOGIN_DOMAINS)
  return d.length ? d : ["matbao.com"]
}

export function isAllowedLoginEmail(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim().toLowerCase()
  const at = e.lastIndexOf("@")
  if (at <= 0 || at === e.length - 1) return false
  if (list(process.env.ALLOWED_LOGIN_EMAILS).includes(e)) return true
  return allowedLoginDomains().includes(e.slice(at + 1))
}

export const loginDomainMessage = () => `Chỉ tài khoản email ${allowedLoginDomains().map((d) => "@" + d).join(", ")} được đăng nhập.`
