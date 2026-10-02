// ============================================================
// So sánh 2 creative — đối đầu trực tiếp, kể cả chạy lệch thời điểm
// ============================================================
// Vì sao cần riêng, không dùng lib/ab-testing-engine.ts: engine đó chỉ ghép
// được 2 ad ĐANG CHẠY trong CÙNG một ad set và cùng khung 14 ngày — đúng cho
// A/B thật, nhưng vô dụng với câu hỏi thực tế "video người đóng chạy hồi
// tháng 6 và video AI chạy tháng 9, cái nào ăn hơn". Ở đây mỗi bên tự mang
// khung ngày sống của chính nó (date_preset=maximum), nên so được hai thứ
// không bao giờ chạy song song.
//
// Đổi lại, hai thứ không chạy song song thì KHÔNG phải một phép thử công
// bằng: khác mùa, khác giá đấu, khác tệp, khác cả mục tiêu tối ưu. Vì vậy
// mọi kết quả ở đây luôn đi kèm phần "mức độ so sánh được" — và khi dữ liệu
// chưa đủ để kết luận thì nói thẳng là chưa đủ, không cố nặn ra người thắng.

import { graphFetch, throwIfMetaError } from "@/lib/meta-client";
import { resolveConversionActionTypes, sumConversionActions } from "@/lib/meta-conversion-goal";
import { labelForStandardEvent, normalizeStandardEvent } from "@/lib/meta-pixel-events";
import { META_GRAPH_BASE } from "@/lib/meta/graph-version";

const BASE_URL = META_GRAPH_BASE;

// ─────────────────────────────────────────────
// Kiểu dữ liệu
// ─────────────────────────────────────────────

export interface CompareMetrics {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number;            // %
  cpc: number;
  cpm: number;
  conversions: number;
  conversionValue: number;
  cpa: number | null;     // null khi chưa có chuyển đổi nào
  cvr: number | null;     // % trên số click; null khi chưa có click
  roas: number | null;    // null khi sự kiện không mang giá trị tiền
}

export interface CompareVideoMetrics {
  p25: number;
  p50: number;
  p75: number;
  p100: number;
  thruplay: number;
  avgWatchSeconds: number | null;
  hookRate: number | null;       // % — p25 / impressions: ai dừng lướt
  holdRate: number | null;       // % — thruplay / p25: giữ được bao nhiêu người đã dừng
  completionRate: number | null; // % — p100 / p25
}

export type CompareLevel = "creative" | "campaign";

export interface CompareSide {
  /** "creative" = một ad; "campaign" = gộp cả chiến dịch. */
  level: CompareLevel;
  adId: string;
  adName: string;
  adStatus: string;
  campaignId: string;
  campaignName: string;
  campaignObjective: string | null;
  adSetId: string | null;
  adSetName: string | null;
  optimizationGoal: string | null;
  /** Nhãn tiếng Việt của sự kiện chuyển đổi ad set này tối ưu */
  conversionEventLabel: string | null;
  thumbnailUrl: string | null;
  isVideo: boolean;
  /** Danh tính nội dung. Cần để biết đang so NỘI DUNG hay đang so TỆP: hai ad
   *  dùng CÙNG một video mà khác ad set thì chênh lệch là do tệp, không phải
   *  do video — mà đó lại đúng là câu hỏi người dùng mở bảng này ra để hỏi. */
  creativeId: string | null;
  videoId: string | null;
  /** Chỉ có ở cấp chiến dịch: số ad và số video KHÁC NHAU bên trong.
   *  videoCount > 1 nghĩa là bên này đang trộn nhiều nội dung, nên kết luận
   *  "video nào hơn" không còn nói được gì — phải nói ra thay vì để người
   *  đọc tự đoán. */
  adCount?: number;
  videoCount?: number;
  /** Khung ngày THẬT sự có số liệu của riêng ad này */
  window: { from: string; to: string; days: number } | null;
  targeting: {
    ageMin: number | null;
    ageMax: number | null;
    genders: string;
    locations: string[];
    interestCount: number;
    interestNames: string[];
    usesAdvantage: boolean;
  };
  metrics: CompareMetrics;
  video: CompareVideoMetrics | null;
  /** Ghi chú riêng của bên này (vd không lấy được insights) */
  notes: string[];
}

export type ComparabilityLevel = "ok" | "warn" | "blocked";

export interface ComparabilityCheck {
  key: string;
  label: string;
  level: ComparabilityLevel;
  detail: string;
}

export interface MetricVerdict {
  key: string;
  label: string;
  /** Giải thích ngắn chỉ số này đo cái gì — người không làm ads vẫn hiểu */
  meaning: string;
  aValue: number | null;
  bValue: number | null;
  /** Đơn vị hiển thị */
  unit: "percent" | "currency" | "ratio" | "seconds";
  /** true khi giá trị CÀNG THẤP càng tốt (CPA, CPC, CPM) */
  lowerIsBetter: boolean;
  winner: "a" | "b" | "tie" | "unknown";
  /** Chênh lệch tương đối của bên thắng so với bên thua, % */
  deltaPercent: number | null;
  /** Độ tin cậy thống kê (%) — chỉ có với chỉ số kiểm định được */
  confidence: number | null;
  significant: boolean | null;
  /** Vì sao chưa kết luận được, khi winner = "unknown" */
  insufficientReason?: string;
}

export interface CompareResult {
  a: CompareSide;
  b: CompareSide;
  comparability: ComparabilityCheck[];
  /** Mức thấp nhất trong comparability — quyết định cách đọc kết luận */
  comparabilityLevel: ComparabilityLevel;
  verdicts: MetricVerdict[];
  /** Kết luận tổng, viết sẵn bằng tiếng Việt để dán vào báo cáo */
  summary: string;
  /** Chỉ số được dùng làm căn cứ chính cho kết luận tổng */
  decidedBy: string | null;
  /** Việc nên làm tiếp theo, suy từ chính các con số ở trên */
  recommendations: CompareRecommendation[];
  /** Bản diễn giải bằng lời — do route gắn thêm sau, không phải kết quả tính. */
  narrative?: { text: string | null; source: "ai" | "rules" | "off"; note?: string };
  warnings: string[];
}

// ─────────────────────────────────────────────
// Kiểm định hai tỷ lệ
// ─────────────────────────────────────────────

/** Kiểm định z hai tỷ lệ (pooled), cùng ngưỡng độ tin cậy với
 *  lib/ab-testing-engine.ts để hai chỗ không đưa ra hai kết luận khác nhau
 *  trên cùng một cặp số. `minTrials` chặn kết luận trên mẫu quá nhỏ. */
export function twoProportionZTest(
  successA: number, trialsA: number,
  successB: number, trialsB: number,
  minTrials: number
): { zScore: number; confidence: number; significant: boolean; enoughData: boolean } {
  if (trialsA < minTrials || trialsB < minTrials) {
    return { zScore: 0, confidence: 0, significant: false, enoughData: false };
  }
  const pA = successA / trialsA;
  const pB = successB / trialsB;
  const pooled = (successA + successB) / (trialsA + trialsB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / trialsA + 1 / trialsB));
  if (se === 0) return { zScore: 0, confidence: 0, significant: false, enoughData: true };

  const zScore = Math.abs((pB - pA) / se);
  let confidence: number;
  if (zScore >= 2.576) confidence = 99;
  else if (zScore >= 1.96) confidence = 95;
  else if (zScore >= 1.645) confidence = 90;
  else if (zScore >= 1.28) confidence = 80;
  else confidence = Math.round(zScore * 30);

  return {
    zScore,
    confidence: Math.min(confidence, 99.9),
    significant: confidence >= 90,
    enoughData: true,
  };
}

