import { and, asc, count, eq } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/db/client";
import { getChampionshipWithType } from "@/features/championships/_shared/db/queries";
import { requireChampionshipActor } from "@/features/championships/core/authorization";
import { executeChampionshipCommand } from "@/features/championships/core/commands";
import { championshipMetricMappings } from "@/features/championships/matches-statistics/db";
import type {
  ChampionshipMetricMappingsQuery,
  ReplaceChampionshipMetricMappingsInput
} from "@/features/championships/matches-statistics/inputs";
import type { ChampionshipMetricMappingsResponse } from "@/features/championships/matches-statistics/responses";
import {
  eventSchemaFamilies,
  eventSchemaVersions
} from "@/features/event-schemas/db";
import { badRequest } from "@/shared/http/errors";

export async function listChampionshipMetricMappings(
  championshipUuid: string,
  query: ChampionshipMetricMappingsQuery
): Promise<ChampionshipMetricMappingsResponse> {
  const context = await getChampionshipWithType(db, championshipUuid);
  await requireChampionshipActor(db, {
    actorAccountUuid: query.actorAccountUuid,
    championshipId: context.championship.id,
    permission: ["championship:admin", "championship:operate"]
  });

  return projectMetricMappings(
    db,
    context.championship.id,
    championshipUuid,
    query.limit ?? 100,
    query.offset ?? 0
  );
}

export async function replaceChampionshipMetricMappings(
  championshipUuid: string,
  input: ReplaceChampionshipMetricMappingsInput
): Promise<ChampionshipMetricMappingsResponse> {
  return executeChampionshipCommand(
    {
      championshipUuid,
      actorAccountUuid: input.actorAccountUuid,
      commandUuid: input.commandUuid,
      expectedRevision: input.expectedRevision,
      permission: ["championship:admin", "championship:operate"],
      action: "statistics.metric-mappings.replaced"
    },
    async (tx, championship, actor) => {
      const seenSources = new Set<string>();
      const canonicalDefinitions = new Map<
        string,
        {
          displayLabel: string;
          valueKind: (typeof input.mappings)[number]["valueKind"];
          aggregation: (typeof input.mappings)[number]["aggregation"];
        }
      >();
      const resolved = [];

      for (const mapping of input.mappings) {
        const sourceKey = `${mapping.eventSchemaId}:${mapping.eventSchemaVersion}:${mapping.sourceMetricKey}`;

        if (seenSources.has(sourceKey)) {
          throw badRequest(`Duplicate metric mapping source: ${sourceKey}`);
        }
        seenSources.add(sourceKey);

        const previousCanonical = canonicalDefinitions.get(
          mapping.canonicalMetricKey
        );
        const nextCanonical = {
          displayLabel: mapping.displayLabel,
          valueKind: mapping.valueKind,
          aggregation: mapping.aggregation
        };

        if (
          previousCanonical &&
          (previousCanonical.displayLabel !== nextCanonical.displayLabel ||
            previousCanonical.valueKind !== nextCanonical.valueKind ||
            previousCanonical.aggregation !== nextCanonical.aggregation)
        ) {
          throw badRequest(
            `Canonical metric ${mapping.canonicalMetricKey} has conflicting definitions`
          );
        }
        canonicalDefinitions.set(mapping.canonicalMetricKey, nextCanonical);

        const [schema] = await tx
          .select({
            family: eventSchemaFamilies,
            version: eventSchemaVersions
          })
          .from(eventSchemaVersions)
          .innerJoin(
            eventSchemaFamilies,
            eq(eventSchemaVersions.familyId, eventSchemaFamilies.id)
          )
          .where(
            and(
              eq(eventSchemaFamilies.uuid, mapping.eventSchemaId),
              eq(eventSchemaVersions.version, mapping.eventSchemaVersion)
            )
          );

        if (!schema) {
          throw badRequest(
            `Event schema ${mapping.eventSchemaId}@${mapping.eventSchemaVersion} does not exist`
          );
        }

        if (
          !knownMetricKeys(schema.version.definition).has(
            mapping.sourceMetricKey
          )
        ) {
          throw badRequest(
            `Metric ${mapping.sourceMetricKey} does not exist in ${schema.family.name}@${schema.version.version}`
          );
        }

        resolved.push({ mapping, schema });
      }

      await tx
        .delete(championshipMetricMappings)
        .where(eq(championshipMetricMappings.championshipId, championship.id));

      if (resolved.length > 0) {
        await tx.insert(championshipMetricMappings).values(
          resolved.map(({ mapping, schema }) => ({
            championshipId: championship.id,
            canonicalMetricKey: mapping.canonicalMetricKey,
            sourceEventSchemaVersionId: schema.version.id,
            sourceMetricKey: mapping.sourceMetricKey,
            displayLabel: mapping.displayLabel,
            valueKind: mapping.valueKind,
            aggregation: mapping.aggregation,
            revision: championship.revision,
            actorAccountId: actor.account.id,
            updatedAt: new Date().toISOString()
          }))
        );
      }

      const response = await projectMetricMappings(
        tx,
        championship.id,
        championship.uuid,
        500,
        0
      );

      return {
        response: () => response,
        targetType: "championship-statistics",
        targetUuid: championship.uuid,
        before: null,
        after: {
          mappingCount: resolved.length,
          canonicalMetrics: [...canonicalDefinitions.keys()]
        },
        metadata: { sourceCount: resolved.length }
      };
    }
  );
}

