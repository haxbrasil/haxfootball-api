import { type Static, t } from "elysia";
import {
  type StatEventSchemaResponse,
  statEventSchemaResponseSchema,
  toStatEventSchemaResponse
} from "@/features/stat-event-schemas/stat-event-schema.contract";
import { validateStatEventSchemaDefinition } from "@/features/stat-event-schemas/stat-event-schema.service";
import {
  createStatEventSchemaVersion,
  getLatestStatEventSchemaRow
} from "@/features/stat-event-schemas/stat-event-schema.persistence";
import { badRequest } from "@/shared/http/errors";

export const publishStatEventSchemaVersionBodySchema = t.Object({
  definition: t.Unknown()
});

export {
  statEventSchemaResponseSchema as publishStatEventSchemaVersionResponseSchema
};

export type PublishStatEventSchemaVersionInput = Static<
  typeof publishStatEventSchemaVersionBodySchema
>;

export async function publishStatEventSchemaVersion(
  id: string,
  input: PublishStatEventSchemaVersionInput
): Promise<StatEventSchemaResponse> {
  const latest = await getLatestStatEventSchemaRow(id);
  const definition = validateStatEventSchemaDefinition(input.definition);

  if (!definition) {
    throw badRequest("Invalid stat event schema definition");
  }

  const version = await createStatEventSchemaVersion({
    familyId: latest.family.id,
    version: latest.version.version + 1,
    definition
  });

  return toStatEventSchemaResponse({
    family: latest.family,
    version,
    latestVersion: version.version
  });
}
