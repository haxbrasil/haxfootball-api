import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notFound } from "@/shared/http/errors";
import type { RoleResponse } from "@/features/roles/_shared/http/responses";
import { toRoleResponse } from "@/features/roles/_shared/http/responses";
import { roles } from "@/features/roles/db";
import { roleWithPermissions } from "@/features/roles/_shared/db/queries";

export async function getRole(uuid: string): Promise<RoleResponse> {
  const [role] = await db.select().from(roles).where(eq(roles.uuid, uuid));

  if (!role) {
    throw notFound("Role not found");
  }

  return toRoleResponse(await roleWithPermissions(role));
}
