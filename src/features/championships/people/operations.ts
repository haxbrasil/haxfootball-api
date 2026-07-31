import { and, asc, eq, gt, ne } from "drizzle-orm";
import { db, type DbTransaction } from "@/db/client";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import {
  championshipTeamIdentities,
  championshipTeams
} from "@/features/championships/people/db";
import {
  type CreateChampionshipTeamInput,
  type CreateTeamIdentityInput,
  type UpdateTeamIdentityInput,
  type UpdateChampionshipTeamInput
} from "@/features/championships/_shared/http/inputs";
import {
  type ChampionshipTeamIdentityResponse,
  type ChampionshipTeamResponse
} from "@/features/championships/_shared/http/responses";
import {
  toTeamIdentityResponse,
  toTeamResponse
} from "@/features/championships/_shared/db/queries";
import { badRequest, notFound } from "@/shared/http/errors";
import {
  decodeCursor,
  pageItems,
  pageLimit,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

export async function createTeamIdentity(
  championshipUuid: string,
  input: CreateTeamIdentityInput
): Promise<ChampionshipTeamIdentityResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "team-identity.created"
    },
    async (tx) => {
      const [duplicate] = await tx
        .select({ id: championshipTeamIdentities.id })
        .from(championshipTeamIdentities)
        .where(eq(championshipTeamIdentities.slug, input.slug));

      if (duplicate) {
        throw badRequest("Team identity slug already exists");
      }

      const [identity] = await tx
        .insert(championshipTeamIdentities)
        .values({
          slug: input.slug,
          name: input.name,
          abbreviation: input.abbreviation ?? null,
          colors: input.colors ?? null,
          branding: input.branding ?? null
        })
        .returning();
      const response = toTeamIdentityResponse(identity);

      return {
        response: () => response,
        targetType: "team-identity",
        targetUuid: identity.uuid,
        before: null,
        after: response
      };
    }
  );
}

export async function createChampionshipTeam(
  championshipUuid: string,
  input: CreateChampionshipTeamInput
): Promise<ChampionshipTeamResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "team.created"
    },
    async (tx, championship) => {
      const identity = input.teamIdentityId
        ? await findTeamIdentity(tx, input.teamIdentityId)
        : null;
      await assertTeamUniqueness(tx, {
        championshipId: championship.id,
        name: input.name,
        abbreviation: input.abbreviation ?? identity?.abbreviation ?? null
      });

      const [team] = await tx
        .insert(championshipTeams)
        .values({
          championshipId: championship.id,
          teamIdentityId: identity?.id ?? null,
          name: input.name,
          abbreviation: input.abbreviation ?? identity?.abbreviation ?? null,
          colors: input.colors ?? identity?.colors ?? null,
          brandingSnapshot: identity?.branding ?? null,
          seed: input.seed ?? null,
          displayOrder: input.displayOrder ?? 0,
          revision: 1
        })
        .returning();
      const response = toTeamResponse(team, identity);

      return {
        response: () => response,
        targetType: "team",
        targetUuid: team.uuid,
        before: null,
        after: response
      };
    }
  );
}

export async function updateChampionshipTeam(
  championshipUuid: string,
  teamUuid: string,
  input: UpdateChampionshipTeamInput
): Promise<ChampionshipTeamResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "team.updated"
    },
    async (tx, championship) => {
      const [team] = await tx
        .select()
        .from(championshipTeams)
        .where(
          and(
            eq(championshipTeams.uuid, teamUuid),
            eq(championshipTeams.championshipId, championship.id)
          )
        );

      if (!team) {
        throw notFound("Championship team not found");
      }

      const identity =
        input.teamIdentityId === undefined
          ? team.teamIdentityId
            ? await findTeamIdentityById(tx, team.teamIdentityId)
            : null
          : input.teamIdentityId
            ? await findTeamIdentity(tx, input.teamIdentityId)
            : null;
      const nextName = input.name ?? team.name;
      const nextAbbreviation =
        input.abbreviation === undefined
          ? team.abbreviation
          : input.abbreviation;

      await assertTeamUniqueness(tx, {
        championshipId: championship.id,
        name: nextName,
        abbreviation: nextAbbreviation,
        exceptTeamId: team.id
      });
      const [updated] = await tx
        .update(championshipTeams)
        .set({
          teamIdentityId: identity?.id ?? null,
          name: nextName,
          abbreviation: nextAbbreviation,
          colors: input.colors === undefined ? team.colors : input.colors,
          brandingSnapshot:
            input.teamIdentityId === undefined
              ? team.brandingSnapshot
              : (identity?.branding ?? null),
          seed: input.seed === undefined ? team.seed : input.seed,
          displayOrder: input.displayOrder ?? team.displayOrder,
          state: input.state ?? team.state,
          revision: team.revision + 1,
          updatedAt: new Date().toISOString()
        })
        .where(eq(championshipTeams.id, team.id))
        .returning();
      const response = toTeamResponse(updated, identity);

      return {
        response: () => response,
        targetType: "team",
        targetUuid: team.uuid,
        before: toTeamResponse(
          team,
          team.teamIdentityId
            ? await findTeamIdentityById(tx, team.teamIdentityId)
            : null
        ),
        after: response
      };
    }
  );
}

