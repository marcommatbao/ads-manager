import { companyIds, isCompany } from "@/lib/companies/registry";
// ============================================================
// AdsCommand — Permissions & RBAC (Company-Based Roles)
// ============================================================

// ─────────────────────────────────────────────
// Role Types
// ─────────────────────────────────────────────

export type Role =
  | "super_admin"   // Full access MBC + MBI
  | "admin_mbc"     // Full access MBC only
  | "admin_mbi"     // Full access MBI only
  | "viewer_mbc"    // Read-only MBC
  | "viewer_mbi";   // Read-only MBI

export type CompanyScope = string;

// ─────────────────────────────────────────────
// Permission Matrix
// ─────────────────────────────────────────────

export interface RolePermissions {
  companies: CompanyScope[];
  can_edit: boolean;
  can_manage_budget: boolean;
  can_manage_users: boolean;
  can_view_cpl: boolean;
  can_input_offline: boolean;
  can_edit_thresholds: boolean;
  /** View masked API credentials in Settings → API page */
  can_view_credentials: boolean;
  /** Save / update API credentials (super_admin only) */
  can_edit_credentials: boolean;
  /** Add policy items manually and mark Policy Radar items reviewed */
  can_manage_policy_radar: boolean;
}

export type PermissionKey = keyof Omit<RolePermissions, "companies">;

const PERMISSIONS: Record<Role, RolePermissions> = {
  super_admin: {
    // Đợt 21a: mọi công ty chạy quảng cáo của bản cài (bản Mắt Bão: MBC, MBI). Getter = đọc lúc tra.
    get companies() { return companyIds() },
    can_edit:             true,
    can_manage_budget:    true,
    can_manage_users:     true,
    can_view_cpl:         true,
    can_input_offline:    true,
    can_edit_thresholds:  true,
    can_view_credentials: true,
    can_edit_credentials: true,
    can_manage_policy_radar: true,
  },
  admin_mbc: {
    companies:            ["MBC"],
    can_edit:             true,
    can_manage_budget:    true,
    can_manage_users:     false,
    can_view_cpl:         true,
    can_input_offline:    false,
    can_edit_thresholds:  false,
    can_view_credentials: true,   // see masked creds (read-only form)
    can_edit_credentials: false,  // cannot save new keys
    can_manage_policy_radar: true,
  },
  admin_mbi: {
    companies:            ["MBI"],
    can_edit:             true,
    can_manage_budget:    true,
    can_manage_users:     false,
    can_view_cpl:         true,
    can_input_offline:    true,
    can_edit_thresholds:  false,
    can_view_credentials: true,
    can_edit_credentials: false,
    can_manage_policy_radar: true,
  },
  viewer_mbc: {
    companies:            ["MBC"],
    can_edit:             false,
    can_manage_budget:    false,
    can_manage_users:     false,
    can_view_cpl:         true,
    can_input_offline:    false,
    can_edit_thresholds:  false,
    can_view_credentials: false,
    can_edit_credentials: false,
    can_manage_policy_radar: false,
  },
  viewer_mbi: {
    companies:            ["MBI"],
    can_edit:             false,
    can_manage_budget:    false,
    can_manage_users:     false,
    can_view_cpl:         true,
    can_input_offline:    false,
    can_edit_thresholds:  false,
    can_view_credentials: false,
    can_edit_credentials: false,
    can_manage_policy_radar: false,
  },
};

// ─────────────────────────────────────────────
// Permission Checkers
// ─────────────────────────────────────────────

export function getPermissions(role: Role): RolePermissions {
  return PERMISSIONS[role];
}

export function hasPermission(role: Role, action: PermissionKey): boolean {
  return PERMISSIONS[role]?.[action] ?? false;
}

export function canAccessCompany(role: Role, company: CompanyScope): boolean {
  return PERMISSIONS[role].companies.includes(company);
}

export function getCompaniesForRole(role: Role): CompanyScope[] {
  return PERMISSIONS[role].companies;
}

/**
 * Phạm vi công ty THẬT của một phiên đăng nhập.
 *
 * Vì sao cần: trường `companies` trong phiên KHÔNG phải danh sách công ty, nó
 * là phạm vi — và giá trị đang dùng cho MỌI tài khoản là ["ALL"] (kiểm
 * data/team-members.json 16/09/2026, cả 5 tài khoản; nhánh đăng nhập qua SEO ở
 * app/api/auth/login cũng gán cứng ["ALL"]).
 *
 * Nên đoạn mã phổ biến này SAI với mọi người dùng:
 *     ["MBC","MBI"].filter(c => user.companies.includes(c))   // → []
 * Nó cho ra danh sách rỗng rồi trang báo "Tài khoản của bạn chưa được gán công
 * ty nào" — đúng lỗi người dùng gặp ở Budget Pacing, và 4 trang Toolkit khác
 * cũng dính y hệt.
 *
 * Ở đây mở "ALL" ra thành danh sách thật, RỒI giao với phạm vi của vai trò —
 * viewer_mbc dù mang ["ALL"] cũng chỉ được MBC, khớp đúng điều máy chủ sẽ cho
 * qua ở canAccessCompany().
 */
export function resolveCompanyScope(
  companies: string[] | undefined | null,
  role: Role | undefined | null,
): CompanyScope[] {
  const roleScope = role && PERMISSIONS[role] ? PERMISSIONS[role].companies : [];
  const list = companies ?? [];
  const expanded: CompanyScope[] = list.includes("ALL")
    ? companyIds()
    : (list.filter((c): c is CompanyScope => isCompany(c)));
  return expanded.filter(c => roleScope.includes(c));
}

