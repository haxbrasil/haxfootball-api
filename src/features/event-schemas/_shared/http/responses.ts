import { type Static, t } from "elysia";
import type {
  EventSchemaFamily,
  EventSchemaVersion
} from "@/features/event-schemas/db";
import {
  eventSchemaIdSchema,
  eventSchemaNameSchema
} from "@/features/event-schemas/_shared/http/inputs";
import { paginatedResponseSchema } from "@lib";

export const eventSchemaResponseSchema = t.Object({
  id: eventSchemaIdSchema,
  name: eventSchemaNameSchema,
  title: t.Nullable(t.String()),
  description: t.Nullable(t.String()),
  version: t.Integer({ minimum: 1 }),
  isLatest: t.Boolean(),
  definition: t.Unknown(),
  createdAt: t.String(),
  updatedAt: t.String()
});

export const listEventSchemasResponseSchema = paginatedResponseSchema(
  eventSchemaResponseSchema
);

export type EventSchemaResponse = Static<typeof eventSchemaResponseSchema>;

export type EventSchemaRow = {
  family: EventSchemaFamily;
  version: EventSchemaVersion;
  latestVersion: number;
};

export function toEventSchemaResponse({
  family,
  version,
  latestVersion
}: EventSchemaRow): EventSchemaResponse {
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
