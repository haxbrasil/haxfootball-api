import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { accounts } from "@/features/accounts/account.db";
import { badRequest, notFound } from "@/shared/http/errors";
import { getDefaultRole } from "@/features/roles/get-default-role";
import {
  defaultRoleName,
  rolePermissions,
  roles
} from "@/features/roles/role.db";

export const removeRoleResponseSchema = t.Object({
  deleted: t.Boolean()
});

export type RemoveRoleResult = Static<typeof removeRoleResponseSchema>;

export async function removeRole(uuid: string): Promise<RemoveRoleResult> {
  const [role] = await db.select().from(roles).where(eq(roles.uuid, uuid));

  if (!role) {
    throw notFound("Role not found");
  }

  if (role.name === defaultRoleName) {
    throw badRequest("Default role cannot be removed");
  }

  const defaultRole = await getDefaultRole();

  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({
        roleId: defaultRole.role.id,
        updatedAt: new Date().toISOString()
      })
      .where(eq(accounts.roleId, role.id));

    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));

    await tx.delete(roles).where(eq(roles.id, role.id));
  });

  return { deleted: true };
}
