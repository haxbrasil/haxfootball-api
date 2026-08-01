import { eq } from "drizzle-orm";
import { db, withDatabaseTransaction } from "@/db/client";
import {
  eventSchemaFamilies,
  eventSchemaVersions
} from "@/features/event-schemas/db";
import { gameModeEventSchemas, gameModes } from "@/features/game-modes/db";
import { badRequest, notFound } from "@/shared/http/errors";

export async function listGameModeSchemaCompatibility(gameModeUuid: string) {
  const gameMode = await requireGameMode(gameModeUuid);
  const rows = await db
    .select({ binding: gameModeEventSchemas, schema: eventSchemaFamilies })
    .from(gameModeEventSchemas)
    .innerJoin(
      eventSchemaFamilies,
      eq(gameModeEventSchemas.eventSchemaFamilyId, eventSchemaFamilies.id)
    )
    .where(eq(gameModeEventSchemas.gameModeId, gameMode.id));
  return {
    items: rows.map(({ binding, schema }) => ({
      id: schema.uuid,
      name: schema.name,
      title: schema.title,
      isDefault: binding.isDefault,
      managementMode: schema.managementMode
    })),
    totalCount: rows.length,
    truncated: false
  };
}

export async function replaceGameModeSchemaCompatibility(
  gameModeUuid: string,
  input: { items: Array<{ eventSchemaId: string; isDefault?: boolean }> }
) {
  if (input.items.filter((item) => item.isDefault).length > 1)
    throw badRequest("A game mode can have only one default event schema");
  return withDatabaseTransaction(async (tx) => {
    const [gameMode] = await tx
      .select()
      .from(gameModes)
      .where(eq(gameModes.uuid, gameModeUuid));
    if (!gameMode) throw notFound("Game mode not found");
    const schemas =
      input.items.length === 0
        ? []
        : await Promise.all(
            input.items.map(async (item) => {
              const [schema] = await tx
                .select()
                .from(eventSchemaFamilies)
                .where(eq(eventSchemaFamilies.uuid, item.eventSchemaId));
              if (!schema) throw notFound("Event schema not found");
              return { schema, isDefault: item.isDefault ?? false };
            })
          );
    await tx
      .delete(gameModeEventSchemas)
      .where(eq(gameModeEventSchemas.gameModeId, gameMode.id));
    if (schemas.length)
      await tx.insert(gameModeEventSchemas).values(
        schemas.map(({ schema, isDefault }) => ({
          gameModeId: gameMode.id,
          eventSchemaFamilyId: schema.id,
          isDefault
        }))
      );
    return listGameModeSchemaCompatibility(gameModeUuid);
  });
}

export async function assertGameModeSchemaCompatible(
  gameModeId: number | null | undefined,
  eventSchemaVersionId: number | null | undefined
) {
  if (!gameModeId || !eventSchemaVersionId) return;
  const bindings = await db
    .select()
    .from(gameModeEventSchemas)
    .where(eq(gameModeEventSchemas.gameModeId, gameModeId));
  if (bindings.length === 0) return;
  const [version] = await db
    .select()
    .from(eventSchemaVersions)
    .where(eq(eventSchemaVersions.id, eventSchemaVersionId));
  if (
    !version ||
    !bindings.some(
      (binding) => binding.eventSchemaFamilyId === version.familyId
    )
  ) {
    throw badRequest(
      "Event schema is not compatible with the selected game mode"
    );
  }
}

async function requireGameMode(uuid: string) {
  const [gameMode] = await db
    .select()
    .from(gameModes)
    .where(eq(gameModes.uuid, uuid));
  if (!gameMode) throw notFound("Game mode not found");
  return gameMode;
}
