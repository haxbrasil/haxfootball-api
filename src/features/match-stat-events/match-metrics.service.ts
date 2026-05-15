import type {
  MatchMetricsResponse,
  MatchStatEventRow
} from "@/features/match-stat-events/match-stat-event.contract";
import { toPlayerResponse } from "@/features/players/player.contract";
import type {
  StatEventAggregationRule,
  StatEventSchemaDefinition
} from "@/features/stat-event-schemas/stat-event-schema.service";
import { evaluateJsonExpression, type JsonObject } from "@lib";

type PlayerMetricState = {
  player: MatchStatEventRow["player"];
  account: MatchStatEventRow["account"];
  metrics: JsonObject;
};

export function deriveMatchMetrics(
  definition: StatEventSchemaDefinition,
  events: MatchStatEventRow[]
): MatchMetricsResponse {
  const eventDefinitionByType = new Map(
    definition.events.map((eventDefinition) => [
      eventDefinition.type,
      eventDefinition
    ])
  );
  const stateByPlayerId = new Map<number, PlayerMetricState>();
  const enabledEvents = events.filter((event) => event.disabledAt === null);

  for (const event of enabledEvents) {
    const eventDefinition = eventDefinitionByType.get(event.type);
    const aggregations = eventDefinition?.aggregations ?? [];

    if (aggregations.length === 0) {
      continue;
    }

    const state = getPlayerMetricState(stateByPlayerId, event);

    for (const aggregation of aggregations) {
      applyAggregation(state.metrics, event, aggregation);
    }
  }

  const states = Array.from(stateByPlayerId.values());

  for (const state of states) {
    for (const virtualMetric of definition.virtualMetrics ?? []) {
      state.metrics[virtualMetric.metric] = evaluateJsonExpression(
        virtualMetric.value,
        {
          metrics: state.metrics
        }
      );
    }
  }

  return states.map((state) => ({
    player: toPlayerResponse({ player: state.player, account: state.account }),
    metrics: state.metrics
  }));
}

function applyAggregation(
  metrics: JsonObject,
  event: MatchStatEventRow,
  aggregation: StatEventAggregationRule
): void {
  const currentValue = metrics[aggregation.metric] ?? aggregation.initial;
  const nextValue = evaluateJsonExpression(aggregation.step, {
    acc: currentValue,
    event: statEventScopeValue(event),
    metrics
  });

  metrics[aggregation.metric] = nextValue;
}

function getPlayerMetricState(
  stateByPlayerId: Map<number, PlayerMetricState>,
  event: MatchStatEventRow
): PlayerMetricState {
  const existingState = stateByPlayerId.get(event.playerId);

  if (existingState) {
    return existingState;
  }

  const state = {
    player: event.player,
    account: event.account,
    metrics: {}
  };

  stateByPlayerId.set(event.playerId, state);

  return state;
}

function statEventScopeValue(event: MatchStatEventRow): JsonObject {
  return {
    type: event.type,
    value: event.value,
    occurredAt: event.occurredAt,
    tick: event.tick
  };
}
