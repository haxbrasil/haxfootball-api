import { eq } from "drizzle-orm";
import { t } from "elysia";
import { db } from "@/db/client";
import { accounts } from "@/features/accounts/account.db";
import {
  type PlayerResponse,
  playerResponseSchema,
  toPlayerResponse
} from "@/features/players/player.contract";
import { players } from "@/features/players/player.db";

export const listPlayersResponseSchema = t.Array(playerResponseSchema);

export async function listPlayers(): Promise<PlayerResponse[]> {
  const rows = await db
    .select({
      player: players,
      account: accounts
    })
    .from(players)
    .leftJoin(accounts, eq(players.accountId, accounts.id))
    .orderBy(players.id);

  return rows.map(toPlayerResponse);
}
