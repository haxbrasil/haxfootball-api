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
import { badRequest } from "@/shared/http/errors";

export const createGameModeBodySchema = t.Object({
  name: gameModeNameSchema,
  title: t.Optional(t.Union([valueKeySchema, t.Null()])),
  description: t.Optional(t.Union([valueKeySchema, t.Null()])),
  visibility: t.Optional(gameModeVisibilitySchema),
  rank: t.Optional(t.Integer())
});

export type CreateGameModeInput = Static<typeof createGameModeBodySchema>;

export async function createGameMode(
  input: CreateGameModeInput
): Promise<GameModeResponse> {
  const [existingGameMode] = await db
    .select({ id: gameModes.id })
    .from(gameModes)
    .where(eq(gameModes.name, input.name));

  if (existingGameMode) {
    throw badRequest("Game mode name already exists");
  }

  const [gameMode] = await db
    .insert(gameModes)
    .values({
      name: input.name,
      title: input.title ?? null,
      description: input.description ?? null,
      visibility: input.visibility ?? "visible",
      rank: input.rank ?? 0
    })
    .returning();
  const labels = await resolveLabels(
    [gameMode.title, gameMode.description].filter(
      (value): value is string => !!value
    )
  );

  return toGameModeResponse(gameMode, labels);
}
