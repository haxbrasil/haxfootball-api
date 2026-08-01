import { eq } from "drizzle-orm";
import { db, withDatabaseTransaction } from "@/db/client";
import {
  eventSchemaDrafts,
  eventSchemaFamilies
} from "@/features/event-schemas/db";
import { getLatestEventSchemaRow } from "@/features/event-schemas/_shared/db/queries";
import { validateEventSchemaDefinition } from "@/features/event-schemas/_shared/domain/definition";
import { badRequest, conflict, notFound } from "@/shared/http/errors";

export async function getEventSchemaDraft(uuid: string) {
  const latest = await getLatestEventSchemaRow(uuid);
  const [draft] = await db
    .select()
    .from(eventSchemaDrafts)
    .where(eq(eventSchemaDrafts.familyId, latest.family.id));
  return {
    managementMode: latest.family.managementMode,
    draft: draft ?? null,
    publishedDefinition: latest.version.definition
  };
}

export async function saveEventSchemaDraft(
  uuid: string,
  input: { definition: unknown; expectedRevision?: number }
) {
  return withDatabaseTransaction(async (tx) => {
    const latest = await getLatestEventSchemaRow(uuid);
    if (latest.family.managementMode !== "manual")
      throw badRequest(
        "Externally managed schemas must be cloned before editing"
      );
    const [existing] = await tx
      .select()
      .from(eventSchemaDrafts)
      .where(eq(eventSchemaDrafts.familyId, latest.family.id));
    if (existing && existing.revision !== input.expectedRevision)
      throw conflict("Event schema draft revision conflict", {
        currentRevision: existing.revision
      });
    if (existing) {
      const [updated] = await tx
        .update(eventSchemaDrafts)
        .set({
          definition: input.definition,
          revision: existing.revision + 1,
          updatedAt: new Date().toISOString()
        })
        .where(eq(eventSchemaDrafts.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await tx
      .insert(eventSchemaDrafts)
      .values({ familyId: latest.family.id, definition: input.definition })
      .returning();
    return created;
  });
}

export async function cloneEventSchema(
  uuid: string,
  input: { name: string; title?: string; description?: string }
) {
  const latest = await getLatestEventSchemaRow(uuid);
  const [family] = await db
    .insert(eventSchemaFamilies)
    .values({
      uuid: crypto.randomUUID(),
      name: input.name,
      title: input.title ?? latest.family.title,
      description: input.description ?? latest.family.description,
      managementMode: "manual"
    })
    .returning();
  const [draft] = await db
    .insert(eventSchemaDrafts)
    .values({ familyId: family.id, definition: latest.version.definition })
    .returning();
  return { id: family.uuid, name: family.name, draft };
}

export async function validateEventSchemaDraft(uuid: string) {
  const latest = await getLatestEventSchemaRow(uuid);
  const [draft] = await db
    .select()
    .from(eventSchemaDrafts)
    .where(eq(eventSchemaDrafts.familyId, latest.family.id));
  if (!draft) throw notFound("Event schema draft not found");
  const definition = validateEventSchemaDefinition(draft.definition);
  return {
    valid: Boolean(definition),
    issues: definition ? [] : ["Invalid event schema definition"]
  };
}
