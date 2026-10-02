// ─────────────────────────────────────────────
// Bật một rule tự đổi ngân sách chính là đổi ngân sách — chỉ là qua đường vòng,
// và lặp lại mỗi 6 giờ mà không ai bấm nút.
//
// Đổi ngân sách trực tiếp (app/api/google/campaigns/[id]/budget) yêu cầu
// `can_manage_budget`. Trước bản này, tạo/bật một rule `increase_budget` chỉ cần
// `can_edit` — tức là quyền yếu hơn lại đạt được hệ quả lớn hơn.
//
// Nói cho đúng mức: ma trận quyền hiện tại KHÔNG có vai nào `can_edit: true` mà
// `can_manage_budget: false`, nên hôm nay đây chưa phải lỗ hổng khai thác được.
// Nó là một khe đang mở sẵn, sẽ thành lỗ hổng đúng vào lúc ai đó thêm vai
// "editor" — thời điểm không ai nhớ tới file này nữa. Đóng lại tốn một hàm.
// ─────────────────────────────────────────────
import type { Action } from "./automation-shared";

/** Hành động chạm vào tiền. Trùng khít META_MUTATION_ACTIONS / MUTATION_ACTIONS. */
const BUDGET_ACTIONS = new Set(["increase_budget", "decrease_budget"]);

export function ruleTouchesBudget(actions: Action[] | undefined): boolean {
  return (actions ?? []).some(a => BUDGET_ACTIONS.has(a?.type));
}

// ─────────────────────────────────────────────
// Phạm vi công ty của rule (audit bảo mật 30/09). Engine coi rule KHÔNG có company là "cả hai công ty"
// (automation-engine ruleAllowsCompany) → trước đây admin_mbc bỏ trống company là tạo được rule chạy
// lên campaign MBI; toggle/delete theo id cũng không kiểm công ty của rule đang lưu.
// ─────────────────────────────────────────────
import { canAccessCompany, getCompaniesForRole, type Role } from "./permissions";
import { isCompany } from "@/lib/companies"

/** Trống / null / "all" = cả hai công ty. */
export function effectiveRuleCompany(company: unknown): string | "all" {
  return isCompany(company) ? company : "all";
}

/** Người này có được đụng tới rule mang phạm vi này không. "all" chỉ dành cho ai có CẢ HAI công ty. */
export function canTouchRuleScope(role: Role, company: unknown): boolean {
  const c = effectiveRuleCompany(company);
  return c === "all" ? getCompaniesForRole(role).length === 2 : canAccessCompany(role, c);
}

/** Tạo rule: bỏ trống company mà chỉ có một công ty → gán công ty đó (không để rule rơi về "cả hai"). */
export function defaultRuleCompany(role: Role, company: unknown): unknown {
  if (effectiveRuleCompany(company) !== "all") return company;
  const mine = getCompaniesForRole(role);
  return mine.length === 1 ? mine[0] : company;
}
