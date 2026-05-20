import { type Static, t } from "elysia";

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

export const statEventSchemaIdParamsSchema = t.Object({
  id: statEventSchemaIdSchema
});

export const statEventSchemaNameParamsSchema = t.Object({
  name: statEventSchemaNameSchema
});

export const statEventSchemaVersionParamsSchema = t.Object({
  id: statEventSchemaIdSchema,
  version: t.Integer({ minimum: 1 })
});

export const statEventSchemaNameVersionParamsSchema = t.Object({
  name: statEventSchemaNameSchema,
  version: t.Integer({ minimum: 1 })
});

export type StatEventSchemaReference = Static<
  typeof statEventSchemaReferenceSchema
>;
