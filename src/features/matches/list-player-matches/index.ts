import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  type MatchSummaryRow,
  type MatchSummaryResponse,
  listMatchesResponseSchema,
  toMatchSummaryResponse
} from "@/features/matches/_shared/http/responses";
import { gameModes } from "@/features/game-modes/db";
import { matchPlayerStints, matches } from "@/features/matches/db";
import { listMatchMetadata } from "@/features/matches/_shared/db/queries";
import { players } from "@/features/players/db";
import { recordings } from "@/features/recordings/db";
import {
  statEventSchemaFamilies,
  statEventSchemaVersions
} from "@/features/stat-event-schemas/db";
import { notFound } from "@/shared/http/errors";
import {
  cursorAfter,
  pageItems,
  pageLimit,
  type PaginatedResponse,
  type PaginationQuery
} from "@lib";

export { listMatchesResponseSchema as listPlayerMatchesResponseSchema };

export async function listPlayerMatches(
  externalId: string,
  query: PaginationQuery = {}
): Promise<PaginatedResponse<MatchSummaryResponse>> {
  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.externalId, externalId));

  if (!player) {
    throw notFound("Player not found");
  }

  const rows = await db
    .select({
      match: matches,
      recording: recordings,
      gameMode: gameModes,
      statEventSchemaFamily: statEventSchemaFamilies,
      statEventSchemaVersion: statEventSchemaVersions
    })
    .from(matches)
    .innerJoin(matchPlayerStints, eq(matchPlayerStints.matchId, matches.id))
    .leftJoin(recordings, eq(matches.recordingId, recordings.id))
    .leftJoin(gameModes, eq(matches.gameModeId, gameModes.id))
    .leftJoin(
      statEventSchemaVersions,
      eq(matches.statEventSchemaVersionId, statEventSchemaVersions.id)
    )
    .leftJoin(
      statEventSchemaFamilies,
      eq(statEventSchemaVersions.familyId, statEventSchemaFamilies.id)
    )
    .where(
      and(
        eq(matchPlayerStints.playerId, player.id),
        cursorAfter(matches.id, query.cursor, "desc")
      )
    )
    .groupBy(matches.id)
    .orderBy(desc(matches.id))
    .limit(pageLimit(query));

  const rowsWithMetadata: MatchSummaryRow[] = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      metadata: await listMatchMetadata(row.match.id)
    }))
  );
  const page = pageItems(rowsWithMetadata, query, (row) => row.match.id);

  return {
    items: page.items.map(toMatchSummaryResponse),
    page: page.page
  };
}
