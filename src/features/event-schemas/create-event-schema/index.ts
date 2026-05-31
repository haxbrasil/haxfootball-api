import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { eventSchemaNameSchema } from "@/features/event-schemas/_shared/http/inputs";
import type { EventSchemaResponse } from "@/features/event-schemas/_shared/http/responses";
import {
  eventSchemaResponseSchema,
  toEventSchemaResponse
} from "@/features/event-schemas/_shared/http/responses";
import { eventSchemaFamilies } from "@/features/event-schemas/db";
import { validateEventSchemaDefinition } from "@/features/event-schemas/_shared/domain/definition";
import { createEventSchemaVersion } from "@/features/event-schemas/_shared/db/queries";
import { badRequest } from "@/shared/http/errors";

export const createEventSchemaBodySchema = t.Object({
  name: eventSchemaNameSchema,
  title: t.Optional(t.String({ minLength: 1 })),
  description: t.Optional(t.String({ minLength: 1 })),
  definition: t.Unknown()
});

export { eventSchemaResponseSchema as createEventSchemaResponseSchema };

export type CreateEventSchemaInput = Static<typeof createEventSchemaBodySchema>;

export async function createEventSchema(
  input: CreateEventSchemaInput
): Promise<EventSchemaResponse> {
  const definition = validateEventSchemaDefinition(input.definition);

  if (!definition) {
    throw badRequest("Invalid event schema definition");
  }

  const [existingFamily] = await db
    .select({ id: eventSchemaFamilies.id })
    .from(eventSchemaFamilies)
    .where(eq(eventSchemaFamilies.name, input.name));

  if (existingFamily) {
    throw badRequest("Event schema name already exists");
  }

  const [family] = await db
    .insert(eventSchemaFamilies)
    .values({
      uuid: crypto.randomUUID(),
      name: input.name,
      title: input.title ?? null,
      description: input.description ?? null
    })
    .returning();

  const version = await createEventSchemaVersion({
    familyId: family.id,
    version: 1,
    definition
  });

  return toEventSchemaResponse({
    family,
    version,
    latestVersion: version.version
  });
}
