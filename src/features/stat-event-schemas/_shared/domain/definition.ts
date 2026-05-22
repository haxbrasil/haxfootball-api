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
  presentation?: PresentationMetadata;
  valueSchema?: JsonValueSchema;
  aggregations?: StatEventAggregationRule[];
};

export type StatVirtualMetricDefinition = {
  metric: string;
  value: StatMetricExpression;
};

export type PresentationMetadata = {
  label?: string;
  description?: string;
};

export type StatMetricValueType = "number" | "string" | "boolean" | "unknown";

export type StatMetricMetadata = {
  key: string;
  label?: string;
  description?: string;
  category?: string;
  valueType?: StatMetricValueType;
  format?: string;
  precision?: number;
  hidden?: boolean;
};

export type StatMetricCategoryMetadata = {
  key: string;
  label?: string;
  description?: string;
  primaryMetric?: string;
};

export type StatFeaturedMetricsMetadata = {
  points?: string;
};

export type StatEventSchemaDefinition = {
  events: StatEventDefinition[];
  virtualMetrics?: StatVirtualMetricDefinition[];
  metrics?: StatMetricMetadata[];
  categories?: StatMetricCategoryMetadata[];
  featuredMetrics?: StatFeaturedMetricsMetadata;
  presentation?: PresentationMetadata;
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
  const metrics = definition.metrics;
  const categories = definition.categories;
  const featuredMetrics = definition.featuredMetrics;
  const presentation = definition.presentation;

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

  const metricDefinitions =
    metrics === undefined ? undefined : toMetrics(metrics);
  const categoryDefinitions =
    categories === undefined ? undefined : toCategories(categories);
  const featuredMetricsMetadata =
    featuredMetrics === undefined
      ? undefined
      : toFeaturedMetrics(featuredMetrics);

  if (metrics !== undefined && !metricDefinitions) {
    return null;
  }

  if (categories !== undefined && !categoryDefinitions) {
    return null;
  }

  if (featuredMetrics !== undefined && !featuredMetricsMetadata) {
    return null;
  }

  const presentationMetadata =
    presentation === undefined
      ? undefined
      : toPresentationMetadata(presentation);

  if (presentation !== undefined && !presentationMetadata) {
    return null;
  }

  if (
    metricDefinitions &&
    !metricsMatchKnownMetrics(
      metricDefinitions,
      eventDefinitions,
      virtualMetrics
    )
  ) {
    return null;
  }

  if (
    categoryDefinitions &&
    !categoriesMatchKnownMetrics(categoryDefinitions, metricDefinitions ?? [])
  ) {
    return null;
  }

  if (
    featuredMetricsMetadata &&
    !featuredMetricsMatchKnownMetrics(
      featuredMetricsMetadata,
      eventDefinitions,
      virtualMetrics
    )
  ) {
    return null;
  }

  return {
    events: eventDefinitions,
    ...(virtualMetrics
      ? {
          virtualMetrics: virtualMetrics.map(toRequiredVirtualMetricDefinition)
        }
      : {}),
    ...(metricDefinitions ? { metrics: metricDefinitions } : {}),
    ...(categoryDefinitions ? { categories: categoryDefinitions } : {}),
    ...(featuredMetricsMetadata
      ? { featuredMetrics: featuredMetricsMetadata }
      : {}),
    ...(presentationMetadata ? { presentation: presentationMetadata } : {})
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
  const presentation =
    value.presentation === undefined
      ? undefined
      : toPresentationMetadata(value.presentation);

  if (valueSchema !== undefined && toJsonValueSchema(valueSchema) === null) {
    return null;
  }

  if (value.presentation !== undefined && !presentation) {
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
    ...(presentation ? { presentation } : {}),
    ...(valueSchema !== undefined
      ? { valueSchema: toRequiredJsonValueSchema(valueSchema) }
      : {}),
    ...(aggregations !== undefined
      ? { aggregations: aggregations.map(toRequiredAggregationRule) }
      : {})
  };
}

function toMetrics(value: JsonValue): StatMetricMetadata[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const metrics = value.map(toMetricMetadata);

  if (metrics.some((metric) => metric === null)) {
    return null;
  }

  const metricKeys = new Set(metrics.map((metric) => metric?.key));

  if (metricKeys.size !== metrics.length) {
    return null;
  }

  return metrics as StatMetricMetadata[];
}

function toCategories(value: JsonValue): StatMetricCategoryMetadata[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const categories = value.map(toCategoryMetadata);

  if (categories.some((category) => category === null)) {
    return null;
  }

  const categoryKeys = new Set(categories.map((category) => category?.key));

  if (categoryKeys.size !== categories.length) {
    return null;
  }

  return categories as StatMetricCategoryMetadata[];
}

function toFeaturedMetrics(
  value: JsonValue
): StatFeaturedMetricsMetadata | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const allowedKeys = new Set(["points"]);

  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return null;
  }

  const metadata: StatFeaturedMetricsMetadata = {};

  if (value.points !== undefined) {
    if (typeof value.points !== "string" || !isPublicIdentifier(value.points)) {
      return null;
    }

    metadata.points = value.points;
  }

  return metadata;
}

