import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notFound } from "@/shared/http/errors";
import {
  type AccountResponse,
  toAccountResponse
} from "@/features/accounts/account.contract";
import { accounts } from "@/features/accounts/account.db";
import { roles } from "@/features/roles/role.db";
import { roleWithPermissions } from "@/features/roles/role.persistence";

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

  return toAccountResponse({
    account: row.account,
    role: await roleWithPermissions(row.role)
  });
}
