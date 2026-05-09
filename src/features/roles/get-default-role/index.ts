import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import {
  type Role,
  defaultRoleId,
  defaultRoleName,
  defaultRoleUuid,
  roles
} from "../role.db";

export async function getDefaultRole(): Promise<Role> {
  const [existingRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.isDefault, true));

  if (existingRole) {
    return existingRole;
  }

  const [role] = await db
    .insert(roles)
    .values({
      id: defaultRoleId,
      uuid: defaultRoleUuid,
      name: defaultRoleName,
      isDefault: true
    })
    .returning();

  return role;
}
