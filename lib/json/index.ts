export type JsonObject = {
  [key: string]: JsonValue;
};

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | JsonObject;

export function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}

export function jsonType(value: JsonValue): JsonType {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (typeof value === "object") {
    return "object";
  }

  return valueType(value);
}

export function jsonEquals(first: JsonValue, second: JsonValue): boolean {
  return stableJsonStringify(first) === stableJsonStringify(second);
}

export function stableJsonStringify(value: JsonValue | undefined): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }

  if (value !== undefined && isJsonObject(value)) {
    return `{${Object.entries(value)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJsonStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export type JsonType =
  | "null"
  | "boolean"
  | "number"
  | "string"
  | "array"
  | "object";

function valueType(value: boolean | number | string): JsonType {
  if (typeof value === "boolean") {
    return "boolean";
  }

  if (typeof value === "number") {
    return "number";
  }

  return "string";
}
