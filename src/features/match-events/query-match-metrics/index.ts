import { and, eq, gte, inArray, isNull, lte, type SQL } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import { gameModes } from "@/features/game-modes/db";
import { gameModeNameSchema } from "@/features/game-modes/http";
import type { MatchEventRow } from "@/features/match-events/http";
import { matchEvents, type MatchEvent } from "@/features/match-events/db";
import {
  applyEventAggregation,
  applyVirtualMetrics
} from "@/features/match-events/_shared/domain/metrics";
import { matches } from "@/features/matches/db";
import { playerAccountResponseSchema } from "@/features/players/http";
import { players } from "@/features/players/db";
import { resolveLabels } from "@/features/localization/resolve-labels";
import {
  eventSchemaIdSchema,
  eventSchemaNameSchema
} from "@/features/event-schemas/http";
import {
  getLatestEventSchemaRow,
  getLatestEventSchemaRowByName,
  getEventSchemaRow,
  getEventSchemaRowByName
} from "@/features/event-schemas/read-event-schema";
import type {
  EventAggregationRule,
  EventSchemaDefinition,
  EventMetricMetadata
} from "@/features/event-schemas/definition";
import { badRequest } from "@/shared/http/errors";
import {
  decodeCursor,
  encodeCursor,
  pageInfoSchema,
  resolvePaginationQuery,
  type PageInfo
} from "@lib";
import type { JsonObject, JsonValue } from "@lib";

const matchMetricsPeriodFieldSchema = t.Union([
  t.Literal("initiatedAt"),
  t.Literal("endedAt"),
  t.Literal("createdAt")
]);

