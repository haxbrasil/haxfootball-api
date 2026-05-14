import { db } from "@/db/client";
import {
  type PermissionResponse,
  permissionResponseSchema,
  toPermissionResponse
} from "@/features/permissions/permission.contract";
import { permissions } from "@/features/permissions/permission.db";
import {
  cursorAfter,
  cursorSort,
  pageItems,
  pageLimit,
  paginatedResponseSchema,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

export const listPermissionsResponseSchema = paginatedResponseSchema(
  permissionResponseSchema
);

export async function listPermissions(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<PermissionResponse>> {
  const rows = await db
    .select()
    .from(permissions)
    .where(cursorAfter(permissions.id, query.cursor, "asc"))
    .orderBy(cursorSort(permissions.id, "asc"))
    .limit(pageLimit(query));

  const page = pageItems(rows, query, (permission) => permission.id);

  return {
    items: page.items.map(toPermissionResponse),
    page: page.page
  };
}
