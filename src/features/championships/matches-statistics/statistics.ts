import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import { getChampionshipWithType } from "@/features/championships/_shared/db/queries";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import {
  championshipMatchResultRevisions,
  championshipMetricMappings,
  championshipStatisticEntries
} from "@/features/championships/matches-statistics/db";
import type { ChampionshipStatisticsQuery } from "@/features/championships/matches-statistics/inputs";
import type { ChampionshipStatisticsResponse } from "@/features/championships/matches-statistics/responses";
import {
  championshipParticipants,
  championshipTeamIdentities,
  championshipTeams
} from "@/features/championships/people/db";
import {
  eventSchemaFamilies,
  eventSchemaVersions
} from "@/features/event-schemas/db";
import { roomPrograms } from "@/features/rooms/core-db";
import { forbidden } from "@/shared/http/errors";

export async function getChampionshipStatistics(
  championshipUuid: string,
  query: ChampionshipStatisticsQuery = {}
): Promise<ChampionshipStatisticsResponse> {
  const context = await getChampionshipWithType(db, championshipUuid);

  if (query.actorAccountUuid) {
    await requireChampionshipActor(db, {
      actorAccountUuid: query.actorAccountUuid,
      championshipId: context.championship.id,
      permission: ["championship:admin", "championship:operate"]
    });
  } else if (context.championship.visibility !== "public") {
    throw forbidden("Private championship statistics require staff access");
  }

  const limit = query.limit ?? 100;
  const offset = query.offset ?? 0;
  const currentResults = await db
    .select({ id: championshipMatchResultRevisions.id })
    .from(championshipMatchResultRevisions)
    .where(
      and(
        eq(
          championshipMatchResultRevisions.championshipId,
          context.championship.id
        ),
        eq(championshipMatchResultRevisions.state, "current")
      )
    );
  const resultIds = currentResults.map((result) => result.id);

  if (resultIds.length === 0) {
    return {
      championshipUuid,
      resultRevision: context.championship.revision,
      teams: { items: [], totalCount: 0, truncated: false },
      players: { items: [], totalCount: 0, truncated: false },
      metricSources: { items: [], totalCount: 0, truncated: false }
    };
  }

  const teamMetric = (key: string) =>
    sql<number>`coalesce(sum(case when ${championshipStatisticEntries.metricKey} = ${key} then ${championshipStatisticEntries.numericValue} else 0 end), 0)`;
  const teamRows = await db
    .select({
      team: championshipTeams,
      identity: championshipTeamIdentities,
      played: teamMetric("matches_played"),
      wins: teamMetric("wins"),
      draws: teamMetric("draws"),
      losses: teamMetric("losses"),
      pointsFor: teamMetric("points_for"),
      pointsAgainst: teamMetric("points_against"),
      differential: teamMetric("score_differential")
    })
    .from(championshipTeams)
    .leftJoin(
      championshipTeamIdentities,
      eq(championshipTeams.teamIdentityId, championshipTeamIdentities.id)
    )
    .leftJoin(
      championshipStatisticEntries,
      and(
        eq(championshipStatisticEntries.teamId, championshipTeams.id),
        inArray(championshipStatisticEntries.resultRevisionId, resultIds)
      )
    )
    .where(eq(championshipTeams.championshipId, context.championship.id))
    .groupBy(championshipTeams.id, championshipTeamIdentities.id)
    .orderBy(asc(championshipTeams.displayOrder), asc(championshipTeams.id))
    .limit(limit + 1)
    .offset(offset);
  const identityKey = sql<string>`coalesce('participant:' || ${championshipStatisticEntries.participantId}, 'player:' || ${championshipStatisticEntries.sourcePlayerId})`;
  const playerDisplayName = sql<string>`max(${championshipStatisticEntries.displayNameSnapshot})`;
  const playerMatchesPlayed = sql<number>`coalesce(sum(case when ${championshipStatisticEntries.metricKey} = 'matches_played' then ${championshipStatisticEntries.numericValue} else 0 end), 0)`;
  const playerIdentityRows = await db
    .select({
      identityKey,
      participantId: championshipStatisticEntries.participantId,
      sourcePlayerId: championshipStatisticEntries.sourcePlayerId,
      displayName: playerDisplayName,
      matchesPlayed: playerMatchesPlayed,
      playingTimeSeconds: sql<number>`coalesce(sum(case when ${championshipStatisticEntries.metricKey} = 'playing_time_seconds' then ${championshipStatisticEntries.numericValue} else 0 end), 0)`
    })
    .from(championshipStatisticEntries)
    .where(
      and(
        eq(
          championshipStatisticEntries.championshipId,
          context.championship.id
        ),
        inArray(championshipStatisticEntries.resultRevisionId, resultIds),
        sql`${championshipStatisticEntries.teamId} is null`,
        sql`${championshipStatisticEntries.sourcePlayerId} is not null`
      )
    )
    .groupBy(identityKey)
    .orderBy(desc(playerMatchesPlayed), asc(playerDisplayName))
    .limit(limit + 1)
    .offset(offset);
  const selectedPlayers = playerIdentityRows.slice(0, limit);
  const selectedKeys = selectedPlayers.map((row) => row.identityKey);
  const metricRows = selectedKeys.length
    ? await db
        .select({
          identityKey,
          metricKey: championshipStatisticEntries.metricKey,
          sourceEventSchemaVersionId:
            championshipStatisticEntries.sourceEventSchemaVersionId,
          sourceRoomProgramId: championshipStatisticEntries.sourceRoomProgramId,
          numericSum: sql<number>`sum(${championshipStatisticEntries.numericValue})`,
          numericCount: sql<number>`count(${championshipStatisticEntries.numericValue})`,
          numericMaximum: sql<number>`max(${championshipStatisticEntries.numericValue})`,
          numericMinimum: sql<number>`min(${championshipStatisticEntries.numericValue})`
        })
        .from(championshipStatisticEntries)
        .where(
          and(
            eq(
              championshipStatisticEntries.championshipId,
              context.championship.id
            ),
            inArray(championshipStatisticEntries.resultRevisionId, resultIds),
            inArray(identityKey, selectedKeys),
            sql`${championshipStatisticEntries.teamId} is null`
          )
        )
        .groupBy(
          identityKey,
          championshipStatisticEntries.metricKey,
          championshipStatisticEntries.sourceEventSchemaVersionId,
          championshipStatisticEntries.sourceRoomProgramId
        )
        .limit(limit * 200)
    : [];
  const sourceMetricRows = await db
    .select({
      sourceEventSchemaVersionId:
        championshipStatisticEntries.sourceEventSchemaVersionId,
      metricKey: championshipStatisticEntries.metricKey
    })
    .from(championshipStatisticEntries)
    .where(
      and(
        eq(
          championshipStatisticEntries.championshipId,
          context.championship.id
        ),
        inArray(championshipStatisticEntries.resultRevisionId, resultIds),
        sql`${championshipStatisticEntries.sourceEventSchemaVersionId} is not null`,
        sql`${championshipStatisticEntries.teamId} is null`
      )
    )
    .groupBy(
      championshipStatisticEntries.sourceEventSchemaVersionId,
      championshipStatisticEntries.metricKey
    )
    .orderBy(
      asc(championshipStatisticEntries.sourceEventSchemaVersionId),
      asc(championshipStatisticEntries.metricKey)
    )
    .limit(501);
  const participantIds = selectedPlayers
    .map((row) => row.participantId)
    .filter((id): id is number => id !== null);
  const schemaIds = [
    ...new Set(
      metricRows
        .map((row) => row.sourceEventSchemaVersionId)
        .concat(sourceMetricRows.map((row) => row.sourceEventSchemaVersionId))
        .filter((id): id is number => id !== null)
    )
  ];
  const programIds = [
    ...new Set(
      metricRows
        .map((row) => row.sourceRoomProgramId)
        .filter((id): id is number => id !== null)
    )
  ];
  const [
    participantRows,
    mappingRows,
    schemaRows,
    programRows,
    teamCountRows,
    playerCountRows
  ] = await Promise.all([
    participantIds.length
      ? db
          .select({
            participant: championshipParticipants,
            account: accounts
          })
          .from(championshipParticipants)
          .leftJoin(
            accounts,
            eq(championshipParticipants.accountId, accounts.id)
          )
          .where(inArray(championshipParticipants.id, participantIds))
      : [],
    db
      .select()
      .from(championshipMetricMappings)
      .where(
        eq(championshipMetricMappings.championshipId, context.championship.id)
      ),
    schemaIds.length
      ? db
          .select({
            version: eventSchemaVersions,
            family: eventSchemaFamilies
          })
          .from(eventSchemaVersions)
          .innerJoin(
            eventSchemaFamilies,
            eq(eventSchemaVersions.familyId, eventSchemaFamilies.id)
          )
          .where(inArray(eventSchemaVersions.id, schemaIds))
      : [],
    programIds.length
      ? db
          .select()
          .from(roomPrograms)
          .where(inArray(roomPrograms.id, programIds))
      : [],
    db
      .select({ value: count() })
      .from(championshipTeams)
      .where(eq(championshipTeams.championshipId, context.championship.id)),
    db
      .select({
        value: sql<number>`count(distinct ${identityKey})`
      })
      .from(championshipStatisticEntries)
      .where(
        and(
          eq(
            championshipStatisticEntries.championshipId,
            context.championship.id
          ),
          inArray(championshipStatisticEntries.resultRevisionId, resultIds),
          sql`${championshipStatisticEntries.teamId} is null`,
          sql`${championshipStatisticEntries.sourcePlayerId} is not null`
        )
      )
  ]);
  const teamCount = teamCountRows[0]?.value ?? 0;
  const playerCount = playerCountRows[0]?.value ?? 0;
  const participantById = new Map(
    participantRows.map((row) => [row.participant.id, row])
  );
  const mappingBySource = new Map(
    mappingRows.map((mapping) => [
      `${mapping.sourceEventSchemaVersionId}:${mapping.sourceMetricKey}`,
      mapping
    ])
  );
  const schemaById = new Map(
    schemaRows.map((schema) => [schema.version.id, schema])
  );
  const programById = new Map(
    programRows.map((program) => [program.id, program])
  );
  const metricsByIdentity = new Map<string, typeof metricRows>();

  for (const metric of metricRows) {
    const rows = metricsByIdentity.get(metric.identityKey) ?? [];
    rows.push(metric);
    metricsByIdentity.set(metric.identityKey, rows);
  }

  const playerItems = selectedPlayers.map((row) => {
    const participant = row.participantId
      ? participantById.get(row.participantId)
      : null;
    const metricAggregates = new Map<
      string,
      {
        aggregation: "sum" | "average" | "maximum" | "minimum";
        sum: number;
        count: number;
        maximum: number;
        minimum: number;
      }
    >();
    const separated = new Map<
      string,
      {
        eventSchema: string | null;
        program: string | null;
        metrics: Record<string, number>;
      }
    >();
    const rows = metricsByIdentity.get(row.identityKey) ?? [];
    const schemasByMetric = new Map<string, Set<string>>();

    for (const metric of rows) {
      const mapping = metric.sourceEventSchemaVersionId
        ? mappingBySource.get(
            `${metric.sourceEventSchemaVersionId}:${metric.metricKey}`
          )
        : null;
      const canonicalKey = mapping?.canonicalMetricKey ?? metric.metricKey;
      const schemaSet = schemasByMetric.get(canonicalKey) ?? new Set();
      const schema = metric.sourceEventSchemaVersionId
        ? schemaById.get(metric.sourceEventSchemaVersionId)
        : null;
      schemaSet.add(
        mapping
          ? "mapped"
          : schema
            ? metricCompatibilityKey(
                schema.version.definition,
                metric.metricKey
              )
            : "built-in"
      );
      schemasByMetric.set(canonicalKey, schemaSet);
    }

    for (const metric of rows) {
      const mapping = metric.sourceEventSchemaVersionId
        ? mappingBySource.get(
            `${metric.sourceEventSchemaVersionId}:${metric.metricKey}`
          )
        : null;
      const canonicalKey = mapping?.canonicalMetricKey ?? metric.metricKey;
      const compatible =
        mapping ||
        (schemasByMetric.get(canonicalKey)?.size ?? 0) <= 1 ||
        metric.sourceEventSchemaVersionId === null;

      if (compatible) {
        mergeMetricAggregate(
          metricAggregates,
          canonicalKey,
          mapping?.aggregation ?? "sum",
          metric
        );
        continue;
      }

      const key = `${metric.sourceEventSchemaVersionId ?? "none"}:${metric.sourceRoomProgramId ?? "none"}`;
      const source = separated.get(key) ?? {
        eventSchema: metric.sourceEventSchemaVersionId
          ? schemaById.get(metric.sourceEventSchemaVersionId)
            ? `${schemaById.get(metric.sourceEventSchemaVersionId)!.family.name}@${schemaById.get(metric.sourceEventSchemaVersionId)!.version.version}`
            : null
          : null,
        program: metric.sourceRoomProgramId
          ? (programById.get(metric.sourceRoomProgramId)?.name ?? null)
          : null,
        metrics: {} as Record<string, number>
      };
      source.metrics[metric.metricKey] =
        (source.metrics[metric.metricKey] ?? 0) + metric.numericSum;
      separated.set(key, source);
    }
    const metrics = Object.fromEntries(
      [...metricAggregates].map(([key, aggregate]) => [
        key,
        aggregate.aggregation === "average"
          ? aggregate.count > 0
            ? aggregate.sum / aggregate.count
            : 0
          : aggregate.aggregation === "maximum"
            ? aggregate.maximum
            : aggregate.aggregation === "minimum"
              ? aggregate.minimum
              : aggregate.sum
      ])
    );

    return {
      participantUuid: participant?.participant.uuid ?? null,
      accountUuid: participant?.account?.uuid ?? null,
      displayName:
        participant?.participant.displayNameSnapshot ??
        row.displayName ??
        "Jogador desconhecido",
      matchesPlayed: row.matchesPlayed,
      playingTimeSeconds: row.playingTimeSeconds,
      metrics,
      sourceSeparatedMetrics: [...separated.values()]
    };
  });

  return {
    championshipUuid,
    resultRevision: context.championship.revision,
    teams: {
      items: teamRows.slice(0, limit).map((row) => ({
        team: {
          uuid: row.team.uuid,
          name: row.team.name,
          abbreviation: row.team.abbreviation,
          colors: row.team.colors
        },
        played: row.played,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        pointsFor: row.pointsFor,
        pointsAgainst: row.pointsAgainst,
        differential: row.differential
      })),
      totalCount: teamCount,
      truncated: offset + limit < teamCount
    },
    players: {
      items: playerItems,
      totalCount: playerCount,
      truncated: offset + limit < playerCount
    },
    metricSources: {
      items: sourceMetricRows.slice(0, 500).flatMap((source) => {
        if (!source.sourceEventSchemaVersionId) {
          return [];
        }
        const schema = schemaById.get(source.sourceEventSchemaVersionId);

        if (!schema) {
          return [];
        }
        const metadata = schema.version.definition.metrics?.find(
          (metric) => metric.key === source.metricKey
        );
        const mapping = mappingBySource.get(
          `${source.sourceEventSchemaVersionId}:${source.metricKey}`
        );

        return [
          {
            eventSchemaId: schema.family.uuid,
            eventSchemaName: schema.family.name,
            eventSchemaVersion: schema.version.version,
            metricKey: source.metricKey,
            label: metadata?.label ?? null,
            valueKind: metricValueKind(metadata),
            mappedCanonicalMetricKey: mapping?.canonicalMetricKey ?? null
          }
        ];
      }),
      totalCount: sourceMetricRows.length,
      truncated: sourceMetricRows.length > 500
    }
  };
}

