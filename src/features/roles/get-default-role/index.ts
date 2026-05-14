import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import type { RoleWithPermissions } from "@/features/roles/role.contract";
import {
  defaultRoleId,
  defaultRoleName,
  defaultRoleTitle,
  roles
} from "@/features/roles/role.db";
import { roleWithPermissions } from "@/features/roles/role.persistence";

export async function getDefaultRole(): Promise<RoleWithPermissions> {
  const [existingRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, defaultRoleName));

  if (existingRole) {
    return roleWithPermissions(existingRole);
  }

  const [role] = await db
    .insert(roles)
    .values({
      id: defaultRoleId,
      name: defaultRoleName,
      title: defaultRoleTitle
    })
    .returning();

  return roleWithPermissions(role);
}
