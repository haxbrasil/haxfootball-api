import { and, eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import {
  type StatEventSchemaResponse,
  statEventSchemaResponseSchema,
  toStatEventSchemaResponse
} from "@/features/stat-event-schemas/stat-event-schema.contract";
import { statEventSchemaVersions } from "@/features/stat-event-schemas/stat-event-schema.db";
import {
  isBreakingSchemaChange,
  validateStatEventSchemaDefinition
} from "@/features/stat-event-schemas/stat-event-schema.service";
import { getStatEventSchemaRow } from "@/features/stat-event-schemas/stat-event-schema.persistence";
import { badRequest } from "@/shared/http/errors";

export const updateStatEventSchemaBodySchema = t.Object({
  definition: t.Unknown()
});

export { statEventSchemaResponseSchema as updateStatEventSchemaResponseSchema };

export type UpdateStatEventSchemaInput = Static<
  typeof updateStatEventSchemaBodySchema
>;

export async function updateStatEventSchema(
  id: string,
  versionNumber: number,
  input: UpdateStatEventSchemaInput
): Promise<StatEventSchemaResponse> {
  const row = await getStatEventSchemaRow(id, versionNumber);

  if (row.version.version !== row.latestVersion) {
    throw badRequest("Only the latest stat event schema version can be updated");
  }

  const definition = validateStatEventSchemaDefinition(input.definition);

  if (!definition) {
    throw badRequest("Invalid stat event schema definition");
  }

  if (isBreakingSchemaChange(row.version.definition, definition)) {
    throw badRequest("Breaking changes must be published as a new version");
  }

  const [version] = await db
    .update(statEventSchemaVersions)
    .set({
      definition,
      updatedAt: new Date().toISOString()
    })
    .where(
      and(
        eq(statEventSchemaVersions.familyId, row.family.id),
        eq(statEventSchemaVersions.version, versionNumber)
      )
    )
    .returning();

  return toStatEventSchemaResponse({
    family: row.family,
    version,
    latestVersion: version.version
  });
}
