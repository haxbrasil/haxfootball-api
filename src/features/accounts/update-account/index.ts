import { password } from "bun";
import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "../../../db/client";
import { notFound } from "../../../shared/http/errors";
import { roles } from "../../roles/role.db";
import {
  type AccountResponse,
  accountExternalIdSchema,
  accountNameSchema,
  accountPasswordSchema,
  toAccountResponse
} from "../account.contract";
import { accounts } from "../account.db";

export const updateAccountBodySchema = t.Partial(
  t.Object({
    name: accountNameSchema,
    password: accountPasswordSchema,
    externalId: accountExternalIdSchema,
    roleUuid: t.String({ format: "uuid" })
  })
);

export type UpdateAccountInput = Static<typeof updateAccountBodySchema>;

export async function updateAccount(
  uuid: string,
  input: UpdateAccountInput
): Promise<AccountResponse> {
  const { password: newPassword, roleUuid, ...accountUpdate } = input;

  const passwordHash = newPassword
    ? await password.hash(newPassword)
    : undefined;

  const [role] = roleUuid
    ? await db.select().from(roles).where(eq(roles.uuid, roleUuid))
    : [];

  if (roleUuid && !role) {
    throw notFound("Role not found");
  }

  const [account] = await db
    .update(accounts)
    .set({
      ...accountUpdate,
      ...(passwordHash ? { passwordHash } : {}),
      ...(role ? { roleId: role.id } : {}),
      updatedAt: new Date().toISOString()
    })
    .where(eq(accounts.uuid, uuid))
    .returning();

  if (!account) {
    throw notFound("Account not found");
  }

  const [row] = await db
    .select({
      account: accounts,
      role: roles
    })
    .from(accounts)
    .innerJoin(roles, eq(accounts.roleId, roles.id))
    .where(eq(accounts.id, account.id));

  return toAccountResponse(row);
}