// ─────────────────────────────────────────────
// Lấy dữ liệu thật từ Meta
// ─────────────────────────────────────────────

interface ActionRow { action_type: string; value: string }

interface RawInsight {
  impressions?: string; reach?: string; frequency?: string; clicks?: string;
  spend?: string; ctr?: string; cpc?: string; cpm?: string;
  actions?: ActionRow[]; action_values?: ActionRow[];
  video_p25_watched_actions?: ActionRow[];
  video_p50_watched_actions?: ActionRow[];
  video_p75_watched_actions?: ActionRow[];
  video_p100_watched_actions?: ActionRow[];
  video_thruplay_watched_actions?: ActionRow[];
  video_avg_time_watched_actions?: ActionRow[];
  date_start?: string; date_stop?: string;
}

interface RawAd {
  id: string;
  name?: string;
  status?: string;
  adcreatives?: { data?: Array<{ id?: string; video_id?: string }> };
  campaign?: { id?: string; name?: string; objective?: string };
  adset?: {
    id?: string; name?: string;
    optimization_goal?: string;
    promoted_object?: { custom_event_type?: string; custom_conversion_id?: string };
    targeting?: {
      age_min?: number; age_max?: number; genders?: number[];
      geo_locations?: { countries?: string[]; cities?: Array<{ name?: string }>; regions?: Array<{ name?: string }> };
      flexible_spec?: Array<{ interests?: Array<{ name?: string }> }>;
      interests?: Array<{ name?: string }>;
      targeting_automation?: { advantage_audience?: number };
    };
  };
  creative?: {
    id?: string;
    thumbnail_url?: string;
    video_id?: string;
    object_story_spec?: { video_data?: { video_id?: string }; link_data?: { picture?: string } };
  };
  insights?: { data?: RawInsight[] };
  error?: { message?: string };
}

const AD_FIELDS = [
  "name", "status",
  "campaign{id,name,objective}",
  "adset{id,name,optimization_goal,promoted_object,targeting}",
  "creative{id,thumbnail_url,video_id,object_story_spec}",
  // date_preset=maximum: mỗi ad tự mang khung ngày sống của nó, nên hai ad
  // chạy cách nhau nhiều tháng vẫn ra đủ số — đây chính là chỗ engine A/B cũ
  // không làm được.
  "insights.date_preset(maximum){impressions,reach,frequency,clicks,spend,ctr,cpc,cpm,actions,action_values,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions,video_avg_time_watched_actions,date_start,date_stop}",
].join(",");

/** Cộng TOÀN BỘ dòng — chỉ dùng cho các trường video (video_p25_watched_actions…),
 *  nơi mỗi dòng là một vị trí quảng cáo khác nhau của cùng một chỉ số nên cộng
 *  hết mới ra tổng đúng. Đếm chuyển đổi thì KHÔNG được dùng hàm này: xem
 *  sumConversionActions() ở lib/meta-conversion-goal.ts. */
function sumActions(rows: ActionRow[] | undefined): number {
  if (!rows) return 0;
  return rows.reduce((s, r) => s + Number(r.value || 0), 0);
}

function daysBetween(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

function describeGenders(genders?: number[]): string {
  if (!genders || genders.length === 0 || genders.length === 2) return "Tất cả";
  if (genders[0] === 1) return "Nam";
  if (genders[0] === 2) return "Nữ";
  return "Tất cả";
}

function buildSide(raw: RawAd): CompareSide {
  const notes: string[] = [];
  const insight = raw.insights?.data?.[0];
  if (!insight) notes.push("Meta không trả về số liệu nào cho ad này (có thể chưa từng phân phối).");

  const goal = {
    optimization_goal: raw.adset?.optimization_goal,
    custom_event_type: raw.adset?.promoted_object?.custom_event_type,
  };
  // Danh sách ƯU TIÊN, không phải tập để cộng dồn — xem sumConversionActions().
  const conversionTypes = resolveConversionActionTypes(goal);

  const impressions = Number(insight?.impressions || 0);
  const clicks = Number(insight?.clicks || 0);
  const spend = Number(insight?.spend || 0);
  const conversions = sumConversionActions(insight?.actions, conversionTypes);
  // Giá trị chuyển đổi phải đi CÙNG loại hành động đã dùng để đếm số lượng,
  // nếu không thì tử số và mẫu số của ROAS nói về hai thứ khác nhau.
  const conversionValue = sumConversionActions(insight?.action_values, conversionTypes);

  const p25 = sumActions(insight?.video_p25_watched_actions);
  const p50 = sumActions(insight?.video_p50_watched_actions);
  const p75 = sumActions(insight?.video_p75_watched_actions);
  const p100 = sumActions(insight?.video_p100_watched_actions);
  const thruplay = sumActions(insight?.video_thruplay_watched_actions);
  const avgWatch = sumActions(insight?.video_avg_time_watched_actions);

  // Là video khi creative khai video HOẶC khi thật sự có lượt xem video —
  // creative dạng bài đã đăng (object_story_id) không lộ video_data ra ngoài,
  // nên chỉ nhìn creative sẽ bỏ sót đúng loại ad người dùng hay chạy nhất.
  const isVideo = Boolean(raw.creative?.video_id || raw.creative?.object_story_spec?.video_data) || p25 > 0;

  const t = raw.adset?.targeting;
  const interestNames = [
    ...(t?.interests ?? []).map((i) => i.name ?? ""),
    ...(t?.flexible_spec ?? []).flatMap((f) => (f.interests ?? []).map((i) => i.name ?? "")),
  ].filter(Boolean);

  const locations = [
    ...(t?.geo_locations?.countries ?? []),
    ...(t?.geo_locations?.regions ?? []).map((r) => r.name ?? ""),
    ...(t?.geo_locations?.cities ?? []).map((c) => c.name ?? ""),
  ].filter(Boolean);

  const eventEnum = normalizeStandardEvent(raw.adset?.promoted_object?.custom_event_type);

  return {
    level: "creative",
    adId: raw.id,
    adName: raw.name ?? raw.id,
    adStatus: raw.status ?? "UNKNOWN",
    campaignId: raw.campaign?.id ?? "",
    campaignName: raw.campaign?.name ?? "",
    campaignObjective: raw.campaign?.objective ?? null,
    adSetId: raw.adset?.id ?? null,
    adSetName: raw.adset?.name ?? null,
    optimizationGoal: raw.adset?.optimization_goal ?? null,
    conversionEventLabel: eventEnum
      ? labelForStandardEvent(eventEnum)
      : raw.adset?.promoted_object?.custom_conversion_id
        ? "Chuyển đổi tùy chỉnh"
        : null,
    thumbnailUrl: raw.creative?.thumbnail_url ?? raw.creative?.object_story_spec?.link_data?.picture ?? null,
    isVideo,
    creativeId: raw.creative?.id ?? null,
    videoId: raw.creative?.video_id ?? raw.creative?.object_story_spec?.video_data?.video_id ?? null,
    window: insight?.date_start && insight?.date_stop
      ? { from: insight.date_start, to: insight.date_stop, days: daysBetween(insight.date_start, insight.date_stop) }
      : null,
    targeting: {
      ageMin: t?.age_min ?? null,
      ageMax: t?.age_max ?? null,
      genders: describeGenders(t?.genders),
      locations,
      interestCount: interestNames.length,
      interestNames,
      usesAdvantage: t?.targeting_automation?.advantage_audience === 1,
    },
    metrics: {
      spend,
      impressions,
      reach: Number(insight?.reach || 0),
      frequency: Number(insight?.frequency || 0),
      clicks,
      ctr: Number(insight?.ctr || 0),
      cpc: Number(insight?.cpc || 0),
      cpm: Number(insight?.cpm || 0),
      conversions,
      conversionValue,
      cpa: conversions > 0 ? spend / conversions : null,
      cvr: clicks > 0 ? (conversions / clicks) * 100 : null,
      roas: conversionValue > 0 && spend > 0 ? conversionValue / spend : null,
    },
    video: isVideo
      ? {
          p25, p50, p75, p100, thruplay,
          avgWatchSeconds: avgWatch > 0 ? avgWatch : null,
          hookRate: impressions > 0 ? (p25 / impressions) * 100 : null,
          holdRate: p25 > 0 ? (thruplay / p25) * 100 : null,
          completionRate: p25 > 0 ? (p100 / p25) * 100 : null,
        }
      : null,
    notes,
  };
}

/** Lấy dữ liệu 2 ad trong MỘT lượt gọi Graph API (`?ids=`).
 *  Tài khoản đang ở bậc development access (~60 lượt/giờ) nên gộp lại thay vì
 *  gọi 4 lượt riêng lẻ là khác biệt thật, không phải tối ưu cho vui. */
export async function fetchAdCompareSnapshots(adIds: [string, string]): Promise<CompareSide[]> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN chưa cấu hình");

  const url = new URL(BASE_URL + "/");
  url.searchParams.set("ids", adIds.join(","));
  url.searchParams.set("fields", AD_FIELDS);
  url.searchParams.set("access_token", token);

  const res = await graphFetch(url.toString());
  const json = (await res.json()) as Record<string, RawAd> & { error?: { message?: string; code?: number } };
  throwIfMetaError(json);

  return adIds.map((id) => {
    const raw = json[id];
    if (!raw || raw.error) {
      throw new Error(`Không đọc được ad ${id}: ${raw?.error?.message ?? "Meta không trả về dữ liệu"}`);
    }
    return buildSide({ ...raw, id });
  });
}

