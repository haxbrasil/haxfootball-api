import { type Static, t } from "elysia";
import type { EventSchemaResponse } from "@/features/event-schemas/_shared/http/responses";
import {
  eventSchemaResponseSchema,
  toEventSchemaResponse
} from "@/features/event-schemas/_shared/http/responses";
import { validateEventSchemaDefinition } from "@/features/event-schemas/_shared/domain/definition";
import {
  createEventSchemaVersion,
  getLatestEventSchemaRow
} from "@/features/event-schemas/_shared/db/queries";
import { badRequest } from "@/shared/http/errors";

export const publishEventSchemaVersionBodySchema = t.Object({
  definition: t.Unknown()
});

export { eventSchemaResponseSchema as publishEventSchemaVersionResponseSchema };

export type PublishEventSchemaVersionInput = Static<
  typeof publishEventSchemaVersionBodySchema
>;

export async function publishEventSchemaVersion(
  id: string,
  input: PublishEventSchemaVersionInput
): Promise<EventSchemaResponse> {
  const latest = await getLatestEventSchemaRow(id);
  const definition = validateEventSchemaDefinition(input.definition);

  if (!definition) {
    throw badRequest("Invalid event schema definition");
  }

  const version = await createEventSchemaVersion({
    familyId: latest.family.id,
    version: latest.version.version + 1,
    definition
  });

  return toEventSchemaResponse({
    family: latest.family,
    version,
    latestVersion: version.version
  });
}
