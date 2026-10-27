# Dùng Claude với AdsCommand (MCP)

AdsCommand có sẵn một **MCP server**. Nối Claude vào là hỏi được bằng lời trên **số thật** của bạn. Nếu khoá có quyền Ghi, Claude còn **chỉnh sửa, tối ưu và lên chiến dịch** được, nhưng luôn chạy thử và hỏi bạn trước.

## 1. Tạo khoá

1. Mở AdsCommand → **Cài đặt → Claude** (Kết nối Claude).
2. Đặt tên khoá (ví dụ "Laptop của tôi"), rồi chọn mức:
   - **Chỉ đọc**: Claude xem số liệu, phân tích, đề xuất.
   - **Đọc + Ghi (có hạn mức)**: Claude được chỉnh sửa sau khi bạn đồng ý trong khung chat. Chỉ người có quyền sửa mới tạo được khoá mức này.
3. Bấm **Tạo khoá**, rồi **sao chép ngay**. Khoá chỉ hiện một lần.

Khoá mang **đúng quyền của bạn**. Ví dụ Viewer MBI chỉ thấy MBI. Mất khoá thì vào cùng trang bấm **Thu hồi**.

## 2. Nối Claude

**Claude Code** (terminal):

```bash
claude mcp add --transport http adscommand https://<địa-chỉ-adscommand>/api/mcp \
  --header "Authorization: Bearer mcpk_…"
```

**Claude Desktop** (cần Node.js): thêm vào `claude_desktop_config.json` rồi khởi động lại Claude Desktop.

```json
{
  "mcpServers": {
    "adscommand": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<địa-chỉ-adscommand>/api/mcp", "--header", "Authorization: Bearer mcpk_…"]
    }
  }
}
```

Trang Cài đặt hiện sẵn hai đoạn trên, có điền đúng địa chỉ và khoá. Bạn chỉ cần sao chép.

Nối từ **claude.ai** (mục Connectors) cần đăng nhập OAuth. Phần này để giai đoạn sau.

## 3. Hỏi gì

- "Tuần này chiến dịch Meta nào vượt chi phí/đơn mục tiêu? Vì sao? Nên làm gì trước?"
- "Ở Search MBC, cụm tìm kiếm nào tốn tiền mà không ra đơn trong 30 ngày qua? Soạn danh sách từ khoá phủ định."
- "PMax đang tiêu bao nhiêu vào YouTube so với Search?"
- "Mẫu quảng cáo Meta nào thật sự ra đơn (khớp đơn thật), mẫu nào nên tắt?"
- "Thay đổi nào tháng trước thật sự làm giảm chi phí/đơn?"
- Với khoá Ghi:
  - "Giảm 20% ngân sách chiến dịch X."
  - "Tạm dừng nhóm quảng cáo Y."
  - "Lên chiến dịch Meta khách tiềm năng cho tên miền .vn, ngân sách 300.000 ₫/ngày, nhắm HCM 25–45 tuổi, dùng bài đăng mới nhất của Trang."

## 4. Claude ghi thế nào (an toàn)

1. Claude gọi công cụ **propose_…**: AdsCommand **chạy thử thật** trên Google/Meta, không thay đổi gì, rồi trả bảng **trước → sau**, ảnh hưởng chi tiêu và cách hoàn tác.
2. Claude **hỏi bạn trong chat**. Claude Code/Desktop cũng tự hiện hộp xin phép cho lệnh ghi.
3. Bạn đồng ý thì Claude gọi **apply_change** kèm `XAC NHAN`. AdsCommand chỉ ghi **đúng nội dung đã chạy thử**, và từ chối nếu có ai sửa trong lúc chờ.

**Giới hạn cứng, không tắt được:**
- Đổi ngân sách **tối đa ±30% mỗi lần**, mỗi chiến dịch hoặc nhóm quảng cáo **1 lần/24 giờ**.
- Chiến dịch **mới luôn tạo ở trạng thái TẠM DỪNG**: bạn tự bật trong AdsCommand hoặc Ads Manager. Tổng ngân sách/ngày phải ≤ trần đặt ở Cài đặt (mặc định 500.000 ₫).
- Tối đa **20 lần ghi/ngày cho mỗi khoá**. Super Admin chỉnh được con số này.
- Super Admin có **công tắc tổng** "Cho phép Claude ghi". Tắt là mọi lệnh ghi bị từ chối.
- Đề xuất hết hạn sau 15 phút, mỗi đề xuất chỉ dùng được một lần.

**Mọi thay đổi do Claude làm:**
- hiện ở **Đã làm & kết quả** với nguồn "<email> qua Claude (MCP)", và được **đo lại sau 7 và 14 ngày**;
- **hoàn tác được**: nói "hoàn tác thay đổi …" với Claude, hoặc bấm trong trang Đã làm & kết quả. Chiến dịch mới do Claude tạo thì xoá được khi còn tạm dừng.

## 5. Danh sách công cụ

| Đọc | Ghi (đề xuất → apply_change) |
|---|---|
| `list_companies`, `get_campaign_performance`, `get_campaigns_over_target`, `get_today_inbox`, `list_cases`, `get_case`, `google_search_xray`, `google_pmax_xray`, `meta_xray`, `meta_creative_truth`, `get_change_history`, `get_playbook`, `meta_launch_assets`, `meta_page_posts` | `propose_campaign_status`, `propose_budget_change`, `propose_negative_keywords`, `propose_case_actions`, `propose_new_meta_campaign`, `propose_undo`, `apply_change` |

## 6. Vận hành

- Nhật ký mọi lần gọi nằm ở `data/audit/mcp.json`, gồm người, công cụ, tham số, kết quả. Nội dung trả về không được ghi.
- Khoá chỉ lưu dạng băm ở `data/mcp-keys.json`, đề xuất ở `data/mcp-proposals.json`.
- Giới hạn 60 lượt/phút cho mỗi khoá. Khoảng ngày tối đa 90 ngày.
- Bản cài khách (chế độ cổng) **mặc định tắt ghi**. Super Admin của khách bật ở Cài đặt.
