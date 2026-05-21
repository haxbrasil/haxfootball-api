import { and, eq, like, type SQL } from "drizzle-orm";
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

export type ListAccountsQuery = PaginationQuery & {
  search?: string;
  name?: string;
  externalId?: string;
  roleUuid?: string;
};

export const listAccountsResponseSchema = paginatedResponseSchema(
  accountResponseSchema
);

export async function listAccounts(
  query: ListAccountsQuery = {}
): Promise<PaginatedResponse<AccountResponse>> {
  const rows = await db
    .select({
      account: accounts,
      role: roles
    })
    .from(accounts)
    .innerJoin(roles, eq(accounts.roleId, roles.id))
    .where(accountListWhere(query))
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

function accountListWhere(query: ListAccountsQuery): SQL | undefined {
  const filters: Array<SQL | undefined> = [
    cursorAfter(accounts.id, query.cursor, "asc")
  ];

  if (query.search) {
    filters.push(like(accounts.name, `%${query.search}%`));
  }

  if (query.name) {
    filters.push(eq(accounts.name, query.name));
  }

  if (query.externalId) {
    filters.push(eq(accounts.externalId, query.externalId));
  }

  if (query.roleUuid) {
    filters.push(eq(roles.uuid, query.roleUuid));
  }

  return and(...filters.filter((filter) => filter !== undefined));
}
