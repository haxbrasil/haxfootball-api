import { and, eq, gte, inArray, isNull, lte, type SQL } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import type { MatchStatEventRow } from "@/features/match-stat-events/http";
import { matchStatEvents } from "@/features/match-stat-events/db";
import {
  applyStatEventAggregation,
  applyVirtualMetrics
} from "@/features/match-stat-events/_shared/domain/metrics";
import { matches } from "@/features/matches/db";
import { playerAccountResponseSchema } from "@/features/players/http";
import { players } from "@/features/players/db";
import { resolveLabels } from "@/features/localization/resolve-labels";
import {
  statEventSchemaIdSchema,
  statEventSchemaNameSchema
} from "@/features/stat-event-schemas/http";
import {
  getLatestStatEventSchemaRow,
  getLatestStatEventSchemaRowByName,
  getStatEventSchemaRow,
  getStatEventSchemaRowByName
} from "@/features/stat-event-schemas/read-stat-event-schema";
import type {
  StatEventSchemaDefinition,
  StatMetricMetadata
} from "@/features/stat-event-schemas/definition";
import { badRequest } from "@/shared/http/errors";
import {
  decodeCursor,
  encodeCursor,
  pageInfoSchema,
  resolvePaginationQuery,
  type PageInfo
} from "@lib";
import type { JsonObject } from "@lib";

const matchMetricsPeriodFieldSchema = t.Union([
  t.Literal("initiatedAt"),
  t.Literal("endedAt"),
  t.Literal("createdAt")
]);

const matchMetricsGroupBySchema = t.Union([
  t.Literal("account"),
  t.Literal("player"),
  t.Literal("account-or-player")
]);

const sortDirectionSchema = t.Union([t.Literal("asc"), t.Literal("desc")]);

export const queryMatchMetricsBodySchema = t.Object({
  schema: t.Union([
    t.Object({
      id: statEventSchemaIdSchema,
      version: t.Optional(t.Integer({ minimum: 1 }))
    }),
    t.Object({
      name: statEventSchemaNameSchema,
      version: t.Optional(t.Integer({ minimum: 1 }))
    })
  ]),
  language: t.Optional(t.String({ minLength: 2, maxLength: 16 })),
  filters: t.Optional(
    t.Object({
      statuses: t.Optional(
        t.Array(t.Union([t.Literal("completed"), t.Literal("ongoing")]), {
          minItems: 1,
          maxItems: 2,
          uniqueItems: true
        })
      ),
      period: t.Optional(
        t.Object({
          field: matchMetricsPeriodFieldSchema,
          from: t.Optional(t.String({ minLength: 1 })),
          to: t.Optional(t.String({ minLength: 1 }))
        })
      ),
      matchIds: t.Optional(
        t.Array(t.String({ minLength: 8, maxLength: 8 }), {
          minItems: 1,
          uniqueItems: true
        })
      ),
      playerIds: t.Optional(
        t.Array(t.String({ minLength: 1, maxLength: 64 }), {
          minItems: 1,
          uniqueItems: true
        })
      ),
      accountIds: t.Optional(
        t.Array(t.String({ format: "uuid" }), {
          minItems: 1,
          uniqueItems: true
        })
      ),
      eventTypes: t.Optional(
        t.Array(t.String({ minLength: 1, maxLength: 64 }), {
          minItems: 1,
          uniqueItems: true
        })
      )
    })
  ),
  group: t.Optional(
    t.Object({
      by: matchMetricsGroupBySchema
    })
  ),
  metrics: t.Optional(
    t.Array(t.String({ minLength: 1, maxLength: 64 }), {
      minItems: 1,
      uniqueItems: true
    })
  ),
  sort: t.Optional(
    t.Array(
      t.Union([
        t.Object({
          type: t.Literal("metric"),
          key: t.String({ minLength: 1, maxLength: 64 }),
          direction: sortDirectionSchema
        }),
        t.Object({
          type: t.Literal("field"),
          key: t.Literal("name"),
          direction: sortDirectionSchema
        })
      ]),
      { minItems: 1 }
    )
  ),
  page: t.Optional(
    t.Object({
      limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
      cursor: t.Optional(t.String({ minLength: 1 }))
    })
  )
});

