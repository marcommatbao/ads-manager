"use client";

import { useState, useEffect, useCallback } from "react";
import { isHiddenPage } from "@/lib/hidden-pages";
import {
  BookOpen, LayoutDashboard, Megaphone, Sparkles, Eye,
  Target, PieChart, ShieldCheck, Lightbulb, Zap, Wrench,
  Bell, Settings, ChevronDown, ChevronRight,
  CheckCircle2, AlertCircle, Info, ArrowRight, Search,
  Bot, DollarSign, Radar, Loader2,
  ListTodo, CalendarRange, Stethoscope, ListChecks, BookOpenCheck,
  ScanLine, HeartPulse, Images, Split,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// Data
//
// Thứ tự + tên nhóm KHỚP đúng menu trái (components/Sidebar.tsx, trường `section`).
// Trang đang tạm ẩn (lib/hidden-pages.ts: Audiences, Doanh thu thật, Attribution,
// Reports, Google Audit, và các mục con N-Gram / Budget Pacing / Cấu trúc nhóm QC /
// Automation → Audience) KHÔNG được viết ở đây. Khi mở lại một trang: xoá dòng của nó
// trong lib/hidden-pages.ts, rồi thêm mục tương ứng vào nhóm bên dưới.
// ─────────────────────────────────────────────

interface Feature {
  id: string;
  label: string;
  href: string;
  icon: typeof BookOpen;
  color: string;
  badge?: string;
  /** Mục chỉ tài khoản Admin thấy trong menu (khớp `roles` ở Sidebar). */
  adminOnly?: boolean;
  /** 1 dòng "dùng cho việc gì" — hiện ở mục lục và ở đầu thẻ. */
  summary: string;
  /** "Dùng để làm gì" */
  description: string;
  /** "Khi nào dùng" */
  when?: string;
  /** "Các bước chính" */
  steps?: string[];
  tips?: string[];
  warnings?: string[];
  visual?: {
    title: string;
    items: { label: string; value: string; color?: string }[];
  };
}

interface FeatureGroup {
  id: string;
  label: string;
  intro: string;
  features: Feature[];
}

const GROUPS: FeatureGroup[] = [
  // ───────────── Dashboard ─────────────
  {
    id: "nhom-dashboard",
    label: "Dashboard",
    intro: "Màn hình đầu tiên khi mở app, và trợ lý chat AI nổi ở mọi trang.",
    features: [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/",
        icon: LayoutDashboard,
        color: "from-slate-500 to-slate-700",
        summary: "Tổng quan chi tiêu, cảnh báo và tóm tắt AI mỗi sáng.",
        description:
          "Màn hình tổng quan: chi tiêu, cảnh báo và tóm tắt AI mỗi sáng cho cả Meta (Facebook) và Google Ads.",
        when: "Mở đầu ngày để nắm nhanh tình hình, trước khi đi vào các trang chi tiết.",
      },
      {
        id: "adsbot",
        label: "AdsBot (chat AI)",
        href: "/",
        icon: Bot,
        color: "from-amber-500 to-orange-600",
        summary: "Hỏi nhanh số liệu bằng tiếng Việt — nút tròn góc dưới bên phải, mở được ở mọi trang.",
        description:
          "AdsBot là chatbot AI (Gemini). Hỏi tự nhiên về chi tiêu, lead, CPL, PMax, đơn hàng thật, từ khoá… AdsBot tự gọi công cụ để lấy số thật, không bịa số. AdsBot CHỈ TƯ VẤN: không pause, đổi ngân sách hay đăng bài được. Bản nháp nó viết ra (quảng cáo mới, viết lại RSA…) bạn phải tự xem lại và tự áp dụng ở đúng trang chức năng.",
        when: "Cần một con số nhanh hoặc một bản nháp nội dung mà không muốn mở nhiều trang.",
        steps: [
          "Bấm nút tròn góc dưới bên phải để mở khung chat.",
          "Hỏi tự nhiên, ví dụ: “Chiến dịch chi nhiều nhất tháng này là gì?”.",
          "Thiếu thông tin (sản phẩm, giọng văn…) AdsBot sẽ hỏi lại thay vì tự đoán.",
        ],
        tips: ["Mỗi tin nhắn tối đa 3 lượt gọi AI sinh nội dung — việc nhiều thì hỏi từng việc một."],
      },
    ],
  },

  // ───────────── Hằng ngày ─────────────
  {
    id: "nhom-hang-ngay",
    label: "Hằng ngày",
    intro: "Mở đầu ngày: xem việc cần làm, báo cáo tuần và cảnh báo.",
    features: [
      {
        id: "viec-hom-nay",
        label: "Việc hôm nay",
        href: "/viec-hom-nay",
        icon: ListTodo,
        color: "from-blue-500 to-indigo-600",
        summary: "Một hộp việc gộp từ PMax, Search, Meta, phiên xử lý và sức khoẻ đo lường.",
        description:
          "Gộp các việc nên làm từ nhiều nơi vào MỘT danh sách, xếp theo thứ tự ưu tiên: ① Số đo sai (sửa trước, vì mọi quyết định khác dựa trên số này), ② Lãng phí rõ (tiền đang chảy vào phần không ra đơn), ③ Cơ hội (ước tính, làm sau). Trong mỗi loại xếp theo số tiền. Hộp việc KHÔNG tự ghi gì lên tài khoản quảng cáo.",
        when: "Việc đầu tiên mỗi sáng: xem hôm nay nên làm gì trước.",
        steps: [
          "Lọc theo Công ty, Nguồn, Loại, Trạng thái (mặc định “Mới + Đã xem”).",
          "Đọc lý do và số tiền của từng việc (mở “mục bên trong” nếu có), rồi sang trang tương ứng để xử lý.",
          "Xong thì bấm “Đã làm”; chưa cần thì “Đã xem”, “Hoãn…” hoặc “Bỏ qua…”.",
          "Cần xem lại việc đã đóng: đổi bộ lọc Trạng thái rồi bấm “Mở lại”.",
        ],
        tips: [
          "08:10 mỗi ngày 5 việc ưu tiên nhất được gửi vào kênh Teams của team Ads (nếu đã cấu hình kênh).",
        ],
        warnings: [
          "“Bỏ qua…” bắt buộc nhập lý do. Việc bị hoãn hoặc bỏ qua vẫn hiện lại nếu tiền liên quan tăng hơn 50%.",
          "Nếu một nguồn không đọc được, việc của nguồn đó bị ẩn (để không xử lý trên số cũ) và có dòng báo lỗi ở đầu trang.",
        ],
      },
      {
        id: "bao-cao-tuan",
        label: "Báo cáo tuần",
        href: "/bao-cao-tuan",
        icon: CalendarRange,
        color: "from-teal-500 to-emerald-700",
        summary: "Mỗi thứ Hai: tiền và kết quả từng công ty, số đáng tin tới đâu, tool đã làm gì.",
        description:
          "Báo cáo quản lý tuần, tự dựng vào thứ Hai 08:30 và gửi Teams kênh Ads. Gồm tiền và kết quả từng công ty, số đáng tin tới đâu, tool đã ghi gì lên tài khoản, việc tồn, thử nghiệm. Số do hệ thống tính, không do AI viết; nguồn nào đọc hỏng thì ghi “không đọc được”, không hiện số 0.",
        when: "Họp đầu tuần hoặc khi cần xem lại một tuần cũ.",
        steps: [
          "Chọn tuần ở ô “Chọn tuần” để xem các tuần đã lưu.",
          "Đọc từng khối theo thứ tự trên trang.",
          "Người có quyền sửa có thể bấm “Dựng lại tuần trọn gần nhất” để dựng ngay (chỉ lưu, không gửi Teams).",
        ],
      },
      {
        id: "notifications",
        label: "Thông báo",
        href: "/notifications",
        icon: Bell,
        color: "from-orange-500 to-red-600",
        summary: "Cảnh báo chiến dịch theo thời gian thực.",
        description:
          "Danh sách cảnh báo tự động từ hệ thống giám sát chiến dịch. Lọc theo mức độ hoặc xem các cảnh báo đã xử lý.",
        when: "Khi thấy chuông thông báo, hoặc cuối ngày để rà các cảnh báo còn mở.",
      },
    ],
  },

  // ───────────── Xử lý chiến dịch ─────────────
  {
    id: "nhom-xu-ly-chien-dich",
    label: "Xử lý chiến dịch",
    intro: "Phiên xử lý 7 bước: từ phát hiện chiến dịch tiêu vượt mục tiêu tới đo lại kết quả.",
    features: [
      {
        id: "xu-ly",
        label: "Xử lý chiến dịch",
        href: "/xu-ly",
        icon: Stethoscope,
        color: "from-rose-500 to-red-700",
        summary: "Chiến dịch nào đang tiêu vượt mục tiêu, vì sao, và xử lý tới khi xong.",
        description:
          "Trang tổng quan xếp chiến dịch theo số tiền “chi vượt trần” (chi phí − trần × số đơn), lớn nhất lên đầu. Từ đây mở một phiên xử lý gồm 7 bước: Phân tích → Thu thập → Mục tiêu → Nguyên nhân → Hướng xử lý → Duyệt & làm → Hoàn thành. Sau khi làm thật, hệ thống tự đo lại sau 7 và 14 ngày.",
        when: "Khi có chiến dịch chi nhiều mà ra ít đơn và bạn muốn xử lý có quy trình, có đo lại.",
        steps: [
          "Chọn Kênh (Google Ads hoặc Facebook), Công ty và khoảng ngày.",
          "Xem các ô tổng: Tổng chi, Đơn mua, Chi phí/đơn, Chi vượt trần (và ROAS chung với Facebook).",
          "Chiến dịch chưa có mục tiêu: bấm “Đặt mục tiêu”. Đã có mục tiêu: bấm “Mở phiên xử lý”.",
          "Đi hết các bước trên thanh bước. Bước 6 “Duyệt & làm” ghi thật lên tài khoản.",
          "Bước 7: theo dõi kết quả đo lại 7/14 ngày.",
        ],
        warnings: [
          "Mở phiên cần khoảng ngày ít nhất 7 ngày (khoảng này được lưu làm mốc “trước” để so với đo lại).",
          "Bước ghi thật (bước 6) phải gõ đúng “XAC NHAN”.",
          "Chiến dịch 0 đơn chỉ bị đánh đỏ khi đã chi từ 1 lần trần trở lên; ít hơn thì ghi “Chưa đủ dữ liệu”.",
        ],
      },
      {
        id: "theo-doi",
        label: "Theo dõi phiên",
        href: "/xu-ly/theo-doi",
        icon: ListChecks,
        color: "from-sky-500 to-blue-700",
        summary: "Mọi phiên đang mở, chờ đo lại, hoặc vừa mở lại vì đo lại không cải thiện.",
        description:
          "Một bảng chung cho mọi phiên của 2 công ty và 2 nền tảng: phiên đang ở bước nào, đo lại 7/14 ngày ra sao, việc giao người còn mở bao lâu.",
        when: "Hằng ngày hoặc hằng tuần để biết phiên nào cần làm tiếp, phiên nào đang chờ đo lại.",
        steps: [
          "Lọc theo công ty, nền tảng, trạng thái.",
          "Bấm “Mở phiên” để vào đúng phiên cần làm tiếp.",
        ],
        tips: ["Chưa có phiên nào thì dùng nút “Mở tổng quan chiến dịch” để chọn chiến dịch cần xử lý."],
      },
      {
        id: "so-kinh-nghiem",
        label: "Sổ kinh nghiệm",
        href: "/so-kinh-nghiem",
        icon: BookOpenCheck,
        color: "from-violet-500 to-purple-700",
        summary: "Học từ những gì đã thắng 180 ngày qua — dùng lại khi tạo chiến dịch mới.",
        description:
          "Tổng hợp từ 180 ngày gần nhất những đặc điểm lặp lại ở đơn vị thắng (“Nên dùng”) và đơn vị thua tiêu tiền mà 0 kết quả (“Nên tránh”). Cập nhật tự động thứ Hai 04:00. Bấm “Bằng chứng” để xem chiến dịch hoặc nhóm cụ thể làm căn cứ.",
        when: "Trước khi tạo chiến dịch mới, để biết cái gì đã chạy tốt và cái gì nên tránh.",
        steps: [
          "Lọc theo Công ty, Nền tảng, Sản phẩm, Trạng thái (có nút “Xoá bộ lọc”).",
          "Đọc khối “Nên dùng” và “Nên tránh”, mở “Bằng chứng” để kiểm lại.",
          "Muốn áp dụng thì sang tạo chiến dịch (nút “Tạo chiến dịch Meta →”).",
        ],
        tips: [
          "Super Admin có thể bấm “Tải thêm số Meta” và “Chạy lại bây giờ” để cập nhật ngay, không cần chờ thứ Hai.",
        ],
      },
    ],
  },

  // ───────────── Google Ads ─────────────
  {
    id: "nhom-google-ads",
    label: "Google Ads",
    intro: "Công cụ làm việc trực tiếp trên tài khoản Google Ads (MBC / MBI).",
    features: [
      {
        id: "google-search",
        label: "Google Search",
        href: "/google-search",
        icon: Search,
        color: "from-red-500 to-rose-700",
        adminOnly: true,
        summary: "Bật/tắt, đổi ngân sách, chặn cụm đốt tiền, xem duyệt chính sách; X-quang chẩn đoán và việc nên làm.",
        description:
          "Trang làm việc cho chiến dịch Search. Chọn công ty (MBC/MBI) dùng chung cho cả 4 tab. Tab quan trọng nhất là “X-quang & việc nên làm”: chẩn đoán theo Ý ĐỊNH tìm kiếm trong từng chiến dịch (chi phí, mất hiển thị, từ khoá, thiết bị) rồi nói rõ NÊN LÀM GÌ, cho áp dụng tại chỗ.",
        when: "Chiến dịch Search chi nhiều mà ít đơn, mất hiển thị vì ngân sách, hoặc cần dọn từ khoá/cụm tìm kiếm tốn tiền.",
        visual: {
          title: "4 tab của trang",
          items: [
            { label: "🩻 X-quang & việc nên làm", value: "Chẩn đoán + danh sách việc áp dụng được", color: "text-red-600" },
            { label: "🔍 Cụm tìm kiếm", value: "Chặn cụm tìm kiếm tốn tiền, thêm từ khoá", color: "text-blue-600" },
            { label: "✍️ Quảng cáo RSA", value: "AI soạn nháp viết lại quảng cáo, bạn duyệt rồi mới ghi", color: "text-violet-600" },
            { label: "🧾 Nhật ký ghi", value: "Mọi lần tool ghi lên tài khoản, Hoàn tác một chạm", color: "text-slate-600" },
          ],
        },
        steps: [
          "Mở tab “X-quang & việc nên làm”, chọn công ty và khoảng ngày (mặc định 30 ngày). Bấm “Tải lại” để lấy số mới.",
          "Đọc banner cảnh báo ở đầu, rồi khối “✅ Việc nên làm”. Mỗi thẻ có mức ưu tiên: P1 Làm ngay, P2 Nên làm, P3 Xem xét, kèm lý do và số tiền đang chảy vào.",
          "Thẻ có “việc cụ thể”: bấm dòng “… việc cụ thể” để mở danh sách và tích chọn việc muốn làm (xem mục bên dưới).",
          "Bấm “Kiểm trước (không ghi)”: Google kiểm tra giúp, CHƯA ghi gì. Báo OK thì nút “Áp dụng” mới bật.",
          "Bấm “Áp dụng”, gõ “XAC NHAN”, bấm “Ghi thật”. Hệ thống đọc lại để xác nhận khớp.",
          "Muốn rút lại: mở “Lịch sử áp dụng”, bấm “Hoàn tác” ở lần ghi đó (cũng phải gõ “XAC NHAN”).",
        ],
        tips: [
          "Danh sách việc cụ thể dài (hơn 8 việc) sẽ có ô lọc theo tên/chiến dịch (gõ không dấu cũng được) và ô “Chỉ hiện đã chọn”.",
          "“Chọn tất cả N” tích mọi việc đang hiện trong danh sách (đang lọc thì chỉ tích phần đã lọc); bấm lại để “Bỏ chọn”. Danh sách hiện 20 việc một lần, bấm “Xem thêm” để thấy tiếp.",
          "Thanh trên cùng có “Chọn tất cả việc tích sẵn” để chọn các việc hệ thống đã tích mặc định ở mọi thẻ, rồi Kiểm trước + Áp dụng một lượt.",
        ],
        warnings: [
          "Mọi lệnh ghi đều theo thứ tự: Kiểm trước (không ghi) → gõ “XAC NHAN” → Ghi thật → Hoàn tác nếu cần. Không có đường tắt.",
          "Không có quyền sửa thì xem được nhưng không áp dụng được (có dòng 🔒 báo ở đầu mục).",
        ],
      },
      {
        id: "search-split",
        label: "Google Search → Tách lượt tìm chung",
        href: "/google-search",
        icon: Split,
        color: "from-orange-500 to-red-600",
        adminOnly: true,
        summary: "Tách lượt tìm “chung” khỏi chiến dịch thương hiệu để lượt tìm thương hiệu không bị ăn ngân sách.",
        description:
          "Khi một chiến dịch thương hiệu trộn cả lượt tìm thương hiệu (rẻ) và lượt tìm chung (đắt) chung MỘT ngân sách, lượt chung ăn trước và chiến dịch mất hiển thị vì ngân sách. Tính năng này dựng một chiến dịch riêng cho lượt tìm chung, có ngân sách và mục tiêu riêng. Mở từ thẻ “Tách lượt tìm chung…” trong X-quang & việc nên làm.",
        when: "Thẻ việc nên làm đề xuất tách, hoặc chiến dịch thương hiệu mất nhiều hiển thị vì ngân sách do lẫn từ khoá chung.",
        visual: {
          title: "4 bước (mỗi bước ghi thật đều gõ “XAC NHAN”)",
          items: [
            { label: "1. Kiểm trước → Tạo chiến dịch tạm dừng", value: "Dựng chiến dịch mới ở trạng thái TẠM DỪNG, chưa tiêu tiền" },
            { label: "2. Bổ sung tài sản từ chiến dịch gốc", value: "Gắn sitelink, ảnh, tên doanh nghiệp… (chỉ tạo liên kết, không đổi nội dung); nên làm trước khi chuyển từ khoá" },
            { label: "3. Bật chiến dịch mới", value: "Chiến dịch mới bắt đầu tiêu tiền" },
            { label: "4. Chuyển từ khoá chung (bước 3 trong tool)", value: "Chỉ TẠM DỪNG từ khoá chung trong chiến dịch gốc, KHÔNG xoá; chỉ làm được khi chiến dịch mới đang bật" },
          ],
        },
        steps: [
          "Trong thẻ đề xuất, bấm “Tách lượt tìm chung…” và đọc phần “Đánh giá & lộ trình”.",
          "Chọn ngân sách/ngày cho chiến dịch mới (hoặc chọn một phương án trong khối “Chia ngân sách”: “Giữ tổng ngân sách” hoặc “Giữ thương hiệu nguyên ngân sách cũ”).",
          "Chọn Mục tiêu CPA: “Không đặt” (khuyên dùng 2 tuần đầu để Google học), “Giữ như chiến dịch gốc” (nếu gốc có), hoặc “Đặt mức khác”.",
          "Bấm “Kiểm trước (không ghi)”, rồi “Tạo chiến dịch tạm dừng”, gõ “XAC NHAN”, bấm “Tạo thật”.",
          "Trên thẻ bản tách: “Bổ sung tài sản từ chiến dịch gốc” (Kiểm trước rồi “Gắn thật”) → “Bật chiến dịch mới” → “Chuyển từ khoá chung (bước 3)”.",
          "Theo dõi bằng “Diễn biến theo ngày”, “Quảng cáo bản tách (Ad strength)” và các mốc đo tự động.",
        ],
        tips: [
          "Phương án “Giữ tổng ngân sách”: ngân sách chiến dịch gốc sẽ được hạ ở bước chuyển từ khoá chung. Chiến dịch gốc dùng ngân sách DÙNG CHUNG thì tool không đổi được, bạn chỉnh tay. Nút “Ngân sách chiến dịch gốc…” để đặt lại mức này; tool ghi nhớ mức cũ để hoàn tác.",
          "“Bỏ mục tiêu CPA” chuyển chiến dịch mới sang Tối đa chuyển đổi không mục tiêu CPA; đặt lại mục tiêu sau khi có khoảng 30 chuyển đổi.",
          "“Diễn biến theo ngày” (chỉ đọc) so chi phí và chuyển đổi từng ngày giữa chiến dịch gốc và chiến dịch mới. “CĐ” là chuyển đổi Google tự báo, chưa phải đơn đã thu tiền.",
          "“Quảng cáo bản tách (Ad strength)” cho biết độ mạnh quảng cáo từng nhóm; quảng cáo chép từ chiến dịch thương hiệu thường “Kém” với lượt tìm chung. Bấm “Sửa bằng AI…” để AI gợi ý viết lại, bạn duyệt, Kiểm trước, gõ “XAC NHAN” mới ghi.",
          "Tool tự đo ở mốc 7 và 14 ngày sau khi chuyển từ khoá (kết quả: Đạt / Theo dõi / Nên hoàn tác) và báo Teams kênh Ads. Cũng nhắc nếu bản tách tạo quá 3 ngày mà chưa chuyển từ khoá. Có thể bấm “Đo lại (mốc 7/14 ngày)” để đo thủ công.",
          "Sau khi đã tách, thẻ đề xuất đổi thành “Đã tách …” (còn bước bật + chuyển từ khoá, hoặc “đang theo dõi” kèm số ngày đã chạy trên 14). Một chiến dịch đã có bản tách thì không tách lần hai; muốn làm lại từ đầu phải bấm “Gỡ chiến dịch mới” ở bản cũ.",
        ],
        warnings: [
          "Chuyển từ khoá chung CHỈ tạm dừng từ khoá chung ở chiến dịch gốc, không bao giờ xoá. “Hoàn tác chuyển từ khoá” bật lại các từ khoá đó (và trả ngân sách gốc về mức cũ nếu đã hạ).",
          "Chiến dịch mới luôn tạo ở trạng thái TẠM DỪNG: chưa tiêu tiền cho tới khi bạn tự bấm “Bật chiến dịch mới”.",
          "Nên bổ sung tài sản TRƯỚC khi chuyển từ khoá, vì sau đó chiến dịch gốc không còn phục vụ lượt tìm chung.",
        ],
      },
      {
        id: "pmax",
        label: "PMax Insights",
        href: "/google-pmax",
        icon: PieChart,
        color: "from-indigo-500 to-blue-700",
        adminOnly: true,
        summary: "Xếp hạng asset PMax, search categories, phân bổ kênh; X-quang và việc nên làm.",
        description:
          "Phân tích chiến dịch Performance Max bằng dữ liệu thật từ Google Ads API. Chọn công ty MBC/MBI. Tab “🩻 X-quang” có khối “✅ Việc nên làm” dùng giống hệt Google Search: danh sách việc cụ thể để tích chọn → Kiểm trước (không ghi) → Áp dụng (gõ “XAC NHAN”) → Hoàn tác.",
        when: "Chiến dịch PMax chi nhiều mà không rõ tiền đi đâu, cần dọn asset yếu hoặc chặn phần lãng phí.",
        visual: {
          title: "6 tab của trang",
          items: [
            { label: "Tổng quan", value: "Thẻ từng chiến dịch PMax, cảnh báo", color: "text-blue-600" },
            { label: "🩻 X-quang", value: "Chẩn đoán + “Việc nên làm” áp dụng được", color: "text-red-600" },
            { label: "🧪 Thí nghiệm", value: "Thí nghiệm loại trừ vùng và các chỉ số khác (chất lượng lead…)", color: "text-violet-600" },
            { label: "🎨 Asset", value: "Sức khoẻ asset, thay asset yếu", color: "text-emerald-600" },
            { label: "AI PMax Advisor", value: "AI nhận xét từng chiến dịch (chỉ tải khi mở tab)", color: "text-amber-600" },
            { label: "Hành động nháp", value: "Nháp tạo từ thẻ của Advisor", color: "text-slate-600" },
          ],
        },
        steps: [
          "Mở tab “🩻 X-quang”.",
          "Ở “Việc nên làm”, mở danh sách “việc cụ thể”; dùng ô lọc, “Chọn tất cả”, “Chỉ hiện đã chọn”, “Xem thêm” như ở Google Search.",
          "Bấm “Kiểm trước (không ghi)” rồi “Áp dụng”, gõ “XAC NHAN”.",
          "Muốn rút lại thì “Hoàn tác” trong lịch sử.",
        ],
        tips: [
          "“Chọn tất cả việc tích sẵn” ở thanh trên cùng chọn các việc hệ thống đã tích mặc định.",
          "Nếu trang trống: tài khoản có thể chưa chạy PMax trong 30 ngày gần đây.",
        ],
        warnings: ["Không có quyền sửa thì xem được nhưng không áp dụng được."],
      },
    ],
  },

  // ───────────── Facebook / Meta ─────────────
  {
    id: "nhom-facebook-meta",
    label: "Facebook / Meta",
    intro: "Nhìn xuyên số “mua hàng” Meta tự báo để biết đơn thật nằm ở đâu.",
    features: [
      {
        id: "meta-xray",
        label: "Meta X-quang",
        href: "/meta-xray",
        icon: ScanLine,
        color: "from-blue-500 to-indigo-700",
        adminOnly: true,
        summary: "Đơn Meta báo tách “bấm thật” vs “chỉ xem”, đối chiếu GA4, việc nên làm cho từng chiến dịch.",
        description:
          "Chẩn đoán chiến dịch Facebook: đơn “Mua hàng” Meta báo được tách thành đơn từ lượt bấm thật (7 ngày) và đơn chỉ do xem quảng cáo (1 ngày), đối chiếu với GA4, kiểm cài đặt ghi nhận. Cuối trang có khối “✅ Việc nên làm” cho từng chiến dịch. Trang này chỉ đọc; việc ghi (mở nhóm quảng cáo mới) đi qua phiên Xử lý chiến dịch.",
        when: "Meta báo nhiều đơn nhưng doanh thu thật không tương xứng, hoặc cần quyết định chiến dịch nào đáng tăng/giảm.",
        steps: [
          "Chọn công ty (MBC / MBI) và khoảng ngày (mặc định 30 ngày).",
          "Đọc phần tách đơn bấm thật / chỉ xem và đối chiếu GA4.",
          "Ở “Việc nên làm”, mỗi thẻ có nút “Mở phiên xử lý” (làm tiếp ở phiên Xử lý chiến dịch), hoặc link sang trang liên quan, hoặc phần “Cách làm” tự thực hiện.",
        ],
      },
      {
        id: "creative-don-that",
        label: "Creative đơn thật",
        href: "/creative-don-that",
        icon: Target,
        color: "from-fuchsia-500 to-pink-700",
        adminOnly: true,
        summary: "Mẫu quảng cáo nào thật sự ra đơn — chấm theo đơn đã thu tiền / lượt bấm.",
        description:
          "Xếp mẫu quảng cáo Meta theo nguồn gần đơn thật nhất đang có (đơn đã thu tiền từ Odoo, GA4 theo mã quảng cáo, hoặc mua hàng từ lượt bấm), không theo số “mua hàng” Meta tự báo (phần lớn là người chỉ xem). Mỗi số đều ghi rõ nguồn.",
        when: "Chọn creative nào nên giữ, creative nào nên thay.",
        steps: [
          "Chọn công ty (MBC / MBI) và khoảng ngày.",
          "Xem bảng xếp hạng creative và nguồn dùng để chấm.",
        ],
      },
    ],
  },

  // ───────────── Đo lường & đơn thật ─────────────
  {
    id: "nhom-do-luong",
    label: "Đo lường & đơn thật",
    intro: "Số liệu có đáng tin không, và đưa đơn đã thu tiền về Google / Meta để chúng học theo đơn thật.",
    features: [
      {
        id: "do-luong",
        label: "Sức khoẻ đo lường",
        href: "/do-luong",
        icon: HeartPulse,
        color: "from-emerald-500 to-teal-700",
        summary: "Kiểm pixel/sự kiện chuyển đổi có bắn đúng trước khi đọc chi phí/đơn; tab “Đơn thật” gửi đơn thật về Google / Meta.",
        description:
          "Trang có 4 tab: Facebook, Google Ads (kiểm đo lường từng nền tảng), Chẩn đoán gắn thẻ, và Đơn thật. Hệ thống cũng chạy lại kiểm tra hằng ngày và báo Teams khi có lỗi mới hoặc đã khỏi.",
        when: "Trước khi tin các con số chi phí/đơn; hoặc khi muốn Google/Meta tối ưu theo đơn đã thu tiền thay vì số chúng tự báo.",
        visual: {
          title: "Tab “Đơn thật” gồm 5 khối",
          items: [
            { label: "Nguồn đơn", value: "Chọn Odoo / Webhook / Tệp CSV (mỗi công ty MỘT nguồn)", color: "text-blue-600" },
            { label: "1. Xem trước", value: "Chỉ đọc nguồn đơn, đếm đơn và độ phủ", color: "text-slate-600" },
            { label: "2. Google Ads", value: "Bật gửi đơn vào hàng “Lead chốt đơn”", color: "text-red-600" },
            { label: "3. Meta (Conversions API)", value: "Bật gửi sự kiện đơn thật lên pixel", color: "text-indigo-600" },
            { label: "4 và 5. Học theo đơn thật", value: "So sánh theo chiến dịch + kết luận (Google và Facebook)", color: "text-emerald-600" },
          ],
        },
        steps: [
          "Mở tab “Đơn thật”, chọn công ty.",
          "Khối “Nguồn đơn”: bấm một trong 3 nguồn. Đổi nguồn phải gõ “XAC NHAN”. Mỗi công ty dùng MỘT nguồn, hai nguồn cùng lúc sẽ đếm trùng đơn.",
          "Odoo: đọc đơn đã thanh toán trực tiếp (hiện chỉ MBI có danh sách từng đơn). Webhook: web/CRM gọi vào khi đơn đã thanh toán. Tệp CSV: xuất đơn rồi tải lên thủ công.",
          "Bấm “Xem trước” để thấy số đơn 30 ngày (gửi Google) và 7 ngày (gửi Meta), tỉ lệ có email/SĐT và “khớp được” bao nhiêu %.",
          "Khối Google Ads bấm “Bật gửi Google”, khối Meta bấm “Bật gửi Meta” (hoặc “Bật chế độ thử” nếu nhập mã thử). Bật phải gõ “XAC NHAN”; tắt lại bất cứ lúc nào.",
          "“Chạy ngay một lượt” để đẩy ngay thay vì chờ lịch tự động.",
          "Đọc khối 4 và 5 để biết chiến dịch nào đã đủ điều kiện (xem bên dưới).",
        ],
        tips: [
          "Webhook: bấm “Tạo khoá webhook”. Khoá chỉ hiện MỘT LẦN, hãy sao chép và cất ngay. “Tạo khoá mới” làm khoá cũ hết hiệu lực (cần gõ “XAC NHAN”). Mỗi lần gửi tối đa 500 đơn, chỉ gửi đơn ĐÃ THANH TOÁN; email/SĐT được băm ngay khi nhận. Gửi kèm gclid / fbc / utm thì khớp tốt nhất.",
          "Tệp CSV: dòng đầu là tên cột. Bắt buộc có order_id, paid_at, value; tuỳ chọn email, phone, gclid, fbc, utm_source, utm_campaign, status. Tối đa 2MB mỗi tệp. Tải lại tệp cũ không sao, đơn trùng mã bị bỏ.",
          "Mục “10 đơn gần nhất” chỉ hiện mã, giờ, giá trị và cờ có email/SĐT/gclid/fbc/utm, không hiện thông tin khách.",
          "Khối 4 “Google học theo đơn thật”: đầu tiên là checklist “Sẵn sàng” (hành động “Lead chốt đơn” ở mức PHỤ, điều khoản dữ liệu khách hàng, chuyển đổi nâng cao). Bên dưới là bảng 30 ngày theo chiến dịch: đơn Google báo, CPA Google, đơn thật, CPA thật, và kết luận. Quy tắc: chạy song song ít nhất 14 ngày và có ít nhất 15 đơn thật khớp được thì chiến dịch mới “Đủ để đưa lên chính”. Kết luận khác: “Đang gom số”, “Chưa đủ đơn”, “Chưa khớp — kiểm cấu hình”. Tool chỉ đề xuất, không tự đổi mục tiêu.",
          "Khối 5 “Facebook học theo đơn thật”: checklist Pixel, Gửi CAPI, Chuyển đổi tuỳ chỉnh. Nếu chưa có chuyển đổi tuỳ chỉnh, bấm “Tạo chuyển đổi tuỳ chỉnh… (Kiểm trước)”, rồi gõ “XAC NHAN” để tạo. Bảng theo chiến dịch có cột “% chỉ-xem” (phần “mua hàng” Meta báo chỉ do xem quảng cáo); kết luận như “Meta nhận vơ lượt xem” hoặc “Đủ để tối ưu theo đơn thật”.",
        ],
        warnings: [
          "Google: đơn đi vào hành động chuyển đổi PHỤ, nên Google CHƯA dùng nó để đặt giá cho tới khi bạn tự đưa vào mục tiêu chính.",
          "Meta: gửi sự kiện riêng, không phải “Purchase”, nên không làm trùng số mua hàng pixel đang báo. Meta chỉ nhận đơn trong 7 ngày.",
          "Khi Kiểm trước tạo chuyển đổi tuỳ chỉnh Meta báo OK, đó mới là kiểm dữ liệu, không kiểm quyền ghi — tạo thật vẫn có thể bị từ chối.",
          "Đơn thật không khớp quảng cáo (khách tự vào, không qua quảng cáo) là bình thường.",
          "Chưa chọn nguồn đơn là việc cần làm, không phải sự cố.",
        ],
      },
    ],
  },

  // ───────────── Chiến dịch & Creative ─────────────
  {
    id: "nhom-chien-dich-creative",
    label: "Chiến dịch & Creative",
    intro: "Xem chiến dịch đang chạy, và tạo / lưu / chấm điểm nội dung quảng cáo.",
    features: [
      {
        id: "campaigns",
        label: "Campaigns",
        href: "/campaigns",
        icon: Megaphone,
        color: "from-blue-500 to-blue-700",
        summary: "Bảng chiến dịch đầy đủ — chỉnh sửa, đồng bộ, export.",
        description:
          "Danh sách toàn bộ chiến dịch Facebook Ads và Google Ads. Xem nhanh trạng thái, ngân sách, chỉ số hiệu suất; nhấn vào tên chiến dịch để xem báo cáo chi tiết theo ngày.",
        when: "Cần xem hoặc sửa một chiến dịch cụ thể, hoặc xuất dữ liệu.",
      },
      {
        id: "ads-content",
        label: "Ads Content",
        href: "/campaigns/ads-content",
        icon: Images,
        color: "from-cyan-500 to-sky-600",
        summary: "Creative đang chạy theo từng chiến dịch trong tháng.",
        description: "Xem các creative (nội dung quảng cáo) đang chạy, gom theo từng chiến dịch trong tháng.",
        when: "Muốn biết chiến dịch nào đang chạy mẫu nào.",
      },
      {
        id: "creative",
        label: "Creative AI",
        href: "/creative",
        icon: Sparkles,
        color: "from-violet-500 to-purple-700",
        adminOnly: true,
        summary: "Tạo chiến dịch mới bằng AI — audience, ad copy, launch.",
        description:
          "Creative AI Studio: tạo chiến dịch mới với AI hỗ trợ audience và ad copy rồi launch. Có tab “Creative AI” và “AI Ad Copy” (headline và mô tả bằng AI); mục con “Creative Brief” để dựng brief.",
        when: "Lên chiến dịch hoặc mẫu quảng cáo mới.",
        tips: [
          "Nội dung AI viết ra chỉ là bản nháp: đọc lại, chỉnh, rồi mới launch.",
          "Dùng “Sổ kinh nghiệm” để biết nên dùng/tránh gì trước khi tạo.",
        ],
      },
      {
        id: "visual-analysis",
        label: "Creative Library",
        href: "/creative/analysis",
        icon: Eye,
        color: "from-cyan-500 to-teal-600",
        adminOnly: true,
        summary: "Thư viện creative đã lưu + chấm điểm nội dung chữ.",
        description:
          "Lưu và theo dõi các creative đã tạo (tab “Hiệu suất”), và chấm điểm nội dung chữ — headline/description — theo quy tắc cố định (tab “Chấm điểm”). Đây KHÔNG phải phân tích ảnh/video bằng AI.",
        when: "Muốn xem lại creative đã lưu hoặc chấm nhanh một đoạn nội dung trước khi chạy.",
        steps: [
          "Tab “Hiệu suất”: xem creative đã lưu và số liệu theo dõi.",
          "Tab “Chấm điểm”: dán headline/description cần đánh giá, xem điểm và gợi ý chỉnh.",
        ],
      },
    ],
  },

  // ───────────── Tối ưu & Tự động ─────────────
  {
    id: "nhom-toi-uu-tu-dong",
    label: "Tối ưu & Tự động",
    intro: "Gợi ý tối ưu, quy tắc tự động và các công cụ phân tích rời.",
    features: [
      {
        id: "improvements",
        label: "Improvements",
        href: "/improvements",
        icon: Lightbulb,
        color: "from-yellow-500 to-amber-600",
        adminOnly: true,
        badge: "Có badge số",
        summary: "Danh sách gợi ý tối ưu ưu tiên theo tác động, một số auto-apply được.",
        description:
          "Gom gợi ý tối ưu cho Facebook và Google vào một nơi, ưu tiên theo mức tác động. Badge đỏ trên menu là số gợi ý chưa xử lý.",
        when: "Khi rảnh tay rà các gợi ý đã tích luỹ; xử lý mục ưu tiên cao trước.",
      },
      {
        id: "automation",
        label: "Automation",
        href: "/automation",
        icon: Zap,
        color: "from-blue-500 to-indigo-700",
        adminOnly: true,
        summary: "Rule tự động Facebook + Google + tối ưu ngân sách theo lịch.",
        description:
          "Tạo quy tắc tự động và xem kết quả. Có 3 tab: “Automation” (các quy tắc), “Redistribution” (lịch sử phân bổ ngân sách tự động giữa các chiến dịch — cũng là mục con “Budget Redistribution” trong menu) và “History” (nhật ký thực thi).",
        when: "Muốn máy làm thay việc lặp lại như tạm dừng chiến dịch vượt ngưỡng.",
        steps: [
          "Ở tab “Automation”, bấm “Tạo quy tắc mới”.",
          "Chọn điều kiện và hành động, rồi lưu. Mỗi quy tắc có công tắc bật/tắt.",
          "Xem tab “History” để biết quy tắc đã làm gì.",
        ],
        warnings: ["Quy tắc tự động có thể ghi lên tài khoản thật. Kiểm tra kỹ điều kiện trước khi bật."],
      },
      {
        id: "toolkit",
        label: "Toolkit",
        href: "/toolkit",
        icon: Wrench,
        color: "from-slate-500 to-slate-700",
        adminOnly: true,
        summary: "Công cụ phân tích rời: Day-Parting, Quality Score, Phân khúc Bid.",
        description: "Ba công cụ phân tích rời, mỗi công cụ một trang trong menu Toolkit.",
        when: "Cần phân tích sâu một khía cạnh cụ thể của tài khoản Google.",
        visual: {
          title: "Công cụ đang mở trong menu",
          items: [
            { label: "Day-Parting", value: "Hiệu suất theo khung giờ và ngày trong tuần (30 ngày qua)", color: "text-violet-600" },
            { label: "🎯 Quality Score", value: "Điểm chất lượng theo từng từ khoá Google, xem từ khoá nào kéo điểm xuống", color: "text-amber-600" },
            { label: "📊 Phân khúc Bid", value: "Hiệu suất theo thiết bị, vị trí, lịch chạy — cơ sở để chỉnh bid", color: "text-blue-600" },
          ],
        },
      },
    ],
  },

  // ───────────── Báo cáo & chính sách ─────────────
  {
    id: "nhom-bao-cao-chinh-sach",
    label: "Báo cáo & chính sách",
    intro: "Theo dõi thay đổi chính sách của Google Ads và Meta.",
    features: [
      {
        id: "policy-radar",
        label: "Radar Chính Sách",
        href: "/policy-radar",
        icon: Radar,
        color: "from-sky-500 to-blue-700",
        summary: "Cập nhật chính sách Google Ads + Meta, chấm mức ảnh hưởng và việc cần làm.",
        description:
          "Theo dõi thay đổi mới từ Google Ads và Meta, kèm tác động thực tế đến chiến dịch. Google Ads được quét tự động vào Thứ 2 và Thứ 5; Meta vẫn phải nhập tay (người có quyền quản lý có nút “Thêm mục”).",
        when: "Hằng tuần, hoặc khi nghi một thay đổi chính sách làm chiến dịch bị từ chối/giảm.",
      },
    ],
  },

  // ───────────── Cài đặt ─────────────
  {
    id: "nhom-cai-dat",
    label: "Cài đặt",
    intro: "Kết nối, ngân sách, KPI, người dùng và các tác vụ nền.",
    features: [
      {
        id: "settings",
        label: "Settings",
        href: "/settings",
        icon: Settings,
        color: "from-slate-600 to-slate-800",
        summary: "Cấu hình tài khoản, ngân sách, KPI, nhóm, tracking, tác vụ nền.",
        description:
          "Cấu hình kết nối API và quản lý hệ thống. Menu con: Quản lý Users (chỉ Super Admin), Ngân sách, Scheduled Jobs (Super Admin), Sức khoẻ tool (Super Admin), KPI, Team (Super Admin), Tracking.",
        when: "Thiết lập ban đầu, đổi ngân sách/KPI, hoặc kiểm tra tác vụ nền.",
        steps: [
          "Kết nối Meta / Google / Teams: làm theo “Hướng dẫn kết nối” ở đầu trang này.",
          "Quản lý Users: thêm thành viên và phân quyền (chỉ Super Admin).",
          "Scheduled Jobs: xem, tạm dừng hoặc chạy tay các tác vụ nền; đổi link webhook Teams ở khối “Webhook Teams” (có hiệu lực ngay, không cần sửa code).",
        ],
        tips: [
          "Trong Scheduled Jobs có job “Tự kiểm truy vấn thật” (query_smoke), chạy mỗi sáng 05:45 (giờ VN). Nó chạy thử (chỉ đọc) các truy vấn Google Ads / Meta mà tính năng đang dùng; khi một lần đọc bị hỏng (lỗi MỚI) hoặc đã hết lỗi, nó báo Teams kênh IT.",
          "Job Health Monitor tự báo Teams nếu việc báo lead / đơn hàng mới bị im hoặc lỗi.",
        ],
        warnings: [
          "Meta Access Token hết hạn sau 60 ngày — cần gia hạn định kỳ.",
          "Chỉ Super Admin mới vào được Quản lý Users, Scheduled Jobs, Sức khoẻ tool và Team.",
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────
// Chi phí vận hành (AI)
//
// Token hiển thị ở đây là số ĐÃ ĐO THẬT (lib/gemini-usage.ts ghi lại ngay sau
// mỗi lần gọi Gemini thành công) — không phải ước lượng. Đơn giá do NGƯỜI
// DÙNG tự nhập (giá thật họ xem ở Google Cloud Console của chính họ); app chỉ
// nhân đơn giá đó với token đã đo, tuyệt đối không tự bịa mức giá.
// ─────────────────────────────────────────────

// Rút từ grep thật `callGemini|generateWithTools|streamGeminiChat` trên toàn
// bộ app (20 file, 2026-09-18) — không phải danh sách suy đoán.
const GEMINI_FEATURES = [
  "AdsBot (chat AI + các công cụ sinh nội dung của nó)",
  "Creative AI / AI Ad Copy",
  "Google Search → Quảng cáo RSA và “Sửa bằng AI…” của bản tách",
  "PMax Advisor & Diagnosis",
  "RSA Suggest (Toolkit → Quality Score)",
  "Radar Chính Sách (tóm tắt thay đổi chính sách)",
  "Improvements (một phần đề xuất)",
];
const FREE_FEATURES = [
  "Dashboard, Campaigns — đọc số liệu qua Meta/Google Ads API",
  "X-quang Search / PMax / Meta — chỉ đọc số liệu",
  "Sức khoẻ đo lường → Đơn thật — đọc đơn từ nguồn đơn đã chọn",
  "Toolkit: Day-Parting, Quality Score, Phân khúc Bid",
];

function fmtInt(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

interface CostData {
  settings: { inputPricePerMillion?: number; outputPricePerMillion?: number; currency?: "VND" | "USD" };
  usage: {
    firstRecordedAt: string | null;
    month: string;
    monthPromptTokens: number;
    monthCandidateTokens: number;
    monthCalls: number;
  };
  estimatedCost: number | null;
}

function AiCostSection() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [inputPrice, setInputPrice] = useState("");
  const [outputPrice, setOutputPrice] = useState("");
  const [currency, setCurrency] = useState<"VND" | "USD">("VND");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadCost = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/ai-cost");
      setData(res.ok ? await res.json() as CostData : null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCost(); }, [loadCost]);

  const startEdit = () => {
    setSaveError(null);
    setInputPrice(data?.settings.inputPricePerMillion !== undefined ? String(data.settings.inputPricePerMillion) : "");
    setOutputPrice(data?.settings.outputPricePerMillion !== undefined ? String(data.settings.outputPricePerMillion) : "");
    setCurrency(data?.settings.currency ?? "VND");
    setEditing(true);
  };

  const savePrice = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/settings/ai-cost", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputPricePerMillion: Number(inputPrice),
          outputPricePerMillion: Number(outputPrice),
          currency,
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && json.ok) { setEditing(false); await loadCost(); }
      else setSaveError(json.error ?? "Lỗi khi lưu");
    } catch { setSaveError("Network error"); }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }
  if (!data) return null;

  const { usage, estimatedCost, settings } = data;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-emerald-600" />
        <h2 className="text-sm font-bold text-slate-800">Chi phí vận hành (AI)</h2>
      </div>

      {!usage.firstRecordedAt ? (
        <p className="text-xs text-slate-500 leading-relaxed">
          Chưa có dữ liệu — hệ thống vừa bắt đầu đo token thật từ hôm nay. Trước đó app không lưu lại đã dùng
          bao nhiêu nên không tính ngược được chi phí các tháng cũ. Từ giờ số dưới đây luôn là số đã đo thật,
          không phải ước lượng.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase text-slate-400">Token tháng {usage.month}</p>
            <p className="text-lg font-bold text-slate-800 mt-1">
              {fmtInt(usage.monthPromptTokens + usage.monthCandidateTokens)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">{fmtInt(usage.monthCalls)} lượt gọi AI — đo thật</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase text-slate-400">Token vào / ra</p>
            <p className="text-sm font-semibold text-slate-700 mt-1">
              {fmtInt(usage.monthPromptTokens)} / {fmtInt(usage.monthCandidateTokens)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">input / output</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase text-slate-400">Ước tính chi phí tháng này</p>
            <p className="text-lg font-bold text-emerald-700 mt-1">
              {estimatedCost !== null ? `${fmtInt(estimatedCost)} ${settings.currency ?? "VND"}` : "—"}
            </p>
            {estimatedCost === null && <p className="text-[10px] text-amber-600 mt-0.5">chưa nhập đơn giá</p>}
          </div>
        </div>
      )}

      {editing ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700">Đơn giá Gemini — lấy đúng số bạn xem ở Google Cloud Console</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">
              Input — giá / 1 triệu token
              <input type="number" min="0" step="0.01" value={inputPrice} onChange={(e) => setInputPrice(e.target.value)}
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </label>
            <label className="text-xs text-slate-500">
              Output — giá / 1 triệu token
              <input type="number" min="0" step="0.01" value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)}
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <select value={currency} onChange={(e) => setCurrency(e.target.value === "USD" ? "USD" : "VND")}
              className="rounded border border-slate-200 px-2 py-1.5 text-xs">
              <option value="VND">VND</option>
              <option value="USD">USD</option>
            </select>
            <button onClick={savePrice} disabled={saving || !inputPrice || !outputPrice}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />} Lưu đơn giá
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600">Huỷ</button>
          </div>
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
        </div>
      ) : (
        <button onClick={startEdit} className="text-xs font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2">
          {settings.inputPricePerMillion !== undefined ? "Sửa đơn giá" : "Nhập đơn giá để tính ra tiền"}
        </button>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-emerald-100">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Tính năng dùng AI (tốn phí)</p>
          <ul className="space-y-1">
            {GEMINI_FEATURES.map((f) => (
              <li key={f} className="text-xs text-slate-600 flex gap-1.5">
                <span className="text-amber-500 shrink-0">•</span>{f}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Miễn phí (không tốn phí AI)</p>
          <ul className="space-y-1">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="text-xs text-slate-600 flex gap-1.5">
                <span className="text-emerald-500 shrink-0">•</span>{f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 leading-relaxed">
        Chi phí server/hosting không tính ở đây — máy chủ chạy chung nhiều dự án khác, không tách riêng được phần
        của tool này. Gemini là chi phí biến động duy nhất gắn trực tiếp với việc dùng tool — Meta Ads API,
        Google Ads API và Odoo Report API đều miễn phí gọi.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Role permissions table
// ─────────────────────────────────────────────

const ROLES = [
  {
    role: "Super Admin",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    access: "Toàn quyền: xem, chỉnh sửa, quản lý users, cấu hình API",
  },
  {
    role: "Admin MBC",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    access: "Xem và chỉnh sửa dữ liệu MBC. Không quản lý được users",
  },
  {
    role: "Admin MBI",
    color: "bg-violet-100 text-violet-800 border-violet-200",
    access: "Xem và chỉnh sửa dữ liệu MBI. Không quản lý được users",
  },
  {
    role: "Viewer MBC",
    color: "bg-slate-100 text-slate-700 border-slate-200",
    access: "Chỉ xem dữ liệu MBC. Không thể thay đổi cài đặt",
  },
  {
    role: "Viewer MBI",
    color: "bg-slate-100 text-slate-700 border-slate-200",
    access: "Chỉ xem dữ liệu MBI. Không thể thay đổi cài đặt",
  },
];

// ─────────────────────────────────────────────
// Feature Card
// ─────────────────────────────────────────────

function FeatureCard({ feature }: { feature: Feature }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(
      "rounded-2xl border transition-all duration-200",
      open ? "border-slate-300 shadow-md" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
    )}>
      {/* Header — always visible */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-4 p-5 text-left"
      >
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow", feature.color)}>
          <feature.icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-900">{feature.label}</h3>
            {feature.badge && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                {feature.badge}
              </span>
            )}
            {feature.adminOnly && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                Chỉ Admin
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{feature.summary}</p>
        </div>
        <div className="shrink-0 text-slate-400">
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-slate-100 px-5 pb-6 pt-4 space-y-4">
          {/* Dùng để làm gì */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Dùng để làm gì</p>
            <p className="text-sm text-slate-600 leading-relaxed">{feature.description}</p>
          </div>

          {/* Khi nào dùng */}
          {feature.when && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Khi nào dùng</p>
              <p className="text-sm text-slate-600 leading-relaxed">{feature.when}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Visual breakdown */}
            {feature.visual && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                  {feature.visual.title}
                </p>
                <ul className="space-y-2">
                  {feature.visual.items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-xs">
                      <ArrowRight size={12} className={cn("mt-0.5 shrink-0", item.color ?? "text-slate-400")} />
                      <span>
                        <strong className="text-slate-700">{item.label}:</strong>{" "}
                        <span className="text-slate-500">{item.value}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Steps */}
            {feature.steps && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-3">
                  Các bước chính
                </p>
                <ol className="space-y-2">
                  {feature.steps.map((step, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-600">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Tips */}
          {feature.tips && (
            <div className="space-y-1.5">
              {feature.tips.map((tip, i) => (
                <div key={i} className="flex gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-700">
                  <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-emerald-500" />
                  {tip}
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {feature.warnings && (
            <div className="space-y-1.5">
              {feature.warnings.map((w, i) => (
                <div key={i} className="flex gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
                  <AlertCircle size={13} className="shrink-0 mt-0.5 text-amber-500" />
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* Link to feature */}
          <div className="pt-1">
            <a
              href={feature.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              Mở tính năng <ArrowRight size={12} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

// Tính năng thực sự hiện ra = bỏ mục trỏ tới trang đang tạm ẩn (lib/hidden-pages.ts)
// — cùng một nguồn với menu, để trang Hướng dẫn không đi giới thiệu một trang
// không vào được. Nhóm nào rỗng sau khi lọc thì bỏ luôn.
const VISIBLE_GROUPS: FeatureGroup[] = GROUPS
  .map((g) => ({ ...g, features: g.features.filter((f) => !isHiddenPage(f.href)) }))
  .filter((g) => g.features.length > 0);
const VISIBLE_FEATURES = VISIBLE_GROUPS.flatMap((g) => g.features);

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function GuidePage() {
  const [search, setSearch] = useState("");

  const q = search.toLowerCase();
  const matches = (f: Feature) =>
    q === "" ||
    f.label.toLowerCase().includes(q) ||
    f.summary.toLowerCase().includes(q) ||
    f.description.toLowerCase().includes(q) ||
    (f.when ?? "").toLowerCase().includes(q);
  const filteredGroups = VISIBLE_GROUPS
    .map((g) => ({ ...g, features: g.features.filter(matches) }))
    .filter((g) => g.features.length > 0);
  const filteredCount = filteredGroups.reduce((n, g) => n + g.features.length, 0);

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* ── Header ── */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-8 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
            <BookOpen className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Hướng dẫn sử dụng</h1>
            <p className="text-sm text-white/60">AdsCommand — Phiên bản 2026</p>
          </div>
        </div>
        <p className="text-sm text-white/70 leading-relaxed max-w-2xl">
          Các tính năng được xếp theo đúng thứ tự menu bên trái. Nhấn vào từng tính năng để xem dùng để làm gì, khi nào dùng, các bước chính và lưu ý quan trọng. Mọi thao tác ghi lên tài khoản quảng cáo đều phải “Kiểm trước (không ghi)” rồi gõ “XAC NHAN”.
        </p>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-3 gap-3 max-w-sm">
          {[
            { label: "Tính năng", value: String(VISIBLE_FEATURES.length) },
            { label: "Nền tảng", value: "Meta + Google" },
            { label: "AI Model", value: "Gemini" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-white/10 px-3 py-2">
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-[10px] text-white/50 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Hướng dẫn kết nối ── */}
      <a
        href="/guide/ket-noi"
        className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-5 hover:border-amber-300 hover:bg-amber-50 transition-colors"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow">
          <BookOpen size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-900">Hướng dẫn kết nối (Meta, Trang Facebook, GTM, Google Ads, Teams)</h3>
          <p className="text-xs text-slate-500 mt-0.5">Từng bước lấy token/khoá và dán đúng ô trong Cài đặt — kèm lỗi thường gặp và cách xử lý.</p>
        </div>
        <ArrowRight size={16} className="shrink-0 text-amber-600" />
      </a>

      <AiCostSection />

      {/* ── Search ── */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Tìm kiếm tính năng..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent shadow-sm"
        />
      </div>

      {/* ── Mục lục theo nhóm menu ── */}
      {search === "" && (
        <nav aria-label="Mục lục" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            Mục lục — theo đúng thứ tự menu
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            {VISIBLE_GROUPS.map((g) => (
              <div key={g.id}>
                <a
                  href={`#${g.id}`}
                  onClick={(e) => { e.preventDefault(); scrollToId(g.id); }}
                  className="text-sm font-bold text-slate-800 hover:text-amber-700"
                >
                  {g.label}
                </a>
                <ul className="mt-1.5 space-y-1">
                  {g.features.map((f) => (
                    <li key={f.id}>
                      <a
                        href={`#${f.id}`}
                        onClick={(e) => { e.preventDefault(); scrollToId(f.id); }}
                        className="group flex gap-1.5 text-xs leading-snug"
                      >
                        <f.icon size={12} className="mt-0.5 shrink-0 text-slate-400 group-hover:text-amber-600" />
                        <span>
                          <span className="font-semibold text-slate-700 group-hover:text-amber-700">{f.label}</span>
                          <span className="text-slate-500"> — {f.summary}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      )}

      {/* ── Danh sách theo nhóm ── */}
      <div className="space-y-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          {filteredCount} tính năng {search ? `khớp với "${search}"` : ""}
        </p>
        {filteredGroups.map((g) => (
          <section key={g.id} id={g.id} className="space-y-3 scroll-mt-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">{g.label}</h2>
              <p className="text-xs text-slate-500">{g.intro}</p>
            </div>
            {g.features.map((f) => (
              <div key={f.id} id={f.id} className="scroll-mt-4">
                <FeatureCard feature={f} />
              </div>
            ))}
          </section>
        ))}
        {filteredCount === 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-10 text-center">
            <Info className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Không tìm thấy tính năng nào khớp</p>
          </div>
        )}
      </div>

      {/* ── Roles & Permissions ── */}
      {search === "" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Phân quyền theo Role
          </h2>
          <div className="space-y-2">
            {ROLES.map((r) => (
              <div key={r.role} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3">
                <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold shrink-0", r.color)}>
                  {r.role}
                </span>
                <p className="text-xs text-slate-500 leading-relaxed">{r.access}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick Tips ── */}
      {search === "" && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
          <h2 className="text-sm font-bold text-blue-800 mb-4 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-blue-500" />
            Mẹo sử dụng nhanh
          </h2>
          <ul className="space-y-2.5">
            {[
              "Sidebar thu gọn trên tablet — hover vào icon để xem tên tính năng",
              "Rê chuột vào một mục trong menu để xem mô tả ngắn mục đó dùng cho việc gì",
              "Badge số đỏ trên Improvements = số gợi ý AI chưa được xử lý",
              "Mọi lệnh ghi lên Google/Meta: “Kiểm trước (không ghi)” → gõ “XAC NHAN” → ghi thật → có thể Hoàn tác",
              "Google Search, PMax, Meta X-quang chọn công ty MBC hoặc MBI trước khi đọc số",
              "Meta Access Token hết hạn sau 60 ngày — vào Settings để gia hạn",
            ].map((tip, i) => (
              <li key={i} className="flex gap-2 text-xs text-blue-700">
                <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-blue-400" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
