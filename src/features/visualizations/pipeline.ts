import { badRequest } from "@/shared/http/errors";

export type DataRow = Record<string, unknown>;
export type PipelineOperation = Record<string, unknown> & { type: string };

export const visualizationLimits = {
  chartsPerSurface: 24,
  datasetsPerChart: 8,
  operationsPerDataset: 32,
  rowsPerDataset: 5_000,
  cellsPerDashboard: 250_000,
  bytesPerDashboard: 4 * 1024 * 1024
} as const;

const blockedKeys = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "renderItem"
]);
const blockedString =
  /(?:javascript:|data:text\/html|https?:\/\/|<\/?(?:script|iframe)|function\s*\(|=>)/i;

export function validateVisualizationSpecification(value: unknown) {
  if (!isRecord(value))
    throw badRequest("Visualization specification must be an object");
  const datasets = value.datasets;
  if (!Array.isArray(datasets) || datasets.length === 0)
    throw badRequest("At least one dataset is required");
  if (datasets.length > visualizationLimits.datasetsPerChart)
    throw badRequest("Visualization has too many datasets");
  for (const dataset of datasets) {
    if (
      !isRecord(dataset) ||
      typeof dataset.id !== "string" ||
      typeof dataset.source !== "string"
    ) {
      throw badRequest("Invalid visualization dataset");
    }
    if (
      dataset.operations !== undefined &&
      (!Array.isArray(dataset.operations) ||
        dataset.operations.length > visualizationLimits.operationsPerDataset)
    ) {
      throw badRequest("Invalid visualization pipeline");
    }
  }
  inspectSafeJson(value);
  return value;
}

export function executePipeline(
  input: DataRow[],
  operations: unknown[] = []
): DataRow[] {
  let rows = input.map((row) => ({ ...row }));
  for (const raw of operations) {
    if (!isRecord(raw) || typeof raw.type !== "string")
      throw badRequest("Invalid pipeline operation");
    rows = applyOperation(rows, raw as PipelineOperation);
    if (rows.length > visualizationLimits.rowsPerDataset)
      rows = rows.slice(0, visualizationLimits.rowsPerDataset);
  }
  return rows.slice(0, visualizationLimits.rowsPerDataset);
}

function applyOperation(
  rows: DataRow[],
  operation: PipelineOperation
): DataRow[] {
  switch (operation.type) {
    case "select": {
      const fields = stringArray(operation.fields);
      return rows.map((row) =>
        Object.fromEntries(fields.map((field) => [field, read(row, field)]))
      );
    }
    case "rename": {
      const fields = isRecord(operation.fields) ? operation.fields : {};
      return rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            typeof fields[key] === "string" ? fields[key] : key,
            value
          ])
        )
      );
    }
    case "filter":
      return rows.filter((row) =>
        Boolean(expression(operation.expression, row))
      );
    case "formula": {
      if (typeof operation.as !== "string")
        throw badRequest("Formula requires an output field");
      return rows.map((row) => ({
        ...row,
        [operation.as as string]: expression(operation.expression, row)
      }));
    }
    case "sort": {
      const field = requiredString(operation.field, "Sort field");
      const direction = operation.direction === "desc" ? -1 : 1;
      return [...rows].sort(
        (a, b) => compare(read(a, field), read(b, field)) * direction
      );
    }
    case "limit":
      return rows.slice(
        0,
        Math.max(
          0,
          Math.min(
            Number(operation.count) || 0,
            visualizationLimits.rowsPerDataset
          )
        )
      );
    case "rank": {
      const as = typeof operation.as === "string" ? operation.as : "rank";
      return rows.map((row, index) => ({ ...row, [as]: index + 1 }));
    }
    case "normalize": {
      const field = requiredString(operation.field, "Normalize field");
      const as =
        typeof operation.as === "string" ? operation.as : `${field}_normalized`;
      const total = rows.reduce(
        (sum, row) => sum + numeric(read(row, field)),
        0
      );
      return rows.map((row) => ({
        ...row,
        [as]: total === 0 ? 0 : numeric(read(row, field)) / total
      }));
    }
    case "cumulative": {
      const field = requiredString(operation.field, "Cumulative field");
      const as =
        typeof operation.as === "string" ? operation.as : `${field}_cumulative`;
      let total = 0;
      return rows.map((row) => ({
        ...row,
        [as]: (total += numeric(read(row, field)))
      }));
    }
    case "bin": {
      const field = requiredString(operation.field, "Bin field");
      const size = Math.max(Number(operation.size) || 1, Number.EPSILON);
      const as =
        typeof operation.as === "string" ? operation.as : `${field}_bin`;
      return rows.map((row) => ({
        ...row,
        [as]: Math.floor(numeric(read(row, field)) / size) * size
      }));
    }
    case "aggregate":
    case "group":
      return aggregate(
        rows,
        stringArray(operation.groupBy),
        Array.isArray(operation.metrics) ? operation.metrics : []
      );
    case "fold": {
      const fields = stringArray(operation.fields);
      const key = typeof operation.key === "string" ? operation.key : "key";
      const value =
        typeof operation.value === "string" ? operation.value : "value";
      return rows.flatMap((row) =>
        fields.map((field) => ({
          ...row,
          [key]: field,
          [value]: read(row, field)
        }))
      );
    }
    case "pivot":
      return pivot(
        rows,
        requiredString(operation.index, "Pivot index"),
        requiredString(operation.column, "Pivot column"),
        requiredString(operation.value, "Pivot value")
      );
    case "hierarchy":
    case "edges":
      return rows;
    default:
      throw badRequest(`Unsupported pipeline operation: ${operation.type}`);
  }
}