const matchMetricsMetricSchema = t.Object({
  key: t.String(),
  label: t.String(),
  description: t.Nullable(t.String()),
  category: t.Nullable(
    t.Object({
      key: t.String(),
      label: t.String(),
      description: t.Nullable(t.String()),
      primaryMetric: t.Nullable(t.String())
    })
  ),
  valueType: t.Optional(t.String()),
  format: t.Optional(t.String()),
  precision: t.Optional(t.Number()),
  hidden: t.Optional(t.Boolean())
});

const matchMetricsAccountGroupSchema = t.Object({
  type: t.Literal("account"),
  id: t.String({ format: "uuid" }),
  name: t.String(),
  externalId: t.String()
});

const matchMetricsPlayerGroupSchema = t.Object({
  type: t.Literal("player"),
  id: t.String(),
  name: t.String(),
  country: t.Nullable(t.String()),
  account: t.Nullable(playerAccountResponseSchema)
});

export const queryMatchMetricsResponseSchema = t.Object({
  items: t.Array(
    t.Object({
      rank: t.Integer({ minimum: 1 }),
      group: t.Union([
        matchMetricsAccountGroupSchema,
        matchMetricsPlayerGroupSchema
      ]),
      metrics: t.Record(t.String(), t.Unknown()),
      contribution: t.Object({
        matchesCount: t.Integer({ minimum: 0 }),
        eventsCount: t.Integer({ minimum: 0 }),
        playersCount: t.Integer({ minimum: 0 })
      })
    })
  ),
  page: pageInfoSchema,
  meta: t.Object({
    schema: t.Object({
      id: statEventSchemaIdSchema,
      name: statEventSchemaNameSchema,
      version: t.Integer({ minimum: 1 }),
      isLatest: t.Boolean()
    }),
    group: t.Object({
      by: matchMetricsGroupBySchema,
      identityMode: t.Literal("current")
    }),
    availableMetrics: t.Array(matchMetricsMetricSchema),
    sort: t.Array(t.Unknown()),
    totals: t.Object({
      groupsCount: t.Integer({ minimum: 0 }),
      matchesCount: t.Integer({ minimum: 0 }),
      eventsCount: t.Integer({ minimum: 0 })
    })
  })
});

export type QueryMatchMetricsInput = Static<typeof queryMatchMetricsBodySchema>;
export type QueryMatchMetricsResponse = Static<
  typeof queryMatchMetricsResponseSchema
>;

type AggregateGroup =
  | Static<typeof matchMetricsAccountGroupSchema>
  | Static<typeof matchMetricsPlayerGroupSchema>;

type SortDescriptor = NonNullable<QueryMatchMetricsInput["sort"]>[number];

type StatEventWithMatchRow = MatchStatEventRow & {
  match: typeof matches.$inferSelect;
};

type AggregateState = {
  groupKey: string;
  group: AggregateGroup;
  metrics: JsonObject;
  matchIds: Set<number>;
  playerIds: Set<number>;
  eventsCount: number;
};

type AggregateRow = {
  rank: number;
  groupKey: string;
  group: AggregateGroup;
  metrics: JsonObject;
  contribution: {
    matchesCount: number;
    eventsCount: number;
    playersCount: number;
  };
};

export async function queryMatchMetrics(
  input: QueryMatchMetricsInput
): Promise<QueryMatchMetricsResponse> {
  const schema = await resolveQuerySchema(input.schema);
  const definition = schema.version.definition;
  const metricKeys = metricKeysForDefinition(definition);
  const selectedMetricKeys = input.metrics ?? metricKeys;
  const groupBy = input.group?.by ?? "account";
  const sort = input.sort ?? [
    {
      type: "field",
      key: "name",
      direction: "asc"
    }
  ];

  assertKnownMetrics(metricKeys, selectedMetricKeys, "metric");
  assertKnownSort(metricKeys, sort);
  assertKnownEventTypes(definition, input.filters?.eventTypes);

  const events = await listQueryEvents(schema.version.id, input);
  const states = aggregateEvents(events, definition, groupBy);
  const rows = states.map((state) => toAggregateRow(state, selectedMetricKeys));

  rows.sort((left, right) => compareRows(left, right, sort));

  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  const page = pageRows(rows, input.page ?? {});
  const allMatchIds = new Set<number>();
  let eventsCount = 0;

  for (const state of states) {
    eventsCount += state.eventsCount;
    for (const matchId of state.matchIds) {
      allMatchIds.add(matchId);
    }
  }

  return {
    items: page.items,
    page: page.page,
    meta: {
      schema: {
        id: schema.family.uuid,
        name: schema.family.name,
        version: schema.version.version,
        isLatest: schema.version.version === schema.latestVersion
      },
      group: {
        by: groupBy,
        identityMode: "current"
      },
      availableMetrics: await metricMetadata(
        definition,
        metricKeys,
        input.language
      ),
      sort,
      totals: {
        groupsCount: rows.length,
        matchesCount: allMatchIds.size,
        eventsCount
      }
    }
  };
}

