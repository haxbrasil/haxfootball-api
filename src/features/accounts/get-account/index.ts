import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { notFound } from "../../../shared/http/errors";
import {
  type AccountResponse,
  toAccountResponse
} from "../account.contract";
import { accounts } from "../account.db";

export async function getAccount(uuid: string): Promise<AccountResponse> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.uuid, uuid));

  if (!account) {
    throw notFound("Account not found");
  }

  return toAccountResponse(account);
}
