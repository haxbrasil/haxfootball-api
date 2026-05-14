import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { rolePermissions } from "@/features/roles/role.db";
import { permissions } from "@/features/permissions/permission.db";
import { notFound } from "@/shared/http/errors";

export const removePermissionResponseSchema = t.Object({
  deleted: t.Boolean()
});

export type RemovePermissionResult = Static<
  typeof removePermissionResponseSchema
>;

export async function removePermission(
  uuid: string
): Promise<RemovePermissionResult> {
  const [permission] = await db
    .select()
    .from(permissions)
    .where(eq(permissions.uuid, uuid));

  if (!permission) {
    throw notFound("Permission not found");
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(rolePermissions)
      .where(eq(rolePermissions.permissionId, permission.id));

    await tx.delete(permissions).where(eq(permissions.id, permission.id));
  });

  return { deleted: true };
}
