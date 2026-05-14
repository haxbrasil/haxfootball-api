import { password } from "bun";
import { eq } from "drizzle-orm";
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
import { badRequest } from "@/shared/http/errors";

export const createAccountBodySchema = t.Object({
  name: accountNameSchema,
  password: accountPasswordSchema,
  externalId: accountExternalIdSchema
});

export type CreateAccountInput = Static<typeof createAccountBodySchema>;

export async function createAccount(
  input: CreateAccountInput
): Promise<AccountResponse> {
  const [existingAccountWithName] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.name, input.name));

  if (existingAccountWithName) {
    throw badRequest("Account name already exists");
  }

  const [existingAccountWithExternalId] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.externalId, input.externalId));

  if (existingAccountWithExternalId) {
    throw badRequest("Account external ID already exists");
  }

  const role = await getDefaultRole();

  const [account] = await db
    .insert(accounts)
    .values({
      name: input.name,
      passwordHash: await password.hash(input.password),
      externalId: input.externalId,
      roleId: role.role.id
    })
    .returning();

  return toAccountResponse({ account, role });
}
