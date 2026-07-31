import { and, asc, count, eq, inArray, or } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import { championships } from "@/features/championships/core/db";
import {
  championshipMatches,
  championshipSpots
} from "@/features/championships/format-scheduling/db";
import { championshipStatisticEntries } from "@/features/championships/matches-statistics/db";
import {
  championshipHistoricalPlayerIdentities,
  championshipParticipants,
  championshipTeamIdentities,
  championshipTeamMemberships,
  championshipTeams
} from "@/features/championships/people/db";
import {
  championshipAwards,
  championshipPlacements,
  championshipRecords
} from "@/features/championships/history/db";
import { championshipMatchNeedsSettlement } from "@/features/championships/history/completion";
import type {
  AccountChampionshipHistoryResponse,
  ChampionshipAwardResponse,
  ChampionshipHistoryQuery,
  ChampionshipHistoryResponse,
  ChampionshipPlacementResponse,
  CreateChampionshipAwardInput,
  ReplaceChampionshipPlacementsInput,
  TeamIdentityHistoryResponse,
  UpdateChampionshipAwardInput
} from "@/features/championships/history/contracts";
import { badRequest, forbidden, notFound } from "@/shared/http/errors";

const projectionLimit = 500;

export async function getChampionshipHistory(
  championshipUuid: string,
  query: ChampionshipHistoryQuery = {}
): Promise<ChampionshipHistoryResponse> {
  const championship = await requireHistoryChampionship(championshipUuid);

  if (championship.visibility !== "public" && !query.actorAccountUuid) {
    throw forbidden("Private championship history requires staff access");
  }
  if (championship.visibility !== "public") {
    await requireChampionshipActor(db, {
      actorAccountUuid: query.actorAccountUuid!,
      championshipId: championship.id,
      permission: [
        "championship:admin",
        "championship:operate",
        "championship-history:admin"
      ]
    });
  }

  const limit = Math.min(projectionLimit, Math.max(1, query.limit ?? 100));
  const [
    placementRows,
    awardRows,
    teamCount,
    membershipCount,
    matchCount,
    statisticCount,
    recordRows
  ] = await Promise.all([
    db
      .select()
      .from(championshipPlacements)
      .where(eq(championshipPlacements.championshipId, championship.id))
      .orderBy(asc(championshipPlacements.rank), asc(championshipPlacements.id))
      .limit(limit + 1),
    db
      .select()
      .from(championshipAwards)
      .where(
        and(
          eq(championshipAwards.championshipId, championship.id),
          query.kind ? eq(championshipAwards.kind, query.kind) : undefined
        )
      )
      .orderBy(asc(championshipAwards.kind), asc(championshipAwards.id))
      .limit(limit + 1),
    countRows(
      championshipTeams,
      championshipTeams.championshipId,
      championship.id
    ),
    countRows(
      championshipTeamMemberships,
      championshipTeamMemberships.championshipId,
      championship.id
    ),
    countRows(
      championshipMatches,
      championshipMatches.championshipId,
      championship.id
    ),
    countRows(
      championshipStatisticEntries,
      championshipStatisticEntries.championshipId,
      championship.id
    ),
    db
      .select()
      .from(championshipRecords)
      .where(
        and(
          eq(championshipRecords.championshipId, championship.id),
          eq(championshipRecords.scope, "championship"),
          eq(championshipRecords.state, "current")
        )
      )
      .orderBy(asc(championshipRecords.metricKey), asc(championshipRecords.id))
      .limit(limit + 1)
  ]);
  const [placementTotal, awardTotal, recordTotal] = await Promise.all([
    countRows(
      championshipPlacements,
      championshipPlacements.championshipId,
      championship.id
    ),
    countRows(
      championshipAwards,
      championshipAwards.championshipId,
      championship.id,
      query.kind ? eq(championshipAwards.kind, query.kind) : undefined
    ),
    countRows(
      championshipRecords,
      championshipRecords.championshipId,
      championship.id,
      and(
        eq(championshipRecords.scope, "championship"),
        eq(championshipRecords.state, "current")
      )
    )
  ]);
  const placements = await projectPlacements(db, placementRows.slice(0, limit));
  const awards = await projectAwards(db, awardRows.slice(0, limit));
  const statisticRecords = await projectStatisticRecords(
    db,
    recordRows.slice(0, limit)
  );
  const records = buildRecords(placements, awards, statisticRecords);

  return {
    championship: {
      uuid: championship.uuid,
      slug: championship.slug,
      name: championship.name,
      editionLabel: championship.editionLabel,
      lifecycle: championship.lifecycle,
      historical: championship.historical,
      completedAt: championship.completedAt,
      archivedAt: championship.archivedAt
    },
    completeness: {
      placements: placementTotal > 0,
      awards: awardTotal > 0,
      teams: teamCount > 0,
      rosters: membershipCount > 0,
      matches: matchCount > 0,
      detailedStatistics: statisticCount > 0
    },
    placements: {
      items: placements,
      totalCount: placementTotal,
      truncated: placementTotal > placements.length
    },
    awards: {
      items: awards,
      totalCount: awardTotal,
      truncated: awardTotal > awards.length
    },
    records: {
      items: records.slice(0, limit),
      totalCount: placementTotal + awardTotal + recordTotal,
      truncated:
        placementTotal + awardTotal + recordTotal >
        records.slice(0, limit).length
    }
  };
}

