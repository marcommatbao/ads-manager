// ============================================================
// NBA collectors — shared helpers
// ============================================================

import type { Campaign } from "@/types/ads.types";
import type { NbaCompany, NbaPlatform } from "../types";

/** Suy công ty: ưu tiên field, fallback prefix tên. null nếu không xác định. */
export function detectCompany(c: Campaign): NbaCompany | null {
  if (c.company === "MBC" || c.company === "MBI") return c.company;
  const n = (c.name ?? "").toUpperCase();
  if (n.includes("MBI")) return "MBI";
  if (n.includes("MBC")) return "MBC";
  return null;
}

export function platformOf(c: Campaign): NbaPlatform {
  return c.platform === "google" ? "google" : "facebook";
}

export function isActive(c: Campaign): boolean {
  return c.status === "ACTIVE";
}
