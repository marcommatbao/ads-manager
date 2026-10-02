// Node.js-only half of instrumentation.
//
// Split out of instrumentation.ts because Turbopack bundles that file for the
// Edge runtime as well, and a bare `process.cwd()` in its body triggered an
// "A Node.js API is used ... not supported in the Edge Runtime" warning on
// every compile (147 lines of log noise per dev boot, which buried real
// errors). The runtime guard in instrumentation.ts is a runtime check, so it
// could not keep these calls out of the Edge bundle — only a dynamic import
// of a separate module can.
//
// Nothing here is edge-safe by design: it is only ever imported after
// instrumentation.ts has confirmed NEXT_RUNTIME === "nodejs".

export async function registerNode() {

  // ── Đợt 21a: nạp danh sách công ty của bản cài (data/companies.json) vào sổ công ty dùng chung ─────────
  // Không chặn khởi động: tệp hỏng → giữ mặc định + lỗi hiện ở Cài đặt / tự kiểm.
  try {
    const { companiesConfigError, companyIds } = await import("@/lib/companies");
    const err = companiesConfigError();
    console.log(JSON.stringify({ level: err ? "warn" : "info", module: "startup", message: `Companies: ${companyIds().join(", ")}`, ...(err ? { error: err } : {}) }));
  } catch (e) { console.error("[startup] companies config", e); }

  // ── 0. Verify DATA_ENCRYPTION_KEY is configured ─────────────────────────────
  // Deliberately NOT inside the non-fatal try/catch below: an app that can't
  // decrypt its own stored Meta/Google credentials should refuse to boot,
  // not silently continue as if everything is fine. This is the one
  // exception to this file's "never crash the server" rule — see
  // lib/crypto/data-encryption.ts for why plaintext fallback isn't acceptable.
  {
    const { assertEncryptionKeyConfigured } = await import("@/lib/crypto/data-encryption");
    try {
      assertEncryptionKeyConfigured();
    } catch (err) {
      console.error(
        "[instrumentation] FATAL: DATA_ENCRYPTION_KEY missing or invalid — refusing to boot with credentials at risk of plaintext storage. Generate one with: openssl rand -base64 32",
        err instanceof Error ? err.message : err
      );
      throw err;
    }
  }

  // ── 1. Backfill credentials from data/ ─────────────────────────────────────

  try {
    const fs   = (await import("fs")).default;
    const path = (await import("path")).default;
    const { decryptFields } = await import("@/lib/crypto/data-encryption");

    // Meta settings (legacy format)
    const metaPath = path.resolve(process.cwd(), "data/meta-settings.json");
    if (fs.existsSync(metaPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<string, unknown>;
        const saved = decryptFields(raw, ["accessToken", "appSecret"]) as Record<string, string>;
        if (saved.accessToken  && !process.env.META_ACCESS_TOKEN)  process.env.META_ACCESS_TOKEN  = saved.accessToken;
        if (saved.adAccountId  && !process.env.META_AD_ACCOUNT_ID) process.env.META_AD_ACCOUNT_ID = saved.adAccountId;
        if (saved.appId        && !process.env.META_APP_ID)        process.env.META_APP_ID        = saved.appId;
        if (saved.appSecret    && !process.env.META_APP_SECRET)    process.env.META_APP_SECRET    = saved.appSecret;
      } catch (err) { console.warn("[instrumentation] meta-settings.json unreadable — skipping (non-fatal):", err instanceof Error ? err.message : err); }
    }

    // Google Ads settings
    const googlePath = path.resolve(process.cwd(), "data/google-settings.json");
    if (fs.existsSync(googlePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(googlePath, "utf8")) as Record<string, unknown>;
        const saved = decryptFields(raw, ["developerToken", "clientSecret", "refreshToken"]) as Record<string, string>;
        if (saved.developerToken  && !process.env.GOOGLE_ADS_DEVELOPER_TOKEN)   process.env.GOOGLE_ADS_DEVELOPER_TOKEN   = saved.developerToken;
        if (saved.clientId        && !process.env.GOOGLE_ADS_CLIENT_ID)         process.env.GOOGLE_ADS_CLIENT_ID         = saved.clientId;
        if (saved.clientSecret    && !process.env.GOOGLE_ADS_CLIENT_SECRET)     process.env.GOOGLE_ADS_CLIENT_SECRET     = saved.clientSecret;
        if (saved.refreshToken    && !process.env.GOOGLE_ADS_REFRESH_TOKEN)     process.env.GOOGLE_ADS_REFRESH_TOKEN     = saved.refreshToken;
        if (saved.customerIdMbc   && !process.env.GOOGLE_ADS_CUSTOMER_ID_MBC)   process.env.GOOGLE_ADS_CUSTOMER_ID_MBC   = saved.customerIdMbc;
        if (saved.customerIdMbi   && !process.env.GOOGLE_ADS_CUSTOMER_ID_MBI)   process.env.GOOGLE_ADS_CUSTOMER_ID_MBI   = saved.customerIdMbi;
        if (saved.loginCustomerId && !process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = saved.loginCustomerId;
      } catch (err) { console.warn("[instrumentation] google-settings.json unreadable — skipping (non-fatal):", err instanceof Error ? err.message : err); }
    }

    // Gemini settings
    const geminiPath = path.resolve(process.cwd(), "data/gemini-settings.json");
    if (fs.existsSync(geminiPath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(geminiPath, "utf8")) as Record<string, string>;
        if (saved.apiKey && !process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = saved.apiKey;
      } catch { /* non-fatal */ }
    }

    // Telegram settings
    const telegramPath = path.resolve(process.cwd(), "data/telegram-settings.json");
    if (fs.existsSync(telegramPath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(telegramPath, "utf8")) as Record<string, string>;
        if (saved.botToken && !process.env.TELEGRAM_BOT_TOKEN) process.env.TELEGRAM_BOT_TOKEN = saved.botToken;
        if (saved.chatId   && !process.env.TELEGRAM_CHAT_ID)   process.env.TELEGRAM_CHAT_ID   = saved.chatId;
      } catch { /* non-fatal */ }
    }

    // Teams webhook links (leads_notify / orders_notify / job_health_monitor)
    const teamsWebhooksPath = path.resolve(process.cwd(), "data/teams-webhooks-settings.json");
    if (fs.existsSync(teamsWebhooksPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(teamsWebhooksPath, "utf8")) as Record<string, unknown>;
        const saved = decryptFields(raw, ["leads_notify", "orders_notify", "job_health_monitor"]) as Record<string, string>;
        if (saved.leads_notify       && !process.env.TEAMS_WEBHOOK_MATBAOIN)        process.env.TEAMS_WEBHOOK_MATBAOIN        = saved.leads_notify;
        if (saved.orders_notify      && !process.env.TEAMS_WEBHOOK_ORDERS_MATBAOIN) process.env.TEAMS_WEBHOOK_ORDERS_MATBAOIN = saved.orders_notify;
        if (saved.job_health_monitor && !process.env.TEAMS_WEBHOOK_OPS_ALERTS)      process.env.TEAMS_WEBHOOK_OPS_ALERTS      = saved.job_health_monitor;
      } catch { /* non-fatal */ }
    }

    // Odoo settings
    const odooPath = path.resolve(process.cwd(), "data/odoo-settings.json");
    if (fs.existsSync(odooPath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(odooPath, "utf8")) as Record<string, string>;
        if (saved.url      && !process.env.ODOO_URL)      process.env.ODOO_URL      = saved.url;
        if (saved.db       && !process.env.ODOO_DB)       process.env.ODOO_DB       = saved.db;
        if (saved.user     && !process.env.ODOO_USER)     process.env.ODOO_USER     = saved.user;
        if (saved.password && !process.env.ODOO_PASSWORD) process.env.ODOO_PASSWORD = saved.password;
        if (saved.apiKey   && !process.env.ODOO_API_KEY)  process.env.ODOO_API_KEY  = saved.apiKey;
      } catch { /* non-fatal */ }
    }

  } catch { /* non-fatal — instrumentation must not crash the server */ }

  // ── 2. Run startup checks ────────────────────────────────────────────────────

  try {
    const { runStartupChecks } = await import("@/lib/startup-check");
    runStartupChecks();
  } catch { /* non-fatal — startup checks must never crash the server */ }
}
