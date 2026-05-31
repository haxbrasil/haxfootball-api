import type {
  MatchMetricsResponse,
  MatchEventRow
} from "@/features/match-events/_shared/http/responses";
import { toPlayerResponse } from "@/features/players/http";
import type {
  EventAggregationRule,
  EventSchemaDefinition
} from "@/features/event-schemas/definition";
import { evaluateJsonExpression, type JsonObject } from "@lib";

type PlayerMetricState = {
  player: NonNullable<MatchEventRow["actorPlayer"]>;
  account: MatchEventRow["actorAccount"];
  metrics: JsonObject;
};

type ProjectionState = {
  players: Map<number, PlayerMetricState>;
  teams: Map<string, JsonObject>;
  match: JsonObject;
};

export function deriveMatchMetrics(
  definition: EventSchemaDefinition,
  events: MatchEventRow[]
): MatchMetricsResponse {
  const state = projectEvents(definition, events);

  for (const playerState of state.players.values()) {
    applyVirtualMetrics(playerState.metrics, definition, {
      matches: state.match,
      total: state.match
    });
  }

  return Array.from(state.players.values()).map((state) => ({
    player: toPlayerResponse({ player: state.player, account: state.account }),
    metrics: state.metrics
  }));
}

export function projectEvents(
  definition: EventSchemaDefinition,
  events: MatchEventRow[]
): ProjectionState {
  const eventDefinitionByType = new Map(
    definition.events.map((eventDefinition) => [
      eventDefinition.type,
      eventDefinition
    ])
  );
  const state: ProjectionState = {
    players: new Map(),
    teams: new Map(),
    match: {}
  };
  const enabledEvents = events.filter((event) => event.disabledAt === null);

  for (const event of enabledEvents) {
    const eventDefinition = eventDefinitionByType.get(event.type);
    const aggregations = eventDefinition?.aggregations ?? [];

    for (const aggregation of aggregations) {
      const target = resolveAggregationTarget(state, event, aggregation);

      if (!target) {
        continue;
      }

      applyEventAggregation(target, event, aggregation);
    }
  }

  return state;
}

export function applyEventAggregation(
  metrics: JsonObject,
  event: MatchEventRow,
  aggregation: EventAggregationRule
): void {
  const currentValue = metrics[aggregation.metric] ?? aggregation.initial;
  const nextValue = evaluateJsonExpression(aggregation.step, {
    acc: currentValue,
    event: eventScopeValue(event),
    metrics
  });

  metrics[aggregation.metric] = nextValue;
}

export function applyVirtualMetrics(
  metrics: JsonObject,
  definition: EventSchemaDefinition,
  context: { matches?: JsonObject; total?: JsonObject } = {}
): void {
  for (const virtualMetric of definition.virtualMetrics ?? []) {
    metrics[virtualMetric.metric] = evaluateJsonExpression(
      virtualMetric.value,
      {
        metrics,
        matches: context.matches ?? {},
        total: context.total ?? {}
      }
    );
  }
}

function resolveAggregationTarget(
  state: ProjectionState,
  event: MatchEventRow,
  aggregation: EventAggregationRule
): JsonObject | null {
  if (aggregation.target === "match") {
    return state.match;
  }

  if (aggregation.target === "team") {
    if (!event.team) {
      return null;
    }

    const existing = state.teams.get(event.team);

    if (existing) {
      return existing;
    }

    const metrics: JsonObject = {};

    state.teams.set(event.team, metrics);

    return metrics;
  }

  const player =
    aggregation.target === "actor" ? event.actorPlayer : event.subjectPlayer;
  const account =
    aggregation.target === "actor" ? event.actorAccount : event.subjectAccount;

  if (!player) {
    return null;
  }

  const existing = state.players.get(player.id);

  if (existing) {
    return existing.metrics;
  }

  const next = {
    player,
    account,
    metrics: {}
  };

  state.players.set(player.id, next);

  return next.metrics;
}

export function eventScopeValue(event: MatchEventRow): JsonObject {
  return {
    domain: event.domain,
    type: event.type,
    scope: event.scope,
    team: event.team,
    roomPlayerId: event.roomPlayerId,
    playId: event.playId,
    sourceState: event.sourceState,
    value: event.value,
    occurredAt: event.occurredAt,
    elapsedSeconds: event.elapsedSeconds,
    tick: event.tick
  };
}
