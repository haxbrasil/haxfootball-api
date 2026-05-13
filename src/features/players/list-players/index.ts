import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/features/accounts/account.db";
import {
  type PlayerResponse,
  playerResponseSchema,
  toPlayerResponse
} from "@/features/players/player.contract";
import { players } from "@/features/players/player.db";
import {
  cursorAfter,
  cursorSort,
  pageItems,
  pageLimit,
  paginatedResponseSchema,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

export const listPlayersResponseSchema =
  paginatedResponseSchema(playerResponseSchema);

export async function listPlayers(
  query: PaginationQuery = {}
): Promise<PaginatedResponse<PlayerResponse>> {
  const rows = await db
    .select({
      player: players,
      account: accounts
    })
    .from(players)
    .leftJoin(accounts, eq(players.accountId, accounts.id))
    .where(cursorAfter(players.id, query.cursor, "asc"))
    .orderBy(cursorSort(players.id, "asc"))
    .limit(pageLimit(query));

  const page = pageItems(rows, query, (row) => row.player.id);

  return {
    items: page.items.map(toPlayerResponse),
    page: page.page
  };
}
