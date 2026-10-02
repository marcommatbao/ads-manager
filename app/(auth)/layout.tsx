// Auth layout — no sidebar/header (login/register pages)
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