async function resolveQuerySchema(schema: QueryMatchMetricsInput["schema"]) {
  if ("id" in schema) {
    return schema.version === undefined
      ? getLatestStatEventSchemaRow(schema.id)
      : getStatEventSchemaRow(schema.id, schema.version);
  }

  return schema.version === undefined
    ? getLatestStatEventSchemaRowByName(schema.name)
    : getStatEventSchemaRowByName(schema.name, schema.version);
}

async function listQueryEvents(
  schemaVersionId: number,
  input: QueryMatchMetricsInput
): Promise<StatEventWithMatchRow[]> {
  const filters = input.filters ?? {};
  const statuses = filters.statuses ?? ["completed"];
  const conditions: Array<SQL | undefined> = [
    eq(matchStatEvents.schemaVersionId, schemaVersionId),
    isNull(matchStatEvents.disabledAt),
    inArray(matches.status, statuses)
  ];

  if (filters.matchIds) {
    conditions.push(inArray(matches.publicId, filters.matchIds));
  }

  if (filters.playerIds) {
    conditions.push(inArray(players.externalId, filters.playerIds));
  }

  if (filters.accountIds) {
    conditions.push(inArray(accounts.uuid, filters.accountIds));
  }

  if (filters.eventTypes) {
    conditions.push(inArray(matchStatEvents.type, filters.eventTypes));
  }

  if (filters.period?.from) {
    conditions.push(
      gte(periodColumn(filters.period.field), filters.period.from)
    );
  }

  if (filters.period?.to) {
    conditions.push(lte(periodColumn(filters.period.field), filters.period.to));
  }

  return db
    .select({
      id: matchStatEvents.id,
      uuid: matchStatEvents.uuid,
      matchId: matchStatEvents.matchId,
      schemaVersionId: matchStatEvents.schemaVersionId,
      sequence: matchStatEvents.sequence,
      type: matchStatEvents.type,
      playerId: matchStatEvents.playerId,
      value: matchStatEvents.value,
      occurredAt: matchStatEvents.occurredAt,
      tick: matchStatEvents.tick,
      disabledAt: matchStatEvents.disabledAt,
      createdAt: matchStatEvents.createdAt,
      updatedAt: matchStatEvents.updatedAt,
      player: players,
      account: accounts,
      match: matches
    })
    .from(matchStatEvents)
    .innerJoin(matches, eq(matchStatEvents.matchId, matches.id))
    .innerJoin(players, eq(matchStatEvents.playerId, players.id))
    .leftJoin(accounts, eq(players.accountId, accounts.id))
    .where(and(...conditions));
}

function periodColumn(field: "initiatedAt" | "endedAt" | "createdAt") {
  if (field === "initiatedAt") {
    return matches.initiatedAt;
  }

  if (field === "endedAt") {
    return matches.endedAt;
  }

  return matches.createdAt;
}

