import { db } from "@/db/client";
import {
  type RoleResponse,
  roleResponseSchema,
  toRoleResponse
} from "@/features/roles/role.contract";
import { roles } from "@/features/roles/role.db";
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

  return {
    items: page.items.map(toRoleResponse),
    page: page.page
  };
}
