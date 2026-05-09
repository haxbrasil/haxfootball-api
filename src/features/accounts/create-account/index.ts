import { password } from "bun";
import { type Static, t } from "elysia";
import { db } from "../../../db/client";
import {
  type AccountResponse,
  accountExternalIdSchema,
  accountNameSchema,
  accountPasswordSchema,
  toAccountResponse
} from "../account.contract";
import { accounts } from "../account.db";

export const createAccountBodySchema = t.Object({
  name: accountNameSchema,
  password: accountPasswordSchema,
  externalId: accountExternalIdSchema
});

export type CreateAccountInput = Static<typeof createAccountBodySchema>;

export async function createAccount(
  input: CreateAccountInput
): Promise<AccountResponse> {
  const [account] = await db
    .insert(accounts)
    .values({
      name: input.name,
      passwordHash: await password.hash(input.password),
      externalId: input.externalId
    })
    .returning();

  return toAccountResponse(account);
}
