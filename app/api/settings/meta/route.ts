import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { maskSecret, isMaskedPlaceholder } from "@/lib/settings/validators/credentials";
import { writeAuditEntry } from "@/lib/settings/audit";
import { guardViewCredentials, guardEditCredentials } from "@/lib/settings/guards";
import { encryptFields, decryptFields } from "@/lib/crypto/data-encryption";
import { withFileLock } from "@/lib/file-lock";
import fs from "fs";
import { writeFileAtomicSync } from "@/lib/fs-atomic";
import path from "path";

const SETTINGS_PATH = path.resolve(process.cwd(), "data/meta-settings.json");

type MetaSettings = {
  accessToken?: string;
  adAccountId?: string;
  appId?: string;
  appSecret?: string;
};

// Real secrets only — appId/adAccountId are identifiers, not credentials.
const ENCRYPTED_FIELDS = ["accessToken", "appSecret"] as const;

function readSettings(): MetaSettings {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) as MetaSettings;
      return decryptFields(raw, ENCRYPTED_FIELDS);
    }
  } catch { /* ignore */ }
  return {};
}

async function saveSettings(settings: MetaSettings): Promise<{ persisted: boolean }> {
  return withFileLock(SETTINGS_PATH, async () => {
    const existing = readSettings();
    const merged = { ...existing, ...settings };
    // Apply to runtime process.env immediately (works for current process lifetime)
    if (merged.accessToken) process.env.META_ACCESS_TOKEN = merged.accessToken;
    if (merged.adAccountId) process.env.META_AD_ACCOUNT_ID = merged.adAccountId;
    if (merged.appId) process.env.META_APP_ID = merged.appId;
    if (merged.appSecret) process.env.META_APP_SECRET = merged.appSecret;
    // Write to disk for persistence across restarts
    try {
      fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
      const toWrite = encryptFields(merged, ENCRYPTED_FIELDS);
      writeFileAtomicSync(SETTINGS_PATH, JSON.stringify(toWrite, null, 2));
      return { persisted: true };
    } catch (e) {
      console.warn("[settings/meta] Could not persist to disk:", e);
      return { persisted: false };
    }
  });
}

// GET — masked values; never expose raw secrets
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const credGuard = guardViewCredentials(user);
  if (credGuard) return credGuard;

  const saved = readSettings();
  const rawAccessToken = process.env.META_ACCESS_TOKEN || saved.accessToken || "";
  const rawAccountId   = process.env.META_AD_ACCOUNT_ID || saved.adAccountId || "";
  const rawAppId       = process.env.META_APP_ID || saved.appId || "";
  const rawAppSecret   = process.env.META_APP_SECRET || saved.appSecret || "";
  const fmtAccountId   = rawAccountId ? (rawAccountId.startsWith("act_") ? rawAccountId : `act_${rawAccountId}`) : "";

  return NextResponse.json({
    ok: true,
    adAccountId: fmtAccountId,            // not a secret — return as-is
    accessToken: maskSecret(rawAccessToken),
    appId:       maskSecret(rawAppId),
    appSecret:   maskSecret(rawAppSecret),
    connected: {
      accessToken: !!rawAccessToken,
      adAccountId: !!rawAccountId,
    },
  });
}

// POST — skip fields that are masked placeholders (client echoed them back unchanged)
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editGuard = guardEditCredentials(user);
  if (editGuard) return editGuard;

  const body = await request.json() as { accessToken?: string; adAccountId?: string; appId?: string; appSecret?: string };

  const settings: MetaSettings = {};
  if (body.accessToken && !isMaskedPlaceholder(body.accessToken)) settings.accessToken = body.accessToken;
  if (body.adAccountId)                                           settings.adAccountId  = body.adAccountId.replace(/^act_/, "");
  if (body.appId      && !isMaskedPlaceholder(body.appId))       settings.appId        = body.appId;
  if (body.appSecret  && !isMaskedPlaceholder(body.appSecret))   settings.appSecret    = body.appSecret;

  if (Object.keys(settings).length === 0) {
    return NextResponse.json({ ok: true, message: "Không có thay đổi mới nào để lưu.", persisted: false });
  }

  const { persisted } = await saveSettings(settings);

  // Log field names only — never values (SECRET domain)
  await writeAuditEntry(
    "credentials_meta", user, "update",
    Object.keys(settings).join(", "),
    null, null, "ALL",
  );

  const message = persisted
    ? "Meta credentials đã lưu."
    : "Credentials áp dụng (in-memory). Disk write thất bại — sẽ reset khi restart.";

  return NextResponse.json({ ok: true, message, persisted });
}
