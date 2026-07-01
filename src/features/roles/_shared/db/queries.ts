import { asc, eq, inArray } from "drizzle-orm";
import { db, type DbTransaction } from "@/db/client";
import { type Permission, permissions } from "@/features/permissions/db";
import { ensurePermissionsByKeys } from "@/features/permissions/ensure-permissions";
import { allPermissionsWildcard } from "@/features/roles/_shared/http/inputs";
import type { RoleWithPermissions } from "@/features/roles/_shared/http/responses";
import { type Role, rolePermissions } from "@/features/roles/db";

export async function resolveRolePermissionInput(
  database: DbTransaction,
  keys: string[]
): Promise<{
  bypassAllPermissions: boolean;
  permissionRows: Permission[];
}> {
  const bypassAllPermissions = keys.includes(allPermissionsWildcard);
  const concretePermissionKeys = keys.filter(
    (key) => key !== allPermissionsWildcard
  );

  return {
    bypassAllPermissions,
    permissionRows: await ensurePermissionsByKeys(
      database,
      concretePermissionKeys
    )
  };
}

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
      permissionKey: permissions.key
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(inArray(rolePermissions.roleId, roleIds))
    .orderBy(asc(rolePermissions.id));

  const permissionsByRoleId = new Map<number, string[]>();

  for (const row of permissionRows) {
    const permissions = permissionsByRoleId.get(row.roleId) ?? [];

    permissions.push(row.permissionKey);
    permissionsByRoleId.set(row.roleId, permissions);
  }

  const allPermissionKeys = roles.some((role) => role.bypassAllPermissions)
    ? (
        await db
          .select({ key: permissions.key })
          .from(permissions)
          .orderBy(asc(permissions.id))
      ).map((permission) => permission.key)
    : [];

  return roles.map((role) => ({
    role,
    permissions: role.bypassAllPermissions
      ? allPermissionKeys
      : (permissionsByRoleId.get(role.id) ?? [])
  }));
}

export async function roleWithPermissions(
  role: Role
): Promise<RoleWithPermissions> {
  const [roleWithPermissions] = await rolesWithPermissions([role]);

  return roleWithPermissions;
}
