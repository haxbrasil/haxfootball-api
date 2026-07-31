import { and, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/client";
import {
  championshipMatchResultRevisions,
  championshipStatisticEntries
} from "@/features/championships/matches-statistics/db";
import { championshipRecords } from "@/features/championships/history/db";
import {
  championshipParticipants,
  championshipTeams
} from "@/features/championships/people/db";

type AggregateRecord = {
  metricKey: string;
  targetId: number;
  numericValue: number;
};

export async function refreshChampionshipRecords(
  database: DatabaseExecutor,
  championshipId: number
): Promise<void> {
  await database
    .update(championshipRecords)
    .set({ state: "superseded" })
    .where(
      and(
        eq(championshipRecords.championshipId, championshipId),
        eq(championshipRecords.scope, "championship"),
        eq(championshipRecords.state, "current")
      )
    );
  const resultRows = await database
    .select({ id: championshipMatchResultRevisions.id })
    .from(championshipMatchResultRevisions)
    .where(
      and(
        eq(championshipMatchResultRevisions.championshipId, championshipId),
        eq(championshipMatchResultRevisions.state, "current")
      )
    );
  const resultIds = resultRows.map(({ id }) => id);

  if (resultIds.length === 0) return;

  const [teamAggregates, participantAggregates, teams, participants] =
    await Promise.all([
      database
        .select({
          metricKey: championshipStatisticEntries.metricKey,
          targetId: championshipStatisticEntries.teamId,
          numericValue: sql<number>`sum(${championshipStatisticEntries.numericValue})`
        })
        .from(championshipStatisticEntries)
        .where(
          and(
            eq(championshipStatisticEntries.championshipId, championshipId),
            inArray(championshipStatisticEntries.resultRevisionId, resultIds),
            sql`${championshipStatisticEntries.teamId} is not null`,
            sql`${championshipStatisticEntries.numericValue} is not null`
          )
        )
        .groupBy(
          championshipStatisticEntries.metricKey,
          championshipStatisticEntries.teamId
        ),
      database
        .select({
          metricKey: championshipStatisticEntries.metricKey,
          targetId: championshipStatisticEntries.participantId,
          numericValue: sql<number>`sum(${championshipStatisticEntries.numericValue})`
        })
        .from(championshipStatisticEntries)
        .where(
          and(
            eq(championshipStatisticEntries.championshipId, championshipId),
            inArray(championshipStatisticEntries.resultRevisionId, resultIds),
            sql`${championshipStatisticEntries.teamId} is null`,
            sql`${championshipStatisticEntries.participantId} is not null`,
            sql`${championshipStatisticEntries.numericValue} is not null`
          )
        )
        .groupBy(
          championshipStatisticEntries.metricKey,
          championshipStatisticEntries.participantId
        ),
      database
        .select({ id: championshipTeams.id, uuid: championshipTeams.uuid })
        .from(championshipTeams)
        .where(eq(championshipTeams.championshipId, championshipId)),
      database
        .select({
          id: championshipParticipants.id,
          uuid: championshipParticipants.uuid
        })
        .from(championshipParticipants)
        .where(eq(championshipParticipants.championshipId, championshipId))
    ]);
  const teamUuidById = new Map(teams.map((team) => [team.id, team.uuid]));
  const participantUuidById = new Map(
    participants.map((participant) => [participant.id, participant.uuid])
  );
  const leaders = [
    ...recordLeaders(
      teamAggregates.filter(hasNumericTarget),
      "team",
      teamUuidById
    ),
    ...recordLeaders(
      participantAggregates.filter(hasNumericTarget),
      "participant",
      participantUuidById
    )
  ].slice(0, 1_000);

  if (leaders.length === 0) return;

  await database.insert(championshipRecords).values(
    leaders.map((leader) => ({
      championshipId,
      scope: "championship" as const,
      metricKey: leader.metricKey,
      targetType: leader.targetType,
      targetUuid: leader.targetUuid,
      numericValue: leader.numericValue,
      state: "current" as const
    }))
  );
}

function hasNumericTarget(row: {
  metricKey: string;
  targetId: number | null;
  numericValue: number;
}): row is AggregateRecord {
  return row.targetId !== null && Number.isFinite(row.numericValue);
}

function recordLeaders(
  rows: AggregateRecord[],
  targetType: "team" | "participant",
  targetUuidById: Map<number, string>
) {
  const maximumByMetric = new Map<string, number>();

  for (const row of rows) {
    const maximum = maximumByMetric.get(row.metricKey);
    if (maximum === undefined || row.numericValue > maximum) {
      maximumByMetric.set(row.metricKey, row.numericValue);
    }
  }

  return rows.flatMap((row) => {
    const targetUuid = targetUuidById.get(row.targetId);

    return targetUuid && row.numericValue === maximumByMetric.get(row.metricKey)
      ? [
          {
            metricKey: row.metricKey,
            targetType,
            targetUuid,
            numericValue: row.numericValue
          }
        ]
      : [];
  });
}
