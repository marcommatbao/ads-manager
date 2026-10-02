// ============================================================
// Hướng dẫn xử lý THỦ CÔNG cho từng loại đề xuất cải tiến.
// ------------------------------------------------------------
// Tách ra khỏi app/(dashboard)/improvements/page.tsx ngày 16/09/2026.
//
// Vì sao: bộ hướng dẫn chi tiết cho 14 loại đề xuất này đã được viết đầy đủ —
// từng bước cụ thể trong Google/Meta Ads Manager, link công cụ nội bộ — nhưng
// component dùng nó (`ManualGuideModal`) KHÔNG được gọi ở đâu cả sau một đợt
// refactor. Trang thật dùng ActionPlanPanel, mà bộ sinh của nó chỉ xử lý cụ
// thể 4/14 loại; 9 loại còn lại rơi vào một khối chung luôn in đúng ba dòng:
//   "Truy cập trình quản lý quảng cáo. Tìm campaign X. Thực hiện thay đổi
//    được yêu cầu."
// Người dùng bấm "Xem & Sửa" cho 9/14 loại chỉ nhận bấy nhiêu, trong khi
// hướng dẫn thật nằm ngay trong repo.
//
// Nằm ở lib thì CẢ HAI nơi dùng được: modal cũ (nếu nối lại) và ActionPlanPanel.
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ManualGuide {
  whatToDo:  string          // 1 câu tóm tắt
  steps:     string[]        // bước thực hiện
  internalLink?: string      // link tool nội bộ
  internalLabel?: string
  externalHint?: string      // gợi ý platform bên ngoài
}

