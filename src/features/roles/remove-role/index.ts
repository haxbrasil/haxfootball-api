import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "../../../db/client";
import { accounts } from "../../accounts/account.db";
import { badRequest, notFound } from "../../../shared/http/errors";
import { getDefaultRole } from "../get-default-role";
import { roles } from "../role.db";

export const removeRoleResponseSchema = t.Object({
  deleted: t.Boolean()
});

export type RemoveRoleResult = Static<typeof removeRoleResponseSchema>;

export async function removeRole(uuid: string): Promise<RemoveRoleResult> {
  const [role] = await db.select().from(roles).where(eq(roles.uuid, uuid));

  if (!role) {
    throw notFound("Role not found");
  }

  if (role.isDefault) {
    throw badRequest("Default role cannot be removed");
  }

  const defaultRole = await getDefaultRole();

  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({
        roleId: defaultRole.id,
        updatedAt: new Date().toISOString()
      })
      .where(eq(accounts.roleId, role.id));

    await tx.delete(roles).where(eq(roles.id, role.id));
  });

  return { deleted: true };
}
