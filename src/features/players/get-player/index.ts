import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/features/accounts/account.db";
import {
  type PlayerResponse,
  toPlayerResponse
} from "@/features/players/player.contract";
import { players } from "@/features/players/player.db";
import { notFound } from "@/shared/http/errors";

export async function getPlayer(externalId: string): Promise<PlayerResponse> {
  const [row] = await db
    .select({
      player: players,
      account: accounts
    })
    .from(players)
    .leftJoin(accounts, eq(players.accountId, accounts.id))
    .where(eq(players.externalId, externalId));

  if (!row) {
    throw notFound("Player not found");
  }

  return toPlayerResponse(row);
}
