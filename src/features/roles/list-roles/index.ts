import { t } from "elysia";
import { db } from "../../../db/client";
import {
  type RoleResponse,
  roleResponseSchema,
  toRoleResponse
} from "../role.contract";
import { roles } from "../role.db";

export const listRolesResponseSchema = t.Array(roleResponseSchema);

export async function listRoles(): Promise<RoleResponse[]> {
  const rows = await db.select().from(roles).orderBy(roles.id);

  return rows.map(toRoleResponse);
}
