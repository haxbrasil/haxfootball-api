import { eq } from "drizzle-orm";
import { type Static, t } from "elysia";
import { db } from "@/db/client";
import {
  type PlayerResponse,
  playerCountrySchema,
  playerExternalIdSchema,
  playerNameSchema,
  toPlayerResponse
} from "@/features/players/player.contract";
import { players } from "@/features/players/player.db";
import { badRequest } from "@/shared/http/errors";

export const createPlayerBodySchema = t.Object({
  externalId: playerExternalIdSchema,
  name: playerNameSchema,
  country: t.Optional(playerCountrySchema)
});

export type CreatePlayerInput = Static<typeof createPlayerBodySchema>;

export async function createPlayer(
  input: CreatePlayerInput
): Promise<PlayerResponse> {
  const [existingPlayer] = await db
    .select()
    .from(players)
    .where(eq(players.externalId, input.externalId));

  if (existingPlayer) {
    throw badRequest("Player external ID already exists");
  }

  const [player] = await db
    .insert(players)
    .values({
      externalId: input.externalId,
      identityKey: `player:${input.externalId}`,
      roomId: input.externalId,
      roomPlayerId: 0,
      name: input.name,
      country: input.country
    })
    .returning();

  return toPlayerResponse({ player, account: null });
}
