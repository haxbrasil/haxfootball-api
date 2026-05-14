import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import {
  type PermissionResponse,
  permissionKeySchema,
  permissionTitleInputSchema,
  toPermissionResponse
} from "@/features/permissions/permission.contract";
import { permissions } from "@/features/permissions/permission.db";
import { badRequest, notFound } from "@/shared/http/errors";

export const updatePermissionBodySchema = t.Partial(
  t.Object({
    key: permissionKeySchema,
    title: permissionTitleInputSchema
  })
);

export type UpdatePermissionInput = Static<typeof updatePermissionBodySchema>;

export async function updatePermission(
  uuid: string,
  input: UpdatePermissionInput
): Promise<PermissionResponse> {
  const [permission] = await db
    .select()
    .from(permissions)
    .where(eq(permissions.uuid, uuid));

  if (!permission) {
    throw notFound("Permission not found");
  }

  const nextKey = input.key;

  if (nextKey !== undefined && nextKey !== permission.key) {
    const [existingPermission] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.key, nextKey));

    if (existingPermission) {
      throw badRequest("Permission key already exists");
    }
  }

  const [updatedPermission] = await db
    .update(permissions)
    .set({
      key: nextKey ?? permission.key,
      title: input.title === undefined ? permission.title : input.title,
      updatedAt: new Date().toISOString()
    })
    .where(eq(permissions.id, permission.id))
    .returning();

  return toPermissionResponse(updatedPermission);
}
