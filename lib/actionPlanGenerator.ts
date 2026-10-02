import { Improvement, ActionPlan, ActionStep } from "@/types/improvements";

export function generateActionPlan(
  improvement: Improvement
): ActionPlan {
  switch (improvement.type) {
    case "PAUSE_FB_AD_LOW_CTR":
      return {
        improvementId: improvement.id,
        totalImpact:   improvement.impactValue || 0,
        autoSteps: 1, manualSteps: 1,
        status: "PENDING",
        steps: [
          {
            id: `${improvement.id}-pause`,
            type: "PAUSE_AD",
            platform: "FACEBOOK",
            title: "Tạm dừng ad CTR thấp",
            description: `Tạm dừng "${improvement.adName || 'Ad'}" để tránh lãng phí ngân sách`,
            entityId:   improvement.adName || improvement.id,
            entityName: improvement.adName || improvement.title,
            payload:    { status: "PAUSED" },
            canAutoApply: true,
            estimatedImpact: (improvement.impactValue || 0) * 0.3,
            before: { "Trạng thái": "ACTIVE", "Cảnh báo": improvement.currentMetric || "" },
            after:  { "Trạng thái": "PAUSED", "Resolution": "Tiết kiệm ngân sách" },
          },
          {
            id: `${improvement.id}-creative`,
            type: "CHANGE_CREATIVE",
            platform: "FACEBOOK",
            title: "Tạo creative mới",
            description: "Viết lại headline + thay ảnh/video để tăng CTR.",
            entityId:   improvement.adName || improvement.id,
            entityName: improvement.adName || improvement.title,
            payload:    {},
            canAutoApply: false,
            estimatedImpact: (improvement.impactValue || 0) * 0.7,
            before: { "Creative": "Chưa tốt", "CTR": "Thấp" },
            after:  { "Creative": "Cần update", "CTR dự kiến": "> 1%" },
          },
        ],
      };

    case "DAYPART_OPPORTUNITY":
      return {
        improvementId: improvement.id,
        totalImpact:   improvement.impactValue || 0,
        autoSteps: 1, manualSteps: 0,
        status: "PENDING",
        steps: [
          {
            id: `${improvement.id}-daypart`,
            type: "SET_DAYPARTING",
            platform: improvement.platform as "FACEBOOK" | "GOOGLE",
            title: `Tối ưu khung giờ chạy`,
            description: `Tắt các khung giờ không mang lại conversion.`,
            entityId:   improvement.campaignId || improvement.id,
            entityName: improvement.campaignName || improvement.title,
            payload:    improvement.applyPayload || {},
            canAutoApply: true,
            estimatedImpact: improvement.impactValue || 0,
            before: {
              "Giờ xấu": improvement.currentMetric || "",
            },
            after: {
              "Khung giờ mục tiêu": improvement.targetMetric || "",
              "Chi tiêu tiết kiệm": `${improvement.impactValue?.toLocaleString()} VND/tháng`,
            },
          },
        ],
      };

    case "PAUSE_FB_AD_FATIGUE":
      return {
        improvementId: improvement.id,
        totalImpact:   improvement.impactValue || 0,
        autoSteps: 1, manualSteps: 1,
        status: "PENDING",
        steps: [
          {
            id: `${improvement.id}-freq-cap`,
            type: "UPDATE_TARGETING",
            platform: "FACEBOOK",
            title: "Giảm áp lực hiển thị",
            description: `Pause hoặc đổi targeting cho AdSet đang bị fatigue.`,
            entityId:   improvement.adGroupName || improvement.id,
            entityName: improvement.adGroupName || improvement.title,
            payload: { status: "PAUSED" },
            canAutoApply: true,
            estimatedImpact: (improvement.impactValue || 0) * 0.5,
            before: { "Vấn đề": improvement.currentMetric || "Frequency cao" },
            after: { "Trạng thái": "PAUSED", "Dự kiến": "Giảm lãng phí" },
          },
          {
            id: `${improvement.id}-audience-expand`,
            type: "UPDATE_TARGETING",
            platform: "FACEBOOK",
            title: "Mở rộng audience",
            description: "Audience bị bão hòa. Cần mở rộng targeting để giảm overlap.",
            entityId:   improvement.adGroupName || improvement.id,
            entityName: improvement.adGroupName || improvement.title,
            payload:    {},
            canAutoApply: false,
            estimatedImpact: (improvement.impactValue || 0) * 0.5,
            before: { "Audience": "Đã bão hòa" },
            after: { "Gợi ý": "Mở rộng age range hoặc thêm lookalike" },
          },
        ],
      };

    case "NEGATIVE_BRAND_LEAK":
    case "PAUSE_SEARCH_TERM":
      return {
        improvementId: improvement.id,
        totalImpact:   improvement.impactValue || 0,
        autoSteps: 1, manualSteps: 0,
        status: "PENDING",
        steps: [
          {
            id: `${improvement.id}-pause-kw`,
            type: "ADD_NEGATIVE",
            platform: "GOOGLE",
            title: `Thêm negative keyword`,
            description: `Loại bỏ lượt tìm kiếm không liên quan.`,
            entityId:   improvement.campaignId || improvement.id,
            entityName: improvement.campaignName || improvement.title,
            payload:    { ...improvement.applyPayload },
            canAutoApply: true,
            estimatedImpact: improvement.impactValue || 0,
            before: {
              "Trạng thái":  "Đang kích hoạt",
              "Vấn đề": improvement.currentMetric || "",
            },
            after: {
              "Trạng thái":  "Negative Keyword",
              "Lợi ích":   "Dữ liệu sạch hơn, bớt lãng phí",
            },
          }
        ]
      };

    default:
      // Generic payload generator
      return {
        improvementId: improvement.id,
        totalImpact:   improvement.impactValue || 0,
        autoSteps: improvement.canAutoApply ? 1 : 0, 
        manualSteps: improvement.canAutoApply ? 0 : 1,
        status: "PENDING",
        steps: [
          {
            id: `${improvement.id}-step`,
            type: "UNKNOWN",
            platform: improvement.platform as "FACEBOOK" | "GOOGLE",
            title: improvement.title,
            description: improvement.description,
            entityId: improvement.id,
            entityName: improvement.title,
            payload: improvement.applyPayload || {},
            canAutoApply: improvement.canAutoApply,
            estimatedImpact: improvement.impactValue || 0,
            before: {
              "Trạng thái": improvement.currentMetric || "Cần tối ưu"
            },
            after: {
              "Mục tiêu": improvement.targetMetric || "Tối ưu hóa thành công"
            }
          }
        ]
      };
  }
}