export async function replaceChampionshipPlacements(
  championshipUuid: string,
  input: ReplaceChampionshipPlacementsInput
): Promise<ChampionshipHistoryResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship-history:admin"],
      action: "history.placements.replaced"
    },
    async (tx, championship, actor) => {
      const ranks = new Set(input.placements.map(({ rank }) => rank));
      const teamUuids = new Set(
        input.placements.map(({ teamUuid }) => teamUuid)
      );

      if (ranks.size !== input.placements.length) {
        throw badRequest("Placement ranks must be unique");
      }
      if (teamUuids.size !== input.placements.length) {
        throw badRequest("Each team may have only one placement");
      }

      const teams = await tx
        .select()
        .from(championshipTeams)
        .where(
          and(
            eq(championshipTeams.championshipId, championship.id),
            inArray(championshipTeams.uuid, [...teamUuids])
          )
        );
      if (teams.length !== teamUuids.size) {
        throw badRequest(
          "Every placement team must belong to the championship"
        );
      }

      const before = await tx
        .select()
        .from(championshipPlacements)
        .where(eq(championshipPlacements.championshipId, championship.id));
      await tx
        .delete(championshipPlacements)
        .where(eq(championshipPlacements.championshipId, championship.id));
      const teamByUuid = new Map(teams.map((team) => [team.uuid, team]));

      await tx.insert(championshipPlacements).values(
        input.placements.map((placement) => {
          const team = teamByUuid.get(placement.teamUuid)!;
          return {
            championshipId: championship.id,
            teamId: team.id,
            rank: placement.rank,
            teamIdentityIdSnapshot: team.teamIdentityId,
            teamNameSnapshot: team.name,
            source: input.source ?? "staff",
            awardedByAccountId: actor.account.id
          };
        })
      );
      const placementTeamByRank = new Map(
        input.placements.map((placement) => [
          placement.rank,
          teamByUuid.get(placement.teamUuid)!.id
        ])
      );
      const placementSpots = await tx
        .select()
        .from(championshipSpots)
        .where(
          and(
            eq(championshipSpots.championshipId, championship.id),
            eq(championshipSpots.kind, "placement")
          )
        );

      for (const spot of placementSpots) {
        if (spot.placementRank === null) continue;
        const teamId = placementTeamByRank.get(spot.placementRank) ?? null;

        if (teamId === spot.currentTeamId) continue;
        await tx
          .update(championshipSpots)
          .set({
            currentTeamId: teamId,
            revision: spot.revision + 1,
            updatedAt: new Date().toISOString()
          })
          .where(eq(championshipSpots.id, spot.id));
      }
      const response = await getChampionshipHistoryFrom(tx, championship);

      return {
        response: () => response,
        targetType: "championship-placements",
        targetUuid: championship.uuid,
        before,
        after: response.placements.items,
        reason: input.reason
      };
    }
  );
}

