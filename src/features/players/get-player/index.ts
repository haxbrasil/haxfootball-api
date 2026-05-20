import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import type { PlayerResponse } from "@/features/players/_shared/http/responses";
import { toPlayerResponse } from "@/features/players/_shared/http/responses";
import { players } from "@/features/players/db";
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
