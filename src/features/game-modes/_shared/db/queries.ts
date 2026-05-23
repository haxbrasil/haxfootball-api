import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { gameModes, type GameMode } from "@/features/game-modes/db";
import { notFound } from "@/shared/http/errors";

export async function getGameModeByUuid(uuid: string): Promise<GameMode> {
  const [gameMode] = await db
    .select()
    .from(gameModes)
    .where(eq(gameModes.uuid, uuid));

  if (!gameMode) {
    throw notFound("Game mode not found");
  }

  return gameMode;
}

export async function getGameModeByName(name: string): Promise<GameMode> {
  const [gameMode] = await db
    .select()
    .from(gameModes)
    .where(eq(gameModes.name, name));

  if (!gameMode) {
    throw notFound("Game mode not found");
  }

  return gameMode;
}
