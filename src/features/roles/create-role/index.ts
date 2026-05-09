import { type Static, t } from "elysia";
import { db } from "../../../db/client";
import {
  type RoleResponse,
  roleNameSchema,
  toRoleResponse
} from "../role.contract";
import { roles } from "../role.db";

export const createRoleBodySchema = t.Object({
  name: roleNameSchema
});

export type CreateRoleInput = Static<typeof createRoleBodySchema>;

export async function createRole(input: CreateRoleInput): Promise<RoleResponse> {
  const [role] = await db
    .insert(roles)
    .values({
      name: input.name
    })
    .returning();

  return toRoleResponse(role);
}
