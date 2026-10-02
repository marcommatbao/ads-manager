// GET /api/settings/gemini/test — verify a Gemini API key is working
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { guardViewCredentials } from "@/lib/settings/guards";
// Google nhét nguyên văn khoá vào thông điệp lỗi ("Consumer 'api_key:AIza…' has
// been suspended") — echo thẳng ra là in khoá lên màn hình người dùng.
import { redactApiKeys } from "@/lib/gemini";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const credGuard = guardViewCredentials(user);
  if (credGuard) return credGuard;

  const apiKey = request.nextUrl.searchParams.get("apiKey") || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Missing API key" });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1`,
      { signal: AbortSignal.timeout(6000) },
    );
    const data = await res.json() as { models?: { name: string }[]; error?: { code: number; message: string } };

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return NextResponse.json({ ok: false, error: redactApiKeys(`Invalid API key: ${data.error?.message ?? `HTTP ${res.status}`}`) });
    }
    if (res.status === 429) {
      return NextResponse.json({ ok: false, error: "Gemini rate limit (429) — thử lại sau" });
    }
    if (!res.ok || data.error) {
      return NextResponse.json({ ok: false, error: redactApiKeys(data.error?.message ?? `HTTP ${res.status}`) });
    }

    return NextResponse.json({ ok: true, modelCount: data.models?.length ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: redactApiKeys(message) }, { status: 500 });
  }
}
