import { and, asc, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/db/client";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import { championships } from "@/features/championships/core/db";
import {
  championshipCapExceptions,
  championshipParticipantPrices
} from "@/features/championships/finance/db";
import {
  championshipParticipants,
  championshipTeamMemberships,
  championshipTeams
} from "@/features/championships/people/db";
import type {
  ChampionshipSalaryAdminQuery,
  ChampionshipSalaryQuery
} from "@/features/championships/_shared/http/inputs";
import type { ChampionshipSalaryProjectionResponse } from "@/features/championships/_shared/http/responses";
import { notFound } from "@/shared/http/errors";
import { decodeCursor, pageItems } from "@lib";

export async function getPublicChampionshipSalaryProjection(
  championshipUuid: string,
  query: ChampionshipSalaryQuery
): Promise<ChampionshipSalaryProjectionResponse> {
  return getChampionshipSalaryProjectionFrom(
    db,
    championshipUuid,
    query,
    "public"
  );
}

export async function getAdminChampionshipSalaryProjection(
  championshipUuid: string,
  query: ChampionshipSalaryAdminQuery
): Promise<ChampionshipSalaryProjectionResponse> {
  const [championship] = await db
    .select({ id: championships.id })
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));

  if (!championship) {
    throw notFound("Championship not found");
  }

  await requireChampionshipActor(db, {
    actorAccountUuid: query.actorAccountUuid,
    permission: ["championship:admin", "championship:operate"],
    championshipId: championship.id
  });

  return getChampionshipSalaryProjectionFrom(
    db,
    championshipUuid,
    query,
    "admin"
  );
}

