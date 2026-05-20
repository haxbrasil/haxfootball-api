import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { badRequest } from "@/shared/http/errors";
import {
  rolePermissionInputSchema,
  roleNameSchema,
  roleTitleSchema
} from "@/features/roles/_shared/http/inputs";
import type { RoleResponse } from "@/features/roles/_shared/http/responses";
import { toRoleResponse } from "@/features/roles/_shared/http/responses";
import { rolePermissions, roles } from "@/features/roles/db";
import {
  resolveRolePermissionInput,
  roleWithPermissions
} from "@/features/roles/_shared/db/queries";

export const createRoleBodySchema = t.Object({
  name: roleNameSchema,
  title: roleTitleSchema,
  permissions: t.Optional(rolePermissionInputSchema)
});

export type CreateRoleInput = Static<typeof createRoleBodySchema>;

export async function createRole(
  input: CreateRoleInput
): Promise<RoleResponse> {
  const [existingRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, input.name));

  if (existingRole) {
    throw badRequest("Role name already exists");
  }

  const permissionKeys = input.permissions ?? [];

  const role = await db.transaction(async (tx) => {
    const resolvedPermissions = await resolveRolePermissionInput(
      tx,
      permissionKeys
    );
    const [createdRole] = await tx
      .insert(roles)
      .values({
        name: input.name,
        title: input.title,
        bypassAllPermissions: resolvedPermissions.bypassAllPermissions
      })
      .returning();

    if (resolvedPermissions.permissionRows.length > 0) {
      await tx.insert(rolePermissions).values(
        resolvedPermissions.permissionRows.map((permission) => ({
          roleId: createdRole.id,
          permissionId: permission.id
        }))
      );
    }

    return createdRole;
  });

  return toRoleResponse(await roleWithPermissions(role));
}
