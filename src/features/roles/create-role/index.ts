import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { badRequest } from "@/shared/http/errors";
import {
  type RoleResponse,
  roleNameSchema,
  rolePermissionsSchema,
  roleTitleSchema,
  toRoleResponse
} from "@/features/roles/role.contract";
import { rolePermissions, roles } from "@/features/roles/role.db";
import { roleWithPermissions } from "@/features/roles/role.persistence";

export const createRoleBodySchema = t.Object({
  name: roleNameSchema,
  title: roleTitleSchema,
  permissions: t.Optional(rolePermissionsSchema)
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

  const permissions = input.permissions ?? [];

  const role = await db.transaction(async (tx) => {
    const [createdRole] = await tx
      .insert(roles)
      .values({
        name: input.name,
        title: input.title
      })
      .returning();

    if (permissions.length > 0) {
      await tx.insert(rolePermissions).values(
        permissions.map((permission) => ({
          roleId: createdRole.id,
          permission
        }))
      );
    }

    return createdRole;
  });

  return toRoleResponse(await roleWithPermissions(role));
}
