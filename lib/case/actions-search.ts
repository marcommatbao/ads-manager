// ============================================================
// Bước 5 — từ nguyên nhân ra việc cụ thể (Google Search)
// ============================================================
// Chỉ đề xuất việc tool GHI ĐƯỢC (danh mục trong store.ts). Việc ngoài danh
// mục → việc giao người, không dựng nút "Áp ngay" giả (luật đúc 23/09).
// Mặc định an toàn: thêm phủ định được chọn sẵn (đã mô phỏng); bỏ phủ định và
// dừng chiến dịch KHÔNG chọn sẵn — người duyệt phải tự tick.

import { intentOf, type IntentLexicon } from "./intent"
import { tokens } from "./text"
import { asNeg, pickSharedList, riskyMembers } from "./actions-pmax"
import { simulateNegatives, withAccentVariants, type NegativeKw } from "./simulate-negatives"
import type { CaseAction, ManualTask } from "./store"
import type { Diagnosis, SearchEvidence } from "./types"
import type { Verdict } from "./verdict"

/** Gói phủ định mặc định — tên thương hiệu công khai + từ điều hướng chung. Đã duyệt 25/09. */
export const NEGATIVE_PACKS: Record<"competitor" | "lookup" | "own_other", string[]> = {
  competitor: ["misa", "meinvoice", "easyinvoice", "easy invoice", "viettel", "sinvoice", "vinvoice", "bkav", "ehoadon", "e hoadon", "vnpt", "minvoice", "m invoice", "fpt", "cyberbill", "htinvoice", "goinvoice", "sapo", "trungnguyen", "kiotviet", "softdreams", "wininvoice", "win hóa đơn", "vininvoice", "safeinvoice", "saveinvoice", "save invoice", "hilo", "vĩnh hy", "ihoadon", "ihoadondientu", "ehoadondientu", "laphoadon", "evan", "smartca", "ica"],
  lookup: ["tra cứu", "tracuu", "tracuuhoadon", "hoadondientu", "gdt", "https", "http", "www", "com vn", "tổng đài", "đăng nhập", "login"],
  own_other: ["domain", "tên miền", "google workspace", "hosting"],
}

const PACK_LABEL = { competitor: "tên đối thủ", lookup: "tra cứu / đăng nhập", own_other: "sản phẩm khác của Mắt Bão" }

/**
 * Phủ định có thể đang chặn người MUA: có chữ "mua" và không mang nghĩa gian lận.
 * Cố ý hẹp — đề xuất bỏ phủ định mà sai (vd bỏ "hóa đơn giả") là mở cửa cho đúng
 * loại lượt tìm cần chặn. Đo 26/09: luật rộng hơn (theo intentOf) từng chọn nhầm "hóa đơn giả".
 */
export function blocksBuyers(negText: string): boolean {
  const t = tokens(negText)
  return t.includes("mua") && !t.some((w) => ["khống", "giả", "lậu", "bán", "khong", "gia", "lau", "ban"].includes(w))
}

