import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import { resolveLabels } from "@/features/localization/resolve-labels";
import {
  gameModeNameSchema,
  gameModeVisibilitySchema,
  valueKeySchema
} from "@/features/game-modes/_shared/http/inputs";
import type { GameModeResponse } from "@/features/game-modes/_shared/http/responses";
import { toGameModeResponse } from "@/features/game-modes/_shared/http/responses";
import { gameModes } from "@/features/game-modes/db";
import { badRequest, notFound } from "@/shared/http/errors";

export const updateGameModeBodySchema = t.Partial(
  t.Object({
    name: gameModeNameSchema,
    title: t.Union([valueKeySchema, t.Null()]),
    description: t.Union([valueKeySchema, t.Null()]),
    visibility: gameModeVisibilitySchema,
    rank: t.Integer()
  })
);

export type UpdateGameModeInput = Static<typeof updateGameModeBodySchema>;

export async function updateGameMode(
  id: string,
  input: UpdateGameModeInput
): Promise<GameModeResponse> {
  const [gameMode] = await db
    .select()
    .from(gameModes)
    .where(eq(gameModes.uuid, id));

  if (!gameMode) {
    throw notFound("Game mode not found");
  }

  if (input.name !== undefined && input.name !== gameMode.name) {
    const [existingGameMode] = await db
      .select({ id: gameModes.id })
      .from(gameModes)
      .where(eq(gameModes.name, input.name));

    if (existingGameMode) {
      throw badRequest("Game mode name already exists");
    }
  }

  const [updatedGameMode] = await db
    .update(gameModes)
    .set({
      name: input.name ?? gameMode.name,
      title: input.title === undefined ? gameMode.title : input.title,
      description:
        input.description === undefined
          ? gameMode.description
          : input.description,
      visibility: input.visibility ?? gameMode.visibility,
      rank: input.rank ?? gameMode.rank,
      updatedAt: new Date().toISOString()
    })
    .where(eq(gameModes.id, gameMode.id))
    .returning();
  const labels = await resolveLabels(
    [updatedGameMode.title, updatedGameMode.description].filter(
      (value): value is string => !!value
    )
  );

  return toGameModeResponse(updatedGameMode, labels);
}
