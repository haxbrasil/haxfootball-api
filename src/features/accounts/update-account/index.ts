import { password } from "bun";
import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "../../../db/client";
import { notFound } from "../../../shared/http/errors";
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
    externalId: accountExternalIdSchema
  })
);

export type UpdateAccountInput = Static<typeof updateAccountBodySchema>;

export async function updateAccount(
  uuid: string,
  input: UpdateAccountInput
): Promise<AccountResponse> {
  const { password: newPassword, ...accountUpdate } = input;
  const passwordHash = newPassword
    ? await password.hash(newPassword)
    : undefined;

  const [account] = await db
    .update(accounts)
    .set({
      ...accountUpdate,
      ...(passwordHash ? { passwordHash } : {}),
      updatedAt: new Date().toISOString()
    })
    .where(eq(accounts.uuid, uuid))
    .returning();

  if (!account) {
    throw notFound("Account not found");
  }

  return toAccountResponse(account);
}
