import { and, asc, eq, gt, isNull, type SQL } from "drizzle-orm";
import { db, type DbTransaction } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import {
  championshipCompetitionTypes,
  championshipPermissionGrants,
  championshipRoomPrograms,
  championships,
  type Championship,
  type ChampionshipCompetitionType
} from "@/features/championships/core/db";
import {
  championshipTeamIdentities,
  championshipTeams,
  type ChampionshipTeam,
  type ChampionshipTeamIdentity
} from "@/features/championships/people/db";
import type {
  ChampionshipCompetitionTypeResponse,
  ChampionshipDetailResponse,
  ChampionshipSummaryResponse,
  ChampionshipTeamIdentityResponse,
  ChampionshipTeamResponse
} from "@/features/championships/_shared/http/responses";
import { roomPrograms } from "@/features/rooms/core-db";
import { notFound } from "@/shared/http/errors";

type Database = typeof db | DbTransaction;

export type ChampionshipWithType = {
  championship: Championship;
  competitionType: ChampionshipCompetitionType;
};

export function toCompetitionTypeResponse(
  type: ChampionshipCompetitionType
): ChampionshipCompetitionTypeResponse {
  return {
    uuid: type.uuid,
    slug: type.slug,
    name: type.name,
    description: type.description,
    cadence: type.cadence,
    defaultRulesSchemaVersion: type.defaultRulesSchemaVersion,
    defaultRules: type.defaultRules,
    state: type.state,
    revision: type.revision,
    createdAt: type.createdAt,
    updatedAt: type.updatedAt
  };
}

export function toTeamIdentityResponse(
  identity: ChampionshipTeamIdentity
): ChampionshipTeamIdentityResponse {
  return {
    uuid: identity.uuid,
    slug: identity.slug,
    name: identity.name,
    abbreviation: identity.abbreviation,
    colors: identity.colors,
    branding: identity.branding,
    archivedAt: identity.archivedAt,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt
  };
}

export function toTeamResponse(
  team: ChampionshipTeam,
  identity: ChampionshipTeamIdentity | null
): ChampionshipTeamResponse {
  return {
    uuid: team.uuid,
    teamIdentity: identity ? toTeamIdentityResponse(identity) : null,
    name: team.name,
    abbreviation: team.abbreviation,
    colors: team.colors,
    brandingSnapshot: team.brandingSnapshot,
    seed: team.seed,
    displayOrder: team.displayOrder,
    state: team.state,
    rosterRevision: team.rosterRevision,
    revision: team.revision,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt
  };
}

export function toChampionshipSummaryResponse(
  row: ChampionshipWithType
): ChampionshipSummaryResponse {
  const { championship, competitionType } = row;

  return {
    uuid: championship.uuid,
    slug: championship.slug,
    competitionType: toCompetitionTypeResponse(competitionType),
    name: championship.name,
    editionLabel: championship.editionLabel,
    description: championship.description,
    lifecycle: championship.lifecycle,
    visibility: championship.visibility,
    registrationState: championship.registrationState,
    priceState: championship.priceState,
    historical: championship.historical,
    revision: championship.revision,
    changeSequence: championship.changeSequence,
    startsAt: championship.startsAt,
    endsAt: championship.endsAt,
    publishedAt: championship.publishedAt,
    completedAt: championship.completedAt,
    createdAt: championship.createdAt,
    updatedAt: championship.updatedAt
  };
}

export async function getChampionshipWithType(
  database: Database,
  uuid: string,
  includeDeleted = false
): Promise<ChampionshipWithType> {
  const [row] = await database
    .select({
      championship: championships,
      competitionType: championshipCompetitionTypes
    })
    .from(championships)
    .innerJoin(
      championshipCompetitionTypes,
      eq(championships.competitionTypeId, championshipCompetitionTypes.id)
    )
    .where(
      includeDeleted
        ? eq(championships.uuid, uuid)
        : and(eq(championships.uuid, uuid), isNull(championships.deletedAt))
    );

  if (!row) {
    throw notFound("Championship not found");
  }

  return row;
}

export async function getChampionshipDetail(
  uuid: string
): Promise<ChampionshipDetailResponse> {
  return getChampionshipDetailFrom(db, uuid);
}

export async function getChampionshipDetailFrom(
  database: Database,
  uuid: string,
  includeDeleted = false
): Promise<ChampionshipDetailResponse> {
  const row = await getChampionshipWithType(database, uuid, includeDeleted);
  const teamRows = await database
    .select({
      team: championshipTeams,
      identity: championshipTeamIdentities
    })
    .from(championshipTeams)
    .leftJoin(
      championshipTeamIdentities,
      eq(championshipTeams.teamIdentityId, championshipTeamIdentities.id)
    )
    .where(eq(championshipTeams.championshipId, row.championship.id))
    .orderBy(asc(championshipTeams.displayOrder), asc(championshipTeams.id));
  const programRows = await database
    .select({
      allowed: championshipRoomPrograms,
      program: roomPrograms
    })
    .from(championshipRoomPrograms)
    .innerJoin(
      roomPrograms,
      eq(championshipRoomPrograms.roomProgramId, roomPrograms.id)
    )
    .where(eq(championshipRoomPrograms.championshipId, row.championship.id))
    .orderBy(asc(championshipRoomPrograms.id));
  const grantRows = await database
    .select({
      grant: championshipPermissionGrants,
      account: accounts
    })
    .from(championshipPermissionGrants)
    .innerJoin(
      accounts,
      eq(championshipPermissionGrants.accountId, accounts.id)
    )
    .where(eq(championshipPermissionGrants.championshipId, row.championship.id))
    .orderBy(asc(championshipPermissionGrants.id));

  return {
    ...toChampionshipSummaryResponse(row),
    rulesSchemaVersion: row.championship.rulesSchemaVersion,
    rules: row.championship.rules,
    teams: teamRows.map(({ team, identity }) => toTeamResponse(team, identity)),
    roomPrograms: programRows.map(({ allowed, program }) => ({
      uuid: program.uuid,
      name: program.name,
      title: program.title,
      state: allowed.state,
      isDefault: allowed.isDefault
    })),
    grants: grantRows.map(({ grant, account }) => ({
      accountUuid: account.uuid,
      accountName: account.name,
      permission: grant.permission,
      createdAt: grant.createdAt
    }))
  };
}

export function cursorIdCondition(
  column: Parameters<typeof gt>[0],
  cursor: number | undefined
): SQL | undefined {
  return cursor === undefined ? undefined : gt(column, cursor);
}

export function conditionsAnd(conditions: Array<SQL | undefined>) {
  const present = conditions.filter(
    (condition): condition is SQL => condition !== undefined
  );

  return present.length > 0 ? and(...present) : undefined;
}
