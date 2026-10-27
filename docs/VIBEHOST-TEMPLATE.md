# AdsCommand — thông số để dựng template Vibe Host

Gửi đội dev Vibe Host kèm link mã nguồn: **https://github.com/marcommatbao/ads-manager** (nhánh `main`).
Chi tiết vận hành ở `docs/VIBEHOST-CHECKLIST.md`. Tờ này chỉ ghi phần template cần cấu hình sẵn.

## 1. Build và chạy

| Mục | Giá trị |
|---|---|
| Cách build | `Dockerfile` ở gốc repo (Node 22, Next.js standalone). Build **không cần biến môi trường**. |
| Cổng | `3000` (`PORT=3000`) |
| Khởi động | `/app/docker-entrypoint.sh`: chạy cron nội bộ, rồi server. Không cần cron ngoài. |
| Tài nguyên | **2 CPU, 3 GB RAM** trở lên. `next build` cần nhiều RAM. |
| **Thư mục lưu bền** | **`/app/data`** — bắt buộc khai báo. Thiếu là mỗi lần deploy mất sạch người dùng, khoá, cài đặt. |
| Kiểm sức khoẻ | `GET /api/health` → 200 |
| Một tiến trình | Chạy **1 bản sao**: khoá file và giới hạn tần suất đều ở trong tiến trình. |

## 2. Biến môi trường

**Template tự sinh** mỗi bản cài, khách không thấy:

| Biến | Cách sinh |
|---|---|
| `AUTH_SECRET` | `openssl rand -hex 32` |
| `DATA_ENCRYPTION_KEY` | `openssl rand -base64 32`: **đúng 32 byte base64**, sai dạng thì app không khởi động |
| `CRON_SECRET` | `openssl rand -hex 24` |
| `APP_URL`, `NEXTAUTH_URL` | địa chỉ công khai của bản cài, ví dụ `https://<tên>.vibe.tinhgon.xyz` hoặc tên miền riêng |
| `SETUP_WIZARD` | `on`: bật trình thiết lập lần đầu cho khách |
| `MB_CONNECT_URL` | `https://connect.marcom-matbao.io.vn`: cổng kết nối Google/Meta của Mắt Bão |

**Khách nhập** khi tạo bản cài:

| Biến | Ghi chú |
|---|---|
| `BOOTSTRAP_ADMIN_EMAIL` | email quản trị đầu tiên |
| `BOOTSTRAP_ADMIN_PASSWORD` | ≥ 12 ký tự. Tool bắt đổi ở lần đăng nhập đầu. |
| `DEFAULT_LOCALE` | tuỳ chọn: `vi` (mặc định) hoặc `en` |

**Mắt Bão cấp** (hiện thủ công, sẽ tự động khi xong task #7117 "bản cài tự đăng ký"):

| Biến | Ghi chú |
|---|---|
| `MB_CONNECT_INSTALL_KEY` | khoá bản cài do cổng sinh cho đúng địa chỉ `APP_URL`. Đánh dấu **bí mật**. |

**Không đặt** ở template: `GOOGLE_ADS_*`, `META_*`. Khách kết nối bằng nút **Kết nối Google Ads / Kết nối Facebook** qua cổng, không dán khoá.

## 3. Sau khi tạo bản cài

1. Mở `APP_URL`, đăng nhập bằng email/mật khẩu quản trị, rồi đổi mật khẩu.
2. Trình thiết lập:
   - bước 1: khai công ty, mã ngắn kiểu `ABC`;
   - bước 2: **Kết nối Google Ads** và **Kết nối Facebook**;
   - bước 3–6: tự kiểm, thêm người dùng, hoàn tất.
3. Tuỳ chọn: **Cài đặt → Claude** để tạo khoá MCP, nối Claude Code/Desktop (`docs/MCP-CLAUDE.md`). Bản khách **mặc định tắt quyền ghi của Claude**, quản trị của khách tự bật.

## 4. Điều kiện phía Mắt Bão trước khi mở cho khách ngoài

- App Google "Mắt Bão Marcom" **đã được Google xác minh**. Trước đó phải thêm email khách vào Test users, và kết nối hết hạn sau 7 ngày.
- App Meta **qua App Review + bật Live**. Trước đó khách phải được thêm làm Tester của app.
- Developer token Google Ads ở mức **Basic access**. Mức Explorer giới hạn lượt gọi dùng chung cho mọi khách.

## 5. Khôi phục khi quên mật khẩu quản trị

Đặt `ADMIN_RECOVERY_EMAIL` + `ADMIN_RECOVERY_PASSWORD` (≥ 12 ký tự) rồi khởi động lại. Tool đặt lại một lần và bắt đổi mật khẩu. Sau đó xoá hai biến này.
