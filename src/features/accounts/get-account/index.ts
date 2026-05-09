import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { notFound } from "../../../shared/http/errors";
import { type AccountResponse, toAccountResponse } from "../account.contract";
import { accounts } from "../account.db";
import { roles } from "../../roles/role.db";

export async function getAccount(uuid: string): Promise<AccountResponse> {
  const [row] = await db
    .select({
      account: accounts,
      role: roles
    })
    .from(accounts)
    .innerJoin(roles, eq(accounts.roleId, roles.id))
    .where(eq(accounts.uuid, uuid));

  if (!row) {
    throw notFound("Account not found");
  }

  return toAccountResponse(row);
}