export async function updateTeamIdentity(
  championshipUuid: string,
  identityUuid: string,
  input: UpdateTeamIdentityInput
): Promise<ChampionshipTeamIdentityResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: "championship:admin",
      action: "team-identity.updated"
    },
    async (tx) => {
      const [identity] = await tx
        .select()
        .from(championshipTeamIdentities)
        .where(eq(championshipTeamIdentities.uuid, identityUuid));

      if (!identity) {
        throw notFound("Team identity not found");
      }

      if (
        input.name === undefined &&
        input.abbreviation === undefined &&
        input.colors === undefined &&
        input.branding === undefined &&
        input.state === undefined
      ) {
        throw badRequest("At least one team identity field is required");
      }

      const [updated] = await tx
        .update(championshipTeamIdentities)
        .set({
          name: input.name ?? identity.name,
          abbreviation:
            input.abbreviation === undefined
              ? identity.abbreviation
              : input.abbreviation,
          colors: input.colors === undefined ? identity.colors : input.colors,
          branding:
            input.branding === undefined ? identity.branding : input.branding,
          archivedAt:
            input.state === undefined
              ? identity.archivedAt
              : input.state === "archived"
                ? new Date().toISOString()
                : null,
          updatedAt: new Date().toISOString()
        })
        .where(eq(championshipTeamIdentities.id, identity.id))
        .returning();
      const response = toTeamIdentityResponse(updated);

      return {
        response: () => response,
        targetType: "team-identity",
        targetUuid: identity.uuid,
        before: toTeamIdentityResponse(identity),
        after: response
      };
    }
  );
}

export async function listTeamIdentities(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<ChampionshipTeamIdentityResponse>> {
  const cursor = decodeCursor<number>(query.cursor);
  const rows = await db
    .select()
    .from(championshipTeamIdentities)
    .where(
      cursor === undefined
        ? undefined
        : gt(championshipTeamIdentities.id, cursor)
    )
    .orderBy(asc(championshipTeamIdentities.id))
    .limit(pageLimit(query));
  const page = pageItems(rows, query, (row) => row.id);

  return {
    items: page.items.map(toTeamIdentityResponse),
    page: page.page
  };
}

async function findTeamIdentity(database: DbTransaction, uuid: string) {
  const [identity] = await database
    .select()
    .from(championshipTeamIdentities)
    .where(eq(championshipTeamIdentities.uuid, uuid));

  if (!identity || identity.archivedAt) {
    throw badRequest("Active team identity not found");
  }

  return identity;
}

async function findTeamIdentityById(database: DbTransaction, id: number) {
  const [identity] = await database
    .select()
    .from(championshipTeamIdentities)
    .where(eq(championshipTeamIdentities.id, id));

  return identity ?? null;
}

async function assertTeamUniqueness(
  database: DbTransaction,
  input: {
    championshipId: number;
    name: string;
    abbreviation: string | null;
    exceptTeamId?: number;
  }
) {
  const baseConditions = [
    eq(championshipTeams.championshipId, input.championshipId),
    input.exceptTeamId === undefined
      ? undefined
      : ne(championshipTeams.id, input.exceptTeamId)
  ];
  const [duplicateName] = await database
    .select({ id: championshipTeams.id })
    .from(championshipTeams)
    .where(and(...baseConditions, eq(championshipTeams.name, input.name)));

  if (duplicateName) {
    throw badRequest("Championship team name already exists");
  }

  if (input.abbreviation === null) {
    return;
  }

  const [duplicateAbbreviation] = await database
    .select({ id: championshipTeams.id })
    .from(championshipTeams)
    .where(
      and(
        ...baseConditions,
        eq(championshipTeams.abbreviation, input.abbreviation)
      )
    );

  if (duplicateAbbreviation) {
    throw badRequest("Championship team abbreviation already exists");
  }
}
