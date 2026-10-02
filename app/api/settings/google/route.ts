// GET  /api/settings/google — read current Google Ads credentials (masked)
// POST /api/settings/google — save Google Ads credentials
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

const SETTINGS_PATH = path.resolve(process.cwd(), "data/google-settings.json");

type GoogleSettings = {
  developerToken?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  customerIdMBC?: string;
  customerIdMBI?: string;
  loginCustomerId?: string;
};

// Real secrets only — clientId/customerIds/loginCustomerId are account
// identifiers, not credentials, and stay plaintext (see file header in
// lib/crypto/data-encryption.ts for why field-level, not whole-file).
const ENCRYPTED_FIELDS = ["developerToken", "clientSecret", "refreshToken"] as const;

function readSettings(): GoogleSettings {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) as GoogleSettings;
      return decryptFields(raw, ENCRYPTED_FIELDS);
    }
  } catch { /* ignore */ }
  return {};
}

async function saveSettings(settings: GoogleSettings): Promise<{ persisted: boolean }> {
  return withFileLock(SETTINGS_PATH, async () => {
    const existing = readSettings();
    const merged = { ...existing, ...settings };

    if (merged.developerToken)  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = merged.developerToken;
    if (merged.clientId)        process.env.GOOGLE_ADS_CLIENT_ID = merged.clientId;
    if (merged.clientSecret)    process.env.GOOGLE_ADS_CLIENT_SECRET = merged.clientSecret;
    if (merged.refreshToken)    process.env.GOOGLE_ADS_REFRESH_TOKEN = merged.refreshToken;
    if (merged.customerIdMBC)   process.env.GOOGLE_ADS_CUSTOMER_ID_MBC = merged.customerIdMBC;
    if (merged.customerIdMBI)   process.env.GOOGLE_ADS_CUSTOMER_ID_MBI = merged.customerIdMBI;
    if (merged.loginCustomerId) process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = merged.loginCustomerId;

    try {
      fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
      const toWrite = encryptFields(merged, ENCRYPTED_FIELDS);
      writeFileAtomicSync(SETTINGS_PATH, JSON.stringify(toWrite, null, 2));
      return { persisted: true };
    } catch (e) {
      console.warn("[settings/google] Could not persist to disk:", e);
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
  const raw = {
    developerToken:  process.env.GOOGLE_ADS_DEVELOPER_TOKEN   || saved.developerToken  || "",
    clientId:        process.env.GOOGLE_ADS_CLIENT_ID         || saved.clientId        || "",
    clientSecret:    process.env.GOOGLE_ADS_CLIENT_SECRET     || saved.clientSecret    || "",
    refreshToken:    process.env.GOOGLE_ADS_REFRESH_TOKEN     || saved.refreshToken    || "",
    customerIdMBC:   process.env.GOOGLE_ADS_CUSTOMER_ID_MBC   || saved.customerIdMBC   || "",
    customerIdMBI:   process.env.GOOGLE_ADS_CUSTOMER_ID_MBI   || saved.customerIdMBI   || "",
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || saved.loginCustomerId || "",
  };

  return NextResponse.json({
    ok: true,
    // customer IDs are not secrets — return as-is
    customerIdMBC:   raw.customerIdMBC,
    customerIdMBI:   raw.customerIdMBI,
    loginCustomerId: raw.loginCustomerId,
    // secrets — masked
    developerToken:  maskSecret(raw.developerToken),
    clientId:        maskSecret(raw.clientId),
    clientSecret:    maskSecret(raw.clientSecret),
    refreshToken:    maskSecret(raw.refreshToken),
    connected: {
      developerToken: !!raw.developerToken,
      refreshToken:   !!raw.refreshToken,
    },
  });
}

// POST — skip masked placeholders; log audit (field names only)
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const editGuard = guardEditCredentials(user);
  if (editGuard) return editGuard;

  const body = await request.json() as {
    developerToken?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    customerIdMBC?: string;
    customerIdMBI?: string;
    loginCustomerId?: string;
  };

  const settings: GoogleSettings = {};
  if (body.developerToken  && !isMaskedPlaceholder(body.developerToken))  settings.developerToken  = body.developerToken;
  if (body.clientId        && !isMaskedPlaceholder(body.clientId))        settings.clientId        = body.clientId;
  if (body.clientSecret    && !isMaskedPlaceholder(body.clientSecret))    settings.clientSecret    = body.clientSecret;
  if (body.refreshToken    && !isMaskedPlaceholder(body.refreshToken))    settings.refreshToken    = body.refreshToken;
  if (body.customerIdMBC)   settings.customerIdMBC   = body.customerIdMBC.replace(/-/g, "");
  if (body.customerIdMBI)   settings.customerIdMBI   = body.customerIdMBI.replace(/-/g, "");
  if (body.loginCustomerId) settings.loginCustomerId = body.loginCustomerId.replace(/-/g, "");

  if (Object.keys(settings).length === 0) {
    return NextResponse.json({ ok: true, message: "Không có thay đổi mới nào để lưu.", persisted: false });
  }

  const { persisted } = await saveSettings(settings);

  await writeAuditEntry(
    "credentials_google", user, "update",
    Object.keys(settings).join(", "),
    null, null, "ALL",
  );

  const message = persisted
    ? "Google Ads credentials đã lưu."
    : "Credentials áp dụng (in-memory). Disk write thất bại — sẽ reset khi restart.";

  return NextResponse.json({ ok: true, message, persisted });
}
