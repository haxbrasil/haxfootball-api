import { password } from "bun";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { getDefaultRole } from "@/features/roles/get-default-role";
import {
  type AccountResponse,
  accountExternalIdSchema,
  accountNameSchema,
  accountPasswordSchema,
  toAccountResponse
} from "@/features/accounts/account.contract";
import { accounts } from "@/features/accounts/account.db";

export const createAccountBodySchema = t.Object({
  name: accountNameSchema,
  password: accountPasswordSchema,
  externalId: accountExternalIdSchema
});

export type CreateAccountInput = Static<typeof createAccountBodySchema>;

export async function createAccount(
  input: CreateAccountInput
): Promise<AccountResponse> {
  const role = await getDefaultRole();
  const [account] = await db
    .insert(accounts)
    .values({
      name: input.name,
      passwordHash: await password.hash(input.password),
      externalId: input.externalId,
      roleId: role.id
    })
    .returning();

  return toAccountResponse({ account, role });
}