const matchMetricsTargetSchema = t.Union([
  t.Literal("player"),
  t.Literal("team"),
  t.Literal("match")
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
      id: eventSchemaIdSchema,
      version: t.Optional(t.Integer({ minimum: 1 }))
    }),
    t.Object({
      name: eventSchemaNameSchema,
      version: t.Optional(t.Integer({ minimum: 1 }))
    })
  ]),
  target: t.Optional(matchMetricsTargetSchema),
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
      gameModeNames: t.Optional(
        t.Array(gameModeNameSchema, {
          minItems: 1,
          uniqueItems: true
        })
      ),
      domains: t.Optional(
        t.Array(
          t.Union([
            t.Literal("room"),
            t.Literal("game"),
            t.Literal("agent"),
            t.Literal("system")
          ]),
          { minItems: 1, uniqueItems: true }
        )
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

const matchMetricsFeaturedMetricsSchema = t.Object({
  points: t.Optional(t.String())
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

const matchMetricsTeamGroupSchema = t.Object({
  type: t.Literal("team"),
  id: t.String(),
  name: t.String()
});

const matchMetricsMatchGroupSchema = t.Object({
  type: t.Literal("match"),
  id: t.String(),
  name: t.String()
});

export const queryMatchMetricsResponseSchema = t.Object({
  items: t.Array(
    t.Object({
      rank: t.Integer({ minimum: 1 }),
      group: t.Union([
        matchMetricsAccountGroupSchema,
        matchMetricsPlayerGroupSchema,
        matchMetricsTeamGroupSchema,
        matchMetricsMatchGroupSchema
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
      id: eventSchemaIdSchema,
      name: eventSchemaNameSchema,
      version: t.Integer({ minimum: 1 }),
      isLatest: t.Boolean()
    }),
    target: matchMetricsTargetSchema,
    group: t.Object({
      by: t.String(),
      identityMode: t.Literal("current")
    }),
    featuredMetrics: matchMetricsFeaturedMetricsSchema,
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
  | Static<typeof matchMetricsPlayerGroupSchema>
  | Static<typeof matchMetricsTeamGroupSchema>
  | Static<typeof matchMetricsMatchGroupSchema>;

type SortDescriptor = NonNullable<QueryMatchMetricsInput["sort"]>[number];

type EventWithMatchRow = MatchEventRow & {
  match: typeof matches.$inferSelect;
};

type AggregateState = {
  groupKey: string;
  group: AggregateGroup;
  metrics: JsonObject;
  matchIds: Set<number>;
  playerIds: Set<number>;
  eventKeys: Set<string>;
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
  const target = input.target ?? "player";
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
  const states = aggregateEvents(events, definition, target, groupBy);
  const rows = states.map((state) => toAggregateRow(state, selectedMetricKeys));

  rows.sort((left, right) => compareRows(left, right, sort));
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  const page = pageRows(rows, input.page ?? {});
  const allMatchIds = new Set<number>();
  let eventsCount = 0;

  for (const state of states) {
    eventsCount += state.eventKeys.size;
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
      target,
      group: {
        by: target === "player" ? groupBy : target,
        identityMode: "current"
      },
      featuredMetrics: definition.featuredMetrics ?? {},
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
      ? getLatestEventSchemaRow(schema.id)
      : getEventSchemaRow(schema.id, schema.version);
  }

  return schema.version === undefined
    ? getLatestEventSchemaRowByName(schema.name)
    : getEventSchemaRowByName(schema.name, schema.version);
}

async function listQueryEvents(
  schemaVersionId: number,
  input: QueryMatchMetricsInput
): Promise<EventWithMatchRow[]> {
  const filters = input.filters ?? {};
  const statuses = filters.statuses ?? ["completed"];
  const conditions: Array<SQL | undefined> = [
    eq(matchEvents.schemaVersionId, schemaVersionId),
    isNull(matchEvents.disabledAt),
    inArray(matches.status, statuses)
  ];

  if (filters.matchIds) {
    conditions.push(inArray(matches.publicId, filters.matchIds));
  }

  if (filters.gameModeNames) {
    conditions.push(inArray(gameModes.name, filters.gameModeNames));
  }

  if (filters.domains) {
    conditions.push(inArray(matchEvents.domain, filters.domains));
  }

  if (filters.eventTypes) {
    conditions.push(inArray(matchEvents.type, filters.eventTypes));
  }

  if (filters.period?.from) {
    conditions.push(
      gte(periodColumn(filters.period.field), filters.period.from)
    );
  }

  if (filters.period?.to) {
    conditions.push(lte(periodColumn(filters.period.field), filters.period.to));
  }

  const rows = await db
    .select({
      event: matchEvents,
      match: matches
    })
    .from(matchEvents)
    .innerJoin(matches, eq(matchEvents.matchId, matches.id))
    .leftJoin(gameModes, eq(matches.gameModeId, gameModes.id))
    .where(and(...conditions));
  const hydrated = await hydrateEvents(rows.map((row) => row.event));
  const eventById = new Map(hydrated.map((event) => [event.id, event]));
  const withMatches = rows.map((row) => ({
    ...(eventById.get(row.event.id) as MatchEventRow),
    match: row.match
  }));

  return withMatches.filter((event) => passesPlayerFilters(event, filters));
}

function passesPlayerFilters(
  event: EventWithMatchRow,
  filters: NonNullable<QueryMatchMetricsInput["filters"]>
): boolean {
  if (!filters.playerIds && !filters.accountIds) {
    return true;
  }

  const players = [
    event.actorPlayer
      ? { player: event.actorPlayer, account: event.actorAccount }
      : null,
    event.subjectPlayer
      ? { player: event.subjectPlayer, account: event.subjectAccount }
      : null
  ].filter((item): item is NonNullable<typeof item> => !!item);

  if (
    filters.playerIds &&
    !players.some((item) => filters.playerIds?.includes(item.player.externalId))
  ) {
    return false;
  }

  if (
    filters.accountIds &&
    !players.some((item) =>
      item.account ? filters.accountIds?.includes(item.account.uuid) : false
    )
  ) {
    return false;
  }

  return true;
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
  events: EventWithMatchRow[],
  definition: EventSchemaDefinition,
  target: "player" | "team" | "match",
  groupBy: "account" | "player" | "account-or-player"
): AggregateState[] {
  const eventDefinitionByType = new Map(
    definition.events.map((event) => [event.type, event])
  );
  const matchMetrics = aggregateMatchMetrics(events, definition);
  const totalMatchMetrics = sumMetricMaps(Array.from(matchMetrics.values()));
  const stateByGroup = new Map<string, AggregateState>();

  for (const event of events) {
    const eventDefinition = eventDefinitionByType.get(event.type);
    const aggregations = eventDefinition?.aggregations ?? [];

    for (const aggregation of aggregations) {
      if (!aggregationAppliesToTarget(aggregation, target)) {
        continue;
      }

      const group = groupForEvent(event, aggregation, target, groupBy);

      if (!group) {
        continue;
      }

      const state = getAggregateState(stateByGroup, group);

      state.matchIds.add(event.matchId);
      state.eventKeys.add(`${event.matchId}:${event.sequence}`);
      addAggregationPlayerIds(state, event, aggregation);
      applyEventAggregation(state.metrics, event, aggregation);
    }
  }

  const states = Array.from(stateByGroup.values());

  for (const state of states) {
    applyVirtualMetrics(state.metrics, definition, {
      matches: sumMetricMaps(
        Array.from(state.matchIds).map((matchId) => matchMetrics.get(matchId))
      ),
      total: totalMatchMetrics
    });
  }

  return states;
}

function aggregateMatchMetrics(
  events: EventWithMatchRow[],
  definition: EventSchemaDefinition
): Map<number, JsonObject> {
  const eventDefinitionByType = new Map(
    definition.events.map((event) => [event.type, event])
  );
  const metricsByMatchId = new Map<number, JsonObject>();

  for (const event of events) {
    const eventDefinition = eventDefinitionByType.get(event.type);
    const aggregations = (eventDefinition?.aggregations ?? []).filter(
      (aggregation) => aggregation.target === "match"
    );

    if (aggregations.length === 0) {
      continue;
    }

    const metrics = metricsByMatchId.get(event.matchId) ?? {};

    metricsByMatchId.set(event.matchId, metrics);

    for (const aggregation of aggregations) {
      applyEventAggregation(metrics, event, aggregation);
    }
  }

  return metricsByMatchId;
}

function aggregationAppliesToTarget(
  aggregation: EventAggregationRule,
  target: "player" | "team" | "match"
): boolean {
  if (target === "player") {
    return aggregation.target === "actor" || aggregation.target === "subject";
  }

  return aggregation.target === target;
}

function groupForEvent(
  event: EventWithMatchRow,
  aggregation: EventAggregationRule,
  target: "player" | "team" | "match",
  groupBy: "account" | "player" | "account-or-player"
): AggregateGroup | null {
  if (target === "match") {
    return {
      type: "match",
      id: event.match.publicId,
      name: event.match.publicId
    };
  }

  if (target === "team") {
    return event.team
      ? {
          type: "team",
          id: event.team,
          name: event.team
        }
      : null;
  }

  const player =
    aggregation.target === "actor" ? event.actorPlayer : event.subjectPlayer;
  const account =
    aggregation.target === "actor" ? event.actorAccount : event.subjectAccount;

  if (!player) {
    return null;
  }

  if (groupBy === "account" || groupBy === "account-or-player") {
    if (account) {
      return {
        type: "account",
        id: account.uuid,
        name: account.name,
        externalId: account.externalId
      };
    }

    if (groupBy === "account") {
      return null;
    }
  }

  return {
    type: "player",
    id: player.externalId,
    name: player.name,
    country: player.country,
    account: account
      ? {
          uuid: account.uuid,
          name: account.name,
          externalId: account.externalId
        }
      : null
  };
}

function addAggregationPlayerIds(
  state: AggregateState,
  event: EventWithMatchRow,
  aggregation: EventAggregationRule
): void {
  if (aggregation.target === "actor" && event.actorPlayer) {
    state.playerIds.add(event.actorPlayer.id);
  }

  if (aggregation.target === "subject" && event.subjectPlayer) {
    state.playerIds.add(event.subjectPlayer.id);
  }
}

function getAggregateState(
  stateByGroup: Map<string, AggregateState>,
  group: AggregateGroup
): AggregateState {
  const groupKey = `${group.type}:${group.id}`;
  const existing = stateByGroup.get(groupKey);

  if (existing) {
    return existing;
  }

  const state = {
    groupKey,
    group,
    metrics: {},
    matchIds: new Set<number>(),
    playerIds: new Set<number>(),
    eventKeys: new Set<string>()
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
      eventsCount: state.eventKeys.size,
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

function metricKeysForDefinition(definition: EventSchemaDefinition) {
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
  definition: EventSchemaDefinition,
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
  definition: EventSchemaDefinition,
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

function optionalMetricMetadata(metadata: EventMetricMetadata | undefined) {
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

async function hydrateEvents(events: MatchEvent[]): Promise<MatchEventRow[]> {
  const playerIds = Array.from(
    new Set(
      events
        .flatMap((event) => [event.actorPlayerId, event.subjectPlayerId])
        .filter((id): id is number => id !== null)
    )
  );

  const rows =
    playerIds.length > 0
      ? await db
          .select({
            player: players,
            account: accounts
          })
          .from(players)
          .leftJoin(accounts, eq(players.accountId, accounts.id))
          .where(inArray(players.id, playerIds))
      : [];
  const playerById = new Map(rows.map((row) => [row.player.id, row]));

  return events.map((event) => {
    const actor = event.actorPlayerId
      ? playerById.get(event.actorPlayerId)
      : null;
    const subject = event.subjectPlayerId
      ? playerById.get(event.subjectPlayerId)
      : null;

    return {
      ...event,
      actorPlayer: actor?.player ?? null,
      actorAccount: actor?.account ?? null,
      subjectPlayer: subject?.player ?? null,
      subjectAccount: subject?.account ?? null
    };
  });
}

function sumMetricMaps(metrics: Array<JsonObject | undefined>): JsonObject {
  const result: JsonObject = {};

  for (const metricMap of metrics) {
    if (!metricMap) {
      continue;
    }

    for (const [key, value] of Object.entries(metricMap)) {
      result[key] = addMetricValues(result[key], value);
    }
  }

  return result;
}

function addMetricValues(
  left: JsonValue | undefined,
  right: JsonValue
): JsonValue {
  if (typeof left === "number" || typeof right === "number") {
    return (
      (typeof left === "number" ? left : 0) +
      (typeof right === "number" ? right : 0)
    );
  }

  return right;
}
