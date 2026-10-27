// Gộp các khu từ điển. Thêm khu mới: tạo vi/<khu>.ts + en/<khu>.ts (en kiểu Translation<typeof vi>) rồi thêm vào đây.
import type { Locale } from "../config"
import { common as viCommon } from "./vi/common"
import { common as enCommon } from "./en/common"
import { auth as viAuth } from "./vi/auth"
import { auth as enAuth } from "./en/auth"
import { shell as viShell } from "./vi/shell"
import { shell as enShell } from "./en/shell"
import { connect as viConnect } from "./vi/connect"
import { connect as enConnect } from "./en/connect"
import { setup as viSetup } from "./vi/setup"
import { setup as enSetup } from "./en/setup"
import { campaigns as viCampaigns } from "./vi/campaigns"
import { campaigns as enCampaigns } from "./en/campaigns"
import { settings as viSettings } from "./vi/settings"
import { settings as enSettings } from "./en/settings"

export const vi = { ...viCommon, ...viAuth, ...viShell, ...viConnect, ...viSetup, ...viCampaigns, ...viSettings } as const
export type MessageKey = keyof typeof vi
export const en: Record<MessageKey, string> = { ...enCommon, ...enAuth, ...enShell, ...enConnect, ...enSetup, ...enCampaigns, ...enSettings }

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { vi, en }
