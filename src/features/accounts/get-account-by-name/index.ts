import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { resolveLabels } from "@/features/localization/resolve-labels";
import type { AccountResponse } from "@/features/accounts/_shared/http/responses";
import { toAccountResponse } from "@/features/accounts/_shared/http/responses";
import { accounts } from "@/features/accounts/db";
import { roles } from "@/features/roles/db";
import { roleWithPermissions } from "@/features/roles/resolve-role-permissions";
import { notFound } from "@/shared/http/errors";

export async function getAccountByName(name: string): Promise<AccountResponse> {
  const [row] = await db
    .select({
      account: accounts,
      role: roles
    })
    .from(accounts)
    .innerJoin(roles, eq(accounts.roleId, roles.id))
    .where(eq(accounts.name, name));

  if (!row) {
    throw notFound("Account not found");
  }

  const role = await roleWithPermissions(row.role);
  const labels = await resolveLabels([role.role.title]);

  return toAccountResponse({ account: row.account, role }, labels);
}
