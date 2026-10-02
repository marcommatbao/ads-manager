// ============================================================
// AdsCommand — Team & User Management (Upgraded for Auth)
// ============================================================

import { promises as fs } from "fs";
import { writeFileAtomic } from "@/lib/fs-atomic";
import { withFileLock } from "@/lib/file-lock";
import path from "path";
import type { Role } from "./permissions";
import { hashPassword } from "./auth";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type { Role };
export type CompanyAccess = string /* mã công ty hoặc "ALL" */;
export type MemberStatus = "active" | "pending" | "disabled";

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: Role;
  company_access: CompanyAccess[];
  password_hash: string;
  telegram_chat_id?: string;
  avatar?: string;
  last_active: string;
  last_login?: string;
  invited_at: string;
  status: MemberStatus;
  is_active: boolean;
  /** Tăng mỗi khi quyền / trạng thái / mật khẩu đổi hoặc đăng xuất — phiên (JWT) mang số cũ bị từ chối ngay. */
  session_version?: number;
}

// ─────────────────────────────────────────────
// Storage — JSON file
// ─────────────────────────────────────────────

const DATA_DIR  = path.join(process.cwd(), "data");
const TEAM_FILE = path.join(DATA_DIR, "team-members.json");

async function ensureDataDir(): Promise<void> {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch { /* exists */ }
}

async function readMembers(): Promise<TeamMember[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(TEAM_FILE, "utf-8");
    return JSON.parse(raw) as TeamMember[];
  } catch {
    // ── TẠO TÀI KHOẢN QUẢN TRỊ ĐẦU TIÊN ──
    //
    // SỬA 17/09/2026 — LỖ HỔNG NGHIÊM TRỌNG ở bản cũ:
    // nhánh này hardcode một super_admin với email thật và một mật khẩu dựng sẵn
    //      ngắn, dễ đoán, nằm thẳng trong mã.
    // Hai điều làm nó thành lỗ hổng thật, không phải lý thuyết:
    //   1. Repo sắp ở trạng thái CÔNG KHAI → ai cũng đọc được mật khẩu đó.
    //   2. Nhánh này chạy MỖI KHI không đọc được data/team-members.json —
    //      tức mỗi lần triển khai lên môi trường chưa có volume bền (đúng
    //      tình huống đang cân nhắc khi chuyển sang nền tảng khác). App sẽ tự
    //      dựng lại một super_admin với mật khẩu dựng sẵn đó mà không ai hay.
    //
    // Nay: mật khẩu PHẢI do biến môi trường cấp. Thiếu biến → KHÔNG tạo tài
    // khoản nào và kêu to. Thà không đăng nhập được còn hơn mở sẵn một cửa
    // super_admin với mật khẩu ai cũng biết.
    const bootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim();
    const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";

    if (!bootstrapEmail || bootstrapPassword.length < 12) {
      console.error(
        "[team] KHÔNG có danh sách thành viên và KHÔNG tạo tài khoản quản trị mặc định. " +
        "Cần đặt BOOTSTRAP_ADMIN_EMAIL và BOOTSTRAP_ADMIN_PASSWORD (tối thiểu 12 ký tự) " +
        "rồi khởi động lại. Hệ thống CỐ Ý không tự tạo admin với mật khẩu dựng sẵn."
      );
      return [];
    }

    const defaultAdmin: TeamMember = {
      id: "user_owner_001",
      email: bootstrapEmail,
      name: (process.env.BOOTSTRAP_ADMIN_NAME ?? "").trim() || bootstrapEmail.split("@")[0],
      role: "super_admin",
      company_access: ["ALL"],
      password_hash: hashPassword(bootstrapPassword),
      last_active: new Date().toISOString(),
      invited_at: new Date().toISOString(),
      status: "active",
      is_active: true,
    };
    console.warn(`[team] Đã tạo tài khoản quản trị đầu tiên cho ${bootstrapEmail} từ biến môi trường.`);
    try { await writeMembers([defaultAdmin]); } catch { /* data dir may be read-only */ }
    return [defaultAdmin];
  }
}

