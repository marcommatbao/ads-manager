"use client";

import Link from "next/link";
import { isHiddenPage } from "@/lib/hidden-pages";
import { Wrench, Search, Clock, TrendingUp, Star, ArrowRight, Users2, Layers, Gauge, Link2Off } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const tools = [
  {
    href: "/toolkit/ngram",
    icon: Search,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "N-Gram Finder",
    description: "Phân tích cụm từ khoá phổ biến trong search terms để tối ưu danh sách từ khoá và loại trừ.",
    badge: "Phân tích",
    badgeColor: "bg-blue-50 text-blue-600",
  },
  {
    href: "/toolkit/budget-pacing",
    icon: TrendingUp,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    title: "Budget Pacing",
    description: "Theo dõi tốc độ tiêu thụ ngân sách so với mục tiêu theo ngày và tháng cho từng chiến dịch.",
    badge: "Ngân sách",
    badgeColor: "bg-emerald-50 text-emerald-600",
  },
  {
    href: "/toolkit/ad-group-structure",
    icon: Layers,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "Cấu trúc nhóm quảng cáo",
    description: "Chỉ ra ad group đang ôm quá nhiều từ khoá — nguyên nhân Ad Relevance tụt và CPC tăng — kèm đề xuất tách theo ý định.",
    badge: "Cấu trúc",
    badgeColor: "bg-blue-50 text-blue-600",
  },
  {
    href: "/toolkit/dayparting",
    icon: Clock,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    title: "Day-Parting Analysis",
    description: "Trực quan hoá hiệu suất quảng cáo theo từng khung giờ và ngày trong tuần để điều chỉnh bid.",
    badge: "Lịch chạy",
    badgeColor: "bg-violet-50 text-violet-600",
  },
  {
    href: "/toolkit/manual-bid",
    icon: Gauge,
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-600",
    title: "Giá thầu thủ công",
    description: "Từ dữ liệu đã chạy, tính mức giá thầu hợp lý cho từng từ khoá: trần chi trả theo mục tiêu CPA đối chiếu với ước tính của Google, kèm nút áp dụng có duyệt.",
    badge: "Giá thầu",
    badgeColor: "bg-indigo-50 text-indigo-600",
  },
  {
    href: "/toolkit/landing-page-sweep",
    icon: Link2Off,
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    title: "Quét trang đích chết",
    description: "Mở thử trang đích của mọi quảng cáo Google đang chạy, tìm trang trả lỗi. 91% quảng cáo bị từ chối là do trang đích chết.",
    badge: "Chẩn đoán",
    badgeColor: "bg-red-50 text-red-600",
  },
  {
    href: "/toolkit/quality-score",
    icon: Star,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    title: "Quality Score Tracker",
    description: "Theo dõi điểm chất lượng của từng từ khoá và nhận gợi ý cải thiện Landing Page, Ad Relevance.",
    badge: "Chất lượng",
    badgeColor: "bg-amber-50 text-amber-600",
  },
  {
    href: "/toolkit/audience-overlap",
    icon: Users2,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    title: "Audience Overlap",
    description: "Phát hiện ad set đang chạy có targeting trùng lặp cao — nguyên nhân tự cạnh tranh, lãng phí ngân sách.",
    badge: "Targeting",
    badgeColor: "bg-violet-50 text-violet-600",
  },
];

export default function ToolkitPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
          <Wrench className="h-5 w-5 text-slate-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Google Ads Toolkit</h1>
          <p className="text-sm text-slate-500">Bộ công cụ phân tích và tối ưu hoá chiến dịch Google Ads</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tools.filter(t => !isHiddenPage(t.href)).map((tool) => {
          const Icon = tool.icon;
          return (
            <Link key={tool.href} href={tool.href} className="group block">
              <Card className="h-full border border-slate-200 bg-white shadow-sm rounded-xl transition-shadow duration-200 hover:shadow-md hover:border-slate-300">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tool.iconBg}`}>
                      <Icon className={`h-5 w-5 ${tool.iconColor}`} />
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tool.badgeColor}`}>
                      {tool.badge}
                    </span>
                  </div>
                  <CardTitle className="mt-3 text-base font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                    {tool.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-end justify-between gap-4">
                  <CardDescription className="text-sm text-slate-500 leading-relaxed">
                    {tool.description}
                  </CardDescription>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
