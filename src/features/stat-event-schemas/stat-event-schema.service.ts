import {
  type JsonExpression,
  type JsonValue,
  type JsonValueSchema,
  isJsonObject,
  isJsonValue,
  stableJsonStringify,
  toJsonValueSchema,
  validateJsonValue
} from "@lib";

export type StatMetricExpression = JsonExpression;

export type StatEventAggregationRule = {
  metric: string;
  initial: JsonValue;
  step: StatMetricExpression;
};

export type StatEventDefinition = {
  type: string;
  title?: string;
  description?: string;
  valueSchema?: JsonValueSchema;
  aggregations?: StatEventAggregationRule[];
};

export type StatVirtualMetricDefinition = {
  metric: string;
  value: StatMetricExpression;
};

export type StatEventSchemaDefinition = {
  events: StatEventDefinition[];
  virtualMetrics?: StatVirtualMetricDefinition[];
};

export function validateStatEventSchemaDefinition(
  definition: unknown
): StatEventSchemaDefinition | null {
  if (!isJsonValue(definition) || !isJsonObject(definition)) {
    return null;
  }

  const events = definition.events;

  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }

  const eventDefinitions = events
    .map(toEventDefinition)
    .filter((event): event is StatEventDefinition => event !== null);

  if (eventDefinitions.length !== events.length) {
    return null;
  }

  const eventTypes = new Set(eventDefinitions.map((event) => event.type));

  if (eventTypes.size !== eventDefinitions.length) {
    return null;
  }

  const virtualMetrics = definition.virtualMetrics;

  if (virtualMetrics !== undefined) {
    if (!Array.isArray(virtualMetrics)) {
      return null;
    }

    const invalidVirtualMetric = virtualMetrics.some(
      (metric) => toVirtualMetricDefinition(metric) === null
    );

    if (invalidVirtualMetric) {
      return null;
    }
  }

  return {
    events: eventDefinitions,
    ...(virtualMetrics
      ? {
          virtualMetrics: virtualMetrics.map(toRequiredVirtualMetricDefinition)
        }
      : {})
  };
}

export function validateStatValue(
  value: JsonValue,
  schema: JsonValueSchema | undefined
): boolean {
  return validateJsonValue(value, schema);
}

export function isBreakingSchemaChange(
  previous: StatEventSchemaDefinition,
  next: StatEventSchemaDefinition
): boolean {
  const nextEventByType = new Map(
    next.events.map((event) => [event.type, event])
  );

  const changedExistingEvent = previous.events.some((previousEvent) => {
    const nextEvent = nextEventByType.get(previousEvent.type);

    if (!nextEvent) {
      return true;
    }

    const valueSchemaChanged =
      stableJsonStringify(previousEvent.valueSchema ?? null) !==
      stableJsonStringify(nextEvent.valueSchema ?? null);
    const aggregationsChanged =
      stableJsonStringify(previousEvent.aggregations ?? []) !==
      stableJsonStringify(nextEvent.aggregations ?? []);

    return valueSchemaChanged || aggregationsChanged;
  });

  if (changedExistingEvent) {
    return true;
  }

  const nextVirtualMetricByName = new Map(
    (next.virtualMetrics ?? []).map((metric) => [metric.metric, metric])
  );

  return (previous.virtualMetrics ?? []).some((previousMetric) => {
    const nextMetric = nextVirtualMetricByName.get(previousMetric.metric);

    return (
      !nextMetric ||
      stableJsonStringify(previousMetric) !== stableJsonStringify(nextMetric)
    );
  });
}

function toEventDefinition(value: JsonValue): StatEventDefinition | null {
  if (!isJsonObject(value) || typeof value.type !== "string") {
    return null;
  }

  if (!isPublicIdentifier(value.type)) {
    return null;
  }

  const valueSchema = value.valueSchema;
  const aggregations = value.aggregations;

  if (valueSchema !== undefined && toJsonValueSchema(valueSchema) === null) {
    return null;
  }

  if (aggregations !== undefined) {
    if (!Array.isArray(aggregations)) {
      return null;
    }

    if (aggregations.some((rule) => toAggregationRule(rule) === null)) {
      return null;
    }
  }

  return {
    type: value.type,
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.description === "string"
      ? { description: value.description }
      : {}),
    ...(valueSchema !== undefined
      ? { valueSchema: toRequiredJsonValueSchema(valueSchema) }
      : {}),
    ...(aggregations !== undefined
      ? { aggregations: aggregations.map(toRequiredAggregationRule) }
      : {})
  };
}

function toVirtualMetricDefinition(
  value: JsonValue
): StatVirtualMetricDefinition | null {
  if (!isJsonObject(value) || typeof value.metric !== "string") {
    return null;
  }

  if (!isPublicIdentifier(value.metric)) {
    return null;
  }

  if (!("value" in value) || !isExpression(value.value)) {
    return null;
  }

  return {
    metric: value.metric,
    value: value.value
  };
}

function toAggregationRule(value: JsonValue): StatEventAggregationRule | null {
  if (!isJsonObject(value) || typeof value.metric !== "string") {
    return null;
  }

  if (!isPublicIdentifier(value.metric)) {
    return null;
  }

  if (
    !("initial" in value) ||
    !("step" in value) ||
    !isExpression(value.step)
  ) {
    return null;
  }

  return {
    metric: value.metric,
    initial: value.initial,
    step: value.step
  };
}

function isExpression(value: JsonValue): boolean {
  if (!isJsonObject(value)) {
    return true;
  }

  if ("path" in value) {
    return typeof value.path === "string";
  }

  if ("op" in value) {
    return typeof value.op === "string";
  }

  return Object.values(value).every(isExpression);
}

function toRequiredJsonValueSchema(value: JsonValue): JsonValueSchema {
  const schema = toJsonValueSchema(value);

  if (!schema) {
    throw new Error("Invalid value schema");
  }

  return schema;
}

function toRequiredAggregationRule(value: JsonValue): StatEventAggregationRule {
  const rule = toAggregationRule(value);

  if (!rule) {
    throw new Error("Invalid aggregation rule");
  }

  return rule;
}

function toRequiredVirtualMetricDefinition(
  value: JsonValue
): StatVirtualMetricDefinition {
  const metric = toVirtualMetricDefinition(value);

  if (!metric) {
    throw new Error("Invalid virtual metric");
  }

  return metric;
}

function isPublicIdentifier(value: string): boolean {
  return /^[a-z][a-z0-9-]{0,63}$/.test(value);
}
