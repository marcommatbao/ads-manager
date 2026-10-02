"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Shield,
  Eye,
  EyeOff,
  XIcon,
  RefreshCw,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdsStore } from "@/store/useAdsStore";
import type { GA4PropertyMapping } from "@/types/ads.types";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useSettingsPermission } from "@/hooks/useSettingsPermission";
import { ReadOnlyBanner } from "@/components/settings/PermissionGate";
import { ConnectorHealth } from "@/components/settings/ConnectorHealth";
import { ExtraConnections } from "@/components/settings/ExtraConnections";

interface ApiSection {
  title: string;
  description: string;
  platform: string;
  color: string;
  fields: { key: string; label: string; placeholder: string }[];
}

const apiSections: ApiSection[] = [
  {
    title: "Meta (Facebook) Ads",
    description: "Connect your Meta Business account to sync Facebook & Instagram campaigns.",
    platform: "meta",
    color: "bg-blue-500",
    fields: [
      {
        key: "metaAccessToken",
        label: "Access Token",
        placeholder: "Your Meta Marketing API access token",
      },
      {
        key: "metaAdAccountId",
        label: "Ad Account ID",
        placeholder: "act_123456789",
      },
      {
        key: "metaAppId",
        label: "App ID",
        placeholder: "Your Meta App ID",
      },
      {
        key: "metaAppSecret",
        label: "App Secret",
        placeholder: "Your Meta App Secret",
      },
    ],
  },
  {
    title: "Google Ads",
    description: "Connect your Google Ads account to sync search, display & video campaigns.",
    platform: "google",
    color: "bg-amber-500",
    fields: [
      {
        key: "googleDeveloperToken",
        label: "Developer Token",
        placeholder: "Your Google Ads developer token",
      },
      {
        key: "googleClientId",
        label: "Client ID",
        placeholder: "Your OAuth2 client ID",
      },
      {
        key: "googleClientSecret",
        label: "Client Secret",
        placeholder: "Your OAuth2 client secret",
      },
      {
        key: "googleRefreshToken",
        label: "Refresh Token",
        placeholder: "Your OAuth2 refresh token",
      },
      {
        key: "googleLoginCustomerId",
        label: "Login Customer ID (MCC)",
        placeholder: "Manager account ID (e.g. 7892146980)",
      },
      {
        key: "googleCustomerIdMBC",
        label: "Customer ID — Mắt Bão Cloud (MBC)",
        placeholder: "e.g. 2190685994",
      },
      {
        key: "googleCustomerIdMBI",
        label: "Customer ID — MIFI (MBI)",
        placeholder: "e.g. 2275457986",
      },
    ],
  },
  {
    title: "Google Gemini AI",
    description: "Enable AI-powered creative generation for your ad campaigns.",
    platform: "gemini",
    color: "bg-purple-500",
    fields: [
      {
        key: "geminiApiKey",
        label: "API Key",
        placeholder: "Your Gemini API key",
      },
    ],
  },
  {
    title: "Telegram Alerts",
    description: "Connect a Telegram Bot to receive real-time anomaly and fatigue alerts.",
    platform: "telegram",
    color: "bg-sky-500",
    fields: [
      {
        key: "telegramBotToken",
        label: "Bot Token",
        placeholder: "123456789:ABCdefGHIjklMNO...",
      },
      {
        key: "telegramChatId",
        label: "Chat ID",
        placeholder: "-100123456789 (Group) or 123456 (User)",
      },
    ],
  },
];

import { COMPANY_CONFIG } from "@/lib/company-config";

