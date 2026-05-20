import { db } from "@/db/client";
import type { RoleResponse } from "@/features/roles/_shared/http/responses";
import {
  roleResponseSchema,
  toRoleResponse
} from "@/features/roles/_shared/http/responses";
import { roles } from "@/features/roles/db";
import { rolesWithPermissions } from "@/features/roles/_shared/db/queries";
import {
  cursorAfter,
  cursorSort,
  pageItems,
  pageLimit,
  paginatedResponseSchema,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

export const listRolesResponseSchema =
  paginatedResponseSchema(roleResponseSchema);

export async function listRoles(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<RoleResponse>> {
  const rows = await db
    .select()
    .from(roles)
    .where(cursorAfter(roles.id, query.cursor, "asc"))
    .orderBy(cursorSort(roles.id, "asc"))
    .limit(pageLimit(query));

  const page = pageItems(rows, query, (role) => role.id);
  const items = await rolesWithPermissions(page.items);

  return {
    items: items.map(toRoleResponse),
    page: page.page
  };
}