export function getManualGuide(imp: any): ManualGuide {
  const camp = imp.campaignName ? `"${imp.campaignName}"` : "campaign này"
  const kw   = imp.keyword      ? `"${imp.keyword}"`      : "keyword này"

  switch (imp.type) {

    case "FIX_LOW_QS_KEYWORD":
      return {
        whatToDo: `Tăng Quality Score của ${kw} từ ${imp.currentMetric} lên ${imp.targetMetric}`,
        steps: [
          `1. Vào Google Ads → Campaign ${camp} → Ad Groups → tìm keyword ${kw}`,
          `2. Kiểm tra điểm yếu: Ad Relevance / Expected CTR / Landing Page`,
          `3. Nếu Ad Relevance thấp: thêm từ khóa vào headlines của RSA`,
          `4. Nếu Landing Page thấp: đảm bảo trang đích chứa nội dung liên quan đến keyword`,
          `5. Nếu Expected CTR thấp: viết lại ad copy với USP mạnh hơn (giá, khuyến mãi, bảo hành)`,
        ],
        internalLink:  "/creative",
        internalLabel: "✨ Mở Creative AI để viết lại Ad",
        externalHint:  "Google Ads → Từ khóa → cột Quality Score",
      }

    case "PAUSE_FB_AD_LOW_CTR":
      return {
        whatToDo: `Pause ad Facebook có CTR thấp, thay bằng creative mới`,
        steps: [
          `1. Vào Facebook Ads Manager → campaign ${camp}`,
          `2. Tìm ad "${imp.adName || imp.title}" → tắt (toggle OFF)`,
          `3. Duplicate ad set này → tạo ad mới với:`,
          `   • Hình ảnh/video khác (thử lifestyle thay product shot)`,
          `   • Headline có số liệu cụ thể (vd: "Tiết kiệm 50%" thay "Ưu đãi tốt")`,
          `   • Primary text ngắn hơn (< 125 ký tự cho mobile)`,
          `4. Chạy A/B 3-5 ngày, giữ ad nào CTR > 1%`,
        ],
        internalLink:  "/creative",
        internalLabel: "✨ Tạo creative mới với AI",
        externalHint:  "Meta Ads Manager → Ads → Filter by CTR",
      }

    case "PAUSE_FB_AD_FATIGUE":
      return {
        whatToDo: `Refresh creative hoặc mở rộng audience để giảm frequency`,
        steps: [
          `1. Ad Set "${imp.adGroupName}" đang có frequency > 3.5× — audience đã "bão hòa"`,
          `2. Phương án A — Refresh creative: tạo 2-3 ad mới trong ad set này`,
          `3. Phương án B — Mở rộng audience: tăng tuổi/vị trí/interest, bỏ exclusion quá hẹp`,
          `4. Phương án C — Tạm dừng 1-2 tuần rồi relaunch`,
          `5. Sau khi refresh, frequency nên về < 2.5× trong 7 ngày đầu`,
        ],
        internalLink:  "/creative",
        internalLabel: "✨ Tạo creative mới với AI",
        externalHint:  "Meta Ads Manager → Ad Sets → cột Frequency",
      }

    case "DAYPART_OPPORTUNITY":
      return {
        whatToDo: `Tắt quảng cáo trong các khung giờ không có conversion để tiết kiệm ngân sách`,
        steps: [
          `1. Vào tool Dayparting để xem chi tiết hiệu suất từng giờ`,
          `2. Chọn campaign muốn tối ưu`,
          `3. Tắt các giờ đang tốn tiền nhưng 0 conversion (thường: 0:00–6:00)`,
          `4. Giữ nguyên giờ hành chính 7:00–21:00 (B2B convert tốt nhất)`,
          `5. Áp dụng và theo dõi CPL sau 7 ngày`,
        ],
        internalLink:  "/toolkit/dayparting",
        internalLabel: "🕐 Mở Dayparting Tool",
      }

    case "FIX_AD_STRENGTH":
    case "IMPROVE_PMAX_ASSETS":
      return {
        whatToDo: `Cải thiện Ad Strength để tăng Quality Score và giảm CPC`,
        steps: [
          `1. Vào Creative AI để xem gợi ý cải thiện ad`,
          `2. Thêm ít nhất 15 headlines đa dạng (không lặp cùng ý)`,
          `3. Thêm 4+ descriptions nêu rõ USP khác nhau`,
          `4. Đảm bảo headlines chứa từ khóa chính của ad group`,
          `5. Pinning headlines quan trọng vào position 1`,
          `6. Sau khi update, chờ 1-2 tuần Google re-evaluate`,
        ],
        internalLink:  `/creative${imp.resourceName ? `?adResource=${imp.resourceName}` : ""}`,
        internalLabel: "✨ Mở Creative AI",
        externalHint:  "Google Ads → Quảng cáo → cột Ad Strength",
      }

    case "ADD_AD_EXTENSION":
      return {
        whatToDo: `Thêm extensions để tăng CTR và chiếm nhiều diện tích trên Google hơn`,
        steps: [
          `1. Vào Google Ads → campaign ${camp} → Tiện ích mở rộng`,
          `2. Thêm Sitelink (4-6 link): Báo giá, Liên hệ, Tính năng, Khuyến mãi`,
          `3. Thêm Callout (4+): "Hỗ trợ 24/7", "Không ràng buộc", "Miễn phí setup"`,
          `4. Thêm Structured Snippet: liệt kê sản phẩm/dịch vụ`,
          `5. Thêm Call extension nếu có hotline`,
          `6. Extensions không tốn thêm tiền, chỉ tăng CTR`,
        ],
        externalHint: "Google Ads → Quảng cáo & tiện ích → Tiện ích",
      }

    case "GEO_BID_ADJUSTMENT":
      return {
        whatToDo: `Giảm bid hoặc tạm dừng các khu vực địa lý không có conversion`,
        steps: [
          `1. Vào Google Ads → campaign ${camp} → Vị trí`,
          `2. Xem hiệu suất theo tỉnh/TP (cột Conversion)`,
          `3. Khu vực 0 conv sau 30 ngày: giảm bid -50% hoặc loại trừ`,
          `4. Ưu tiên: Hà Nội, TP.HCM, Đà Nẵng (B2B tập trung ở đây)`,
          `5. Tạo bid adjustment cho HN/HCM +20% để tăng exposure ở thị trường tốt`,
        ],
        externalHint: "Google Ads → Vị trí → Điều chỉnh giá thầu",
      }

    case "DEVICE_BID_ADJUSTMENT":
      return {
        whatToDo: `Giảm bid cho Mobile vì CPL Mobile đang cao hơn Desktop đáng kể`,
        steps: [
          `1. Vào Google Ads → campaign ${camp} → Thiết bị`,
          `2. So sánh CPL Mobile vs Desktop`,
          `3. Set bid adjustment cho Mobile: ${imp.targetMetric || "-20% đến -40%"}`,
          `4. Hoặc dùng nút Apply để hệ thống tự điều chỉnh`,
          `5. Theo dõi sau 2 tuần — B2B thường có CPL Mobile cao hơn 2x`,
        ],
      }

    case "ADD_EXACT_MATCH":
      return {
        whatToDo: `Thêm keyword [exact match] để kiểm soát traffic tốt hơn và giảm CPC`,
        steps: [
          `1. Vào Google Ads → campaign ${camp} → Ad Groups`,
          `2. Trong ad group chứa keyword broad "${imp.keyword}"`,
          `3. Thêm keyword mới: [${imp.keyword}] (dạng exact, thêm dấu ngoặc vuông)`,
          `4. Set bid cho exact match cao hơn broad 20-30%`,
          `5. Monitor: exact match sẽ convert tốt hơn và CPC thấp hơn`,
          `6. Sau 2 tuần, có thể giảm bid hoặc pause phiên bản broad`,
        ],
        externalHint: "Google Ads → Từ khóa → Thêm từ khóa",
      }

    case "PAUSE_SEARCH_TERM":
    case "NEGATIVE_BRAND_LEAK":
      return {
        whatToDo: `Thêm negative keyword để ngăn từ khóa không liên quan trigger ads`,
        steps: [
          `1. Vào Google Ads → campaign ${camp}`,
          `2. Báo cáo → Cụm từ tìm kiếm`,
          `3. Tìm search term: "${imp.title?.replace("Negative từ khóa không liên quan: ", "").replace("Negative search term không liên quan: ", "").replace(/"/g, "")}"`,
          `4. Chọn → Thêm làm từ khóa phủ định → Exact match`,
          `5. Hoặc nhấn Apply để hệ thống tự thêm negative`,
        ],
        externalHint: "Google Ads → Cụm từ tìm kiếm → Thêm làm từ khóa phủ định",
      }

    case "INCREASE_BUDGET_CAPPED":
      return {
        whatToDo: `Tăng ngân sách campaign đang bị giới hạn để lấy thêm conversion`,
        steps: [
          `1. Campaign ${camp} đang mất ${imp.currentMetric?.match(/\d+%/)?.[0] || ""} impression do hết budget`,
          `2. Vào Google Ads → Campaigns → Budget`,
          `3. Tăng budget theo đề xuất: ${imp.targetMetric}`,
          `4. Hoặc nhấn Apply để hệ thống tự tăng`,
          `5. Monitor CPL sau khi tăng — nếu CPL vẫn tốt, tiếp tục scale`,
        ],
      }

    case "LOWER_TARGET_CPA":
      return {
        whatToDo: `Hạ target CPA để Google bidding aggressively hơn, lấy thêm volume`,
        steps: [
          `1. Campaign ${camp}: CPA thực tế đang thấp hơn target CPA`,
          `2. Vào Google Ads → Campaigns → Chiến lược giá thầu`,
          `3. Hạ target CPA xuống: ${imp.targetMetric}`,
          `4. Hoặc nhấn Apply — hệ thống tự điều chỉnh`,
          `5. Không hạ quá 15% mỗi lần, chờ 2 tuần để thuật toán học lại`,
        ],
      }

    case "INCREASE_BID_HIGH_ROAS":
      return {
        whatToDo: `Keyword này đang convert rất tốt — tăng bid để lấy thêm traffic`,
        steps: [
          `1. Keyword ${kw} trong ${camp} có CPL thấp hơn target nhiều`,
          `2. Vào Google Ads → Từ khóa → tìm keyword này`,
          `3. Tăng CPC max lên 120-150% so với hiện tại`,
          `4. Hoặc nếu đang dùng Smart Bidding: hạ target CPA xuống 80%`,
          `5. Monitor sau 1 tuần — mục tiêu tăng impression share`,
        ],
      }

    case "DUPLICATE_FB_WINNING_ADSET":
      return {
        whatToDo: `Scale ad set đang perform tốt bằng cách duplicate và tăng budget`,
        steps: [
          `1. Vào Meta Ads Manager → Ad Set "${imp.adGroupName}"`,
          `2. Duplicate ad set này (giữ nguyên targeting và creative)`,
          `3. Tăng budget của duplicate lên 50% so với original`,
          `4. Không chỉnh targeting ngay — để thuật toán học`,
          `5. Sau 7 ngày: giữ ad set nào CPL tốt hơn, pause cái còn lại`,
        ],
        externalHint: "Meta Ads Manager → Ad Sets → Duplicate",
      }

    // ── Bảy loại dưới đây TRƯỚC ĐÂY KHÔNG CÓ hướng dẫn riêng (viết 16/09/2026).
    //    Chúng rơi vào nhánh default và chỉ in lại currentMetric/targetMetric —
    //    trong đó PAUSE_KEYWORD là một trong những loại xuất hiện nhiều nhất.

    case "PAUSE_KEYWORD":
      return {
        whatToDo: `Tạm dừng ${kw} — đang tiêu tiền mà không ra chuyển đổi`,
        steps: [
          `1. Vào Google Ads → campaign ${camp} → Từ khoá`,
          `2. Tìm ${kw} (${imp.currentMetric || "xem cột Chi phí và Chuyển đổi"})`,
          `3. Kiểm lại cụm từ tìm kiếm đã kích hoạt nó — nếu lệch nghĩa thì thêm phủ định thay vì tạm dừng`,
          `4. Nếu đúng nghĩa mà vẫn không ra chuyển đổi: chọn từ khoá → Tạm dừng`,
          `5. Ghi lại ngày tạm dừng để 2 tuần sau còn đối chiếu hiệu quả`,
        ],
        externalHint: "Google Ads → Từ khoá → chọn → Tạm dừng",
      }

    case "PAUSE_LOW_CTR_AD":
      return {
        whatToDo: `Tạm dừng quảng cáo CTR thấp trong ${camp} và thay bằng bản mới`,
        steps: [
          `1. Vào Google Ads → campaign ${camp} → Quảng cáo`,
          `2. So CTR của quảng cáo này với các quảng cáo còn lại trong CÙNG nhóm (${imp.currentMetric || "xem cột CTR"})`,
          `3. Chỉ tạm dừng khi nhóm còn ÍT NHẤT 2 quảng cáo đang chạy — tắt hết là nhóm ngừng phân phối`,
          `4. Tạo bản thay thế trước, để nhóm không bị hụt quảng cáo`,
          `5. Tạm dừng bản cũ sau khi bản mới đã được duyệt`,
        ],
        externalHint: "Google Ads → Quảng cáo → chọn → Tạm dừng",
      }

    case "PAUSE_PMAX_ASSET":
      return {
        whatToDo: `Gỡ tài sản kém hiệu quả khỏi nhóm tài sản PMax của ${camp}`,
        steps: [
          `1. Vào Google Ads → campaign ${camp} → Nhóm tài sản`,
          `2. Mở nhóm chứa tài sản bị đánh dấu, xem cột Hiệu suất (Thấp/Tốt/Tốt nhất)`,
          `3. KHÔNG xoá nếu gỡ xong sẽ tụt dưới số tối thiểu Google yêu cầu (3 tiêu đề, 2 mô tả, 1 ảnh mỗi tỉ lệ)`,
          `4. Thêm tài sản thay thế TRƯỚC, rồi mới gỡ tài sản kém`,
          `5. Chờ ít nhất 2 tuần để Google đánh giá lại trước khi kết luận`,
        ],
        internalLink: "/google-pmax",
        internalLabel: "Mở PMax Insights",
      }

    case "SHIFT_BUDGET_CHANNEL":
      return {
        whatToDo: `Chuyển ngân sách sang kênh đang hiệu quả hơn`,
        steps: [
          `1. Đối chiếu CPL/ROAS hai kênh trong cùng khoảng thời gian — khác kỳ là so sai`,
          `2. Chuyển từng phần 10-20%, KHÔNG chuyển hết một lần: đổi ngân sách mạnh đẩy campaign về giai đoạn học lại`,
          `3. Giảm ở kênh kém trước, chờ 3-4 ngày, rồi mới tăng ở kênh tốt`,
          `4. Theo dõi CPL kênh nhận thêm ngân sách — tăng ngân sách thường kéo CPL lên theo`,
        ],
        internalLink: "/toolkit/budget-pacing",
        internalLabel: "Xem tốc độ tiêu ngân sách",
      }

    case "RAISE_BUDGET_TOP_CAMPAIGN":
      return {
        whatToDo: `Tăng ngân sách cho ${camp} — đang hiệu quả mà bị giới hạn`,
        steps: [
          `1. Xác nhận campaign THẬT SỰ bị giới hạn: trạng thái ngân sách "Bị giới hạn" hoặc mất impression share vì ngân sách`,
          `2. Tăng tối đa 20-30% mỗi lần. Tăng gấp đôi trở lên sẽ đẩy campaign về giai đoạn học lại`,
          `3. Chờ 3-4 ngày rồi mới đánh giá — ngày đầu sau khi tăng thường nhiễu`,
          `4. Nếu CPL tăng quá ngưỡng sau khi tăng ngân sách: hạ về mức cũ`,
        ],
        internalLink: "/toolkit/budget-pacing",
        internalLabel: "Xem tốc độ tiêu ngân sách",
      }

    case "ADD_COMPETITOR_KW":
      return {
        whatToDo: `Thêm từ khoá thương hiệu đối thủ vào ${camp}`,
        steps: [
          `1. Tạo nhóm quảng cáo RIÊNG cho từ khoá đối thủ — không trộn vào nhóm thương hiệu mình`,
          `2. Dùng khớp cụm hoặc khớp chính xác, tránh khớp rộng (rất dễ đốt tiền)`,
          `3. TUYỆT ĐỐI không đưa tên đối thủ vào nội dung quảng cáo — Google cấm và có thể bị gỡ quảng cáo`,
          `4. Viết nội dung nêu điểm khác biệt của mình, không so sánh trực tiếp`,
          `5. Đặt giá thầu thấp hơn nhóm thương hiệu và theo dõi CPL riêng cho nhóm này`,
        ],
        externalHint: "Google Ads → Nhóm quảng cáo mới → Từ khoá",
      }

    case "EXPAND_REMARKETING":
      return {
        whatToDo: `Mở rộng tệp tiếp thị lại cho ${camp}`,
        steps: [
          `1. Kiểm tệp hiện có đã đủ kích thước tối thiểu chưa (Google 1.000, Meta 1.000)`,
          `2. Mở rộng cửa sổ thời gian (30 → 60 → 90 ngày) trước khi nới điều kiện hành vi`,
          `3. Tách tệp theo mức độ quan tâm: đã xem giá / đã thêm giỏ / đã liên hệ — mỗi tệp một thông điệp`,
          `4. Loại trừ người đã mua, nếu không sẽ trả tiền để quảng cáo cho khách cũ`,
        ],
        internalLink: "/audiences",
        internalLabel: "Mở Audiences",
      }

    default:
      return {
        whatToDo: imp.description || "Xem chi tiết và xử lý theo gợi ý",
        steps: [
          imp.currentMetric ? `Hiện tại: ${imp.currentMetric}` : "",
          imp.targetMetric  ? `Mục tiêu: ${imp.targetMetric}`  : "",
          imp.impact        ? `Tác động: ${imp.impact}`         : "",
        ].filter(Boolean),
      }
  }
}
