import { and, eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import type { EventSchemaResponse } from "@/features/event-schemas/_shared/http/responses";
import {
  eventSchemaResponseSchema,
  toEventSchemaResponse
} from "@/features/event-schemas/_shared/http/responses";
import { eventSchemaVersions } from "@/features/event-schemas/db";
import {
  isBreakingSchemaChange,
  validateEventSchemaDefinition
} from "@/features/event-schemas/_shared/domain/definition";
import { getEventSchemaRow } from "@/features/event-schemas/_shared/db/queries";
import { badRequest } from "@/shared/http/errors";

export const updateEventSchemaBodySchema = t.Object({
  definition: t.Unknown()
});

export { eventSchemaResponseSchema as updateEventSchemaResponseSchema };

export type UpdateEventSchemaInput = Static<typeof updateEventSchemaBodySchema>;

export async function updateEventSchema(
  id: string,
  versionNumber: number,
  input: UpdateEventSchemaInput
): Promise<EventSchemaResponse> {
  const row = await getEventSchemaRow(id, versionNumber);

  if (row.version.version !== row.latestVersion) {
    throw badRequest("Only the latest event schema version can be updated");
  }

  const definition = validateEventSchemaDefinition(input.definition);

  if (!definition) {
    throw badRequest("Invalid event schema definition");
  }

  if (isBreakingSchemaChange(row.version.definition, definition)) {
    throw badRequest("Breaking changes must be published as a new version");
  }

  const [version] = await db
    .update(eventSchemaVersions)
    .set({
      definition,
      updatedAt: new Date().toISOString()
    })
    .where(
      and(
        eq(eventSchemaVersions.familyId, row.family.id),
        eq(eventSchemaVersions.version, versionNumber)
      )
    )
    .returning();

  return toEventSchemaResponse({
    family: row.family,
    version,
    latestVersion: version.version
  });
}
