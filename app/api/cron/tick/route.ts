// Cron — nhịp điều phối mỗi phút: gọi các job "auto" trong registry chưa có dòng crontab riêng (xem lib/jobs/tick.ts).
// Không chờ job chạy xong (có job vài phút) — mỗi job tự có chốt chống chạy chồng + lịch sử ở trang Jobs.
import { NextRequest, NextResponse } from "next/server"
import { checkCronAuth } from "@/lib/cron-auth"
import { dueJobs } from "@/lib/jobs/tick"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = checkCronAuth(request, "cron/tick")
  if (!auth.ok) return auth.response
  const now = new Date()
  const due = dueJobs(now)
  const base = `http://127.0.0.1:${process.env.PORT || 3000}`
  if (due.length) console.log(`[cron/tick] ${now.toISOString().slice(0, 16)} gọi: ${due.map((j) => j.id).join(", ")}`)
  for (const j of due) {
    void fetch(`${base}${j.endpoint}`, { method: j.httpMethod ?? "GET", headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` }, signal: AbortSignal.timeout(((j.maxDurationSec ?? 300) + 30) * 1000) })
      .then((r) => { if (!r.ok && r.status !== 423) console.warn(`[cron/tick] ${j.id} → HTTP ${r.status}`) })
      .catch((e) => console.warn(`[cron/tick] ${j.id} lỗi: ${e instanceof Error ? e.message : String(e)}`))
  }
  return NextResponse.json({ success: true, at: now.toISOString(), triggered: due.map((j) => j.id) })
}