function aggregateEvents(
  events: StatEventWithMatchRow[],
  definition: StatEventSchemaDefinition,
  groupBy: "account" | "player" | "account-or-player"
): AggregateState[] {
  const eventDefinitionByType = new Map(
    definition.events.map((event) => [event.type, event])
  );
  const stateByGroup = new Map<string, AggregateState>();

  for (const event of events) {
    const eventDefinition = eventDefinitionByType.get(event.type);
    const aggregations = eventDefinition?.aggregations ?? [];

    if (aggregations.length === 0) {
      continue;
    }

    const group = groupForEvent(event, groupBy);

    if (!group) {
      continue;
    }

    const state = getAggregateState(stateByGroup, event, group);

    state.eventsCount += 1;
    state.matchIds.add(event.matchId);
    state.playerIds.add(event.playerId);

    for (const aggregation of aggregations) {
      applyStatEventAggregation(state.metrics, event, aggregation);
    }
  }

  const states = Array.from(stateByGroup.values());

  for (const state of states) {
    applyVirtualMetrics(state.metrics, definition);
  }

  return states;
}

function groupForEvent(
  event: StatEventWithMatchRow,
  groupBy: "account" | "player" | "account-or-player"
): AggregateGroup | null {
  if (groupBy === "account" || groupBy === "account-or-player") {
    if (event.account) {
      return {
        type: "account",
        id: event.account.uuid,
        name: event.account.name,
        externalId: event.account.externalId
      };
    }

    if (groupBy === "account") {
      return null;
    }
  }

  return {
    type: "player",
    id: event.player.externalId,
    name: event.player.name,
    country: event.player.country,
    account: null
  };
}

function getAggregateState(
  stateByGroup: Map<string, AggregateState>,
  event: StatEventWithMatchRow,
  group: AggregateGroup
): AggregateState {
  const groupKey = `${group.type}:${group.id}`;
  const existing = stateByGroup.get(groupKey);

  if (existing) {
    return existing;
  }

  const state = {
    groupKey,
    group:
      group.type === "player" && event.account
        ? {
            ...group,
            account: {
              uuid: event.account.uuid,
              name: event.account.name,
              externalId: event.account.externalId
            }
          }
        : group,
    metrics: {},
    matchIds: new Set<number>(),
    playerIds: new Set<number>(),
    eventsCount: 0
  };

  stateByGroup.set(groupKey, state);

  return state;
}

function toAggregateRow(
  state: AggregateState,
  selectedMetricKeys: string[]
): AggregateRow {
  const metrics: JsonObject = {};

  for (const key of selectedMetricKeys) {
    metrics[key] = state.metrics[key] ?? null;
  }

  return {
    rank: 1,
    groupKey: state.groupKey,
    group: state.group,
    metrics,
    contribution: {
      matchesCount: state.matchIds.size,
      eventsCount: state.eventsCount,
      playersCount: state.playerIds.size
    }
  };
}

function compareRows(
  left: AggregateRow,
  right: AggregateRow,
  sort: SortDescriptor[]
): number {
  for (const descriptor of sort) {
    const result =
      descriptor.type === "metric"
        ? compareValues(
            left.metrics[descriptor.key],
            right.metrics[descriptor.key]
          )
        : compareValues(left.group.name, right.group.name);

    if (result !== 0) {
      return descriptor.direction === "asc" ? result : -result;
    }
  }

  return left.groupKey.localeCompare(right.groupKey);
}

function compareValues(left: unknown, right: unknown): number {
  const leftMissing = left === null || left === undefined;
  const rightMissing = right === null || right === undefined;

  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) {
      return 0;
    }

    return leftMissing ? 1 : -1;
  }

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  return String(left).localeCompare(String(right));
}

function pageRows(
  rows: AggregateRow[],
  pageQuery: { limit?: number; cursor?: string }
): { items: QueryMatchMetricsResponse["items"]; page: PageInfo } {
  const { limit, cursor } = resolvePaginationQuery(pageQuery);
  const cursorValue = decodeCursor<{ groupKey: string }>(cursor);
  const startIndex = cursorValue
    ? rows.findIndex((row) => row.groupKey === cursorValue.groupKey) + 1
    : 0;
  const normalizedStartIndex = Math.max(startIndex, 0);
  const items = rows.slice(normalizedStartIndex, normalizedStartIndex + limit);
  const nextRow = rows[normalizedStartIndex + limit];

  return {
    items: items.map(({ groupKey: _groupKey, ...item }) => item),
    page: {
      limit,
      nextCursor: nextRow
        ? encodeCursor({ groupKey: items.at(-1)?.groupKey ?? nextRow.groupKey })
        : null
    }
  };
}