export function isAdmin(role: Role): boolean {
  return role === "super_admin" || role === "admin_mbc" || role === "admin_mbi";
}

export function isSuperAdmin(role: Role): boolean {
  return role === "super_admin";
}

// ─────────────────────────────────────────────
// Route Access Control
// ─────────────────────────────────────────────

const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  "/settings/users":          ["super_admin"],
  "/settings/cpl-thresholds": ["super_admin"],
  "/settings/team":           ["super_admin"],
  "/settings/budget":         ["super_admin"],
  "/settings/connections":    ["super_admin", "admin_mbc", "admin_mbi"],
  "/settings/notifications":  ["super_admin", "admin_mbc", "admin_mbi"],
  "/settings":                ["super_admin", "admin_mbc", "admin_mbi", "viewer_mbc", "viewer_mbi"],
  "/automation":              ["super_admin", "admin_mbc", "admin_mbi"],
  "/creative":                ["super_admin", "admin_mbc", "admin_mbi"],
  "/cpl":                     ["super_admin", "admin_mbc", "admin_mbi", "viewer_mbc", "viewer_mbi"],
  "/campaigns":               ["super_admin", "admin_mbc", "admin_mbi", "viewer_mbc", "viewer_mbi"],
  "/reports":                 ["super_admin", "admin_mbc", "admin_mbi", "viewer_mbc", "viewer_mbi"],
  "/policy-radar":            ["super_admin", "admin_mbc", "admin_mbi", "viewer_mbc", "viewer_mbi"],
  "/":                        ["super_admin", "admin_mbc", "admin_mbi", "viewer_mbc", "viewer_mbi"],
};

export function canAccessRoute(role: Role, pathname: string): boolean {
  // Exact match
  if (ROUTE_PERMISSIONS[pathname]) {
    return ROUTE_PERMISSIONS[pathname].includes(role);
  }
  // Prefix match — find most specific
  let bestMatch = "";
  for (const route of Object.keys(ROUTE_PERMISSIONS)) {
    if (pathname.startsWith(route) && route.length > bestMatch.length) {
      bestMatch = route;
    }
  }
  if (bestMatch && ROUTE_PERMISSIONS[bestMatch]) {
    return ROUTE_PERMISSIONS[bestMatch].includes(role);
  }
  return true;
}

const BLOCKED_MESSAGES: Record<string, string> = {
  "/settings/users":          "Chỉ Super Admin mới có quyền quản lý người dùng",
  "/settings/cpl-thresholds": "Chỉ Super Admin mới có quyền chỉnh ngưỡng CPL",
  "/settings/team":           "Chỉ Super Admin mới có quyền quản lý team",
  "/settings/budget":         "Chỉ Super Admin mới có quyền thay đổi ngân sách",
  "/automation":              "Bạn không có quyền truy cập Automation",
  "/creative":                "Bạn không có quyền truy cập Creative AI",
};

export function getBlockedMessage(pathname: string): string {
  for (const [route, msg] of Object.entries(BLOCKED_MESSAGES)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      return msg;
    }
  }
  return "Bạn không có quyền truy cập tính năng này";
}

// ─────────────────────────────────────────────
// Role UI Config
// ─────────────────────────────────────────────

export const ROLE_CONFIG: Record<Role, {
  label: string;
  labelVi: string;
  description: string;
  color: string;
  bg: string;
  border: string;
  companyLabel: string;
}> = {
  super_admin: {
    label: "Super Admin",
    labelVi: "Quản trị viên tối cao",
    description: "Toàn quyền MBC + MBI",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    companyLabel: "MBC & MBI",
  },
  admin_mbc: {
    label: "Admin MBC",
    labelVi: "Quản trị viên MBC",
    description: "Toàn quyền MBC",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    companyLabel: "MBC",
  },
  admin_mbi: {
    label: "Admin MBI",
    labelVi: "Quản trị viên MBI",
    description: "Toàn quyền MBI + nhập offline",
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
    companyLabel: "MBI",
  },
  viewer_mbc: {
    label: "Viewer MBC",
    labelVi: "Người xem MBC",
    description: "Chỉ xem báo cáo MBC",
    color: "text-slate-600",
    bg: "bg-slate-50",
    border: "border-slate-200",
    companyLabel: "MBC",
  },
  viewer_mbi: {
    label: "Viewer MBI",
    labelVi: "Người xem MBI",
    description: "Chỉ xem báo cáo MBI",
    color: "text-slate-600",
    bg: "bg-slate-50",
    border: "border-slate-200",
    companyLabel: "MBI",
  },
};

// All available roles for UI selects
export const ALL_ROLES: Role[] = [
  "super_admin",
  "admin_mbc",
  "admin_mbi",
  "viewer_mbc",
  "viewer_mbi",
];

// Permission labels for UI display
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  can_edit:             "Chỉnh sửa campaigns",
  can_manage_budget:    "Quản lý ngân sách",
  can_manage_users:     "Quản lý người dùng",
  can_view_cpl:         "Xem CPL tracking",
  can_input_offline:    "Nhập đơn offline (MBI)",
  can_edit_thresholds:  "Chỉnh ngưỡng CPL",
  can_view_credentials: "Xem cài đặt kết nối API",
  can_edit_credentials: "Lưu/cập nhật API credentials",
  can_manage_policy_radar: "Thêm/duyệt mục Policy Radar",
};
