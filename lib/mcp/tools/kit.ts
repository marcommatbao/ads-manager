// Bộ khung công cụ MCP: kiểm công ty / khoảng ngày như route giao diện (lib/case/http requireCompany + parseRange),
// trả JSON gọn, ghi nhật ký mỗi lần gọi (không ghi nội dung trả về), lỗi → isError có câu dễ hiểu.
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { isCompany, companyIds } from "@/lib/companies"
import { canAccessCompany, getCompaniesForRole } from "@/lib/permissions"
import { DEFAULT_VIEW_DAYS, MAX_RANGE_DAYS, parseRange } from "@/lib/case/dates"
import { appendAudit } from "../store"
import type { McpContext } from "../auth"

export class ToolError extends Error {}

export function requireCo(ctx: McpContext, company: unknown): string {
  if (!isCompany(company)) throw new ToolError(`Unknown company "${String(company)}". Use list_companies. Available: ${companyIds().join(", ")}`)
  if (!canAccessCompany(ctx.user, company)) throw new ToolError(`Your AdsCommand role has no access to company ${company}`)
  return company
}

export function allowedCompanies(ctx: McpContext): string[] {
  return getCompaniesForRole(ctx.user)
}

export function range(from?: string, to?: string) {
  const pr = parseRange(from ?? null, to ?? null, { defaultDays: DEFAULT_VIEW_DAYS, maxDays: MAX_RANGE_DAYS })
  if (!pr.ok) throw new ToolError(pr.error)
  return pr.range
}

/** Cắt danh sách dài để không tràn ngữ cảnh của Claude — và NÓI RA là đã cắt. */
export function top<T>(rows: T[], n: number, key?: (r: T) => number): { items: T[]; total: number; truncated: boolean } {
  const sorted = key ? [...rows].sort((a, b) => key(b) - key(a)) : rows
  return { items: sorted.slice(0, n), total: rows.length, truncated: rows.length > n }
}

const json = (v: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(v) }] })

/** Bọc thân công cụ: nhật ký + bắt lỗi. write=true chỉ đặt cho lần GHI THẬT thành công (đếm trần ghi/ngày). */
export function run<A>(ctx: McpContext, tool: string, fn: (args: A) => Promise<unknown>, opts: { isWrite?: (out: unknown) => boolean } = {}) {
  return async (args: A): Promise<CallToolResult> => {
    const t0 = Date.now()
    try {
      const out = await fn(args)
      await appendAudit({ at: new Date().toISOString(), keyId: ctx.key.id, userId: ctx.user.id, tool, args, ok: true, ms: Date.now() - t0, ...(opts.isWrite?.(out) ? { write: true } : {}) })
      return json(out)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await appendAudit({ at: new Date().toISOString(), keyId: ctx.key.id, userId: ctx.user.id, tool, args, ok: false, ms: Date.now() - t0, error: msg.slice(0, 300) })
      return { isError: true, content: [{ type: "text", text: e instanceof ToolError ? msg : `AdsCommand error: ${msg}` }] }
    }
  }
}
