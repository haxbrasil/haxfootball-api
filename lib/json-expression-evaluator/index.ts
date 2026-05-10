import type { JsonObject, JsonValue } from "@lib/json";
import { isJsonObject } from "@lib/json";

export type JsonExpression =
  | JsonValue
  | {
      path: string;
    }
  | {
      op: string;
      args?: JsonExpression[];
      then?: JsonExpression;
      else?: JsonExpression;
    };

export type JsonExpressionScope = Record<string, JsonValue | undefined>;

type OperationExpression = {
  op: string;
  args?: JsonExpression[];
  then?: JsonExpression;
  else?: JsonExpression;
};

export function evaluateJsonExpression(
  expression: JsonExpression,
  scope: JsonExpressionScope
): JsonValue {
  if (!isJsonObject(expression)) {
    return expression;
  }

  if ("path" in expression && typeof expression.path === "string") {
    return readPath(expression.path, scope);
  }

  if (isOperationExpression(expression)) {
    return evaluateOperation(expression, scope);
  }

  return Object.fromEntries(
    Object.entries(expression).map(([key, value]) => [
      key,
      evaluateJsonExpression(value, scope)
    ])
  );
}

function evaluateOperation(
  expression: OperationExpression,
  scope: JsonExpressionScope
): JsonValue {
  const args = Array.isArray(expression.args)
    ? expression.args.map((arg) => evaluateJsonExpression(arg, scope))
    : [];

  switch (expression.op) {
    case "add":
      return numeric(args[0]) + numeric(args[1]);
    case "subtract":
      return numeric(args[0]) - numeric(args[1]);
    case "multiply":
      return numeric(args[0]) * numeric(args[1]);
    case "divide":
      return numeric(args[1]) === 0 ? null : numeric(args[0]) / numeric(args[1]);
    case "eq":
      return JSON.stringify(args[0]) === JSON.stringify(args[1]);
    case "gt":
      return numeric(args[0]) > numeric(args[1]);
    case "gte":
      return numeric(args[0]) >= numeric(args[1]);
    case "lt":
      return numeric(args[0]) < numeric(args[1]);
    case "lte":
      return numeric(args[0]) <= numeric(args[1]);
    case "and":
      return args.every(Boolean);
    case "or":
      return args.some(Boolean);
    case "not":
      return !args[0];
    case "coalesce":
      return args.find((arg) => arg !== null) ?? null;
    case "append":
      return [...array(args[0]), args[1] ?? null];
    case "length":
      return Array.isArray(args[0]) || typeof args[0] === "string"
        ? args[0].length
        : 0;
    case "if":
      return evaluateJsonExpression(
        args[0] ? expression.then ?? null : expression.else ?? null,
        scope
      );
    default:
      return null;
  }
}

function readPath(path: string, scope: JsonExpressionScope): JsonValue {
  const segments = path.split(".");
  const root = segments[0];
  const value = scope[root];

  const result =
    segments.slice(1).reduce<JsonValue | undefined>((current, segment) => {
      if (current === undefined) {
        return undefined;
      }

      if (!isJsonObject(current) && !Array.isArray(current)) {
        return undefined;
      }

      if (Array.isArray(current)) {
        const index = Number(segment);

        return Number.isInteger(index) ? current[index] : undefined;
      }

      return current[segment];
    }, value) ?? null;

  return result;
}

function isOperationExpression(
  expression: JsonObject
): expression is OperationExpression {
  return typeof expression.op === "string";
}

function numeric(value: JsonValue | undefined): number {
  return typeof value === "number" ? value : 0;
}

function array(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}
