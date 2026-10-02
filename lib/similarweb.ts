// ─────────────────────────────────────────────
// SimilarWeb — Undocumented API + 24h Cache
// Không cần API key
// ─────────────────────────────────────────────

import { INTEL_COMPETITORS } from "./intelligence-config";

// ── Types ──

export interface SimilarWebData {
  domain: string;
  globalRank: number;
  countryRank: number;
  categoryRank: number;
  category: string;
  monthlyVisits: Record<string, number>; // { "2026-01-01": 278135 }
  trafficSources: {
    direct: number;   // 0–1 (VD: 0.40 = 40%)
    search: number;
    social: number;
    mail: number;
    referral: number;
    paid: number;     // display ads
  };
  topSocialNetworks: Array<{
    name: string;   // "Facebook", "YouTube", "TikTok"
    value: number;  // % của social traffic
  }>;
  bounceRate: number;
  fetchedAt: Date;
  /** True when some/all fields came from createEstimatedData() (hand-typed
   * per-domain profiles + deterministic daily jitter), not a real SimilarWeb
   * fetch — must be surfaced to the UI, not presented as measured data. */
  isEstimated?: boolean;
}

// ── In-Memory Cache (TTL = 24h) ──

const SW_CACHE = new Map<
  string,
  { data: SimilarWebData; fetchedAt: number }
>();

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 giờ

// ── Fetch single domain ──

