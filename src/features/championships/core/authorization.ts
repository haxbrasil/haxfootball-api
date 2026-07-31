import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/client";
import { accounts, type Account } from "@/features/accounts/db";
import { championshipPermissionGrants } from "@/features/championships/core/db";
import { permissions } from "@/features/permissions/db";
import { rolePermissions, roles, type Role } from "@/features/roles/db";
import { forbidden, notFound } from "@/shared/http/errors";

export const championshipPermissionKeys = [
  "championship:admin",
  "championship:operate",
  "championship-history:admin"
] as const;

export type ChampionshipPermission =
  (typeof championshipPermissionKeys)[number];

export type ChampionshipActor = {
  account: Account;
  role: Role;
};

export async function findChampionshipActor(
  database: DatabaseExecutor,
  actorAccountUuid: string
): Promise<ChampionshipActor> {
  const [actor] = await database
    .select({
      account: accounts,
      role: roles
    })
    .from(accounts)
    .innerJoin(roles, eq(accounts.roleId, roles.id))
    .where(eq(accounts.uuid, actorAccountUuid));

  if (!actor) {
    throw notFound("Actor account not found");
  }

  return actor;
}

export async function requireChampionshipActor(
  database: DatabaseExecutor,
  input: {
    actorAccountUuid: string;
    permission: ChampionshipPermission | ChampionshipPermission[];
    championshipId?: number;
  }
): Promise<ChampionshipActor> {
  const actor = await findChampionshipActor(database, input.actorAccountUuid);

  if (
    await championshipActorHasPermission(database, actor, {
      permission: input.permission,
      championshipId: input.championshipId
    })
  ) {
    return actor;
  }

  const requestedPermissions = Array.isArray(input.permission)
    ? input.permission
    : [input.permission];

  throw forbidden(
    `Missing one of permissions: ${requestedPermissions.join(", ")}`
  );
}

export async function championshipActorHasPermission(
  database: DatabaseExecutor,
  actor: ChampionshipActor,
  input: {
    permission: ChampionshipPermission | ChampionshipPermission[];
    championshipId?: number;
  }
): Promise<boolean> {
  if (actor.role.bypassAllPermissions) {
    return true;
  }

  const requestedPermissions = Array.isArray(input.permission)
    ? input.permission
    : [input.permission];
  const [globalPermission] = await database
    .select({ id: permissions.id })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        eq(rolePermissions.roleId, actor.role.id),
        inArray(permissions.key, requestedPermissions)
      )
    );

  if (globalPermission) {
    return true;
  }

  if (input.championshipId !== undefined) {
    const [grant] = await database
      .select({ id: championshipPermissionGrants.id })
      .from(championshipPermissionGrants)
      .where(
        and(
          eq(championshipPermissionGrants.championshipId, input.championshipId),
          eq(championshipPermissionGrants.accountId, actor.account.id),
          inArray(championshipPermissionGrants.permission, requestedPermissions)
        )
      );

    if (grant) {
      return true;
    }
  }

  return false;
}
