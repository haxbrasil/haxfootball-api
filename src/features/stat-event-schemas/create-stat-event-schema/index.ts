import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { statEventSchemaNameSchema } from "@/features/stat-event-schemas/_shared/http/inputs";
import type { StatEventSchemaResponse } from "@/features/stat-event-schemas/_shared/http/responses";
import {
  statEventSchemaResponseSchema,
  toStatEventSchemaResponse
} from "@/features/stat-event-schemas/_shared/http/responses";
import { statEventSchemaFamilies } from "@/features/stat-event-schemas/db";
import { validateStatEventSchemaDefinition } from "@/features/stat-event-schemas/_shared/domain/definition";
import { createStatEventSchemaVersion } from "@/features/stat-event-schemas/_shared/db/queries";
import { badRequest } from "@/shared/http/errors";

export const createStatEventSchemaBodySchema = t.Object({
  name: statEventSchemaNameSchema,
  title: t.Optional(t.String({ minLength: 1 })),
  description: t.Optional(t.String({ minLength: 1 })),
  definition: t.Unknown()
});

export { statEventSchemaResponseSchema as createStatEventSchemaResponseSchema };

export type CreateStatEventSchemaInput = Static<
  typeof createStatEventSchemaBodySchema
>;

export async function createStatEventSchema(
  input: CreateStatEventSchemaInput
): Promise<StatEventSchemaResponse> {
  const definition = validateStatEventSchemaDefinition(input.definition);

  if (!definition) {
    throw badRequest("Invalid stat event schema definition");
  }

  const [existingFamily] = await db
    .select({ id: statEventSchemaFamilies.id })
    .from(statEventSchemaFamilies)
    .where(eq(statEventSchemaFamilies.name, input.name));

  if (existingFamily) {
    throw badRequest("Stat event schema name already exists");
  }

  const [family] = await db
    .insert(statEventSchemaFamilies)
    .values({
      uuid: crypto.randomUUID(),
      name: input.name,
      title: input.title ?? null,
      description: input.description ?? null
    })
    .returning();

  const version = await createStatEventSchemaVersion({
    familyId: family.id,
    version: 1,
    definition
  });

  return toStatEventSchemaResponse({
    family,
    version,
    latestVersion: version.version
  });
}
