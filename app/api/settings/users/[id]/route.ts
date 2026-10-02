// ============================================================
// AdsCommand — Individual User API
// PUT    /api/settings/users/[id]  — update member
// DELETE /api/settings/users/[id]  — remove member
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { updateMember, removeMember, getMember } from "@/lib/team";
import { writeAuditEntry, computeDiff } from "@/lib/settings/audit";
import type { Role } from "@/lib/permissions";
import type { MemberStatus, CompanyAccess } from "@/lib/team";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: "Không xác thực" },
        { status: 401 }
      );
    }
    if (!hasPermission(currentUser.role, "can_manage_users")) {
      return NextResponse.json(
        { success: false, error: "Không có quyền quản lý người dùng" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Cannot change own role
    if (id === currentUser.id) {
      const body = await request.json();
      if (body.role && body.role !== currentUser.role) {
        return NextResponse.json(
          { success: false, error: "Không thể tự thay đổi role của mình" },
          { status: 400 }
        );
      }
    }

    const body = await request.json();
    const { name, role, status, is_active, password, telegram_chat_id, company_access } = body as {
      name?: string;
      role?: Role;
      status?: MemberStatus;
      is_active?: boolean;
      password?: string;
      telegram_chat_id?: string;
      company_access?: CompanyAccess[];
    };

    const validAccess: CompanyAccess[] = ["MBC", "MBI", "ALL"];
    const updates: Parameters<typeof updateMember>[1] = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (status !== undefined) updates.status = status;
    if (is_active !== undefined) updates.is_active = is_active;
    if (telegram_chat_id !== undefined) updates.telegram_chat_id = telegram_chat_id;
    if (password) updates.password_hash = hashPassword(password);
    if (Array.isArray(company_access) && company_access.length > 0 && company_access.every((a) => validAccess.includes(a))) {
      updates.company_access = company_access;
    }

    // Capture before-state for diff (exclude password_hash)
    const before = await getMember(id);
    const { password_hash: _bph, ...beforeSafe } = before ?? { password_hash: undefined };

    const updated = await updateMember(id, updates);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy người dùng" },
        { status: 404 }
      );
    }

    const { password_hash: _ph, ...safe } = updated;

    // Audit — diff excludes password changes (only log field name)
    const safeBefore = { ...beforeSafe } as Record<string, unknown>;
    const safeAfter  = { ...safe }       as Record<string, unknown>;
    // If password changed, note it without logging the value
    const changedFields = Object.keys(updates)
      .filter(k => k !== "password_hash")
      .join(", ");
    const passwordChanged = "password_hash" in updates;
    const fieldSummary = passwordChanged
      ? [changedFields, "password"].filter(Boolean).join(", ")
      : changedFields || "no-op";

    await writeAuditEntry(
      "users", currentUser, "update",
      `user:${safe.email} → [${fieldSummary}]`,
      safeBefore, safeAfter, "ALL",
      {
        diff: computeDiff(safeBefore, safeAfter),
        note: `Updated by ${currentUser.email}`,
      },
    );

    return NextResponse.json({ success: true, data: safe });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: "Không xác thực" },
        { status: 401 }
      );
    }
    if (!hasPermission(currentUser.role, "can_manage_users")) {
      return NextResponse.json(
        { success: false, error: "Không có quyền quản lý người dùng" },
        { status: 403 }
      );
    }

    const { id } = await params;

    if (id === currentUser.id) {
      return NextResponse.json(
        { success: false, error: "Không thể xóa tài khoản của chính mình" },
        { status: 400 }
      );
    }

    // Capture before-state for audit
    const target = await getMember(id);
    const targetEmail = target?.email ?? id;
    const { password_hash: _tph, ...targetSafe } = (target ?? {}) as typeof target & { password_hash?: string };

    const removed = await removeMember(id);
    if (!removed) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy người dùng" },
        { status: 404 }
      );
    }

    await writeAuditEntry(
      "users", currentUser, "delete",
      `user:${targetEmail}`,
      targetSafe ?? null, null, "ALL",
      { note: `Deleted by ${currentUser.email}` },
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
