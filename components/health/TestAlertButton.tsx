"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { postJson, ApiError } from "@/components/case/api";
import type { TestAlertResponse } from "./types";

export function TestAlertButton() {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const json = (await postJson("/api/system/health", { action: "test_alert" })) as TestAlertResponse;
      setResult({ ok: true, msg: `Đã gửi qua ${json.channel ?? "kênh cảnh báo"} — kiểm Teams.` });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof ApiError ? e.message : "Không gửi được — thử lại sau." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-800">Gửi thử cảnh báo</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Gửi một thẻ thử tới kênh cảnh báo hệ thống — dùng để xác nhận Teams còn nhận được thông báo.
          </p>
        </div>
        <Button size="sm" onClick={send} disabled={sending}
          className="gap-1.5 text-xs shrink-0 bg-amber-600 text-white hover:bg-amber-700">
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Gửi thử cảnh báo
        </Button>
      </div>
      {result && (
        <p className={cn("text-xs font-medium", result.ok ? "text-emerald-600" : "text-red-600")}>
          {result.msg}
        </p>
      )}
    </div>
  );
}
