import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import type { AccountResponse } from "@/features/accounts/_shared/http/responses";
import {
  accountResponseSchema,
  toAccountResponse
} from "@/features/accounts/_shared/http/responses";
import { accounts } from "@/features/accounts/db";
import { roles } from "@/features/roles/db";
import { rolesWithPermissions } from "@/features/roles/resolve-role-permissions";
import {
  cursorAfter,
  cursorSort,
  pageItems,
  pageLimit,
  paginatedResponseSchema,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

export const listAccountsResponseSchema = paginatedResponseSchema(
  accountResponseSchema
);

export async function listAccounts(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<AccountResponse>> {
  const rows = await db
    .select({
      account: accounts,
      role: roles
    })
    .from(accounts)
    .innerJoin(roles, eq(accounts.roleId, roles.id))
    .where(cursorAfter(accounts.id, query.cursor, "asc"))
    .orderBy(cursorSort(accounts.id, "asc"))
    .limit(pageLimit(query));

  const page = pageItems(rows, query, (row) => row.account.id);
  const pageRoles = await rolesWithPermissions(
    page.items.map((row) => row.role)
  );

  return {
    items: page.items.map((row, index) =>
      toAccountResponse({
        account: row.account,
        role: pageRoles[index]
      })
    ),
    page: page.page
  };
}
