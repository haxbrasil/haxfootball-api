import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { resolveLabels } from "@/features/localization/resolve-labels";
import { notFound } from "@/shared/http/errors";
import type { RoleLanguageQuery } from "@/features/roles/_shared/http/inputs";
import type { RoleResponse } from "@/features/roles/_shared/http/responses";
import { toRoleResponse } from "@/features/roles/_shared/http/responses";
import { roles } from "@/features/roles/db";
import { roleWithPermissions } from "@/features/roles/_shared/db/queries";

export async function getRole(
  uuid: string,
  query: RoleLanguageQuery = {}
): Promise<RoleResponse> {
  const [role] = await db.select().from(roles).where(eq(roles.uuid, uuid));

  if (!role) {
    throw notFound("Role not found");
  }

  const labels = await resolveLabels([role.title], query.language);

  return toRoleResponse(await roleWithPermissions(role), labels);
}