export async function fetchSimilarWeb(
  domain: string
): Promise<SimilarWebData | null> {
  // 1. Check cache trước
  const cached = SW_CACHE.get(domain);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    console.log(`[SimilarWeb] Cache hit for ${domain}`);
    return cached.data;
  }

  try {
    const res = await fetch(
      `https://data.similarweb.com/api/v1/data?domain=${domain}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = await res.json();

    const data: SimilarWebData = {
      domain,
      globalRank: raw.GlobalRank?.Rank ?? 0,
      countryRank: raw.CountryRank?.Rank ?? 0,
      categoryRank: raw.CategoryRank?.Rank ?? 0,
      category: raw.Category ?? "",

      // Monthly visits: lấy 3 tháng gần nhất
      monthlyVisits: raw.EstimatedMonthlyVisits ?? {},

      trafficSources: {
        direct: raw.TrafficSources?.direct ?? 0,
        search: raw.TrafficSources?.search ?? 0,
        social: raw.TrafficSources?.social ?? 0,
        mail: raw.TrafficSources?.mail ?? 0,
        referral: raw.TrafficSources?.referrals ?? 0,
        paid: raw.TrafficSources?.paid_referrals ?? 0,
      },

      topSocialNetworks: raw.TopSocialNetworks ?? [],
      bounceRate: raw.Engagments?.BounceRate ?? 0,
      fetchedAt: new Date(),
    };

    // Kiểm tra data hợp lệ: nếu traffic sources TOÀN = 0 → data không đủ ý nghĩa
    const totalTraffic = Object.values(data.trafficSources).reduce((s, v) => s + v, 0);

    if (totalTraffic < 0.01) {
      console.warn(`[SimilarWeb] Traffic data for ${domain} is empty (all zeros), enriching with estimated data`);
      // Giữ lại rank/visits thật từ API, chỉ bổ sung traffic sources + social từ estimated
      const estimated = createEstimatedData(domain);
      const enriched: SimilarWebData = {
        ...data,
        trafficSources: estimated.trafficSources,
        topSocialNetworks: estimated.topSocialNetworks,
        bounceRate: data.bounceRate > 0 ? data.bounceRate : estimated.bounceRate,
        // Giữ lại rank + visits thật nếu có
        globalRank: data.globalRank > 0 ? data.globalRank : estimated.globalRank,
        countryRank: data.countryRank > 0 ? data.countryRank : estimated.countryRank,
        categoryRank: data.categoryRank > 0 ? data.categoryRank : estimated.categoryRank,
        monthlyVisits: Object.keys(data.monthlyVisits).length > 0 ? data.monthlyVisits : estimated.monthlyVisits,
        isEstimated: true,
      };
      SW_CACHE.set(domain, { data: enriched, fetchedAt: Date.now() });
      return enriched;
    }

    // 2. Lưu cache
    SW_CACHE.set(domain, { data, fetchedAt: Date.now() });
    console.log(`[SimilarWeb] Fetched & cached ${domain} (rank #${data.countryRank}, traffic: ${(totalTraffic * 100).toFixed(0)}%)`);

    return data;
  } catch (err) {
    console.error(`[SimilarWeb] Fetch failed for ${domain}:`, err);
    // Fallback: tạo estimated data dựa trên mô hình ngành — phải gắn cờ
    // isEstimated để UI không hiển thị như số đo thật (endpoint SimilarWeb
    // không chính thức, dễ bị chặn/rate-limit nên fallback này có thể xảy
    // ra thường xuyên trên production).
    const mockData: SimilarWebData = { ...createEstimatedData(domain), isEstimated: true };
    SW_CACHE.set(domain, { data: mockData, fetchedAt: Date.now() });
    return mockData;
  }
}

// ── Fetch tất cả đối thủ song song ──

export async function fetchAllCompetitorsSW(): Promise<
  Array<{
    competitor: (typeof INTEL_COMPETITORS)[number];
    data: SimilarWebData | null;
    error: string | null;
  }>
> {
  const results = await Promise.allSettled(
    INTEL_COMPETITORS.map((c) => fetchSimilarWeb(c.domain))
  );

  return results.map((r, i) => ({
    competitor: INTEL_COMPETITORS[i],
    data: r.status === "fulfilled" ? r.value : null,
    error: r.status === "rejected" ? String(r.reason) : null,
  }));
}

// ── Convert traffic sources → Channel Scores 0-100 ──
// Ví dụ thực tế: pavietnam.vn
//   TrafficSources.search = 0.563 → SEO score = 56
//   TrafficSources.social = 0.005 → social base = 1
//   TrafficSources.paid   = 0.025 → display base = 3

export function toChannelScores(
  sw: SimilarWebData,
  fbAdCount: number, // số ads FB đang chạy
  ggAdCount: number, // số ads Google đang chạy
  ttAdCount: number  // số ads TikTok đang chạy
): Record<string, number> {

  // Base scores từ SimilarWeb traffic %
  const seoScore    = Math.round(sw.trafficSources.search   * 100);
  const emailScore  = Math.round(sw.trafficSources.mail     * 100);
  const directScore = Math.round(sw.trafficSources.direct   * 100);

  // FB score = social traffic + boost nếu có ads đang chạy
  const fbScore = Math.round(Math.min(100,
    Math.round(sw.trafficSources.social * 100)
    + (fbAdCount > 20 ? 40 : fbAdCount > 10 ? 25 : fbAdCount > 0 ? 10 : 0)
  ));

  // Google score = paid traffic × 3 + SEO signal + ad boost
  const ggScore = Math.round(Math.min(100,
    Math.round(sw.trafficSources.paid * 100) * 3
    + (ggAdCount > 10 ? 30 : ggAdCount > 0 ? 15 : 0)
  ));

  // TikTok — check trong topSocialNetworks
  const ttSocialShare = sw.topSocialNetworks
    ?.find(n => n.name?.toLowerCase().includes("tiktok"))
    ?.value ?? 0;

  const ttScore = Math.round(Math.min(100,
    Math.round(ttSocialShare * 100)
    + (ttAdCount > 5 ? 40 : ttAdCount > 0 ? 20 : 0)
  ));

  return {
    facebook: fbScore,
    google:   ggScore,
    tiktok:   ttScore,
    seo:      seoScore,
    email:    emailScore,
    direct:   directScore,
  };
}

// ── Helper: get latest monthly visits ──

export function getLatestVisits(sw: SimilarWebData): number {
  const entries = Object.entries(sw.monthlyVisits);
  if (entries.length === 0) return 0;
  // Sort by key (date string) desc
  entries.sort((a, b) => b[0].localeCompare(a[0]));
  return entries[0][1] ?? 0;
}

// ── Cache management ──

export function clearSWCache(): void {
  SW_CACHE.clear();
}

export function getSWCacheStatus(): {
  size: number;
  domains: string[];
} {
  return {
    size: SW_CACHE.size,
    domains: Array.from(SW_CACHE.keys()),
  };
}

// ── Estimated Data Generator (ngành Domain/Hosting VN) ──
// Sinh data ước lượng thực tế khi SimilarWeb API không trả kết quả.
// Dữ liệu được seed từ domain name để đảm bảo nhất quán mỗi lần sync.

const DOMAIN_PROFILES: Record<string, Partial<SimilarWebData>> = {
  "pavietnam.vn": {
    globalRank: 142000, countryRank: 1850, categoryRank: 45,
    category: "Computers_Electronics_and_Technology/Web_Hosting",
    trafficSources: { direct: 0.38, search: 0.35, social: 0.12, mail: 0.04, referral: 0.06, paid: 0.05 },
    bounceRate: 0.42,
  },
  "inet.vn": {
    globalRank: 98000, countryRank: 1200, categoryRank: 28,
    category: "Computers_Electronics_and_Technology/Web_Hosting",
    trafficSources: { direct: 0.32, search: 0.42, social: 0.08, mail: 0.03, referral: 0.08, paid: 0.07 },
    bounceRate: 0.38,
  },
  "vietnix.vn": {
    globalRank: 165000, countryRank: 2100, categoryRank: 52,
    category: "Computers_Electronics_and_Technology/Web_Hosting",
    trafficSources: { direct: 0.28, search: 0.45, social: 0.10, mail: 0.02, referral: 0.07, paid: 0.08 },
    bounceRate: 0.40,
  },
  "azdigi.com": {
    globalRank: 210000, countryRank: 2800, categoryRank: 68,
    category: "Computers_Electronics_and_Technology/Web_Hosting",
    trafficSources: { direct: 0.25, search: 0.48, social: 0.06, mail: 0.03, referral: 0.10, paid: 0.08 },
    bounceRate: 0.44,
  },
  "nhanhoa.com": {
    globalRank: 180000, countryRank: 2400, categoryRank: 58,
    category: "Computers_Electronics_and_Technology/Web_Hosting",
    trafficSources: { direct: 0.35, search: 0.38, social: 0.09, mail: 0.05, referral: 0.07, paid: 0.06 },
    bounceRate: 0.41,
  },
  "meinvoice.vn": {
    globalRank: 320000, countryRank: 4200, categoryRank: 120,
    category: "Computers_Electronics_and_Technology/SaaS",
    trafficSources: { direct: 0.30, search: 0.40, social: 0.15, mail: 0.06, referral: 0.05, paid: 0.04 },
    bounceRate: 0.35,
  },
};

function createEstimatedData(domain: string): SimilarWebData {
  const profile = DOMAIN_PROFILES[domain];

  // Seed nhỏ để tạo biến thiên mỗi ngày (deterministic theo domain + ngày)
  const dayStr = new Date().toISOString().slice(0, 10);
  let seed = 0;
  for (let i = 0; i < domain.length; i++) seed += domain.charCodeAt(i);
  for (let i = 0; i < dayStr.length; i++) seed += dayStr.charCodeAt(i);
  const jitter = (base: number) => {
    seed = (seed * 9301 + 49297) % 233280;
    const rnd = seed / 233280;
    return +(base * (0.9 + rnd * 0.2)).toFixed(4); // ±10% biến thiên
  };

  const ts = profile?.trafficSources || {
    direct: 0.30, search: 0.40, social: 0.10, mail: 0.03, referral: 0.08, paid: 0.09,
  };

  const now = new Date();
  const m1 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const m2 = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}-01`;
  const m3 = `${now.getFullYear()}-${String(Math.max(now.getMonth() - 1, 1)).padStart(2, "0")}-01`;

  const baseVisits = profile?.globalRank
    ? Math.floor(2_000_000_000 / (profile.globalRank + 10000))
    : 150000;

  return {
    domain,
    globalRank: profile?.globalRank ?? 200000,
    countryRank: profile?.countryRank ?? 3000,
    categoryRank: profile?.categoryRank ?? 75,
    category: profile?.category ?? "Computers_Electronics_and_Technology/Web_Hosting",
    monthlyVisits: {
      [m1]: Math.floor(jitter(baseVisits)),
      [m2]: Math.floor(jitter(baseVisits * 0.95)),
      [m3]: Math.floor(jitter(baseVisits * 0.90)),
    },
    trafficSources: {
      direct: jitter(ts.direct),
      search: jitter(ts.search),
      social: jitter(ts.social),
      mail: jitter(ts.mail),
      referral: jitter(ts.referral),
      paid: jitter(ts.paid),
    },
    topSocialNetworks: [
      { name: "Facebook", value: jitter(0.65) },
      { name: "YouTube", value: jitter(0.18) },
      { name: "TikTok", value: jitter(0.08) },
      { name: "LinkedIn", value: jitter(0.05) },
    ],
    bounceRate: jitter(profile?.bounceRate ?? 0.40),
    fetchedAt: new Date(),
  };
}

