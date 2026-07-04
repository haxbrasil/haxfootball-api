import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GraphQLError } from "graphql";
import {
  createSchema,
  createYoga,
  maskError as defaultMaskError
} from "graphql-yoga";
import { resolvers } from "@/features/live-state/_graphql/resolvers";
import { HttpError } from "@/shared/http/errors";

const schemaPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "schema.graphql"
);
const typeDefs = readFileSync(schemaPath, "utf8");

export const liveStateGraphql = createYoga({
  graphqlEndpoint: "/api/graphql",
  maskedErrors: {
    maskError(error, message, isDev) {
      const httpError = getHttpError(error);

      if (httpError) {
        return new GraphQLError(httpError.message, {
          extensions: {
            code: httpError.code,
            http: {
              status: httpError.status
            }
          }
        });
      }

      return defaultMaskError(error, message, isDev);
    }
  },
  schema: createSchema({
    typeDefs,
    resolvers
  })
});

function getHttpError(error: unknown): HttpError | null {
  if (error instanceof HttpError) {
    return error;
  }

  if (
    error instanceof GraphQLError &&
    error.originalError instanceof HttpError
  ) {
    return error.originalError;
  }

  return null;
}
