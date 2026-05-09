import { t } from "elysia";
import { db } from "../../../db/client";
import {
  type AccountResponse,
  accountResponseSchema,
  toAccountResponse
} from "../account.contract";
import { accounts } from "../account.db";

export const listAccountsResponseSchema = t.Array(accountResponseSchema);

export async function listAccounts(): Promise<AccountResponse[]> {
  const rows = await db.select().from(accounts).orderBy(accounts.id);

  return rows.map(toAccountResponse);
}
