import type { JsonType, JsonValue } from "@lib/json";
import { isJsonObject, jsonEquals, jsonType } from "@lib/json";

export type JsonValueSchema = {
  type?: JsonType;
  enum?: JsonValue[];
  const?: JsonValue;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  items?: JsonValueSchema;
  properties?: Record<string, JsonValueSchema>;
  required?: string[];
};

export function toJsonValueSchema(value: JsonValue): JsonValueSchema | null {
  if (!isJsonObject(value)) {
    return null;
  }

  if (!isValidSchemaType(value.type)) {
    return null;
  }

  if (value.enum !== undefined && !Array.isArray(value.enum)) {
    return null;
  }

  if (value.minimum !== undefined && typeof value.minimum !== "number") {
    return null;
  }

  if (value.maximum !== undefined && typeof value.maximum !== "number") {
    return null;
  }

  if (value.minLength !== undefined && typeof value.minLength !== "number") {
    return null;
  }

  if (value.maxLength !== undefined && typeof value.maxLength !== "number") {
    return null;
  }

  if (value.items !== undefined && toJsonValueSchema(value.items) === null) {
    return null;
  }

  if (value.properties !== undefined) {
    if (!isJsonObject(value.properties)) {
      return null;
    }

    const propertySchemas = Object.values(value.properties);

    if (propertySchemas.some((schema) => toJsonValueSchema(schema) === null)) {
      return null;
    }
  }

  if (
    value.required !== undefined &&
    (!Array.isArray(value.required) ||
      value.required.some((item) => typeof item !== "string"))
  ) {
    return null;
  }

  return value;
}

export function validateJsonValue(
  value: JsonValue,
  schema: JsonValueSchema | undefined
): boolean {
  if (!schema) {
    return true;
  }

  if (schema.const !== undefined && !jsonEquals(value, schema.const)) {
    return false;
  }

  if (schema.enum && !schema.enum.some((item) => jsonEquals(value, item))) {
    return false;
  }

  if (schema.type && jsonType(value) !== schema.type) {
    return false;
  }

  if (typeof value === "number") {
    const aboveMinimum =
      schema.minimum === undefined || value >= schema.minimum;
    const belowMaximum =
      schema.maximum === undefined || value <= schema.maximum;

    return aboveMinimum && belowMaximum;
  }

  if (typeof value === "string") {
    const aboveMinLength =
      schema.minLength === undefined || value.length >= schema.minLength;
    const belowMaxLength =
      schema.maxLength === undefined || value.length <= schema.maxLength;

    return aboveMinLength && belowMaxLength;
  }

  if (Array.isArray(value) && schema.items) {
    return value.every((item) => validateJsonValue(item, schema.items));
  }

  if (isJsonObject(value) && schema.properties) {
    const required = schema.required ?? [];
    const hasRequired = required.every((property) => property in value);

    if (!hasRequired) {
      return false;
    }

    return Object.entries(schema.properties).every(
      ([property, propertySchema]) => {
        const propertyValue = value[property];

        return (
          propertyValue === undefined ||
          validateJsonValue(propertyValue, propertySchema)
        );
      }
    );
  }

  return true;
}

function isValidSchemaType(
  value: JsonValue | undefined
): value is JsonType | undefined {
  return (
    value === undefined ||
    value === "null" ||
    value === "boolean" ||
    value === "number" ||
    value === "string" ||
    value === "array" ||
    value === "object"
  );
}
