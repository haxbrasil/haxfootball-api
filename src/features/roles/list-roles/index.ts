import { db } from "@/db/client";
import { resolveLabels } from "@/features/localization/resolve-labels";
import type { ListRolesQuery } from "@/features/roles/_shared/http/inputs";
import { listRolesQuerySchema } from "@/features/roles/_shared/http/inputs";
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
  type PaginatedResponse
} from "@lib";

export const listRolesResponseSchema =
  paginatedResponseSchema(roleResponseSchema);
export { listRolesQuerySchema };

export async function listRoles(
  query: ListRolesQuery = {}
): Promise<PaginatedResponse<RoleResponse>> {
  const rows = await db
    .select()
    .from(roles)
    .where(cursorAfter(roles.id, query.cursor, "asc"))
    .orderBy(cursorSort(roles.id, "asc"))
    .limit(pageLimit(query));

  const page = pageItems(rows, query, (role) => role.id);
  const items = await rolesWithPermissions(page.items);
  const labels = await resolveLabels(
    items.map((item) => item.role.title),
    query.language
  );

  return {
    items: items.map((item) => toRoleResponse(item, labels)),
    page: page.page
  };
}