export async function createChampionshipAward(
  championshipUuid: string,
  input: CreateChampionshipAwardInput
): Promise<ChampionshipAwardResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship-history:admin"],
      action: "history.award.created"
    },
    async (tx, championship, actor) => {
      const target = await resolveAwardTarget(
        tx,
        championship.id,
        input.target
      );
      const [award] = await tx
        .insert(championshipAwards)
        .values({
          championshipId: championship.id,
          kind: input.kind,
          rank: input.rank ?? null,
          targetType: input.target.type,
          ...target.columns,
          teamIdentityIdSnapshot: target.identitySnapshotId,
          displayLabel: input.displayLabel,
          note: input.note ?? null,
          awardedByAccountId: actor.account.id
        })
        .returning();
      const response = await projectAward(tx, award);

      return {
        response: () => response,
        targetType: "championship-award",
        targetUuid: award.uuid,
        before: null,
        after: response
      };
    }
  );
}

export async function updateChampionshipAward(
  championshipUuid: string,
  awardUuid: string,
  input: UpdateChampionshipAwardInput
): Promise<ChampionshipAwardResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship-history:admin"],
      action: "history.award.corrected"
    },
    async (tx, championship) => {
      const [award] = await tx
        .select()
        .from(championshipAwards)
        .where(
          and(
            eq(championshipAwards.uuid, awardUuid),
            eq(championshipAwards.championshipId, championship.id)
          )
        );
      if (!award) throw notFound("Championship award not found");
      const target = input.target
        ? await resolveAwardTarget(tx, championship.id, input.target)
        : null;
      const [updated] = await tx
        .update(championshipAwards)
        .set({
          kind: input.kind ?? award.kind,
          rank: input.rank === undefined ? award.rank : input.rank,
          targetType: input.target?.type ?? award.targetType,
          ...(target
            ? {
                ...target.columns,
                teamIdentityIdSnapshot: target.identitySnapshotId
              }
            : {}),
          displayLabel: input.displayLabel ?? award.displayLabel,
          note: input.note === undefined ? award.note : input.note
        })
        .where(eq(championshipAwards.id, award.id))
        .returning();
      const response = await projectAward(tx, updated);

      return {
        response: () => response,
        targetType: "championship-award",
        targetUuid: award.uuid,
        before: await projectAward(tx, award),
        after: response,
        reason: input.reason
      };
    }
  );
}

export async function getTeamIdentityHistory(
  identityUuid: string,
  query: ChampionshipHistoryQuery = {}
): Promise<TeamIdentityHistoryResponse> {
  const limit = Math.min(projectionLimit, Math.max(1, query.limit ?? 100));
  const [identity] = await db
    .select()
    .from(championshipTeamIdentities)
    .where(eq(championshipTeamIdentities.uuid, identityUuid));
  if (!identity) throw notFound("Team identity not found");
  const rows = await db
    .select({
      placement: championshipPlacements,
      championship: championships
    })
    .from(championshipPlacements)
    .innerJoin(
      championships,
      eq(championshipPlacements.championshipId, championships.id)
    )
    .where(
      and(
        eq(championshipPlacements.teamIdentityIdSnapshot, identity.id),
        eq(championships.visibility, "public")
      )
    )
    .orderBy(asc(championships.completedAt), asc(championshipPlacements.rank))
    .limit(limit + 1);

  return {
    identity: {
      uuid: identity.uuid,
      slug: identity.slug,
      name: identity.name,
      abbreviation: identity.abbreviation
    },
    titles: rows.filter(({ placement }) => placement.rank === 1).length,
    podiums: rows.filter(({ placement }) => placement.rank <= 3).length,
    editions: rows.slice(0, limit).map(({ placement, championship }) => ({
      championshipUuid: championship.uuid,
      championshipSlug: championship.slug,
      championshipName: championship.name,
      editionLabel: championship.editionLabel,
      rank: placement.rank,
      teamNameSnapshot: placement.teamNameSnapshot,
      completedAt: championship.completedAt
    })),
    truncated: rows.length > limit
  };
}

