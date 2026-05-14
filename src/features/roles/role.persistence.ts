import { asc, eq, inArray } from "drizzle-orm";
import { db, type DbTransaction } from "@/db/client";
import {
  type Permission,
  permissions
} from "@/features/permissions/permission.db";
import type { RoleWithPermissions } from "@/features/roles/role.contract";
import { type Role, rolePermissions } from "@/features/roles/role.db";

export async function ensurePermissionsByKeys(
  database: DbTransaction,
  keys: string[]
): Promise<Permission[]> {
  if (keys.length === 0) {
    return [];
  }

  const existingPermissions = await database
    .select()
    .from(permissions)
    .where(inArray(permissions.key, keys));

  const existingKeys = new Set(
    existingPermissions.map((permission) => permission.key)
  );
  const missingKeys = keys.filter((key) => !existingKeys.has(key));

  const createdPermissions =
    missingKeys.length > 0
      ? await database
          .insert(permissions)
          .values(missingKeys.map((key) => ({ key })))
          .returning()
      : [];

  const permissionsByKey = new Map(
    [...existingPermissions, ...createdPermissions].map((permission) => [
      permission.key,
      permission
    ])
  );

  return keys.map((key) => {
    const permission = permissionsByKey.get(key);

    if (!permission) {
      throw new Error(`Permission was not found after ensuring key ${key}`);
    }

    return permission;
  });
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