let seq = 0
const aid = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`

export function proposeSearchActions(input: {
  evidence: SearchEvidence
  diagnosis: Diagnosis
  verdict: Verdict
  lexicon: IntentLexicon
}): { actions: CaseAction[]; manualTasks: Omit<ManualTask, "id" | "createdAt">[] } {
  const { evidence: ev, diagnosis: dx, lexicon } = input
  const has = (id: string) => dx.causes.some((c) => c.id === id)
  const actions: CaseAction[] = []
  const manualTasks: Omit<ManualTask, "id" | "createdAt">[] = []

  // Phủ định: chỉ lấy gói ứng với nguyên nhân thật sự có mặt.
  const packs: (keyof typeof NEGATIVE_PACKS)[] = []
  if (has("competitor-spend") || ev.keywords.some((k) => k.status === "ENABLED" && intentOf(k.text, lexicon) === "competitor")) packs.push("competitor")
  if (has("lookup") || has("existing-customer")) packs.push("lookup")
  if (has("existing-customer")) packs.push("own_other")
  if (packs.length) {
    const present = new Set(ev.negatives.map((n) => n.text.toLowerCase()))
    const negatives: NegativeKw[] = withAccentVariants(packs.flatMap((p) => NEGATIVE_PACKS[p]).map((text) => ({ text, match: "PHRASE" as const })))
      .filter((n) => !present.has(n.text))
    if (negatives.length) {
      const simulation = simulateNegatives(ev.searchTerms, negatives, ev.keywords)
      actions.push({
        id: aid("neg"), type: "ADD_NEGATIVES", selected: simulation.blockedConversions === 0,
        label: `Thêm ${negatives.length} từ khoá phủ định (${packs.map((p) => PACK_LABEL[p]).join(", ")}; có dấu + không dấu)`,
        campaignIds: [ev.campaign.id], negatives, simulation,
      })
    }
  }

  // Danh sách dùng chung chưa gắn → đề xuất gắn (mô phỏng cả từ khoá đang bật bị chặn theo).
  const list = pickSharedList(ev.sharedLists)
  if (list && !list.attached && list.members.length) {
    const simulation = simulateNegatives(ev.searchTerms, list.members.map(asNeg), ev.keywords)
    // Từ khoá ĐANG BẬT của chính chiến dịch (không phải tên đối thủ) bị list chặn theo → cũng là cờ.
    // Đo 27/09: gắn "Blacklist" vào Search HĐĐT Phần 2 chặn theo “hóa đơn điện tử thông tư 78” (bởi “thông tư”).
    const ownHit = simulation.ownKeywordsBlocked.filter((k) => intentOf(k.text, lexicon) !== "competitor")
    const flagged = [...riskyMembers(list), ...ownHit.map((k) => `${k.by} — chặn cả từ khoá đang bật “${k.text}”`)]
    actions.push({
      id: aid("attach"), type: "ATTACH_SHARED_LIST", campaignId: ev.campaign.id, sharedSetId: list.id, sharedSetName: list.name,
      selected: simulation.blockedConversions === 0 && flagged.length === 0, simulation, flagged,
      label: `Gắn danh sách dùng chung “${list.name}” (${list.members.length} từ) vào chiến dịch này`,
    })
  }

  // Phủ định đang chặn nhầm người có ý định mua.
  for (const n of ev.negatives) {
    if (!blocksBuyers(n.text)) continue
    actions.push({
      id: aid("rmneg"), type: "REMOVE_NEGATIVE", selected: false, campaignId: ev.campaign.id, text: n.text, match: n.match,
      label: `Bỏ phủ định “${n.text}” — có thể đang chặn người muốn mua`,
    })
  }

  // Dừng: chỉ đề xuất khi đỏ vì 0 đơn; không chọn sẵn.
  if (input.verdict.status === "red" && ev.campaign.orders === 0 && ev.campaign.status === "ENABLED") {
    actions.push({ id: aid("pause"), type: "PAUSE_CAMPAIGN", selected: false, campaignId: ev.campaign.id, label: `Dừng chiến dịch “${ev.campaign.name}”` })
  }

  const lowqs = dx.causes.find((c) => c.id === "broad-lowqs")
  if (lowqs) {
    manualTasks.push({ title: "Thu hẹp từ khoá rộng / viết lại trang đích cho khớp từ khoá", detail: `${lowqs.title}: ${lowqs.evidence.map((e) => e.label).join("; ")}. ${lowqs.detail}.`, assignee: null, status: "open" })
  }
  if (dx.causes.some((c) => c.id === "measurement-unverified" || c.id === "goal-not-purchase")) {
    manualTasks.push({ title: "Kiểm đo lường Mua hàng trước khi sửa gì khác", detail: "Xem mục Đo lường ở bước 4.", assignee: null, status: "open" })
  }
  return { actions, manualTasks }
}