// ─────────────────────────────────────────────
// Lấy dữ liệu ở CẤP CHIẾN DỊCH
// ─────────────────────────────────────────────
// Khác cấp creative ở một điểm quan trọng: một chiến dịch thường chứa NHIỀU
// video và nhiều tệp, nên số gộp lại trả lời câu "chiến dịch nào hiệu quả
// hơn" chứ KHÔNG trả lời "video nào hay hơn". Vì vậy phía dưới đếm số video
// khác nhau trong mỗi bên và cảnh báo khi > 1.

interface RawCampaign {
  id: string;
  name?: string;
  status?: string;
  objective?: string;
  adsets?: { data?: Array<NonNullable<RawAd["adset"]>> };
  ads?: { data?: Array<{ id?: string; creative?: RawAd["creative"] }> };
  insights?: { data?: RawInsight[] };
  error?: { message?: string };
}

const CAMPAIGN_FIELDS = [
  "name", "status", "objective",
  "adsets.limit(50){id,name,optimization_goal,promoted_object,targeting}",
  "ads.limit(100){id,creative{id,video_id,object_story_spec}}",
  "insights.date_preset(maximum){impressions,reach,frequency,clicks,spend,ctr,cpc,cpm,actions,action_values,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions,video_avg_time_watched_actions,date_start,date_stop}",
].join(",");

function buildCampaignSide(raw: RawCampaign): CompareSide {
  const notes: string[] = [];
  const insight = raw.insights?.data?.[0];
  if (!insight) notes.push(`Chiến dịch "${raw.name ?? raw.id}" chưa có số liệu phân phối nào.`);

  // Mục tiêu chuyển đổi lấy từ ad set ĐẦU TIÊN, cùng quy ước với
  // buildGoalByCampaignMap() ở lib/meta-conversion-goal.ts (Meta cũng coi một
  // chiến dịch là một mục tiêu). Nếu các ad set khác mục tiêu nhau thì phần
  // "Mức độ so sánh được" sẽ lộ ra qua nhãn sự kiện khác nhau giữa hai bên.
  const firstAdSet = raw.adsets?.data?.[0];
  const goal = {
    optimization_goal: firstAdSet?.optimization_goal,
    custom_event_type: firstAdSet?.promoted_object?.custom_event_type,
  };
  const conversionTypes = resolveConversionActionTypes(goal);

  const impressions = Number(insight?.impressions || 0);
  const clicks = Number(insight?.clicks || 0);
  const spend = Number(insight?.spend || 0);
  const conversions = sumConversionActions(insight?.actions, conversionTypes);
  const conversionValue = sumConversionActions(insight?.action_values, conversionTypes);

  const p25 = sumActions(insight?.video_p25_watched_actions);
  const p50 = sumActions(insight?.video_p50_watched_actions);
  const p75 = sumActions(insight?.video_p75_watched_actions);
  const p100 = sumActions(insight?.video_p100_watched_actions);
  const thruplay = sumActions(insight?.video_thruplay_watched_actions);
  const avgWatch = sumActions(insight?.video_avg_time_watched_actions);

  const ads = raw.ads?.data ?? [];
  const videoIds = new Set(
    ads
      .map((ad) => ad.creative?.video_id ?? ad.creative?.object_story_spec?.video_data?.video_id)
      .filter((x): x is string => Boolean(x))
  );
  const isVideo = videoIds.size > 0 || p25 > 0;

  const t = firstAdSet?.targeting;
  const interestNames = [
    ...(t?.interests ?? []).map((i) => i.name ?? ""),
    ...(t?.flexible_spec ?? []).flatMap((f) => (f.interests ?? []).map((i) => i.name ?? "")),
  ].filter(Boolean);
  const locations = [
    ...(t?.geo_locations?.countries ?? []),
    ...(t?.geo_locations?.regions ?? []).map((r) => r.name ?? ""),
    ...(t?.geo_locations?.cities ?? []).map((c) => c.name ?? ""),
  ].filter(Boolean);

  const eventEnum = normalizeStandardEvent(firstAdSet?.promoted_object?.custom_event_type);
  const adSetCount = raw.adsets?.data?.length ?? 0;

  return {
    level: "campaign",
    adId: raw.id,
    adName: raw.name ?? raw.id,
    adStatus: raw.status ?? "UNKNOWN",
    campaignId: raw.id,
    campaignName: raw.name ?? raw.id,
    campaignObjective: raw.objective ?? null,
    adSetId: null,
    adSetName: adSetCount > 0 ? `${adSetCount} nhóm quảng cáo` : null,
    optimizationGoal: firstAdSet?.optimization_goal ?? null,
    conversionEventLabel: eventEnum
      ? labelForStandardEvent(eventEnum)
      : firstAdSet?.promoted_object?.custom_conversion_id
        ? "Chuyển đổi tùy chỉnh"
        : null,
    thumbnailUrl: ads[0]?.creative?.thumbnail_url ?? null,
    isVideo,
    // Chỉ coi là "một video xác định" khi cả chiến dịch đúng một video —
    // nhiều hơn thì để null, vì lúc đó không có "video của bên này" nào cả.
    creativeId: null,
    videoId: videoIds.size === 1 ? [...videoIds][0] : null,
    adCount: ads.length,
    videoCount: videoIds.size,
    window: insight?.date_start && insight?.date_stop
      ? { from: insight.date_start, to: insight.date_stop, days: daysBetween(insight.date_start, insight.date_stop) }
      : null,
    targeting: {
      ageMin: t?.age_min ?? null,
      ageMax: t?.age_max ?? null,
      genders: describeGenders(t?.genders),
      locations,
      interestCount: interestNames.length,
      interestNames,
      usesAdvantage: t?.targeting_automation?.advantage_audience === 1,
    },
    metrics: {
      spend, impressions,
      reach: Number(insight?.reach || 0),
      frequency: Number(insight?.frequency || 0),
      clicks,
      ctr: Number(insight?.ctr || 0),
      cpc: Number(insight?.cpc || 0),
      cpm: Number(insight?.cpm || 0),
      conversions, conversionValue,
      cpa: conversions > 0 ? spend / conversions : null,
      cvr: clicks > 0 ? (conversions / clicks) * 100 : null,
      roas: conversionValue > 0 && spend > 0 ? conversionValue / spend : null,
    },
    video: isVideo
      ? {
          p25, p50, p75, p100, thruplay,
          avgWatchSeconds: avgWatch > 0 ? avgWatch : null,
          hookRate: impressions > 0 ? (p25 / impressions) * 100 : null,
          holdRate: p25 > 0 ? (thruplay / p25) * 100 : null,
          completionRate: p25 > 0 ? (p100 / p25) * 100 : null,
        }
      : null,
    notes,
  };
}