function metricValueKind(
  metadata:
    | NonNullable<
        (typeof eventSchemaVersions.$inferSelect.definition)["metrics"]
      >[number]
    | undefined
): "integer" | "number" | "duration" | "percentage" {
  if (metadata?.format === "duration") return "duration";
  if (metadata?.format === "percentage") return "percentage";
  if (metadata?.precision === 0) return "integer";
  return "number";
}

function mergeMetricAggregate(
  aggregates: Map<
    string,
    {
      aggregation: "sum" | "average" | "maximum" | "minimum";
      sum: number;
      count: number;
      maximum: number;
      minimum: number;
    }
  >,
  key: string,
  aggregation: "sum" | "average" | "maximum" | "minimum",
  metric: {
    numericSum: number;
    numericCount: number;
    numericMaximum: number;
    numericMinimum: number;
  }
) {
  const current = aggregates.get(key);

  if (current && current.aggregation !== aggregation) {
    return;
  }

  aggregates.set(key, {
    aggregation,
    sum: (current?.sum ?? 0) + metric.numericSum,
    count: (current?.count ?? 0) + metric.numericCount,
    maximum: current
      ? Math.max(current.maximum, metric.numericMaximum)
      : metric.numericMaximum,
    minimum: current
      ? Math.min(current.minimum, metric.numericMinimum)
      : metric.numericMinimum
  });
}

function metricCompatibilityKey(
  definition: typeof eventSchemaVersions.$inferSelect.definition,
  metricKey: string
): string {
  return JSON.stringify({
    metadata:
      definition.metrics?.find((metric) => metric.key === metricKey) ?? null,
    virtual:
      definition.virtualMetrics?.find(
        (metric) => metric.metric === metricKey
      ) ?? null,
    aggregations: definition.events.flatMap((event) =>
      (event.aggregations ?? [])
        .filter((aggregation) => aggregation.metric === metricKey)
        .map((aggregation) => ({
          event: event.type,
          aggregation
        }))
    )
  });
}