function toMetricMetadata(value: JsonValue): StatMetricMetadata | null {
  if (!isJsonObject(value) || typeof value.key !== "string") {
    return null;
  }

  if (!isPublicIdentifier(value.key)) {
    return null;
  }

  const metadata: StatMetricMetadata = {
    key: value.key
  };

  if (value.label !== undefined) {
    if (!isValueKey(value.label)) {
      return null;
    }

    metadata.label = value.label;
  }

  if (value.description !== undefined) {
    if (!isValueKey(value.description)) {
      return null;
    }

    metadata.description = value.description;
  }

  if (value.category !== undefined) {
    if (!isValueKey(value.category)) {
      return null;
    }

    metadata.category = value.category;
  }

  if (value.valueType !== undefined) {
    if (!isMetricValueType(value.valueType)) {
      return null;
    }

    metadata.valueType = value.valueType;
  }

  if (value.format !== undefined) {
    if (typeof value.format !== "string" || !isPublicIdentifier(value.format)) {
      return null;
    }

    metadata.format = value.format;
  }

  if (value.precision !== undefined) {
    if (
      typeof value.precision !== "number" ||
      !Number.isInteger(value.precision) ||
      value.precision < 0 ||
      value.precision > 10
    ) {
      return null;
    }

    metadata.precision = value.precision;
  }

  if (value.hidden !== undefined) {
    if (typeof value.hidden !== "boolean") {
      return null;
    }

    metadata.hidden = value.hidden;
  }

  return metadata;
}

function toCategoryMetadata(
  value: JsonValue
): StatMetricCategoryMetadata | null {
  if (!isJsonObject(value) || !isValueKey(value.key)) {
    return null;
  }

  const metadata: StatMetricCategoryMetadata = {
    key: value.key
  };

  if (value.label !== undefined) {
    if (!isValueKey(value.label)) {
      return null;
    }

    metadata.label = value.label;
  }

  if (value.description !== undefined) {
    if (!isValueKey(value.description)) {
      return null;
    }

    metadata.description = value.description;
  }

  if (value.primaryMetric !== undefined) {
    if (
      typeof value.primaryMetric !== "string" ||
      !isPublicIdentifier(value.primaryMetric)
    ) {
      return null;
    }

    metadata.primaryMetric = value.primaryMetric;
  }

  return metadata;
}

function toPresentationMetadata(
  value: JsonValue | undefined
): PresentationMetadata | null {
  if (value === undefined) {
    return null;
  }

  if (!isJsonObject(value)) {
    return null;
  }

  const metadata: PresentationMetadata = {};

  if (value.label !== undefined) {
    if (!isValueKey(value.label)) {
      return null;
    }

    metadata.label = value.label;
  }

  if (value.description !== undefined) {
    if (!isValueKey(value.description)) {
      return null;
    }

    metadata.description = value.description;
  }

  return metadata.label || metadata.description ? metadata : null;
}

function metricsMatchKnownMetrics(
  metrics: StatMetricMetadata[],
  events: StatEventDefinition[],
  virtualMetrics: JsonValue | undefined
): boolean {
  const knownMetrics = knownMetricKeys(events, virtualMetrics);

  return metrics.every((metric) => knownMetrics.has(metric.key));
}

function featuredMetricsMatchKnownMetrics(
  featuredMetrics: StatFeaturedMetricsMetadata,
  events: StatEventDefinition[],
  virtualMetrics: JsonValue | undefined
): boolean {
  const knownMetrics = knownMetricKeys(events, virtualMetrics);

  return Object.values(featuredMetrics).every((metric) =>
    knownMetrics.has(metric)
  );
}

function knownMetricKeys(
  events: StatEventDefinition[],
  virtualMetrics: JsonValue | undefined
): Set<string> {
  const knownMetrics = new Set<string>();

  for (const event of events) {
    for (const aggregation of event.aggregations ?? []) {
      knownMetrics.add(aggregation.metric);
    }
  }

  if (Array.isArray(virtualMetrics)) {
    for (const metric of virtualMetrics) {
      const definition = toVirtualMetricDefinition(metric);

      if (definition) {
        knownMetrics.add(definition.metric);
      }
    }
  }

  return knownMetrics;
}

function categoriesMatchKnownMetrics(
  categories: StatMetricCategoryMetadata[],
  metrics: StatMetricMetadata[]
): boolean {
  const categoryKeys = new Set(categories.map((category) => category.key));
  const metricByKey = new Map(metrics.map((metric) => [metric.key, metric]));

  for (const metric of metrics) {
    if (metric.category && !categoryKeys.has(metric.category)) {
      return false;
    }
  }

  for (const category of categories) {
    if (!category.primaryMetric) {
      continue;
    }

    const primaryMetric = metricByKey.get(category.primaryMetric);

    if (!primaryMetric || primaryMetric.category !== category.key) {
      return false;
    }
  }

  return true;
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

function isValueKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9.-]{0,127}$/.test(value);
}

function isMetricValueType(value: unknown): value is StatMetricValueType {
  return (
    value === "number" ||
    value === "string" ||
    value === "boolean" ||
    value === "unknown"
  );
}