export async function getAccountChampionshipHistory(
  accountUuid: string,
  query: ChampionshipHistoryQuery = {}
): Promise<AccountChampionshipHistoryResponse> {
  const limit = Math.min(projectionLimit, Math.max(1, query.limit ?? 100));
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.uuid, accountUuid));
  if (!account) throw notFound("Account not found");
  const historicalIds = (
    await db
      .select({ id: championshipHistoricalPlayerIdentities.id })
      .from(championshipHistoricalPlayerIdentities)
      .where(
        eq(championshipHistoricalPlayerIdentities.linkedAccountId, account.id)
      )
  ).map(({ id }) => id);
  const participants = await db
    .select({
      participant: championshipParticipants,
      championship: championships
    })
    .from(championshipParticipants)
    .innerJoin(
      championships,
      eq(championshipParticipants.championshipId, championships.id)
    )
    .where(
      and(
        eq(championships.visibility, "public"),
        or(
          eq(championshipParticipants.accountId, account.id),
          historicalIds.length
            ? inArray(
                championshipParticipants.historicalPlayerIdentityId,
                historicalIds
              )
            : undefined
        )
      )
    )
    .orderBy(asc(championships.completedAt), asc(championshipParticipants.id))
    .limit(limit + 1);
  const projected = [];

  for (const row of participants.slice(0, limit)) {
    const [membership] = await db
      .select({
        membership: championshipTeamMemberships,
        team: championshipTeams
      })
      .from(championshipTeamMemberships)
      .innerJoin(
        championshipTeams,
        eq(championshipTeamMemberships.teamId, championshipTeams.id)
      )
      .where(eq(championshipTeamMemberships.participantId, row.participant.id))
      .orderBy(asc(championshipTeamMemberships.id))
      .limit(1);
    const awards = await db
      .select({ label: championshipAwards.displayLabel })
      .from(championshipAwards)
      .where(
        and(
          eq(championshipAwards.championshipId, row.championship.id),
          or(
            eq(championshipAwards.participantId, row.participant.id),
            eq(championshipAwards.accountId, account.id),
            row.participant.historicalPlayerIdentityId
              ? eq(
                  championshipAwards.historicalPlayerIdentityId,
                  row.participant.historicalPlayerIdentityId
                )
              : undefined
          )
        )
      );
    projected.push({
      championshipUuid: row.championship.uuid,
      championshipSlug: row.championship.slug,
      championshipName: row.championship.name,
      displayNameSnapshot: row.participant.displayNameSnapshot,
      teamName: membership?.team.name ?? null,
      role: membership?.membership.role ?? null,
      awards: awards.map(({ label }) => label),
      completedAt: row.championship.completedAt
    });
  }

  return {
    account: { uuid: account.uuid, name: account.name },
    editions: projected,
    totalCount: participants.length > limit ? limit + 1 : participants.length,
    truncated: participants.length > limit
  };
}

export async function assertChampionshipCompletionReady(
  database: DatabaseExecutor,
  championshipId: number,
  historical: boolean
): Promise<void> {
  if (historical) return;
  const placements = await database
    .select({ rank: championshipPlacements.rank })
    .from(championshipPlacements)
    .where(eq(championshipPlacements.championshipId, championshipId));
  const ranks = new Set(placements.map(({ rank }) => rank));
  if (!ranks.has(1) || !ranks.has(2)) {
    throw badRequest(
      "Champion and runner-up placements are required before completion"
    );
  }
  const matches = await database
    .select({
      matchId: championshipMatches.id,
      resultRevision: championshipMatches.resultRevision,
      matchRulesOverride: championshipMatches.matchRulesOverride,
      sideATeamId: championshipMatches.sideATeamId,
      sideBTeamId: championshipMatches.sideBTeamId
    })
    .from(championshipMatches)
    .where(eq(championshipMatches.championshipId, championshipId));
  if (matches.some(championshipMatchNeedsSettlement)) {
    throw badRequest(
      "Every championship match must be settled before completion"
    );
  }
}