export async function fetchCampaignCompareSnapshots(campaignIds: [string, string]): Promise<CompareSide[]> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN chưa cấu hình");

  const url = new URL(BASE_URL + "/");
  url.searchParams.set("ids", campaignIds.join(","));
  url.searchParams.set("fields", CAMPAIGN_FIELDS);
  url.searchParams.set("access_token", token);

  const res = await graphFetch(url.toString());
  const json = (await res.json()) as Record<string, RawCampaign> & { error?: { message?: string; code?: number } };
  throwIfMetaError(json);

  return campaignIds.map((id) => {
    const raw = json[id];
    if (!raw || raw.error) {
      throw new Error(`Không đọc được chiến dịch ${id}: ${raw?.error?.message ?? "Meta không trả về dữ liệu"}`);
    }
    return buildCampaignSide({ ...raw, id });
  });
}

// ─────────────────────────────────────────────
// Mức độ so sánh được
// ─────────────────────────────────────────────

function overlapDays(a: CompareSide, b: CompareSide): number | null {
  if (!a.window || !b.window) return null;
  const start = Math.max(new Date(a.window.from).getTime(), new Date(b.window.from).getTime());
  const end = Math.min(new Date(a.window.to).getTime(), new Date(b.window.to).getTime());
  if (end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

function jaccard(a: string[], b: string[]): number | null {
  if (a.length === 0 && b.length === 0) return null;
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  const inter = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? null : inter / union;
}

export function assessComparability(a: CompareSide, b: CompareSide): ComparabilityCheck[] {
  const checks: ComparabilityCheck[] = [];

  // 1. Mục tiêu chiến dịch — khác mục tiêu thì Meta phân phối theo hai logic
  //    khác hẳn nhau, so CPA gần như vô nghĩa.
  checks.push(
    a.campaignObjective === b.campaignObjective
      ? { key: "objective", label: "Mục tiêu chiến dịch", level: "ok", detail: `Cùng ${a.campaignObjective ?? "không rõ"}` }
      : { key: "objective", label: "Mục tiêu chiến dịch", level: "blocked", detail: `Khác nhau: ${a.campaignObjective ?? "?"} vs ${b.campaignObjective ?? "?"} — Meta tối ưu theo hai hướng khác nhau, đừng so chi phí/kết quả giữa hai bên.` }
  );

  // 2. Sự kiện chuyển đổi — nếu khác, "kết quả" của hai bên đếm hai thứ khác nhau.
  const evA = a.conversionEventLabel, evB = b.conversionEventLabel;
  checks.push(
    evA === evB
      ? { key: "event", label: "Sự kiện chuyển đổi", level: "ok", detail: evA ? `Cùng đếm "${evA}"` : "Cả hai đều không tối ưu theo sự kiện chuyển đổi" }
      : { key: "event", label: "Sự kiện chuyển đổi", level: "blocked", detail: `Khác nhau: "${evA ?? "không có"}" vs "${evB ?? "không có"}" — cột chuyển đổi/CPA của hai bên đang đếm hai loại hành động khác nhau, không cộng trừ được với nhau.` }
  );

  // 3. Tệp đối tượng
  const sim = jaccard(a.targeting.interestNames, b.targeting.interestNames);
  const sameAge = a.targeting.ageMin === b.targeting.ageMin && a.targeting.ageMax === b.targeting.ageMax;
  const sameGender = a.targeting.genders === b.targeting.genders;
  if (a.adSetId && a.adSetId === b.adSetId) {
    checks.push({ key: "audience", label: "Tệp đối tượng", level: "ok", detail: "Cùng một ad set — đây là phép so sạch nhất: cùng tệp, cùng ngân sách, cùng lịch chạy." });
  } else if (sim !== null && sim >= 0.6 && sameAge && sameGender) {
    checks.push({ key: "audience", label: "Tệp đối tượng", level: "ok", detail: `Gần giống nhau (trùng ${Math.round(sim * 100)}% sở thích, cùng ${a.targeting.ageMin}-${a.targeting.ageMax} tuổi, ${a.targeting.genders}).` });
  } else {
    const bits: string[] = [];
    if (!sameAge) bits.push(`tuổi ${a.targeting.ageMin}-${a.targeting.ageMax} vs ${b.targeting.ageMin}-${b.targeting.ageMax}`);
    if (!sameGender) bits.push(`giới tính ${a.targeting.genders} vs ${b.targeting.genders}`);
    if (sim !== null && sim < 0.6) bits.push(`sở thích chỉ trùng ${Math.round(sim * 100)}%`);
    if (a.targeting.usesAdvantage !== b.targeting.usesAdvantage) bits.push("một bên dùng Advantage+ còn bên kia thì không");
    checks.push({ key: "audience", label: "Tệp đối tượng", level: "warn", detail: bits.length ? `Khác nhau: ${bits.join("; ")} — chênh lệch có thể do tệp chứ không phải do video.` : "Hai ad set khác nhau, không đối chiếu được chi tiết tệp." });
  }

  // 4. Thời điểm chạy — hai video đổi nhau theo thời gian thì gần như chắc
  //    chắn không chồng lấn; đây là hạn chế cố hữu chứ không phải lỗi.
  const ov = overlapDays(a, b);
  if (ov === null) {
    checks.push({ key: "time", label: "Thời điểm chạy", level: "warn", detail: "Thiếu khung ngày của ít nhất một bên." });
  } else if (ov > 0) {
    checks.push({ key: "time", label: "Thời điểm chạy", level: "ok", detail: `Chồng lấn ${ov} ngày — cùng chịu một bối cảnh thị trường.` });
  } else {
    checks.push({ key: "time", label: "Thời điểm chạy", level: "warn", detail: `Không chồng lấn ngày nào (${a.window?.from}→${a.window?.to} vs ${b.window?.from}→${b.window?.to}) — chênh lệch có thể đến từ mùa vụ, giá đấu hoặc cạnh tranh thay đổi, không hẳn do nội dung video.` });
  }

  // 5. Quy mô chi tiêu — chênh quá lớn thì bên tiêu ít có thể còn trong giai
  //    đoạn học máy, số liệu chưa ổn định.
  const [lo, hi] = [a.metrics.spend, b.metrics.spend].sort((x, y) => x - y);
  const ratio = lo > 0 ? hi / lo : Infinity;
  if (!Number.isFinite(ratio)) {
    checks.push({ key: "spend", label: "Quy mô chi tiêu", level: "warn", detail: "Một bên chưa tiêu đồng nào." });
  } else if (ratio <= 2) {
    checks.push({ key: "spend", label: "Quy mô chi tiêu", level: "ok", detail: `Lệch ${ratio.toFixed(1)} lần — chấp nhận được.` });
  } else {
    checks.push({ key: "spend", label: "Quy mô chi tiêu", level: "warn", detail: `Lệch tới ${ratio.toFixed(1)} lần — bên tiêu ít hơn có thể chưa qua giai đoạn học máy nên số chưa ổn định.` });
  }

  // 6. Nội dung — điều đầu tiên phải biết mà bảng này từng KHÔNG nói.
  //    Hai ad dùng chung một video thì mọi chênh lệch là do TỆP/ngân sách, và
  //    kết luận "video nào ăn hơn" trở thành vô nghĩa. Đây đúng là ca hay gặp
  //    khi hai ad nằm trong cùng một chiến dịch, khác ad set.
  const sameVideo = Boolean(a.videoId && b.videoId && a.videoId === b.videoId);
  const sameCreative = Boolean(a.creativeId && b.creativeId && a.creativeId === b.creativeId);
  const mixedSides = [a, b].filter((s) => (s.videoCount ?? 0) > 1);
  if (mixedSides.length > 0) {
    // Ở cấp chiến dịch, gộp nhiều video vào một con số thì con số đó nói về
    // CHIẾN DỊCH, không nói về video nào cả. Phải chặn cách đọc sai này ngay.
    checks.push({
      key: "creative", label: "Nội dung quảng cáo", level: "warn",
      detail: `${mixedSides.map((s) => `"${s.adName}" chứa ${s.videoCount} video khác nhau`).join("; ")} — số liệu gộp lại trả lời "chiến dịch nào hiệu quả hơn", KHÔNG trả lời "video nào hay hơn". Muốn so video thì chuyển sang so ở cấp creative.`,
    });
  } else if (sameVideo || sameCreative) {
    checks.push({
      key: "creative", label: "Nội dung quảng cáo", level: "warn",
      detail: `Hai bên dùng CÙNG một ${sameVideo ? "video" : "nội dung"} — vậy đây là phép so TỆP ĐỐI TƯỢNG / cách phân phối, KHÔNG phải so nội dung. Đừng dùng bảng này để kết luận video nào hay hơn.`,
    });
  } else if (a.videoId && b.videoId) {
    checks.push({ key: "creative", label: "Nội dung quảng cáo", level: "ok", detail: "Hai video khác nhau — so nội dung được." });
  } else {
    checks.push({ key: "creative", label: "Nội dung quảng cáo", level: "warn", detail: "Không đọc được mã video của ít nhất một bên, nên không khẳng định được hai bên khác nội dung hay dùng chung một nội dung." });
  }

  // 7. Định dạng — hook/hold chỉ có nghĩa khi cả hai đều là video.
  if (a.isVideo && b.isVideo) {
    checks.push({ key: "format", label: "Định dạng", level: "ok", detail: "Cả hai đều là video — so được tỷ lệ giữ chân người xem." });
  } else {
    checks.push({ key: "format", label: "Định dạng", level: "warn", detail: `${a.isVideo ? "Chỉ bên A" : b.isVideo ? "Chỉ bên B" : "Không bên nào"} là video — các chỉ số giữ chân người xem sẽ bị bỏ qua.` });
  }

  return checks;
}

// ─────────────────────────────────────────────
// Kết luận từng chỉ số
// ─────────────────────────────────────────────

/** Ngưỡng mẫu tối thiểu. Không phải con số đẹp: dưới mức này phép kiểm định z
 *  hai tỷ lệ mất tính chính xác, và một chênh lệch 30% trên 200 lượt hiển thị
 *  hoàn toàn có thể là ngẫu nhiên. Thà báo "chưa đủ dữ liệu". */
const MIN_IMPRESSIONS = 1000;
const MIN_CLICKS = 50;
const MIN_P25 = 200;
/** Dưới mức này thì CPA/ROAS chỉ là nhiễu — một chuyển đổi lệch là đổi ngôi. */
const MIN_CONVERSIONS_FOR_CPA = 10;
/** Chỉ số không kiểm định thống kê được (CPA, CPM, ROAS) phải chênh ÍT NHẤT
 *  ngần này mới được trao phần thắng.
 *
 *  Vì sao cần: không có kiểm định thì mọi chênh lệch đều "thắng", nên CPM lệch
 *  2% cũng được gắn cúp y như CPA lệch 29% — người đọc lướt qua sẽ tưởng đó là
 *  hai kết luận ngang sức nhau. 10% là mức mà một khác biệt còn có ý nghĩa khi
 *  ra quyết định tiêu tiền; dưới đó gọi là ngang nhau cho đúng bản chất. */
const MIN_DELTA_WITHOUT_TEST = 10;

function ratioDelta(winner: number, loser: number): number | null {
  if (loser === 0) return null;
  return ((winner - loser) / loser) * 100;
}

function makeVerdict(
  key: string, label: string, meaning: string,
  aValue: number | null, bValue: number | null,
  unit: MetricVerdict["unit"], lowerIsBetter: boolean,
  test?: { confidence: number; significant: boolean; enoughData: boolean },
  insufficientReason?: string,
): MetricVerdict {
  const base: MetricVerdict = {
    key, label, meaning, aValue, bValue, unit, lowerIsBetter,
    winner: "unknown", deltaPercent: null,
    confidence: test?.enoughData ? test.confidence : null,
    significant: test?.enoughData ? test.significant : null,
  };

  if (aValue === null || bValue === null) {
    return { ...base, insufficientReason: insufficientReason ?? "Thiếu số liệu ở ít nhất một bên." };
  }
  if (test && !test.enoughData) {
    return { ...base, insufficientReason: insufficientReason ?? "Mẫu quá nhỏ để kết luận." };
  }
  if (aValue === bValue) return { ...base, winner: "tie", deltaPercent: 0 };

  const aBetter = lowerIsBetter ? aValue < bValue : aValue > bValue;
  const [hi, lo] = aBetter ? [aValue, bValue] : [bValue, aValue];
  const delta = lowerIsBetter ? ratioDelta(lo, hi) : ratioDelta(hi, lo);

  // Có kiểm định mà chưa đạt ý nghĩa thống kê thì KHÔNG trao phần thắng —
  // đây đúng là chỗ dễ nhất để một chênh lệch ngẫu nhiên bị đọc thành kết luận.
  // Không có kiểm định + chênh lệch nhỏ ⇒ coi như ngang nhau, không trao cúp.
  if (!test && delta !== null && Math.abs(delta) < MIN_DELTA_WITHOUT_TEST) {
    return {
      ...base,
      winner: "tie",
      deltaPercent: Math.abs(delta),
      insufficientReason: `Chỉ chênh ${Math.abs(delta).toFixed(0)}% và chỉ số này không kiểm định thống kê được — chưa đủ để coi là hơn kém.`,
    };
  }

  if (test && !test.significant) {
    return {
      ...base,
      winner: "unknown",
      deltaPercent: delta === null ? null : Math.abs(delta),
      insufficientReason: `Chênh lệch ${delta === null ? "" : Math.abs(delta).toFixed(0) + "% "}chưa đạt mức tin cậy 90% — vẫn có thể là ngẫu nhiên.`,
    };
  }

  return { ...base, winner: aBetter ? "a" : "b", deltaPercent: delta === null ? null : Math.abs(delta) };
}

export function buildVerdicts(a: CompareSide, b: CompareSide): MetricVerdict[] {
  const verdicts: MetricVerdict[] = [];
  const ma = a.metrics, mb = b.metrics;

  if (a.isVideo && b.isVideo && a.video && b.video) {
    verdicts.push(makeVerdict(
      "hookRate", "Tỷ lệ giữ chân 3 giây đầu",
      "Bao nhiêu người nhìn thấy quảng cáo thì dừng lướt lại xem. Đo sức hút của mấy giây mở đầu.",
      a.video.hookRate, b.video.hookRate, "percent", false,
      twoProportionZTest(a.video.p25, ma.impressions, b.video.p25, mb.impressions, MIN_IMPRESSIONS),
      `Cần tối thiểu ${MIN_IMPRESSIONS.toLocaleString("vi-VN")} lượt hiển thị mỗi bên.`
    ));
    verdicts.push(makeVerdict(
      "holdRate", "Tỷ lệ xem hết (ThruPlay)",
      "Trong số người đã dừng lại xem, bao nhiêu người xem tới 15 giây hoặc hết video. Đo sức giữ của nội dung.",
      a.video.holdRate, b.video.holdRate, "percent", false,
      twoProportionZTest(a.video.thruplay, a.video.p25, b.video.thruplay, b.video.p25, MIN_P25),
      `Cần tối thiểu ${MIN_P25} lượt xem 25% mỗi bên.`
    ));
    verdicts.push(makeVerdict(
      "completionRate", "Tỷ lệ xem trọn video",
      "Trong số người đã dừng lại xem, bao nhiêu người xem đến giây cuối.",
      a.video.completionRate, b.video.completionRate, "percent", false,
      twoProportionZTest(a.video.p100, a.video.p25, b.video.p100, b.video.p25, MIN_P25),
      `Cần tối thiểu ${MIN_P25} lượt xem 25% mỗi bên.`
    ));
  }

  verdicts.push(makeVerdict(
    "ctr", "Tỷ lệ nhấp (CTR)",
    "Bao nhiêu người nhìn thấy thì bấm vào. Đo mức độ video thuyết phục người ta hành động.",
    ma.ctr || null, mb.ctr || null, "percent", false,
    twoProportionZTest(ma.clicks, ma.impressions, mb.clicks, mb.impressions, MIN_IMPRESSIONS),
    `Cần tối thiểu ${MIN_IMPRESSIONS.toLocaleString("vi-VN")} lượt hiển thị mỗi bên.`
  ));

  verdicts.push(makeVerdict(
    "cvr", "Tỷ lệ chuyển đổi trên click",
    "Trong số người đã bấm vào, bao nhiêu người thực hiện hành động mục tiêu.",
    ma.cvr, mb.cvr, "percent", false,
    twoProportionZTest(ma.conversions, ma.clicks, mb.conversions, mb.clicks, MIN_CLICKS),
    `Cần tối thiểu ${MIN_CLICKS} lượt click mỗi bên.`
  ));

  const enoughConv = ma.conversions >= MIN_CONVERSIONS_FOR_CPA && mb.conversions >= MIN_CONVERSIONS_FOR_CPA;
  verdicts.push(makeVerdict(
    "cpa", "Chi phí mỗi kết quả",
    "Trung bình tốn bao nhiêu tiền để có một kết quả. Đây là chỉ số quyết định về mặt tiền bạc.",
    ma.cpa, mb.cpa, "currency", true,
    enoughConv ? undefined : { confidence: 0, significant: false, enoughData: false },
    `Cần tối thiểu ${MIN_CONVERSIONS_FOR_CPA} kết quả mỗi bên (hiện có ${ma.conversions} và ${mb.conversions}).`
  ));

  verdicts.push(makeVerdict(
    "cpm", "Chi phí mỗi 1.000 lượt hiển thị",
    "Giá mua sự chú ý. Chênh lệch lớn thường do đấu giá/thời điểm chứ không do nội dung.",
    ma.cpm || null, mb.cpm || null, "currency", true
  ));

  if (ma.roas !== null || mb.roas !== null) {
    verdicts.push(makeVerdict(
      "roas", "Doanh thu trên chi phí (ROAS)",
      "Một đồng quảng cáo mang về mấy đồng doanh thu.",
      ma.roas, mb.roas, "ratio", false,
      enoughConv ? undefined : { confidence: 0, significant: false, enoughData: false },
      `Cần tối thiểu ${MIN_CONVERSIONS_FOR_CPA} kết quả có giá trị tiền ở mỗi bên.`
    ));
  }

  return verdicts;
}

// ─────────────────────────────────────────────
// Ghép kết quả
// ─────────────────────────────────────────────

const LEVEL_RANK: Record<ComparabilityLevel, number> = { ok: 0, warn: 1, blocked: 2 };

export function buildComparison(a: CompareSide, b: CompareSide): CompareResult {
  const comparability = assessComparability(a, b);
  const comparabilityLevel = comparability.reduce<ComparabilityLevel>(
    (worst, c) => (LEVEL_RANK[c.level] > LEVEL_RANK[worst] ? c.level : worst),
    "ok"
  );
  const verdicts = buildVerdicts(a, b);
  const warnings = [...a.notes, ...b.notes];

  const nameOf = (side: "a" | "b") => (side === "a" ? a.adName : b.adName);

  // Thứ tự ưu tiên khi chốt: tiền trước, hành động sau, chú ý sau cùng. CPM
  // cố tình không nằm trong danh sách — nó nói về giá đấu chứ không nói ai
  // làm nội dung tốt hơn.
  const priority = ["cpa", "roas", "cvr", "ctr", "hookRate", "holdRate"];
  const decisive = priority
    .map((k) => verdicts.find((v) => v.key === k))
    .find((v) => v && (v.winner === "a" || v.winner === "b"));

  let summary: string;
  if (comparability.some((c) => c.level === "blocked")) {
    const blocked = comparability.filter((c) => c.level === "blocked").map((c) => c.label.toLowerCase());
    summary = `Chưa nên kết luận: hai bên khác nhau ở ${blocked.join(" và ")}, nên các con số không đặt cạnh nhau được. Muốn so cho ra ngô ra khoai, hãy chạy lại hai video trong cùng một ad set (cùng tệp, cùng mục tiêu, cùng thời gian).`;
  } else if (!decisive) {
    const closest = verdicts.find((v) => v.deltaPercent !== null && v.winner === "unknown");
    summary = `Chưa đủ căn cứ để chọn video nào. ${closest?.insufficientReason ?? "Các chênh lệch hiện có đều nằm trong khoảng có thể do ngẫu nhiên."} Cần chạy thêm để tích đủ dữ liệu, hoặc cho hai video chạy song song trong cùng một ad set.`;
  } else {
    const winnerName = nameOf(decisive.winner as "a" | "b");
    const delta = decisive.deltaPercent !== null ? ` (${decisive.deltaPercent.toFixed(0)}% ${decisive.lowerIsBetter ? "rẻ hơn" : "cao hơn"})` : "";
    const conf = decisive.confidence !== null ? `, độ tin cậy ${decisive.confidence}%` : "";

    // Hai thước đo tiền có thể chỉ về hai hướng NGƯỢC NHAU: rẻ hơn mỗi kết quả
    // (CPA) không có nghĩa là mang về nhiều tiền hơn mỗi đồng bỏ ra (ROAS) —
    // bên kia có thể ít đơn nhưng đơn to hơn. Trước đây bảng này lặng lẽ lấy
    // CPA làm chuẩn và tuyên bố người thắng, giấu mất chuyện ROAS nói ngược.
    // Với người chạy mục tiêu doanh số thì đó là giấu đúng phần quan trọng nhất.
    const cpaV = verdicts.find((v) => v.key === "cpa");
    const roasV = verdicts.find((v) => v.key === "roas");
    let conflict = "";
    if (
      cpaV && roasV &&
      (cpaV.winner === "a" || cpaV.winner === "b") &&
      (roasV.winner === "a" || roasV.winner === "b") &&
      cpaV.winner !== roasV.winner
    ) {
      conflict =
        ` ⚠️ Nhưng hai thước đo tiền đang nói ngược nhau: “${nameOf(cpaV.winner as "a" | "b")}” rẻ hơn mỗi kết quả, còn “${nameOf(roasV.winner as "a" | "b")}” lại mang về nhiều doanh thu hơn trên mỗi đồng chi (ROAS ${roasV.aValue?.toFixed(1)}x vs ${roasV.bValue?.toFixed(1)}x).` +
        ` Nếu bạn tính theo doanh thu thì chọn theo ROAS, còn nếu tính theo số đơn/số khách thì chọn theo chi phí mỗi kết quả — bảng này không tự quyết thay bạn được.`;
    }

    const caveat = comparabilityLevel === "warn"
      ? " Lưu ý phần “Mức độ so sánh được” bên dưới — vẫn còn khác biệt về bối cảnh có thể góp phần vào chênh lệch này."
      : "";
    summary = `“${winnerName}” đang nhỉnh hơn, xét theo ${decisive.label.toLowerCase()}${delta}${conf}.${conflict}${caveat}`;
  }

  return {
    a, b, comparability, comparabilityLevel, verdicts, summary,
    decidedBy: decisive?.key ?? null,
    recommendations: buildRecommendations(a, b, verdicts, comparability),
    warnings,
  };
}

// ─────────────────────────────────────────────
// Việc nên làm tiếp theo
// ─────────────────────────────────────────────
// Suy hoàn toàn từ các con số ngay trên bảng — mỗi câu đều kèm `evidence` là
// đúng những số đã dùng để rút ra nó, để người đọc kiểm lại được chứ không
// phải tin suông. Cố ý KHÔNG có mô hình nào đoán mò ở đây: lời khuyên sai
// trong quảng cáo là tiền thật.
//
// Các mốc bên dưới là mốc THAM CHIẾU chung của quảng cáo video Meta, không
// phải chuẩn riêng của tài khoản này — nên chúng chỉ dùng để GỢI Ý chỗ cần
// nhìn, và luôn được phát biểu kèm con số thật để người đọc tự đối chiếu.

export interface CompareRecommendation {
  key: string;
  /** 1 = làm trước */
  priority: number;
  title: string;
  /** Vì sao — luôn dẫn số thật */
  evidence: string;
  /** Làm gì */
  action: string;
}

/** Mốc tham chiếu quảng cáo video Meta. Đặt tên rõ là "tham chiếu" vì đây
 *  KHÔNG phải ngưỡng riêng của tài khoản — chỉ để chỉ chỗ đáng nhìn. */
const REF_HOOK_RATE_WEAK = 15;   // % người nhìn thấy mà dừng lại xem
const REF_HOLD_RATE_WEAK = 40;   // % người đã dừng mà xem tới ThruPlay
const REF_FREQUENCY_HIGH = 3;    // lần/người — trên mức này thường bắt đầu chán
const REF_CTR_DECENT = 1;        // %

/** Cỡ mẫu tối thiểu mỗi bên để phân biệt được hai tỷ lệ p1/p2 ở mức tin cậy
 *  90%, lực kiểm định 80% — công thức chuẩn cho kiểm định hai tỷ lệ.
 *  Dùng để trả lời câu "còn thiếu bao nhiêu nữa mới kết luận được", thay vì
 *  chỉ nói chung chung "chưa đủ dữ liệu". */
export function requiredSamplePerSide(p1: number, p2: number): number | null {
  if (p1 <= 0 || p2 <= 0 || p1 >= 1 || p2 >= 1) return null;
  const diff = Math.abs(p1 - p2);
  if (diff < 1e-9) return null;
  const zAlpha = 1.645; // 90%
  const zBeta = 0.84;   // lực 80%
  const n = Math.pow(zAlpha + zBeta, 2) * (p1 * (1 - p1) + p2 * (1 - p2)) / Math.pow(diff, 2);
  return Math.ceil(n);
}

const fmtInt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtPct = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)}%`);
const fmtVnd = (n: number | null) => (n === null ? "—" : `₫${Math.round(n).toLocaleString("vi-VN")}`);

export function buildRecommendations(
  a: CompareSide,
  b: CompareSide,
  verdicts: MetricVerdict[],
  comparability: ComparabilityCheck[],
): CompareRecommendation[] {
  const recs: CompareRecommendation[] = [];
  const v = (k: string) => verdicts.find((x) => x.key === k);
  const nameOf = (s: "a" | "b") => (s === "a" ? a.adName : b.adName);

  // ── 1. Phép so không sạch thì việc đầu tiên là làm cho nó sạch ──
  const blocked = comparability.filter((c) => c.level === "blocked");
  if (blocked.length > 0) {
    recs.push({
      key: "run-clean-test", priority: 1,
      title: "Chạy lại một phép so sạch trước khi tin bất kỳ con số nào",
      evidence: `Hai bên đang khác nhau ở ${blocked.map((c) => c.label.toLowerCase()).join(" và ")}.`,
      action: "Đưa hai video vào CÙNG một ad set (cùng tệp, cùng mục tiêu, cùng ngân sách, cùng khoảng thời gian), để Meta tự chia lượt hiển thị. Đó là cách duy nhất tách được ảnh hưởng của nội dung khỏi ảnh hưởng của tệp.",
    });
  }
  const sameCreative = comparability.find((c) => c.key === "creative" && c.level === "warn" && c.detail.includes("CÙNG"));
  if (sameCreative) {
    recs.push({
      key: "same-creative", priority: 1,
      title: "Bảng này đang KHÔNG so nội dung",
      evidence: "Hai bên dùng chung một video, chỉ khác tệp đối tượng.",
      action: "Muốn biết video nào ăn hơn thì phải có hai video KHÁC nhau. Còn muốn biết tệp nào ăn hơn thì bảng này đang trả lời đúng — chỉ cần đọc nó theo nghĩa đó.",
    });
  }

  // ── 2. Chưa đủ dữ liệu: nói rõ còn thiếu bao nhiêu ──
  const ctr = v("ctr");
  if (ctr && ctr.winner === "unknown" && a.metrics.impressions > 0 && b.metrics.impressions > 0) {
    const need = requiredSamplePerSide(
      a.metrics.clicks / a.metrics.impressions,
      b.metrics.clicks / b.metrics.impressions,
    );
    const have = Math.min(a.metrics.impressions, b.metrics.impressions);
    if (need && need > have) {
      recs.push({
        key: "need-more-data", priority: 2,
        title: "Cần chạy thêm mới kết luận được về tỷ lệ nhấp",
        evidence: `CTR hiện ${fmtPct(a.metrics.ctr)} vs ${fmtPct(b.metrics.ctr)}. Với khoảng cách nhỏ như vậy, cần khoảng ${fmtInt(need)} lượt hiển thị mỗi bên mới phân biệt được thật hay ngẫu nhiên; bên ít hơn mới có ${fmtInt(have)}.`,
        action: `Chạy tiếp tới khi mỗi bên đạt ~${fmtInt(need)} lượt hiển thị, hoặc chấp nhận rằng hai video ngang nhau ở chỉ số này và chọn theo tiêu chí khác.`,
      });
    } else if (need) {
      recs.push({
        key: "ctr-equal", priority: 4,
        title: "Hai video ngang nhau về tỷ lệ nhấp",
        evidence: `CTR ${fmtPct(a.metrics.ctr)} vs ${fmtPct(b.metrics.ctr)}, đã đủ mẫu nhưng chênh lệch không đạt mức tin cậy 90%.`,
        action: "Đừng chọn video dựa trên CTR ở đây. Chọn theo chi phí mỗi kết quả hoặc ROAS.",
      });
    }
  }

  // ── 3. Chẩn đoán theo phễu: hỏng ở khúc nào thì sửa đúng khúc đó ──
  for (const [side, s] of [["A", a], ["B", b]] as const) {
    if (!s.video) continue;
    const hook = s.video.hookRate;
    const hold = s.video.holdRate;
    if (hook !== null && hook < REF_HOOK_RATE_WEAK) {
      recs.push({
        key: `hook-${side}`, priority: 2,
        title: `“${s.adName}”: mất người xem ngay 3 giây đầu`,
        evidence: `Chỉ ${fmtPct(hook)} người nhìn thấy quảng cáo dừng lại xem (mốc tham chiếu ~${REF_HOOK_RATE_WEAK}%).`,
        action: "Sửa 3 giây mở đầu: đưa vấn đề/lợi ích lên ngay khung hình đầu, bỏ intro thương hiệu, thêm chữ lớn trên hình vì phần lớn người xem tắt tiếng.",
      });
    } else if (hook !== null && hold !== null && hold < REF_HOLD_RATE_WEAK) {
      recs.push({
        key: `hold-${side}`, priority: 3,
        title: `“${s.adName}”: vào đề tốt nhưng thân video rớt người xem`,
        evidence: `Giữ chân 3 giây đầu đạt ${fmtPct(hook)} nhưng chỉ ${fmtPct(hold)} trong số đó xem tới ThruPlay.`,
        action: "Cắt ngắn đoạn giữa, dồn thông tin quan trọng lên sớm hơn, hoặc cắt hẳn thành phiên bản ngắn dưới 15 giây.",
      });
    }
    if (s.metrics.frequency >= REF_FREQUENCY_HIGH) {
      recs.push({
        key: `freq-${side}`, priority: 2,
        title: `“${s.adName}”: một người đang thấy quảng cáo quá nhiều lần`,
        evidence: `Tần suất ${s.metrics.frequency.toFixed(1)} lần/người (mốc tham chiếu ${REF_FREQUENCY_HIGH}).`,
        action: "Đổi nội dung mới hoặc mở rộng tệp. Chạy tiếp cùng một video trên cùng một tệp chỉ làm chi phí tăng dần.",
      });
    }
    // CTR tốt mà chuyển đổi kém ⇒ nút thắt nằm SAU cú nhấp, không phải ở video.
    if (s.metrics.ctr >= REF_CTR_DECENT && s.metrics.cvr !== null && s.metrics.cvr < 5 && s.metrics.clicks >= MIN_CLICKS) {
      recs.push({
        key: `landing-${side}`, priority: 2,
        title: `“${s.adName}”: video kéo được người bấm, nhưng rơi ở trang đích`,
        evidence: `CTR ${fmtPct(s.metrics.ctr)} là ổn, nhưng chỉ ${fmtPct(s.metrics.cvr)} người đã bấm thực hiện hành động mục tiêu (${fmtInt(s.metrics.clicks)} lượt bấm → ${fmtInt(s.metrics.conversions)} kết quả).`,
        action: "Vấn đề nằm ở trang đích/chào giá chứ không phải video: kiểm tốc độ tải trên điện thoại, xem lời hứa trong quảng cáo có khớp trang đích không, rút gọn biểu mẫu.",
      });
    }
  }

  // ── 4. Có người thắng rõ ràng thì nói việc cụ thể ──
  const cpa = v("cpa"), roas = v("roas");
  const moneyWinner = [cpa, roas].find((x) => x && (x.winner === "a" || x.winner === "b"));
  const conflict = cpa && roas && (cpa.winner === "a" || cpa.winner === "b") && (roas.winner === "a" || roas.winner === "b") && cpa.winner !== roas.winner;
  if (conflict && cpa && roas) {
    recs.push({
      key: "money-conflict", priority: 1,
      title: "Hai thước đo tiền đang chỉ về hai hướng — phải chọn thước đo trước",
      evidence: `“${nameOf(cpa.winner as "a" | "b")}” rẻ hơn mỗi kết quả (${fmtVnd(cpa.aValue)} vs ${fmtVnd(cpa.bValue)}), nhưng “${nameOf(roas.winner as "a" | "b")}” mang về nhiều doanh thu hơn trên mỗi đồng chi (${roas.aValue?.toFixed(1)}x vs ${roas.bValue?.toFixed(1)}x).`,
      action: "Nếu mục tiêu là doanh thu/lợi nhuận thì theo ROAS. Nếu mục tiêu là số khách hàng mới hoặc đang muốn phủ thị trường thì theo chi phí mỗi kết quả. Chốt thước đo trước, rồi mới chọn video.",
    });
  } else if (moneyWinner) {
    const w = moneyWinner.winner as "a" | "b";
    const l = w === "a" ? "b" : "a";
    recs.push({
      key: "scale-winner", priority: 1,
      title: `Dồn ngân sách cho “${nameOf(w)}”`,
      evidence: `${moneyWinner.label} ${moneyWinner.deltaPercent !== null ? `tốt hơn ${moneyWinner.deltaPercent.toFixed(0)}%` : "tốt hơn"}${moneyWinner.confidence !== null ? `, độ tin cậy ${moneyWinner.confidence}%` : ""}.`,
      action: `Tăng ngân sách bên thắng từng bước ~20-30% mỗi lần, chờ 3-4 ngày giữa các lần để Meta học lại. Giảm dần hoặc tắt “${nameOf(l)}”, đừng tắt đột ngột cả cụm nếu nó đang là nguồn kết quả đáng kể.`,
    });
  }

  // ── 5. Không có gì nổi bật thì cũng phải nói ra, không im lặng ──
  if (recs.length === 0) {
    recs.push({
      key: "nothing-actionable", priority: 5,
      title: "Chưa có việc gì đáng làm gấp từ bảng này",
      evidence: "Không chỉ số nào chênh đủ để kết luận, và không chỉ số nào rơi dưới mốc tham chiếu.",
      action: "Giữ nguyên cả hai và chạy thêm, hoặc thử một biến thể khác hẳn (góc tiếp cận mới, độ dài khác) thay vì tinh chỉnh quanh hai video hiện có.",
    });
  }

  return recs.sort((x, y) => x.priority - y.priority).slice(0, 6);
}
