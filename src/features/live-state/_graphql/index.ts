import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSchema, createYoga } from "graphql-yoga";
import { resolvers } from "@/features/live-state/_graphql/resolvers";

const schemaPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "schema.graphql"
);
const typeDefs = readFileSync(schemaPath, "utf8");

export const liveStateGraphql = createYoga({
  graphqlEndpoint: "/api/graphql",
  schema: createSchema({
    typeDefs,
    resolvers
  })
});