async function writeMembers(members: TeamMember[]): Promise<void> {
  await ensureDataDir();
  await writeFileAtomic(TEAM_FILE, JSON.stringify(members, null, 2));
}

// ─────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────

export async function getAllMembers(): Promise<TeamMember[]> {
  return readMembers();
}

export async function getMember(id: string): Promise<TeamMember | null> {
  const all = await readMembers();
  return all.find((m) => m.id === id) ?? null;
}

export async function getMemberByEmail(email: string): Promise<TeamMember | null> {
  const all = await readMembers();
  return all.find((m) => m.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function addMember(
  data: Omit<TeamMember, "id" | "last_active" | "invited_at" | "status" | "is_active" | "last_login">
): Promise<TeamMember> {
  return withFileLock(TEAM_FILE, async () => {
    const all = await readMembers();
    const now = new Date().toISOString();

    if (all.some((m) => m.email.toLowerCase() === data.email.toLowerCase())) {
      throw new Error("Email đã tồn tại trong hệ thống");
    }

    const member: TeamMember = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      email: data.email,
      name: data.name,
      role: data.role,
      company_access: data.company_access,
      password_hash: data.password_hash,
      telegram_chat_id: data.telegram_chat_id,
      avatar: data.avatar,
      last_active: now,
      invited_at: now,
      status: "active",
      is_active: true,
    };

    all.push(member);
    await writeMembers(all);
    return member;
  });
}

export async function updateMember(
  id: string,
  updates: Partial<Pick<TeamMember, "name" | "role" | "company_access" | "telegram_chat_id" | "status" | "is_active" | "password_hash" | "avatar">>,
  opts: { keepSessions?: boolean } = {},
): Promise<TeamMember | null> {
  return withFileLock(TEAM_FILE, async () => {
    const all = await readMembers();
    const idx = all.findIndex((m) => m.id === id);
    if (idx < 0) return null;

    // Prevent demoting the last super_admin
    if (all[idx].role === "super_admin" && updates.role && updates.role !== "super_admin") {
      const superAdminCount = all.filter(m => m.role === "super_admin").length;
      if (superAdminCount <= 1) {
        throw new Error("Phải có ít nhất 1 Super Admin trong hệ thống");
      }
    }

    const revokes = !opts.keepSessions && SESSION_FIELDS.some((k) => k in updates)
    all[idx] = { ...all[idx], ...updates, ...(revokes ? { session_version: (all[idx].session_version ?? 0) + 1 } : {}) };
    await writeMembers(all);
    return all[idx];
  });
}

/** Đổi quyền, công ty, trạng thái hoặc mật khẩu → mọi phiên đang mở của người đó hết hiệu lực. */
const SESSION_FIELDS = ["role", "company_access", "status", "is_active", "password_hash"] as const

/** Đăng xuất: thu hồi MỌI phiên của người này (JWT không có trạng thái, không thu hồi riêng một thiết bị được). */
export async function revokeSessions(id: string): Promise<void> {
  await withFileLock(TEAM_FILE, async () => {
    const all = await readMembers();
    const idx = all.findIndex((m) => m.id === id);
    if (idx < 0) return;
    all[idx] = { ...all[idx], session_version: (all[idx].session_version ?? 0) + 1 };
    await writeMembers(all);
  });
}

export async function removeMember(id: string): Promise<boolean> {
  return withFileLock(TEAM_FILE, async () => {
    const all = await readMembers();
    const member = all.find((m) => m.id === id);
    if (!member) return false;

    if (member.role === "super_admin") {
      const superAdminCount = all.filter(m => m.role === "super_admin").length;
      if (superAdminCount <= 1) {
        throw new Error("Không thể xóa Super Admin cuối cùng");
      }
    }

    const filtered = all.filter((m) => m.id !== id);
    await writeMembers(filtered);
    return true;
  });
}

export async function updateLastLogin(id: string): Promise<void> {
  await withFileLock(TEAM_FILE, async () => {
    const all = await readMembers();
    const idx = all.findIndex((m) => m.id === id);
    if (idx >= 0) {
      all[idx].last_login = new Date().toISOString();
      all[idx].last_active = new Date().toISOString();
      await writeMembers(all);
    }
  });
}
