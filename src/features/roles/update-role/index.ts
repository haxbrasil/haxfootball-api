import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import {
  type RoleResponse,
  roleNameSchema,
  rolePermissionsSchema,
  roleTitleSchema,
  toRoleResponse
} from "@/features/roles/role.contract";
import {
  defaultRoleName,
  rolePermissions,
  roles
} from "@/features/roles/role.db";
import {
  ensurePermissionsByKeys,
  roleWithPermissions
} from "@/features/roles/role.persistence";
import { badRequest, notFound } from "@/shared/http/errors";

export const updateRoleBodySchema = t.Partial(
  t.Object({
    name: roleNameSchema,
    title: roleTitleSchema,
    permissions: rolePermissionsSchema
  })
);

export type UpdateRoleInput = Static<typeof updateRoleBodySchema>;

export async function updateRole(
  uuid: string,
  input: UpdateRoleInput
): Promise<RoleResponse> {
  const [role] = await db.select().from(roles).where(eq(roles.uuid, uuid));

  if (!role) {
    throw notFound("Role not found");
  }

  const nextName = input.name;
  const isDefaultRole = role.name === defaultRoleName;
  const isChangingDefaultName =
    isDefaultRole && nextName !== undefined && nextName !== defaultRoleName;

  if (isChangingDefaultName) {
    throw badRequest("Default role name cannot be changed");
  }

  if (nextName !== undefined && nextName !== role.name) {
    const [existingRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, nextName));

    if (existingRole) {
      throw badRequest("Role name already exists");
    }
  }

  const name = nextName ?? role.name;
  const title = input.title ?? role.title;
  const permissionKeys = input.permissions;

  const updatedRole = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(roles)
      .set({
        name,
        title,
        updatedAt: new Date().toISOString()
      })
      .where(eq(roles.id, role.id))
      .returning();

    if (permissionKeys !== undefined) {
      await tx
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, role.id));

      const permissionRows = await ensurePermissionsByKeys(tx, permissionKeys);

      if (permissionRows.length > 0) {
        await tx.insert(rolePermissions).values(
          permissionRows.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id
          }))
        );
      }
    }

    return updated;
  });

  return toRoleResponse(await roleWithPermissions(updatedRole));
}