async function getChampionshipHistoryFrom(
  database: DatabaseExecutor,
  championship: typeof championships.$inferSelect
): Promise<ChampionshipHistoryResponse> {
  const [placementRows, awardRows, recordRows] = await Promise.all([
    database
      .select()
      .from(championshipPlacements)
      .where(eq(championshipPlacements.championshipId, championship.id))
      .orderBy(asc(championshipPlacements.rank))
      .limit(projectionLimit + 1),
    database
      .select()
      .from(championshipAwards)
      .where(eq(championshipAwards.championshipId, championship.id))
      .orderBy(asc(championshipAwards.kind))
      .limit(projectionLimit + 1),
    database
      .select()
      .from(championshipRecords)
      .where(
        and(
          eq(championshipRecords.championshipId, championship.id),
          eq(championshipRecords.scope, "championship"),
          eq(championshipRecords.state, "current")
        )
      )
      .orderBy(asc(championshipRecords.metricKey), asc(championshipRecords.id))
      .limit(projectionLimit + 1)
  ]);
  const placements = await projectPlacements(
    database,
    placementRows.slice(0, projectionLimit)
  );
  const awards = await projectAwards(
    database,
    awardRows.slice(0, projectionLimit)
  );
  const statisticRecords = await projectStatisticRecords(
    database,
    recordRows.slice(0, projectionLimit)
  );
  const records = buildRecords(placements, awards, statisticRecords);
  return {
    championship: {
      uuid: championship.uuid,
      slug: championship.slug,
      name: championship.name,
      editionLabel: championship.editionLabel,
      lifecycle: championship.lifecycle,
      historical: championship.historical,
      completedAt: championship.completedAt,
      archivedAt: championship.archivedAt
    },
    completeness: {
      placements: placements.length > 0,
      awards: awards.length > 0,
      teams: true,
      rosters: true,
      matches: true,
      detailedStatistics: recordRows.length > 0
    },
    placements: {
      items: placements,
      totalCount: placements.length,
      truncated: false
    },
    awards: { items: awards, totalCount: awards.length, truncated: false },
    records: {
      items: records.slice(0, projectionLimit),
      totalCount: placements.length + awards.length + statisticRecords.length,
      truncated:
        placementRows.length > projectionLimit ||
        awardRows.length > projectionLimit ||
        recordRows.length > projectionLimit ||
        records.length > projectionLimit
    }
  };
}

async function projectPlacements(
  database: DatabaseExecutor,
  rows: Array<typeof championshipPlacements.$inferSelect>
): Promise<ChampionshipPlacementResponse[]> {
  const teamIds = [...new Set(rows.map(({ teamId }) => teamId))];
  const identityIds = [
    ...new Set(
      rows
        .map(({ teamIdentityIdSnapshot }) => teamIdentityIdSnapshot)
        .filter((id): id is number => id !== null)
    )
  ];
  const [teams, identities] = await Promise.all([
    teamIds.length
      ? database
          .select()
          .from(championshipTeams)
          .where(inArray(championshipTeams.id, teamIds))
      : [],
    identityIds.length
      ? database
          .select()
          .from(championshipTeamIdentities)
          .where(inArray(championshipTeamIdentities.id, identityIds))
      : []
  ]);
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const identityById = new Map(
    identities.map((identity) => [identity.id, identity])
  );

  return rows.map((row) => {
    const team = teamById.get(row.teamId)!;
    const currentIdentity = team.teamIdentityId
      ? (identityById.get(team.teamIdentityId) ?? null)
      : null;
    const snapshot = row.teamIdentityIdSnapshot
      ? (identityById.get(row.teamIdentityIdSnapshot) ?? null)
      : null;
    return {
      uuid: row.uuid,
      rank: row.rank,
      source: row.source,
      team: {
        uuid: team.uuid,
        name: team.name,
        abbreviation: team.abbreviation,
        identity: currentIdentity
          ? {
              uuid: currentIdentity.uuid,
              slug: currentIdentity.slug,
              name: currentIdentity.name
            }
          : null
      },
      identitySnapshot: snapshot
        ? { uuid: snapshot.uuid, name: snapshot.name }
        : null,
      teamNameSnapshot: row.teamNameSnapshot,
      createdAt: row.createdAt
    };
  });
}

