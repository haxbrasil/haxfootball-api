import { and, eq, like, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { accounts } from "@/features/accounts/db";
import type { PlayerResponse } from "@/features/players/_shared/http/responses";
import {
  playerResponseSchema,
  toPlayerResponse
} from "@/features/players/_shared/http/responses";
import { players } from "@/features/players/db";
import {
  cursorAfter,
  cursorSort,
  pageItems,
  pageLimit,
  paginatedResponseSchema,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

export type ListPlayersQuery = PaginationQuery & {
  search?: string;
  accountUuid?: string;
  country?: string;
};

export const listPlayersResponseSchema =
  paginatedResponseSchema(playerResponseSchema);

export async function listPlayers(
  query: ListPlayersQuery = {}
): Promise<PaginatedResponse<PlayerResponse>> {
  const rows = await db
    .select({
      player: players,
      account: accounts
    })
    .from(players)
    .leftJoin(accounts, eq(players.accountId, accounts.id))
    .where(playerListWhere(query))
    .orderBy(cursorSort(players.id, "asc"))
    .limit(pageLimit(query));

  const page = pageItems(rows, query, (row) => row.player.id);

  return {
    items: page.items.map(toPlayerResponse),
    page: page.page
  };
}

function playerListWhere(query: ListPlayersQuery): SQL | undefined {
  const filters: Array<SQL | undefined> = [
    cursorAfter(players.id, query.cursor, "asc")
  ];

  if (query.search) {
    filters.push(like(players.name, `%${query.search}%`));
  }

  if (query.accountUuid) {
    filters.push(eq(accounts.uuid, query.accountUuid));
  }

  if (query.country) {
    filters.push(eq(players.country, query.country));
  }

  return and(...filters.filter((filter) => filter !== undefined));
}
