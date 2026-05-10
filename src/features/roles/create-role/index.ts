import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { badRequest } from "@/shared/http/errors";
import {
  type RoleResponse,
  roleNameSchema,
  roleTitleSchema,
  toRoleResponse
} from "@/features/roles/role.contract";
import { roles } from "@/features/roles/role.db";

export const createRoleBodySchema = t.Object({
  name: roleNameSchema,
  title: roleTitleSchema
});

export type CreateRoleInput = Static<typeof createRoleBodySchema>;

export async function createRole(input: CreateRoleInput): Promise<RoleResponse> {
  const [existingRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, input.name));

  if (existingRole) {
    throw badRequest("Role name already exists");
  }

  const [role] = await db
    .insert(roles)
    .values({
      name: input.name,
      title: input.title
    })
    .returning();

  return toRoleResponse(role);
}
