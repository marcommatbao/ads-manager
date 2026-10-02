// ─────────────────────────────────────────────
// Policy Radar — Vietnamese display labels
// ─────────────────────────────────────────────

import type {
  PolicyAffectedArea,
  PolicyCategory,
  PolicyChangeType,
  PolicyReviewStatus,
} from "./types";

export const CATEGORY_LABELS: Record<PolicyCategory, string> = {
  policy: "Chính sách",
  enforcement: "Thực thi/Xử phạt",
  terms: "Điều khoản",
  product_update: "Cập nhật sản phẩm",
  measurement: "Đo lường",
  targeting: "Nhắm mục tiêu",
  creative: "Creative",
  automation: "Tự động hóa",
  account_health: "Tình trạng tài khoản",
};

export const CHANGE_TYPE_LABELS: Record<PolicyChangeType, string> = {
  new_policy: "Chính sách mới",
  policy_update: "Cập nhật chính sách",
  clarification: "Làm rõ",
  announcement: "Thông báo",
  terms_update: "Cập nhật điều khoản",
  enforcement_change: "Thay đổi xử lý vi phạm",
};

export const AFFECTED_AREA_LABELS: Record<PolicyAffectedArea, string> = {
  ad_copy: "Nội dung quảng cáo",
  landing_page: "Landing page",
  tracking_measurement: "Tracking/Đo lường",
  creative_ai: "Creative AI",
  automation_rules: "Rule tự động",
  account_health: "Tình trạng tài khoản",
  targeting: "Nhắm mục tiêu",
  reporting: "Báo cáo",
  brand_identity: "Nhận diện thương hiệu",
  legal_review: "Rà soát pháp lý",
};

export const STATUS_LABELS: Record<PolicyReviewStatus, string> = {
  unread: "Chưa đọc",
  reviewed: "Đã duyệt",
  archived: "Đã lưu trữ",
  flagged_for_followup: "Cần theo dõi tiếp",
};
