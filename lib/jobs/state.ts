// ============================================================
// Job state read model — builds JobState[] from registry + store
// ============================================================

import { ACTIVE_JOBS as JOB_REGISTRY } from "./registry";
import { getAllJobControls, getAllJobHistory } from "./store";
import type { JobId, JobState, JobRunRecord } from "./types";

// Khoảng lặp (ms) suy từ cron expr, đọc THẲNG hai trường phút và giờ.
//
// Chú thích này CỐ Ý dùng `//` chứ không dùng khối /* */: nội dung có chuỗi
// "sao gạch chéo" của cron, mà viết nguyên dạng trong khối thì nó chính là dấu
// đóng khối, cắt ngang chú thích và làm hỏng cả tệp.
//
// SỬA 17/09/2026 — bản cũ so khớp bằng một danh sách regex ghi sẵn cho các mốc
// "0 giờ chia N", và KHÔNG mẫu nào khớp cron chạy theo PHÚT, nên mọi job kiểu
// đó rơi vào nhánh mặc định 24h. Hậu quả thật: hai cron leads_notify và
// orders_notify (đều 5 phút một lần) chết lúc 05:30 sáng 17/09, nhưng
// nextExpectedAt được tính là "lần chạy cuối + 24h" nên suốt 16 tiếng không có
// gì coi chúng là trễ. Hai lead và hai đơn hàng không ai được báo.
//
// Nay đọc trường thật: bước N ở cột phút → N phút; bước N ở cột giờ → N giờ;
// phút cố định + giờ "*" → mỗi giờ; giờ cố định → hằng ngày (hoặc hằng tuần
// nếu có giới hạn thứ).
export function intervalMsFromCron(cronExpr: string): number | null {
  const f = cronExpr.trim().split(/\s+/);
  if (f.length < 5) return null;
  const [min, hour] = f;

  const stepMin = /^\*\/(\d+)$/.exec(min);
  if (stepMin && hour === "*") {
    const n = Number(stepMin[1]);
    return n > 0 ? n * 60_000 : null;
  }
  const stepHour = /^\*\/(\d+)$/.exec(hour);
  if (stepHour) {
    const n = Number(stepHour[1]);
    return n > 0 ? n * 3_600_000 : null;
  }
  if (hour === "*") return 3_600_000;          // phút cố định, mọi giờ → 1h
  if (/^\d+$/.test(hour)) {
    // giờ cố định — hằng ngày, trừ khi giới hạn theo thứ trong tuần
    const dow = f[4];
    return dow && dow !== "*" ? 7 * 24 * 3_600_000 : 24 * 3_600_000;
  }
  return 24 * 3_600_000;
}

function nextExpected(cronExpr: string, lastRunAt: string | null): string | null {
  const ms = intervalMsFromCron(cronExpr) ?? 24 * 3_600_000;
  const base = lastRunAt ? Date.parse(lastRunAt) : Date.now();
  return new Date(base + ms).toISOString();
}

/**
 * Ân hạn trước khi gọi một job là "im": gấp 3 khoảng lặp, tối thiểu 10 phút.
 * Gấp 3 để một lần chạy lỗi lẻ hoặc một nhịp chạy chậm không kêu nhầm —
 * kêu nhầm thì người ta tắt chuông, rồi lần im thật cũng không ai nhìn.
 */
function staleGraceMs(intervalMs: number): number {
  return Math.max(10 * 60_000, intervalMs * 3);
}

export function buildJobStates(): JobState[] {
  const controls = getAllJobControls();
  const history  = getAllJobHistory();

  return JOB_REGISTRY.map(desc => {
    const id      = desc.id;
    const control = controls[id] ?? { jobId: id, enabled: true, pausedAt: null, pausedBy: null, pauseReason: null };
    const runs    = (history[id] ?? []).slice().reverse(); // newest first

    const lastRun     = runs[0] ?? null;
    const lastSuccess = runs.find(r => r.status === "success") ?? null;
    const lastFailure = runs.find(r => r.status === "failure") ?? null;
    const recentHistory = runs.slice(0, 10);

    // Job bị tạm dừng có chủ đích thì KHÔNG phải "im" — im nghĩa là đáng lẽ
    // phải chạy mà không chạy, chứ không phải người ta cố ý tắt.
    const intervalMs = intervalMsFromCron(desc.cronExpr);
    const lastAt = lastRun?.startedAt ? Date.parse(lastRun.startedAt) : null;
    let isStale = false;
    let staleForMs: number | null = null;
    if (control.enabled && intervalMs !== null && lastAt !== null) {
      const silentFor = Date.now() - lastAt;
      if (silentFor > intervalMs + staleGraceMs(intervalMs)) {
        isStale = true;
        staleForMs = silentFor;
      }
    }

    return {
      jobId:          id,
      enabled:        control.enabled,
      pauseReason:    control.pauseReason,
      pausedBy:       control.pausedBy,
      pausedAt:       control.pausedAt,
      lastRun,
      lastSuccess,
      lastFailure,
      lastRunAt:      lastRun?.startedAt ?? null,
      nextExpectedAt: nextExpected(desc.cronExpr, lastRun?.startedAt ?? null),
      intervalMs,
      isStale,
      staleForMs,
      recentHistory,
    } satisfies JobState;
  });
}

export function buildJobState(id: JobId): JobState | null {
  const all = buildJobStates();
  return all.find(s => s.jobId === id) ?? null;
}
