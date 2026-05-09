import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { notFound } from "../../../shared/http/errors";
import { type RoleResponse, toRoleResponse } from "../role.contract";
import { roles } from "../role.db";

export async function getRole(uuid: string): Promise<RoleResponse> {
  const [role] = await db.select().from(roles).where(eq(roles.uuid, uuid));

  if (!role) {
    throw notFound("Role not found");
  }

  return toRoleResponse(role);
}
