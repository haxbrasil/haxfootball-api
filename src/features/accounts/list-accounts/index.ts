import { eq } from "drizzle-orm";
import { t } from "elysia";
import { db } from "@/db/client";
import {
  type AccountResponse,
  accountResponseSchema,
  toAccountResponse
} from "@/features/accounts/account.contract";
import { accounts } from "@/features/accounts/account.db";
import { roles } from "@/features/roles/role.db";

export const listAccountsResponseSchema = t.Array(accountResponseSchema);

export async function listAccounts(): Promise<AccountResponse[]> {
  const rows = await db
    .select({
      account: accounts,
      role: roles
    })
    .from(accounts)
    .innerJoin(roles, eq(accounts.roleId, roles.id))
    .orderBy(accounts.id);

  return rows.map(toAccountResponse);
}