async function projectAwards(
  database: DatabaseExecutor,
  rows: Array<typeof championshipAwards.$inferSelect>
): Promise<ChampionshipAwardResponse[]> {
  return Promise.all(rows.map((row) => projectAward(database, row)));
}

async function projectAward(
  database: DatabaseExecutor,
  row: typeof championshipAwards.$inferSelect
): Promise<ChampionshipAwardResponse> {
  let targetUuid = "";
  if (row.teamId) {
    const [target] = await database
      .select({ uuid: championshipTeams.uuid })
      .from(championshipTeams)
      .where(eq(championshipTeams.id, row.teamId));
    targetUuid = target?.uuid ?? "";
  } else if (row.participantId) {
    const [target] = await database
      .select({ uuid: championshipParticipants.uuid })
      .from(championshipParticipants)
      .where(eq(championshipParticipants.id, row.participantId));
    targetUuid = target?.uuid ?? "";
  } else if (row.accountId) {
    const [target] = await database
      .select({ uuid: accounts.uuid })
      .from(accounts)
      .where(eq(accounts.id, row.accountId));
    targetUuid = target?.uuid ?? "";
  } else if (row.historicalPlayerIdentityId) {
    const [target] = await database
      .select({ uuid: championshipHistoricalPlayerIdentities.uuid })
      .from(championshipHistoricalPlayerIdentities)
      .where(
        eq(
          championshipHistoricalPlayerIdentities.id,
          row.historicalPlayerIdentityId
        )
      );
    targetUuid = target?.uuid ?? "";
  } else if (row.teamIdentityIdSnapshot) {
    const [target] = await database
      .select({ uuid: championshipTeamIdentities.uuid })
      .from(championshipTeamIdentities)
      .where(eq(championshipTeamIdentities.id, row.teamIdentityIdSnapshot));
    targetUuid = target?.uuid ?? "";
  }
  const [identity] = row.teamIdentityIdSnapshot
    ? await database
        .select()
        .from(championshipTeamIdentities)
        .where(eq(championshipTeamIdentities.id, row.teamIdentityIdSnapshot))
    : [null];

  return {
    uuid: row.uuid,
    kind: row.kind,
    rank: row.rank,
    target: { type: row.targetType, uuid: targetUuid },
    displayLabel: row.displayLabel,
    note: row.note,
    identitySnapshot: identity
      ? { uuid: identity.uuid, name: identity.name }
      : null,
    awardedAt: row.awardedAt
  };
}

async function resolveAwardTarget(
  database: DatabaseExecutor,
  championshipId: number,
  target: { type: string; uuid: string }
) {
  const columns = {
    teamId: null as number | null,
    participantId: null as number | null,
    accountId: null as number | null,
    historicalPlayerIdentityId: null as number | null
  };
  let identitySnapshotId: number | null = null;

  if (target.type === "team") {
    const [team] = await database
      .select()
      .from(championshipTeams)
      .where(
        and(
          eq(championshipTeams.uuid, target.uuid),
          eq(championshipTeams.championshipId, championshipId)
        )
      );
    if (!team) throw notFound("Championship team not found");
    columns.teamId = team.id;
    identitySnapshotId = team.teamIdentityId;
  } else if (target.type === "team-identity") {
    const [identity] = await database
      .select()
      .from(championshipTeamIdentities)
      .where(eq(championshipTeamIdentities.uuid, target.uuid));
    if (!identity) throw notFound("Team identity not found");
    identitySnapshotId = identity.id;
  } else if (target.type === "participant") {
    const [participant] = await database
      .select()
      .from(championshipParticipants)
      .where(
        and(
          eq(championshipParticipants.uuid, target.uuid),
          eq(championshipParticipants.championshipId, championshipId)
        )
      );
    if (!participant) throw notFound("Championship participant not found");
    columns.participantId = participant.id;
  } else if (target.type === "account") {
    const [account] = await database
      .select()
      .from(accounts)
      .where(eq(accounts.uuid, target.uuid));
    if (!account) throw notFound("Account not found");
    columns.accountId = account.id;
  } else {
    const [historical] = await database
      .select()
      .from(championshipHistoricalPlayerIdentities)
      .where(eq(championshipHistoricalPlayerIdentities.uuid, target.uuid));
    if (!historical) throw notFound("Historical player identity not found");
    columns.historicalPlayerIdentityId = historical.id;
  }
  return { columns, identitySnapshotId };
}

