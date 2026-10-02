// ─────────────────────────────────────────────
// EmptyState — shown when list/data is empty
// ─────────────────────────────────────────────
import { type LucideIcon, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon = Inbox,
  title = "Không có dữ liệu",
  description = "Chưa có nội dung nào để hiển thị.",
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-center",
        compact ? "py-8 px-4" : "py-16 px-6",
        className
      )}
    >
      <div className={cn(
        "flex items-center justify-center rounded-full bg-slate-50 mb-4",
        compact ? "h-10 w-10" : "h-16 w-16"
      )}>
        <Icon className={cn("text-slate-300", compact ? "h-5 w-5" : "h-8 w-8")} />
      </div>
      <p className={cn("font-semibold text-slate-700", compact ? "text-sm" : "text-base")}>
        {title}
      </p>
      {description && (
        <p className={cn("text-slate-400 mt-1", compact ? "text-xs" : "text-sm max-w-xs")}>
          {description}
        </p>
      )}
      {action && (
        <div className="mt-4">{action}</div>
      )}
    </div>
  );
}
