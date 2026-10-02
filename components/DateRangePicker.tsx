"use client";

import * as React from "react";
import { format, subDays, startOfMonth, subMonths, endOfMonth } from "date-fns";
import { vi } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { useAdsStore } from "@/store/useAdsStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const PRESETS = [
  { label: "Hôm nay", getValue: () => ({ from: new Date(), to: new Date() }) },
  { label: "7 ngày qua", getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: "30 ngày qua", getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: "Tháng này", getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: "Tháng trước", getValue: () => {
      const prevMonth = subMonths(new Date(), 1);
      return { from: startOfMonth(prevMonth), to: endOfMonth(prevMonth) };
    } 
  },
];

export function DateRangePicker({ className }: { className?: string }) {
  const { dateRange, setDateRange } = useAdsStore();
  const [open, setOpen] = React.useState(false);
  const [tempRange, setTempRange] = React.useState<DateRange | undefined>(() => {
    return {
      from: new Date(dateRange.from),
      to: new Date(dateRange.to),
    };
  });

  React.useEffect(() => {
    setTempRange({
      from: new Date(dateRange.from),
      to: new Date(dateRange.to),
    });
  }, [dateRange]);

  const handleApply = () => {
    if (tempRange?.from && tempRange?.to) {
      const formattedFrom = format(tempRange.from, "yyyy-MM-dd");
      const formattedTo = format(tempRange.to, "yyyy-MM-dd");
      
      setDateRange({ from: formattedFrom, to: formattedTo });

      // Cập nhật URL parameters
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("from", formattedFrom);
        url.searchParams.set("to", formattedTo);
        window.history.replaceState(null, "", url.toString());
      }
      setOpen(false);
    }
  };

  const formattedDate = tempRange?.from && tempRange?.to 
    ? `${format(tempRange.from, "dd/MM/yyyy")} → ${format(tempRange.to, "dd/MM/yyyy")}`
    : "Chọn ngày...";

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              "justify-between text-left font-normal rounded-lg px-4 py-2 text-sm border-slate-200 bg-white min-w-[240px]",
              !tempRange && "text-muted-foreground",
              "focus:ring-2 focus:ring-amber-100"
            )}
          >
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-amber-600" />
              <span className={cn(tempRange ? "text-slate-800 font-medium" : "text-slate-500")}>
                {formattedDate}
              </span>
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="flex bg-white rounded-lg shadow-lg overflow-hidden border border-slate-200">
            {/* Presets Sidebar */}
            <div className="flex flex-col gap-1 border-r border-slate-100 p-3 min-w-[150px] bg-slate-50/50">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  className="text-left text-sm px-3 py-2 rounded-md transition-colors hover:bg-slate-200/50 text-slate-700 font-medium"
                  onClick={() => setTempRange(preset.getValue())}
                >
                  {preset.label}
                </button>
              ))}
              <div className="mt-auto pt-4 flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="w-full">
                  Huỷ
                </Button>
                <Button size="sm" className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950" onClick={handleApply}>
                  Áp dụng
                </Button>
              </div>
            </div>

            {/* Calendar */}
            <div className="p-3">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={tempRange?.from}
                selected={tempRange}
                onSelect={setTempRange}
                numberOfMonths={2}
                locale={vi}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
