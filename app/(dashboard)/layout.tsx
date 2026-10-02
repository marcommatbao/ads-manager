// Dashboard route group — includes AppShell (Sidebar + Header)
import AppShell from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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
  return (
    <AppShell>
      <ErrorBoundary>{children}</ErrorBoundary>
    </AppShell>
  );
}
