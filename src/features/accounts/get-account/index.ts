import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notFound } from "@/shared/http/errors";
import type { AccountResponse } from "@/features/accounts/_shared/http/responses";
import { toAccountResponse } from "@/features/accounts/_shared/http/responses";
import { accounts } from "@/features/accounts/db";
import { roles } from "@/features/roles/db";
import { roleWithPermissions } from "@/features/roles/resolve-role-permissions";

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
