// Dashboard route group — includes AppShell (Sidebar + Header)
import AppShell from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { companiesConfig } from "@/lib/companies";
import { DEFAULT_COMPANIES } from "@/lib/companies/defaults";
import { publicIdsFromEnv } from "@/lib/companies/public-ids";

/**
 * Đợt 21 A3b — nạp cấu hình công ty của BẢN CÀI vào trình duyệt TRƯỚC khi React chạy.
 * Trước đây trình duyệt bắt đầu bằng mặc định Mắt Bão (MBC/MBI) rồi mới tải /api/companies → ở bản khách lần vẽ đầu
 * lệch với máy chủ (React #418) và trang kịp gọi API cho "MBC" (400/403; bản nháp Creative tự lưu dưới MBC).
 * Bản Mắt Bão: cấu hình = mặc định → KHÔNG chèn gì, HTML y nguyên. `<` thoát thành \u003c (nhãn công ty do người dùng nhập).
 */
function companiesBootScript(): string | null {
  const cfg = companiesConfig();
  if (JSON.stringify(cfg) === JSON.stringify(DEFAULT_COMPANIES)) return null;
  // Kèm mã công khai (pixel / trang / GA4) — trước đây chỉ có sau khi CompaniesBoot tải xong, mà CompaniesBoot nay KHÔNG vẽ lại
  // khi cấu hình đã khớp → ô chọn Trang / Pixel ở Creative sẽ rỗng mãi.
  const esc = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
  return `window.__adsCompanies=${esc({ current: cfg, refresh: null })};window.__adsPublicIds=${esc(publicIdsFromEnv())};`;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ErrorBoundary đã viết xong từ lâu nhưng KHÔNG bọc component nào (kiểm
  // 16/09/2026) — nên một lỗi render bất kỳ ở trang con là người dùng nhận
  // TRANG TRẮNG, trong khi màn hình "Đã xảy ra lỗi / Thử lại" đã nằm sẵn trong
  // repo. Bọc quanh phần nội dung, KHÔNG bọc cả AppShell: hỏng nội dung thì
  // menu trái vẫn còn để đi sang trang khác.
  const boot = companiesBootScript();
  return (
    <>
      {boot && <script dangerouslySetInnerHTML={{ __html: boot }} />}
      <AppShell>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AppShell>
    </>
  );
}