function aggregate(
  rows: DataRow[],
  groupBy: string[],
  rawMetrics: unknown[]
): DataRow[] {
  const groups = new Map<string, DataRow[]>();
  for (const row of rows) {
    const key = JSON.stringify(groupBy.map((field) => read(row, field)));
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((items) => {
    const output: DataRow = Object.fromEntries(
      groupBy.map((field) => [field, read(items[0] ?? {}, field)])
    );
    for (const raw of rawMetrics) {
      if (!isRecord(raw)) continue;
      const op = typeof raw.op === "string" ? raw.op : "sum";
      const field = typeof raw.field === "string" ? raw.field : null;
      const as =
        typeof raw.as === "string" ? raw.as : `${op}_${field ?? "rows"}`;
      const values = field ? items.map((row) => numeric(read(row, field))) : [];
      output[as] = aggregateValue(op, values, items, field);
    }
    return output;
  });
}

function aggregateValue(
  op: string,
  values: number[],
  rows: DataRow[],
  field: string | null
): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (op === "count") return rows.length;
  if (op === "distinct")
    return new Set(
      rows.map((row) => JSON.stringify(field ? read(row, field) : row))
    ).size;
  if (values.length === 0) return 0;
  if (op === "min") return Math.min(...values);
  if (op === "max") return Math.max(...values);
  if (op === "average" || op === "mean")
    return values.reduce((a, b) => a + b, 0) / values.length;
  if (op === "median") return percentile(sorted, 0.5);
  if (op === "percentile") return percentile(sorted, 0.9);
  if (op === "variance" || op === "standardDeviation") {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      values.length;
    return op === "variance" ? variance : Math.sqrt(variance);
  }
  return values.reduce((a, b) => a + b, 0);
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  const index = (values.length - 1) * Math.min(1, Math.max(0, percentileValue));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
}

function pivot(rows: DataRow[], index: string, column: string, value: string) {
  const output = new Map<string, DataRow>();
  for (const row of rows) {
    const key = String(read(row, index));
    const target = output.get(key) ?? { [index]: read(row, index) };
    target[String(read(row, column))] = read(row, value);
    output.set(key, target);
  }
  return [...output.values()];
}

function expression(value: unknown, row: DataRow): unknown {
  if (!isRecord(value)) return value;
  if (typeof value.field === "string") return read(row, value.field);
  const args = Array.isArray(value.args)
    ? value.args.map((arg) => expression(arg, row))
    : [];
  switch (value.op) {
    case "add":
      return args.reduce((sum: number, item) => sum + numeric(item), 0);
    case "subtract":
      return numeric(args[0]) - numeric(args[1]);
    case "multiply":
      return args.reduce((product: number, item) => product * numeric(item), 1);
    case "divide":
      return numeric(args[1]) === 0
        ? null
        : numeric(args[0]) / numeric(args[1]);
    case "eq":
      return args[0] === args[1];
    case "neq":
      return args[0] !== args[1];
    case "gt":
      return compare(args[0], args[1]) > 0;
    case "gte":
      return compare(args[0], args[1]) >= 0;
    case "lt":
      return compare(args[0], args[1]) < 0;
    case "lte":
      return compare(args[0], args[1]) <= 0;
    case "and":
      return args.every(Boolean);
    case "or":
      return args.some(Boolean);
    case "not":
      return !args[0];
    case "coalesce":
      return args.find((item) => item !== null && item !== undefined) ?? null;
    default:
      return null;
  }
}

function inspectSafeJson(value: unknown, path = "specification") {
  if (typeof value === "string" && blockedString.test(value))
    throw badRequest(`Unsafe value at ${path}`);
  if (Array.isArray(value))
    return value.forEach((item, index) =>
      inspectSafeJson(item, `${path}.${index}`)
    );
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (blockedKeys.has(key))
      throw badRequest(`Unsafe property at ${path}.${key}`);
    inspectSafeJson(item, `${path}.${key}`);
  }
}

function read(row: DataRow, field: string): unknown {
  return field
    .split(".")
    .reduce<unknown>(
      (value, key) => (isRecord(value) ? value[key] : undefined),
      row
    );
}
function numeric(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}
function compare(a: unknown, b: unknown) {
  return typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a ?? "").localeCompare(String(b ?? ""));
}
function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value)
    throw badRequest(`${label} is required`);
  return value;
}
function stringArray(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw badRequest("Expected a string array");
  return value as string[];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