function metricKeysForDefinition(definition: StatEventSchemaDefinition) {
  const keys: string[] = [];
  const knownKeys = new Set<string>();
  const addKey = (key: string) => {
    if (!knownKeys.has(key)) {
      knownKeys.add(key);
      keys.push(key);
    }
  };

  for (const event of definition.events) {
    for (const aggregation of event.aggregations ?? []) {
      addKey(aggregation.metric);
    }
  }

  for (const virtualMetric of definition.virtualMetrics ?? []) {
    addKey(virtualMetric.metric);
  }

  return keys;
}

function assertKnownMetrics(
  metricKeys: string[],
  requestedKeys: string[],
  label: string
) {
  const knownKeys = new Set(metricKeys);
  const unknownKey = requestedKeys.find((key) => !knownKeys.has(key));

  if (unknownKey) {
    throw badRequest(`Unknown ${label}: ${unknownKey}`);
  }
}

function assertKnownSort(metricKeys: string[], sort: SortDescriptor[]) {
  const metricSortKeys = sort
    .filter((descriptor) => descriptor.type === "metric")
    .map((descriptor) => descriptor.key);

  assertKnownMetrics(metricKeys, metricSortKeys, "sort metric");
}

function assertKnownEventTypes(
  definition: StatEventSchemaDefinition,
  eventTypes: string[] | undefined
) {
  if (!eventTypes) {
    return;
  }

  const knownTypes = new Set(definition.events.map((event) => event.type));
  const unknownType = eventTypes.find((type) => !knownTypes.has(type));

  if (unknownType) {
    throw badRequest(`Unknown event type: ${unknownType}`);
  }
}

async function metricMetadata(
  definition: StatEventSchemaDefinition,
  metricKeys: string[],
  language: string | undefined
) {
  const metadataByKey = new Map(
    (definition.metrics ?? []).map((metric) => [metric.key, metric])
  );
  const categoryMetadataByKey = new Map(
    (definition.categories ?? []).map((category) => [category.key, category])
  );

  const labelKeys = metricKeys.flatMap((key) => {
    const metadata = metadataByKey.get(key);

    return [metadata?.label ?? key, metadata?.description].filter(
      (value): value is string => !!value
    );
  });

  for (const key of metricKeys) {
    const category = metadataByKey.get(key)?.category;

    if (category) {
      const categoryMetadata = categoryMetadataByKey.get(category);
      labelKeys.push(
        categoryMetadata?.label ?? category,
        ...(categoryMetadata?.description ? [categoryMetadata.description] : [])
      );
    }
  }

  const labels = await resolveLabels(labelKeys, language);

  return metricKeys.map((key) => {
    const metadata = metadataByKey.get(key);
    const labelKey = metadata?.label ?? key;
    const descriptionKey = metadata?.description;
    const categoryKey = metadata?.category;
    const categoryMetadata = categoryKey
      ? categoryMetadataByKey.get(categoryKey)
      : undefined;

    return {
      key,
      label: labels.get(labelKey) ?? labelKey,
      description: descriptionKey
        ? (labels.get(descriptionKey) ?? descriptionKey)
        : null,
      category: categoryKey
        ? {
            key: categoryKey,
            label:
              labels.get(categoryMetadata?.label ?? categoryKey) ??
              categoryMetadata?.label ??
              categoryKey,
            description: categoryMetadata?.description
              ? (labels.get(categoryMetadata.description) ??
                categoryMetadata.description)
              : null,
            primaryMetric: categoryMetadata?.primaryMetric ?? null
          }
        : null,
      ...optionalMetricMetadata(metadata)
    };
  });
}

function optionalMetricMetadata(metadata: StatMetricMetadata | undefined) {
  if (!metadata) {
    return {};
  }

  return {
    ...(metadata.valueType ? { valueType: metadata.valueType } : {}),
    ...(metadata.format ? { format: metadata.format } : {}),
    ...(metadata.precision !== undefined
      ? { precision: metadata.precision }
      : {}),
    ...(metadata.hidden !== undefined ? { hidden: metadata.hidden } : {})
  };
}