export async function getChampionshipSalaryProjectionFrom(
  database: DatabaseExecutor,
  championshipUuid: string,
  query: ChampionshipSalaryQuery,
  visibility: "public" | "admin"
): Promise<ChampionshipSalaryProjectionResponse> {
  const [championship] = await database
    .select()
    .from(championships)
    .where(eq(championships.uuid, championshipUuid));

  if (!championship) {
    throw notFound("Championship not found");
  }

  const participantLimit = query.participantLimit ?? 50;
  const participantCursor = decodeCursor<number>(query.participantCursor);
  const participantRows = await database
    .select({
      participant: championshipParticipants,
      price: championshipParticipantPrices,
      membership: championshipTeamMemberships,
      team: championshipTeams
    })
    .from(championshipParticipants)
    .leftJoin(
      championshipParticipantPrices,
      and(
        eq(
          championshipParticipantPrices.participantId,
          championshipParticipants.id
        ),
        eq(
          championshipParticipantPrices.championshipId,
          championshipParticipants.championshipId
        )
      )
    )
    .leftJoin(
      championshipTeamMemberships,
      and(
        eq(
          championshipTeamMemberships.participantId,
          championshipParticipants.id
        ),
        isNull(championshipTeamMemberships.endedAt)
      )
    )
    .leftJoin(
      championshipTeams,
      eq(championshipTeamMemberships.teamId, championshipTeams.id)
    )
    .where(
      and(
        eq(championshipParticipants.championshipId, championship.id),
        visibility === "public"
          ? inArray(championshipParticipants.status, ["pending", "active"])
          : undefined,
        participantCursor === undefined
          ? undefined
          : gt(championshipParticipants.id, participantCursor)
      )
    )
    .orderBy(asc(championshipParticipants.id))
    .limit(participantLimit + 1);
  const participantPage = pageItems(
    participantRows,
    {
      limit: participantLimit,
      cursor: query.participantCursor
    },
    ({ participant }) => participant.id
  );
  const exposePrices =
    visibility === "admin" || championship.priceState === "locked";

  const [missingPriceResult] = await database
    .select({ value: count() })
    .from(championshipParticipants)
    .leftJoin(
      championshipParticipantPrices,
      and(
        eq(
          championshipParticipantPrices.participantId,
          championshipParticipants.id
        ),
        eq(
          championshipParticipantPrices.championshipId,
          championshipParticipants.championshipId
        )
      )
    )
    .where(
      and(
        eq(championshipParticipants.championshipId, championship.id),
        inArray(championshipParticipants.status, ["pending", "active"]),
        isNull(championshipParticipantPrices.id)
      )
    );
  const missingPriceCount = missingPriceResult?.value ?? 0;

  const teamLimit = query.teamLimit ?? 50;
  const teamCursor = decodeCursor<number>(query.teamCursor);
  const teamRows = await database
    .select({
      team: championshipTeams,
      rosterSize: count(championshipTeamMemberships.id),
      usageUnits: sql<number>`coalesce(sum(coalesce(${championshipTeamMemberships.priceUnitsSnapshot}, 0)), 0)`
    })
    .from(championshipTeams)
    .leftJoin(
      championshipTeamMemberships,
      and(
        eq(championshipTeamMemberships.teamId, championshipTeams.id),
        isNull(championshipTeamMemberships.endedAt)
      )
    )
    .where(
      and(
        eq(championshipTeams.championshipId, championship.id),
        teamCursor === undefined
          ? undefined
          : gt(championshipTeams.id, teamCursor)
      )
    )
    .groupBy(championshipTeams.id)
    .orderBy(asc(championshipTeams.id))
    .limit(teamLimit + 1);
  const teamPage = pageItems(
    teamRows,
    { limit: teamLimit, cursor: query.teamCursor },
    ({ team }) => team.id
  );
  const teamIds = teamPage.items.map(({ team }) => team.id);
  const exceptionRows =
    teamIds.length === 0
      ? []
      : await database
          .select()
          .from(championshipCapExceptions)
          .where(
            and(
              inArray(championshipCapExceptions.teamId, teamIds),
              eq(championshipCapExceptions.state, "active")
            )
          )
          .orderBy(asc(championshipCapExceptions.id));
  const exceptionByTeamId = new Map(
    exceptionRows.map((exception) => [exception.teamId, exception])
  );
  const capUnits = championship.rules.salary.capUnits;

  return {
    championshipUuid: championship.uuid,
    enabled: championship.rules.salary.enabled,
    priceState: championship.priceState,
    capUnits,
    displayLabel: championship.rules.salary.displayLabel,
    visibility,
    validation: {
      missingPriceCount:
        visibility === "admin" && championship.rules.salary.enabled
          ? missingPriceCount
          : 0,
      missingParticipantIds:
        visibility === "admin"
          ? participantPage.items
              .filter(
                ({ participant, price }) =>
                  ["pending", "active"].includes(participant.status) && !price
              )
              .map(({ participant }) => participant.uuid)
          : [],
      canFreeze:
        visibility === "admin" &&
        championship.rules.salary.enabled &&
        championship.priceState === "editable" &&
        championship.registrationState === "closed" &&
        missingPriceCount === 0
    },
    participants: {
      items: participantPage.items.map(
        ({ participant, price, membership, team }) => ({
          uuid: participant.uuid,
          displayName: participant.displayNameSnapshot,
          status: participant.status,
          priceUnits: exposePrices ? (price?.priceUnits ?? null) : null,
          frozenAt: exposePrices ? (price?.frozenAt ?? null) : null,
          membership:
            membership && team
              ? {
                  uuid: membership.uuid,
                  teamUuid: team.uuid,
                  teamName: team.name,
                  role: membership.role,
                  priceUnitsSnapshot: membership.priceUnitsSnapshot
                }
              : null
        })
      ),
      page: participantPage.page
    },
    teams: {
      items: teamPage.items.map(({ team, rosterSize, usageUnits }) => {
        const normalizedUsage = Number(usageUnits);
        const exception = exceptionByTeamId.get(team.id) ?? null;
        const overCap =
          championship.rules.salary.enabled && normalizedUsage > capUnits;
        const approvedOverCap =
          overCap && exception?.rosterRevisionSnapshot === team.rosterRevision;

        return {
          uuid: team.uuid,
          name: team.name,
          abbreviation: team.abbreviation,
          colors: team.colors,
          rosterRevision: team.rosterRevision,
          rosterSize: Number(rosterSize),
          usageUnits: normalizedUsage,
          remainingUnits: capUnits - normalizedUsage,
          overCap,
          approvedOverCap,
          activeException: exception
            ? {
                uuid: exception.uuid,
                usageUnitsSnapshot: exception.usageUnitsSnapshot,
                rosterRevisionSnapshot: exception.rosterRevisionSnapshot,
                expiresAtRevision: exception.expiresAtRevision,
                approvedAt: exception.approvedAt,
                reason: visibility === "admin" ? exception.reason : null
              }
            : null
        };
      }),
      page: teamPage.page
    }
  };
}
