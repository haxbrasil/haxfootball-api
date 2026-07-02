import { GraphQLScalarType, Kind } from "graphql";
import { isJsonValue, type JsonValue } from "@lib";

export const dateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  serialize: (value) => value
});

export const jsonScalar = new GraphQLScalarType({
  name: "JSON",
  serialize: (value) => value,
  parseValue: (value) => {
    if (!isJsonValue(value)) {
      throw new TypeError("Expected JSON value");
    }

    return value;
  },
  parseLiteral: (ast) => parseJsonLiteral(ast)
});

function parseJsonLiteral(
  ast: Parameters<GraphQLScalarType["parseLiteral"]>[0]
): JsonValue {
  switch (ast.kind) {
    case Kind.NULL:
      return null;
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.STRING:
      return ast.value;
    case Kind.LIST:
      return ast.values.map(parseJsonLiteral);
    case Kind.OBJECT:
      return Object.fromEntries(
        ast.fields.map((field) => [
          field.name.value,
          parseJsonLiteral(field.value)
        ])
      );
    default:
      throw new TypeError("Expected JSON value");
  }
}
