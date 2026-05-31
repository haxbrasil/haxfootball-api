import { type Static, t } from "elysia";

export const eventSchemaIdSchema = t.String({ format: "uuid" });

export const eventSchemaNameSchema = t.String({
  minLength: 1,
  maxLength: 64,
  pattern: "^[a-z][a-z0-9-]{0,63}$"
});

export const eventSchemaReferenceSchema = t.Object({
  id: eventSchemaIdSchema,
  version: t.Integer({ minimum: 1 })
});

export const eventSchemaIdParamsSchema = t.Object({
  id: eventSchemaIdSchema
});

export const eventSchemaNameParamsSchema = t.Object({
  name: eventSchemaNameSchema
});

export const eventSchemaVersionParamsSchema = t.Object({
  id: eventSchemaIdSchema,
  version: t.Integer({ minimum: 1 })
});

export const eventSchemaNameVersionParamsSchema = t.Object({
  name: eventSchemaNameSchema,
  version: t.Integer({ minimum: 1 })
});

export type EventSchemaReference = Static<typeof eventSchemaReferenceSchema>;