function buildRecords(
  placements: ChampionshipPlacementResponse[],
  awards: ChampionshipAwardResponse[],
  statisticRecords: Array<{
    key: string;
    category: "team" | "player";
    label: string;
    targetUuid: string;
    targetLabel: string;
    value: number | string;
    source: string;
  }>
) {
  return [
    ...statisticRecords,
    ...placements.map((placement) => ({
      key: `placement.${placement.rank}`,
      category: "title" as const,
      label:
        placement.rank === 1 ? "Títulos" : `Colocações em ${placement.rank}º`,
      targetUuid: placement.identitySnapshot?.uuid ?? placement.team.uuid,
      targetLabel: placement.teamNameSnapshot,
      value: 1,
      source: "placement-ledger"
    })),
    ...awards.map((award) => ({
      key: `award.${award.kind}`,
      category: "award" as const,
      label: award.displayLabel,
      targetUuid: award.target.uuid,
      targetLabel: award.displayLabel,
      value: 1,
      source: "award-ledger"
    }))
  ];
}

async function projectStatisticRecords(
  database: DatabaseExecutor,
  rows: Array<typeof championshipRecords.$inferSelect>
) {
  const teamUuids = rows
    .filter((row) => row.targetType === "team")
    .map((row) => row.targetUuid);
  const participantUuids = rows
    .filter((row) => row.targetType === "participant")
    .map((row) => row.targetUuid);
  const [teams, participants] = await Promise.all([
    teamUuids.length
      ? database
          .select({
            uuid: championshipTeams.uuid,
            name: championshipTeams.name
          })
          .from(championshipTeams)
          .where(inArray(championshipTeams.uuid, teamUuids))
      : [],
    participantUuids.length
      ? database
          .select({
            uuid: championshipParticipants.uuid,
            name: championshipParticipants.displayNameSnapshot
          })
          .from(championshipParticipants)
          .where(inArray(championshipParticipants.uuid, participantUuids))
      : []
  ]);
  const targetLabelByUuid = new Map(
    [...teams, ...participants].map((target) => [target.uuid, target.name])
  );

  return rows.map((row) => ({
    key: `${row.targetType === "team" ? "team" : "player"}.${row.metricKey}`,
    category:
      row.targetType === "team" ? ("team" as const) : ("player" as const),
    label: recordMetricLabel(row.metricKey),
    targetUuid: row.targetUuid,
    targetLabel: targetLabelByUuid.get(row.targetUuid) ?? row.targetUuid,
    value: row.numericValue ?? row.textValue ?? "",
    source: "statistics-ledger"
  }));
}

function recordMetricLabel(metricKey: string): string {
  return (
    {
      matches_played: "Mais jogos",
      wins: "Mais vitórias",
      draws: "Mais empates",
      losses: "Mais derrotas",
      points_for: "Mais pontos marcados",
      points_against: "Mais pontos sofridos",
      score_differential: "Maior saldo",
      playing_time_seconds: "Mais tempo em campo"
    }[metricKey] ?? metricKey
  );
}

async function requireHistoryChampionship(uuid: string) {
  const [championship] = await db
    .select()
    .from(championships)
    .where(eq(championships.uuid, uuid));
  if (!championship) throw notFound("Championship not found");
  return championship;
}

async function countRows(
  table: any,
  column: any,
  value: number,
  extra?: any
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(table)
    .where(and(eq(column, value), extra));
  return row?.value ?? 0;
}
