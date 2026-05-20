import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import {
  permissionKeySchema,
  permissionTitleInputSchema
} from "@/features/permissions/_shared/http/inputs";
import type { PermissionResponse } from "@/features/permissions/_shared/http/responses";
import { toPermissionResponse } from "@/features/permissions/_shared/http/responses";
import { permissions } from "@/features/permissions/db";
import { badRequest } from "@/shared/http/errors";

export const createPermissionBodySchema = t.Object({
  key: permissionKeySchema,
  title: t.Optional(permissionTitleInputSchema)
});

export type CreatePermissionInput = Static<typeof createPermissionBodySchema>;

export async function createPermission(
  input: CreatePermissionInput
): Promise<PermissionResponse> {
  const [existingPermission] = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(eq(permissions.key, input.key));

  if (existingPermission) {
    throw badRequest("Permission key already exists");
  }

  const [permission] = await db
    .insert(permissions)
    .values({
      key: input.key,
      title: input.title ?? null
    })
    .returning();

  return toPermissionResponse(permission);
}
