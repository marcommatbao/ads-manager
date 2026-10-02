"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Shield,
  Wallet,
  DollarSign,
  Bell,
  Users,
  Activity,
  UserCog,
  Target,
  Timer,
  Bot,
  LineChart,
  HeartPulse,
} from "lucide-react";

const tabs = [
  { label: "API Keys",       href: "/settings",               icon: Shield },
  { label: "Ngân sách",      href: "/settings/budget",        icon: Wallet },
  { label: "Doanh Thu",      href: "/settings/revenue",       icon: DollarSign },
  { label: "KPI",            href: "/settings/kpi",           icon: Target },
  { label: "Chi phí kênh khác", href: "/settings/manual-spend", icon: Wallet },
  { label: "Thông báo",      href: "/settings/notifications", icon: Bell },
  { label: "Team",           href: "/settings/team",          icon: Users },
  { label: "Quản lý Users",  href: "/settings/users",         icon: UserCog },
  { label: "Tracking",       href: "/settings/tracking",      icon: Activity },
  { label: "Cron Jobs",      href: "/settings/jobs",          icon: Timer },
  { label: "Sức khoẻ tool",  href: "/settings/health",        icon: HeartPulse },
  { label: "Auto-Apply",     href: "/settings/automation",    icon: Bot },
  { label: "GA4",            href: "/settings/ga4",           icon: LineChart },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure your API connections and preferences.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm overflow-x-auto">
        {tabs.map(({ label, href, icon: Icon }) => {
          const isActive =
            href === "/settings"
              ? pathname === "/settings"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-amber-500 text-amber-950 shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>

      {/* Page Content */}
      {children}
    </div>
  );
}
