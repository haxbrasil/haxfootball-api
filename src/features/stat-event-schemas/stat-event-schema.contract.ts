import { type Static, t } from "elysia";
import type {
  StatEventSchemaFamily,
  StatEventSchemaVersion
} from "@/features/stat-event-schemas/stat-event-schema.db";

export const statEventSchemaIdSchema = t.String({ format: "uuid" });

export const statEventSchemaNameSchema = t.String({
  minLength: 1,
  maxLength: 64,
  pattern: "^[a-z][a-z0-9-]{0,63}$"
});

export const statEventSchemaReferenceSchema = t.Object({
  id: statEventSchemaIdSchema,
  version: t.Integer({ minimum: 1 })
});

export const statEventSchemaResponseSchema = t.Object({
  id: statEventSchemaIdSchema,
  name: statEventSchemaNameSchema,
  title: t.Nullable(t.String()),
  description: t.Nullable(t.String()),
  version: t.Integer({ minimum: 1 }),
  isLatest: t.Boolean(),
  definition: t.Unknown(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const listStatEventSchemasResponseSchema = t.Array(
  statEventSchemaResponseSchema
);

export const statEventSchemaIdParamsSchema = t.Object({
  id: statEventSchemaIdSchema
});

export const statEventSchemaVersionParamsSchema = t.Object({
  id: statEventSchemaIdSchema,
  version: t.Integer({ minimum: 1 })
});

export type StatEventSchemaReference = Static<
  typeof statEventSchemaReferenceSchema
>;
export type StatEventSchemaResponse = Static<
  typeof statEventSchemaResponseSchema
>;

export type StatEventSchemaRow = {
  family: StatEventSchemaFamily;
  version: StatEventSchemaVersion;
  latestVersion: number;
};

export function toStatEventSchemaResponse({
  family,
  version,
  latestVersion
}: StatEventSchemaRow): StatEventSchemaResponse {
  return {
    id: family.uuid,
    name: family.name,
    title: family.title,
    description: family.description,
    version: version.version,
    isLatest: version.version === latestVersion,
    definition: version.definition,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt
  };
}
