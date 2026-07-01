import { inArray } from "drizzle-orm";
import type { DbTransaction } from "@/db/client";
import { type Permission, permissions } from "@/features/permissions/db";

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