function CompanyMappingTable() {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm mt-6">
      <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
        <p className="text-[15px] font-bold text-slate-800">Company → Analytics Mapping</p>
        <p className="text-[13px] text-slate-500 mt-1">
          GA4 và Pixel đúng sẽ được dùng tự động theo cột CO. của campaign
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-white">
              <th className="text-left px-5 py-3 text-[12px] text-slate-500 font-semibold uppercase tracking-wider">
                Công ty
              </th>
              <th className="text-left px-5 py-3 text-[12px] text-slate-500 font-semibold uppercase tracking-wider">
                Domain
              </th>
              <th className="text-left px-5 py-3 text-[12px] text-slate-500 font-semibold uppercase tracking-wider">
                GA4 Property
              </th>
              <th className="text-left px-5 py-3 text-[12px] text-slate-500 font-semibold uppercase tracking-wider">
                Measurement ID
              </th>
              <th className="text-left px-5 py-3 text-[12px] text-slate-500 font-semibold uppercase tracking-wider">
                FB Pixel
              </th>
              <th className="text-center px-5 py-3 text-[12px] text-slate-500 font-semibold uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(COMPANY_CONFIG).map(([key, row]) => (
              <tr
                key={key}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
              >
                <td className="px-5 py-4">
                  <span className={cn(
                    "text-xs font-bold px-2.5 py-1 rounded-md",
                    `bg-${row.color}-100 text-${row.color}-700`
                  )}>
                    {row.label}
                  </span>
                </td>
                <td className="px-5 py-4 text-[13px] text-slate-600 font-mono">
                  {row.domain}
                </td>
                <td className="px-5 py-4 text-[13px] font-mono tabular-nums text-slate-700">
                  {row.ga4.propertyId.replace('properties/', '')}
                </td>
                <td className="px-5 py-4">
                  <span className="text-[12px] font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">
                    {row.ga4.measurementId}
                  </span>
                </td>
                <td className="px-5 py-4 text-[13px] font-mono text-slate-600 tabular-nums">
                  {row.facebook.pixelId}
                </td>
                <td className="px-5 py-4 text-center">
                  <span className="flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-700 py-1 px-2 rounded-md w-fit mx-auto">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-bold tracking-wide uppercase">
                      Active
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


type TestResult = { ok: boolean; message: string };

function SettingsContent() {
  const searchParams = useSearchParams();
  const perms = useSettingsPermission();
  const [values, setValues] = useState<Record<string, string>>({});
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaTesting, setMetaTesting] = useState(false);
  const [metaResult, setMetaResult] = useState<TestResult | null>(null);
  const [googleSaving, setGoogleSaving] = useState(false);
  const [googleTesting, setGoogleTesting] = useState(false);
  const [googleResult, setGoogleResult] = useState<TestResult | null>(null);
  const [geminiSaving, setGeminiSaving] = useState(false);
  const [geminiTesting, setGeminiTesting] = useState(false);
  const [geminiResult, setGeminiResult] = useState<TestResult | null>(null);
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramResult, setTelegramResult] = useState<TestResult | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState({ facebook: false, google: false, ga4: false, gemini: false, telegram: false });
  const { fetchGA4 } = useAdsStore();

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => {
        setStatus({
          ...data,
          ga4: searchParams.get("ga4_connected") === "true" || !!data.ga4,
          google: searchParams.get("google_connected") === "true" || !!data.google,
        });
      })
      .catch((e) => console.error("Error fetching status:", e));

    const googleError = searchParams.get("google_error");
    if (googleError) {
      setGoogleResult({ ok: false, message: `OAuth error: ${googleError}` });
    }
    if (searchParams.get("google_connected") === "true") {
      setGoogleResult({ ok: true, message: "Google Ads authorized successfully." });
    }
  }, [searchParams]);

  // Pre-populate Meta credentials
  useEffect(() => {
    fetch("/api/settings/meta")
      .then((r) => r.json())
      .then((data: { ok: boolean; accessToken?: string; adAccountId?: string; appId?: string; appSecret?: string }) => {
        if (data.ok) {
          setValues((prev) => ({
            ...prev,
            ...(data.accessToken ? { metaAccessToken: data.accessToken } : {}),
            ...(data.adAccountId ? { metaAdAccountId: data.adAccountId } : {}),
            ...(data.appId ? { metaAppId: data.appId } : {}),
            ...(data.appSecret ? { metaAppSecret: data.appSecret } : {}),
          }));
        }
      })
      .catch(() => {});
  }, []);

  // Pre-populate Google credentials
  useEffect(() => {
    fetch("/api/settings/google")
      .then((r) => r.json())
      .then((data: {
        ok: boolean;
        developerToken?: string;
        clientId?: string;
        clientSecret?: string;
        refreshToken?: string;
        customerIdMBC?: string;
        customerIdMBI?: string;
        loginCustomerId?: string;
      }) => {
        if (data.ok) {
          setValues((prev) => ({
            ...prev,
            ...(data.developerToken  ? { googleDeveloperToken: data.developerToken }   : {}),
            ...(data.clientId        ? { googleClientId: data.clientId }               : {}),
            ...(data.clientSecret    ? { googleClientSecret: data.clientSecret }       : {}),
            ...(data.refreshToken    ? { googleRefreshToken: data.refreshToken }       : {}),
            ...(data.customerIdMBC   ? { googleCustomerIdMBC: data.customerIdMBC }     : {}),
            ...(data.customerIdMBI   ? { googleCustomerIdMBI: data.customerIdMBI }     : {}),
            ...(data.loginCustomerId ? { googleLoginCustomerId: data.loginCustomerId } : {}),
          }));
        }
      })
      .catch(() => {});
  }, []);

  // Pre-populate Gemini credentials
  useEffect(() => {
    fetch("/api/settings/gemini")
      .then((r) => r.json())
      .then((data: { ok: boolean; apiKey?: string }) => {
        if (data.ok && data.apiKey) {
          setValues((prev) => ({ ...prev, geminiApiKey: data.apiKey! }));
        }
      })
      .catch(() => {});
  }, []);

  // Pre-populate Telegram credentials
  useEffect(() => {
    fetch("/api/settings/telegram")
      .then((r) => r.json())
      .then((data: { ok: boolean; botToken?: string; chatId?: string }) => {
        if (data.ok) {
          setValues((prev) => ({
            ...prev,
            ...(data.botToken ? { telegramBotToken: data.botToken } : {}),
            ...(data.chatId ? { telegramChatId: data.chatId } : {}),
          }));
        }
      })
      .catch(() => {});
  }, []);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleShow = (key: string) => {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTestMeta = async () => {
    setMetaTesting(true);
    setMetaResult(null);
    const token = values["metaAccessToken"];
    const adAccountId = values["metaAdAccountId"];
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (adAccountId) params.set("adAccountId", adAccountId);
    try {
      const res = await fetch(`/api/settings/meta/test?${params}`);
      const data = await res.json() as { ok: boolean; userName?: string; accountName?: string; error?: string };
      if (data.ok) {
        setMetaResult({ ok: true, message: `Connected as ${data.userName}${data.accountName ? ` · ${data.accountName}` : ""}` });
        setStatus((s) => ({ ...s, facebook: true }));
      } else {
        setMetaResult({ ok: false, message: data.error ?? "Connection failed" });
        setStatus((s) => ({ ...s, facebook: false }));
      }
    } catch {
      setMetaResult({ ok: false, message: "Network error" });
    }
    setMetaTesting(false);
  };

  const handleSaveMeta = async () => {
    const token = values["metaAccessToken"];
    if (!token) return;
    setMetaSaving(true);
    try {
      const res = await fetch("/api/settings/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: values["metaAccessToken"],
          adAccountId: values["metaAdAccountId"],
          appId: values["metaAppId"],
          appSecret: values["metaAppSecret"],
        }),
      });
      const text = await res.text();
      let data: { ok: boolean; message?: string; error?: string };
      try { data = JSON.parse(text); } catch { throw new Error(`Server error (${res.status}): ${text.slice(0, 120)}`); }
      if (data.ok) {
        setStatus((s) => ({ ...s, facebook: true }));
        setMetaResult({ ok: true, message: "Đã lưu! Credentials sẽ được dùng ngay cho các tính năng." });
      } else {
        setMetaResult({ ok: false, message: data.error ?? data.message ?? "Save failed" });
      }
    } catch (e) {
      setMetaResult({ ok: false, message: e instanceof Error ? e.message : "Save failed" });
    }
    setMetaSaving(false);
  };

  const handleTestGoogle = async () => {
    setGoogleTesting(true);
    setGoogleResult(null);
    const params = new URLSearchParams();
    if (values["googleDeveloperToken"])  params.set("developerToken",  values["googleDeveloperToken"]);
    if (values["googleClientId"])        params.set("clientId",        values["googleClientId"]);
    if (values["googleClientSecret"])    params.set("clientSecret",    values["googleClientSecret"]);
    if (values["googleRefreshToken"])    params.set("refreshToken",    values["googleRefreshToken"]);
    if (values["googleCustomerIdMBC"])   params.set("customerIdMBC",   values["googleCustomerIdMBC"]);
    if (values["googleCustomerIdMBI"])   params.set("customerIdMBI",   values["googleCustomerIdMBI"]);
    if (values["googleLoginCustomerId"]) params.set("loginCustomerId", values["googleLoginCustomerId"]);
    try {
      const res = await fetch(`/api/settings/google/test?${params}`);
      const data = await res.json() as { ok: boolean; accounts?: { id: string; name: string }[]; error?: string };
      if (data.ok) {
        const names = data.accounts?.map((a) => a.name).join(", ") || "";
        setGoogleResult({ ok: true, message: `Connected · ${names}` });
        setStatus((s) => ({ ...s, google: true }));
      } else {
        setGoogleResult({ ok: false, message: data.error ?? "Connection failed" });
        setStatus((s) => ({ ...s, google: false }));
      }
    } catch {
      setGoogleResult({ ok: false, message: "Network error" });
    }
    setGoogleTesting(false);
  };

  const handleSaveGoogle = async () => {
    setGoogleSaving(true);
    try {
      const res = await fetch("/api/settings/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          developerToken:  values["googleDeveloperToken"],
          clientId:        values["googleClientId"],
          clientSecret:    values["googleClientSecret"],
          refreshToken:    values["googleRefreshToken"],
          customerIdMBC:   values["googleCustomerIdMBC"],
          customerIdMBI:   values["googleCustomerIdMBI"],
          loginCustomerId: values["googleLoginCustomerId"],
        }),
      });
      const text = await res.text();
      let data: { ok: boolean; message?: string; error?: string };
      try { data = JSON.parse(text); } catch { throw new Error(`Server error (${res.status}): ${text.slice(0, 120)}`); }
      if (data.ok) {
        setStatus((s) => ({ ...s, google: true }));
        setGoogleResult({ ok: true, message: "Đã lưu! Google Ads credentials sẽ được dùng ngay." });
      } else {
        setGoogleResult({ ok: false, message: data.error ?? data.message ?? "Save failed" });
      }
    } catch (e) {
      setGoogleResult({ ok: false, message: e instanceof Error ? e.message : "Save failed" });
    }
    setGoogleSaving(false);
  };

  const handleTestGemini = async () => {
    setGeminiTesting(true);
    setGeminiResult(null);
    const params = new URLSearchParams();
    if (values["geminiApiKey"]) params.set("apiKey", values["geminiApiKey"]);
    try {
      const res = await fetch(`/api/settings/gemini/test?${params}`);
      const data = await res.json() as { ok: boolean; modelCount?: number; error?: string };
      if (data.ok) {
        setGeminiResult({ ok: true, message: `Connected · ${data.modelCount ?? 0} models available` });
        setStatus((s) => ({ ...s, gemini: true }));
      } else {
        setGeminiResult({ ok: false, message: data.error ?? "Connection failed" });
        setStatus((s) => ({ ...s, gemini: false }));
      }
    } catch {
      setGeminiResult({ ok: false, message: "Network error" });
    }
    setGeminiTesting(false);
  };

  const handleSaveGemini = async () => {
    const apiKey = values["geminiApiKey"];
    if (!apiKey) return;
    setGeminiSaving(true);
    try {
      const res = await fetch("/api/settings/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const text = await res.text();
      let data: { ok: boolean; message?: string; error?: string };
      try { data = JSON.parse(text); } catch { throw new Error(`Server error (${res.status}): ${text.slice(0, 120)}`); }
      if (data.ok) {
        setStatus((s) => ({ ...s, gemini: true }));
        setGeminiResult({ ok: true, message: "Đã lưu! Gemini API key sẽ được dùng ngay." });
      } else {
        setGeminiResult({ ok: false, message: data.error ?? data.message ?? "Save failed" });
      }
    } catch (e) {
      setGeminiResult({ ok: false, message: e instanceof Error ? e.message : "Save failed" });
    }
    setGeminiSaving(false);
  };

  const handleTestTelegram = async () => {
    setTelegramTesting(true);
    setTelegramResult(null);
    const botToken = values["telegramBotToken"];
    const chatId = values["telegramChatId"];
    if (!botToken || !chatId) {
      setTelegramResult({ ok: false, message: "Cần nhập Bot Token và Chat ID trước khi test" });
      setTelegramTesting(false);
      return;
    }
    try {
      const res = await fetch("/api/settings/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: botToken, chat_id: chatId }),
      });
      const data = await res.json() as { success: boolean; botName?: string; error?: string; hint?: string };
      if (data.success) {
        setTelegramResult({ ok: true, message: `Đã gửi test message tới @${data.botName ?? "bot"}` });
        setStatus((s) => ({ ...s, telegram: true }));
      } else {
        setTelegramResult({ ok: false, message: [data.error, data.hint].filter(Boolean).join(" — ") || "Connection failed" });
        setStatus((s) => ({ ...s, telegram: false }));
      }
    } catch {
      setTelegramResult({ ok: false, message: "Network error" });
    }
    setTelegramTesting(false);
  };

  const handleSaveTelegram = async () => {
    const botToken = values["telegramBotToken"];
    const chatId = values["telegramChatId"];
    if (!botToken && !chatId) return;
    setTelegramSaving(true);
    try {
      const res = await fetch("/api/settings/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken, chatId }),
      });
      const text = await res.text();
      let data: { ok: boolean; message?: string; error?: string };
      try { data = JSON.parse(text); } catch { throw new Error(`Server error (${res.status}): ${text.slice(0, 120)}`); }
      if (data.ok) {
        setStatus((s) => ({ ...s, telegram: !!(botToken && chatId) }));
        setTelegramResult({ ok: true, message: "Đã lưu! Telegram config sẽ được dùng ngay." });
      } else {
        setTelegramResult({ ok: false, message: data.error ?? data.message ?? "Save failed" });
      }
    } catch (e) {
      setTelegramResult({ ok: false, message: e instanceof Error ? e.message : "Save failed" });
    }
    setTelegramSaving(false);
  };

  // Viewer-* roles cannot see credentials at all
  if (!perms.isLoading && !perms.canViewCredentials) {
    return (
      <div className="max-w-3xl space-y-4">
        <ReadOnlyBanner message="Bạn không có quyền xem trang cài đặt kết nối API. Liên hệ Super Admin để được cấp quyền." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Read-only banner for admins who can view but not edit */}
      {!perms.isLoading && perms.canViewCredentials && !perms.canEditCredentials && (
        <ReadOnlyBanner message="Bạn có thể xem thông tin kết nối API nhưng không có quyền lưu thay đổi. Chỉ Super Admin mới được cập nhật credentials." />
      )}
      {/* Security Notice */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
        <Shield className="mt-0.5 h-5 w-5 text-blue-500 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-800">
            Your API keys are encrypted and stored securely
          </p>
          <p className="mt-0.5 text-xs text-blue-600">
            Keys are stored server-side and never exposed to the client.
            Environment variables are used for all API communications.
          </p>
        </div>
      </div>

      {/* API Sections */}
      {apiSections.map((section, idx) => (
        <Card
          key={section.platform}
          className="border border-slate-200 bg-white shadow-sm rounded-xl"
        >
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-3 w-3 rounded-full ${section.color}`}
              />
              <CardTitle className="text-lg font-semibold text-slate-800">
                {section.title}
              </CardTitle>
              {status[section.platform as keyof typeof status] ? (
                <Badge
                  variant="outline"
                  className="ml-auto border-green-200 bg-green-50 text-xs text-green-700 font-semibold"
                >
                  <span className="mr-1 h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                  Connected
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="ml-auto border-slate-200 text-xs text-slate-500"
                >
                  Not connected
                </Badge>
              )}
            </div>
            <CardDescription className="text-sm text-slate-500 mt-1">
              {section.description}
            </CardDescription>
            {(section.platform === "meta" || section.platform === "google") && (
              <a
                href={section.platform === "meta" ? "/guide/ket-noi#meta-ads" : "/guide/ket-noi#google-ads"}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline mt-1 w-fit"
              >
                Hướng dẫn <ArrowRight className="h-3 w-3" />
              </a>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {section.platform === "meta" && !status.facebook && (
              <div className="mb-2 rounded-xl border border-amber-100 bg-amber-50 p-4 space-y-2">
                <p className="text-sm text-amber-800 font-medium">
                  Facebook chưa kết nối hoặc token đã hết hạn.
                </p>
                <p className="text-xs text-amber-700">
                  Lấy token mới tại Meta Business Suite → Settings → Business Settings → System Users → Generate Token.
                </p>
                <a
                  href="https://business.facebook.com/settings/system-users"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 underline underline-offset-2"
                >
                  Mở Meta Business Settings
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {section.platform === "google" && !status.google && (
              <div className="mb-2 rounded-xl border border-amber-100 bg-amber-50 p-4 space-y-2">
                <p className="text-sm text-amber-800 font-medium">
                  Google Ads chưa kết nối. Nhập credentials bên dưới và nhấn Lưu.
                </p>
                <p className="text-xs text-amber-700">
                  Hoặc dùng OAuth nếu chưa có Refresh Token:
                </p>
                <a
                  href="/api/google/auth"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 underline underline-offset-2"
                >
                  Authorize via OAuth
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {section.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  {field.label}
                </label>
                <div className="relative">
                  <Input
                    type={showKeys[field.key] ? "text" : "password"}
                    placeholder={field.placeholder}
                    value={values[field.key] ?? ""}
                    onChange={(e) =>
                      handleChange(field.key, e.target.value)
                    }
                    className="rounded-lg border-slate-200 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShow(field.key)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showKeys[field.key] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}

            {section.platform === "meta" && (
              <div className="pt-2 space-y-3">
                {metaResult && (
                  <div className={cn(
                    "flex items-center gap-2 text-sm rounded-lg px-3 py-2",
                    metaResult.ok
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  )}>
                    {metaResult.ok
                      ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                      : <AlertCircle className="h-4 w-4 shrink-0" />}
                    {metaResult.message}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestMeta}
                    disabled={metaTesting}
                    className="gap-1.5 border-slate-200"
                  >
                    {metaTesting
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />}
                    Test Connection
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveMeta}
                    disabled={metaSaving || !values["metaAccessToken"] || !perms.canEditCredentials}
                    title={!perms.canEditCredentials ? "Chỉ Super Admin mới được lưu credentials" : undefined}
                    className="gap-1.5 bg-amber-500 text-amber-950 hover:bg-amber-600 disabled:opacity-40"
                  >
                    {metaSaving
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Save className="h-3.5 w-3.5" />}
                    Lưu & Kết nối lại
                  </Button>
                </div>
              </div>
            )}

            {section.platform === "google" && (
              <div className="pt-2 space-y-3">
                {googleResult && (
                  <div className={cn(
                    "flex items-center gap-2 text-sm rounded-lg px-3 py-2",
                    googleResult.ok
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  )}>
                    {googleResult.ok
                      ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                      : <AlertCircle className="h-4 w-4 shrink-0" />}
                    {googleResult.message}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestGoogle}
                    disabled={googleTesting}
                    className="gap-1.5 border-slate-200"
                  >
                    {googleTesting
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />}
                    Test Connection
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveGoogle}
                    disabled={googleSaving || !perms.canEditCredentials}
                    title={!perms.canEditCredentials ? "Chỉ Super Admin mới được lưu credentials" : undefined}
                    className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"
                  >
                    {googleSaving
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Save className="h-3.5 w-3.5" />}
                    Lưu & Kết nối lại
                  </Button>
                </div>
              </div>
            )}

            {section.platform === "gemini" && (
              <div className="pt-2 space-y-3">
                {geminiResult && (
                  <div className={cn(
                    "flex items-center gap-2 text-sm rounded-lg px-3 py-2",
                    geminiResult.ok
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  )}>
                    {geminiResult.ok
                      ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                      : <AlertCircle className="h-4 w-4 shrink-0" />}
                    {geminiResult.message}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestGemini}
                    disabled={geminiTesting}
                    className="gap-1.5 border-slate-200"
                  >
                    {geminiTesting
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />}
                    Test Connection
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveGemini}
                    disabled={geminiSaving || !values["geminiApiKey"] || !perms.canEditCredentials}
                    title={!perms.canEditCredentials ? "Chỉ Super Admin mới được lưu credentials" : undefined}
                    className="gap-1.5 bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40"
                  >
                    {geminiSaving
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Save className="h-3.5 w-3.5" />}
                    Lưu & Kết nối lại
                  </Button>
                </div>
              </div>
            )}

            {section.platform === "telegram" && (
              <div className="pt-2 space-y-3">
                {telegramResult && (
                  <div className={cn(
                    "flex items-center gap-2 text-sm rounded-lg px-3 py-2",
                    telegramResult.ok
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  )}>
                    {telegramResult.ok
                      ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                      : <AlertCircle className="h-4 w-4 shrink-0" />}
                    {telegramResult.message}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestTelegram}
                    disabled={telegramTesting}
                    className="gap-1.5 border-slate-200"
                  >
                    {telegramTesting
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />}
                    Test Connection
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveTelegram}
                    disabled={telegramSaving || (!values["telegramBotToken"] && !values["telegramChatId"]) || !perms.canEditCredentials}
                    title={!perms.canEditCredentials ? "Chỉ Super Admin mới được lưu credentials" : undefined}
                    className="gap-1.5 bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40"
                  >
                    {telegramSaving
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Save className="h-3.5 w-3.5" />}
                    Lưu & Kết nối lại
                  </Button>
                </div>
              </div>
            )}
          </CardContent>

          {idx < apiSections.length - 1 && <Separator className="mt-0" />}
        </Card>
      ))}

      <div id="ket-noi" className="scroll-mt-20">
        <ExtraConnections canEdit={perms.canEditCredentials} />
      </div>

      <CompanyMappingTable />

      {/* Connector Health panel — visible to all who can view credentials */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
        <ConnectorHealth canTest={perms.canEditCredentials} />
      </div>

      {/* Save All Button */}
      <div className="flex justify-end gap-3 pt-4">
        <Button
          onClick={async () => {
            await handleSaveMeta();
            await handleSaveGoogle();
            await handleSaveGemini();
            await handleSaveTelegram();
          }}
          disabled={metaSaving || googleSaving || geminiSaving || telegramSaving || !perms.canEditCredentials}
          title={!perms.canEditCredentials ? "Chỉ Super Admin mới được lưu credentials" : undefined}
          className="gap-2 rounded-lg bg-amber-500 text-amber-950 hover:bg-amber-600 disabled:opacity-40"
        >
          {(metaSaving || googleSaving || geminiSaving || telegramSaving) ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save All Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-4"><Loader2 className="h-6 w-6 animate-spin text-amber-500" /></div>}>
      <SettingsContent />
    </Suspense>
  );
}