async function projectMetricMappings(
  database: DatabaseExecutor,
  championshipId: number,
  championshipUuid: string,
  limit: number,
  offset: number
): Promise<ChampionshipMetricMappingsResponse> {
  const [rows, totalRows] = await Promise.all([
    database
      .select({
        mapping: championshipMetricMappings,
        family: eventSchemaFamilies,
        version: eventSchemaVersions
      })
      .from(championshipMetricMappings)
      .innerJoin(
        eventSchemaVersions,
        eq(
          championshipMetricMappings.sourceEventSchemaVersionId,
          eventSchemaVersions.id
        )
      )
      .innerJoin(
        eventSchemaFamilies,
        eq(eventSchemaVersions.familyId, eventSchemaFamilies.id)
      )
      .where(eq(championshipMetricMappings.championshipId, championshipId))
      .orderBy(
        asc(championshipMetricMappings.canonicalMetricKey),
        asc(eventSchemaFamilies.name),
        asc(eventSchemaVersions.version),
        asc(championshipMetricMappings.sourceMetricKey)
      )
      .limit(limit)
      .offset(offset),
    database
      .select({ value: count() })
      .from(championshipMetricMappings)
      .where(eq(championshipMetricMappings.championshipId, championshipId))
  ]);
  const totalCount = totalRows[0]?.value ?? 0;

  return {
    championshipUuid,
    items: rows.map(({ mapping, family, version }) => ({
      uuid: mapping.uuid,
      canonicalMetricKey: mapping.canonicalMetricKey,
      displayLabel: mapping.displayLabel,
      valueKind: mapping.valueKind,
      aggregation: mapping.aggregation,
      source: {
        eventSchemaId: family.uuid,
        eventSchemaName: family.name,
        eventSchemaVersion: version.version,
        metricKey: mapping.sourceMetricKey
      },
      revision: mapping.revision,
      updatedAt: mapping.updatedAt
    })),
    totalCount,
    truncated: offset + rows.length < totalCount
  };
}

function knownMetricKeys(
  definition: typeof eventSchemaVersions.$inferSelect.definition
): Set<string> {
  return new Set([
    ...(definition.metrics ?? []).map((metric) => metric.key),
    ...(definition.virtualMetrics ?? []).map((metric) => metric.metric),
    ...definition.events.flatMap((event) =>
      (event.aggregations ?? []).map((aggregation) => aggregation.metric)
    )
  ]);
}
