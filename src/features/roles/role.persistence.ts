import { asc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import type { RoleWithPermissions } from "@/features/roles/role.contract";
import { type Role, rolePermissions } from "@/features/roles/role.db";

export async function rolesWithPermissions(
  roles: Role[]
): Promise<RoleWithPermissions[]> {
  const roleIds = roles.map((role) => role.id);

  if (roleIds.length === 0) {
    return [];
  }

  const permissionRows = await db
    .select({
      roleId: rolePermissions.roleId,
      permission: rolePermissions.permission
    })
    .from(rolePermissions)
    .where(inArray(rolePermissions.roleId, roleIds))
    .orderBy(asc(rolePermissions.id));

  const permissionsByRoleId = new Map<number, string[]>();

  for (const row of permissionRows) {
    const permissions = permissionsByRoleId.get(row.roleId) ?? [];

    permissions.push(row.permission);
    permissionsByRoleId.set(row.roleId, permissions);
  }

  return roles.map((role) => ({
    role,
    permissions: permissionsByRoleId.get(role.id) ?? []
  }));
}

export async function roleWithPermissions(
  role: Role
): Promise<RoleWithPermissions> {
  const [roleWithPermissions] = await rolesWithPermissions([role]);

  return roleWithPermissions;
}
